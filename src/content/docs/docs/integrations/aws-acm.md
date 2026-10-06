---
title: Use KrakenKey certificates with AWS Certificate Manager, ALB, and CloudFront
description: Import a KrakenKey certificate into ACM for Application Load Balancers and CloudFront, keep the key in Secrets Manager, and re-import renewals to the same ARN from a scheduled job.
sidebar:
  label: AWS (ACM, ALB, CloudFront)
---

Application Load Balancers and CloudFront read certificates from AWS Certificate Manager (ACM). ACM can import a certificate from any CA, and re-importing a renewed certificate to the same ARN keeps every listener and distribution that uses it. This guide sets that up with KrakenKey: issue the certificate once, import it, and run a daily job that re-imports each renewal. See [How KrakenKey fits your stack](/docs/architecture/) for how this compares with the other setups.

## When this fits

ACM's own certificates are free and renew themselves. If everything you serve lives on AWS and ACM's DNS validation works for you, use those. KrakenKey makes sense when:

- You want one issuance and monitoring process across AWS and everything else, instead of ACM for some hosts and something different for the rest.
- The same certificate has to be served both on AWS and elsewhere, for example an ALB and an on-premises proxy for the same name.
- You don't want per-certificate validation records in your DNS: KrakenKey's one `_acme-challenge` CNAME per domain covers every certificate under it.

## How it works

- The **KrakenKey CLI** creates the private key and CSR once, on a machine you trust.
- **ACM** gets the certificate, its chain and the key. ACM never gives an imported key back, so you need a copy to re-import with.
- **AWS Secrets Manager** holds that copy, encrypted with KMS. Only the renewal job can read it.
- A **scheduled job** renews the certificate with KrakenKey when it's due and re-imports it into ACM under the same ARN. ALB and CloudFront pick up the new certificate without any change on their side.

ACM doesn't renew imported certificates, so this job is what keeps them current.

## Prerequisites

- A verified domain in KrakenKey with both DNS records from [Getting started](/docs/getting-started/).
- The [KrakenKey CLI](/docs/cli/) v0.7.0 or later, the AWS CLI v2, `openssl` and `jq`.
- A KrakenKey API key from the dashboard.
- AWS permissions to import into ACM and create a secret, for the one-time setup.

## 1. Issue the certificate

Pick the key type now: ACM won't change it on re-import. ECDSA P-256 (the CLI's default) works with both ALB and CloudFront. RSA 2048 also works with both, if you have clients that need RSA.

```bash
umask 077
mkdir -p kk-acm && cd kk-acm
export KK_API_KEY=...   # from your password manager, not shell history

krakenkey cert issue --domain example.com --san www.example.com --key-type ecdsa-p256 \
  --key-out example.com.key --csr-out example.com.csr \
  --out example.com.crt --chain-out example.com.chain.pem \
  --fullchain-out example.com.fullchain.pem --wait
```

Note the certificate ID it prints. ACM takes the leaf and the chain as separate files, which is why the leaf (`--out`) and the intermediates (`--chain-out`) are saved on their own.

## 2. Store the key and import the certificate

Store the key in Secrets Manager in the region where the renewal job will run:

```bash
aws secretsmanager create-secret --region us-east-1 \
  --name tls/example.com/key \
  --description "Private key for the KrakenKey certificate example.com" \
  --secret-string file://example.com.key
```

Import into ACM. CloudFront only uses certificates in **US East (N. Virginia)**, `us-east-1`. A load balancer uses a certificate in its own region, so import once per region you need:

```bash
aws acm import-certificate --region us-east-1 \
  --certificate fileb://example.com.crt \
  --certificate-chain fileb://example.com.chain.pem \
  --private-key fileb://example.com.key \
  --tags Key=krakenkey-cert-id,Value=<id>
```

Each import prints an ARN. Keep them: the renewal job re-imports to these ARNs. Tags can only be set on the first import, so add any you want now.

Then delete the local key:

```bash
shred -u example.com.key 2>/dev/null || rm -f example.com.key
```

## 3. Attach it to ALB or CloudFront

Use the ARN like any ACM certificate:

- **Application Load Balancer:** set it as the HTTPS listener's default certificate, or add it with `aws elbv2 add-listener-certificates --listener-arn <listener> --certificates CertificateArn=<arn>` so the listener serves it by SNI. [AWS: HTTPS listener certificates](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/https-listener-certificates.html)
- **CloudFront:** in the distribution's settings, choose the `us-east-1` certificate as the custom SSL certificate and add the names as alternate domain names. [AWS: alternate domain names](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)

## 4. Renew and re-import on a schedule

The job needs three things: the KrakenKey CLI or GitHub Action to renew and download, read access to the key secret, and permission to describe and import the ACM certificates. Give its IAM role a policy scoped to exactly those:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["acm:DescribeCertificate", "acm:ImportCertificate"],
      "Resource": [
        "arn:aws:acm:us-east-1:123456789012:certificate/<id>",
        "arn:aws:acm:eu-west-1:123456789012:certificate/<id>"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:tls/example.com/key-*"
    }
  ]
}
```

Each run has two halves. First, ask KrakenKey to renew if the certificate is inside your plan's renewal window, and download the current leaf and chain. Second, re-import them into any ACM ARN whose copy expires earlier. The script below is the second half. It only reads the key when there's something to import, and running it again changes nothing, so a failed or repeated run is harmless. Save it as `scripts/krakenkey-acm-import.sh`:

```bash
#!/usr/bin/env bash
# Re-import a KrakenKey certificate into each ACM ARN that holds an older copy.
# Needs: CERT and CHAIN (PEM files), ACM_ARNS (space-separated), KEY_SECRET, AWS credentials.
set -euo pipefail
umask 077

log() { echo "[krakenkey-acm] $*"; }
epoch() { date -d "$1" +%s; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

new_end=$(epoch "$(openssl x509 -noout -enddate -in "$CERT" | cut -d= -f2)")

for arn in $ACM_ARNS; do
  region=$(cut -d: -f4 <<<"$arn")
  live_end=$(epoch "$(aws acm describe-certificate --region "$region" --certificate-arn "$arn" \
    --query Certificate.NotAfter --output text)")
  if (( new_end <= live_end )); then
    log "$arn is up to date"
    continue
  fi

  if [[ ! -s $WORK/key.pem ]]; then
    aws secretsmanager get-secret-value --secret-id "$KEY_SECRET" \
      --query SecretString --output text > "$WORK/key.pem"
    [[ "$(openssl x509 -noout -pubkey -in "$CERT")" == "$(openssl pkey -pubout -in "$WORK/key.pem")" ]] \
      || { log "certificate doesn't match the stored key"; exit 1; }
  fi

  aws acm import-certificate --region "$region" --certificate-arn "$arn" \
    --certificate "fileb://$CERT" \
    --certificate-chain "fileb://$CHAIN" \
    --private-key "fileb://$WORK/key.pem" >/dev/null
  log "re-imported $arn, now expiring $(date -u -d "@$new_end")"
done
```

### Run it from GitHub Actions

A scheduled workflow with [OIDC federation to AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) needs no stored AWS keys. Create an IAM role that trusts the repository and carries the policy above, then add `.github/workflows/acm-renew.yml`:

```yaml
name: Renew ACM certificate
on:
  schedule:
    - cron: '23 6 * * *'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency: acm-example-com

jobs:
  renew:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Renew if due and download
        id: cert
        uses: krakenkey/cert-action@v1
        with:
          api-key: ${{ secrets.KRAKENKEY_API_KEY }}
          command: renew
          cert-id: ${{ vars.KK_CERT_ID }}
          if-due: 'true'
          poll-timeout: 20m
          cert-path: ${{ runner.temp }}/cert.pem
          chain-path: ${{ runner.temp }}/chain.pem
          fullchain-path: ${{ runner.temp }}/fullchain.pem

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Re-import into ACM if newer
        env:
          CERT: ${{ steps.cert.outputs.cert-path }}
          CHAIN: ${{ steps.cert.outputs.chain-path }}
          ACM_ARNS: ${{ vars.ACM_ARNS }}
          KEY_SECRET: tls/example.com/key
        run: bash scripts/krakenkey-acm-import.sh
```

Set the repository variables `KK_CERT_ID` to the certificate ID from step 1 and `ACM_ARNS` to the ARNs from step 2, separated by spaces. With `if-due`, the action still downloads the current certificate on days it doesn't renew, so the import step always has files to compare.

### Or run it anywhere else

The import script only needs the AWS CLI and credentials, so a systemd timer on an admin host, a cron job, or a scheduled ECS task works the same way. Do the first half with the KrakenKey CLI, then call the script:

```bash
#!/usr/bin/env bash
# Renew with KrakenKey when due, then re-import into ACM.
# Needs: KK_API_KEY, KK_CERT_ID, plus the import script's variables.
set -euo pipefail
export KK_OUTPUT=json
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

status=$(krakenkey cert show "$KK_CERT_ID" | jq -r .status)
case "$status" in
  pending|issuing|renewing) echo "certificate $KK_CERT_ID is $status; trying again next run"; exit 0 ;;
  issued) ;;
  *) echo "certificate $KK_CERT_ID is $status; see krakenkey cert show $KK_CERT_ID"; exit 1 ;;
esac

# Renews only inside the plan's renewal window; otherwise a no-op.
(cd "$WORK" && krakenkey cert renew "$KK_CERT_ID" --if-due --wait --poll-timeout 20m >/dev/null)
krakenkey cert download "$KK_CERT_ID" --format cert --out "$WORK/cert.pem" >/dev/null
krakenkey cert download "$KK_CERT_ID" --format chain --out "$WORK/chain.pem" >/dev/null

CERT="$WORK/cert.pem" CHAIN="$WORK/chain.pem" /usr/local/bin/krakenkey-acm-import.sh
```

Give whatever runs it the IAM policy above and the KrakenKey API key, and run it daily.

## 5. Verify and watch

Check what each endpoint serves:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -enddate -fingerprint -sha256
```

Two safety nets catch a job that stops running:

- Add the hostnames as [monitored endpoints](/docs/cli/commands/#krakenkey-endpoint) in KrakenKey. Monitoring checks what CloudFront and the load balancer actually serve, not what ACM holds.
- ACM sends **ACM Certificate Approaching Expiration** events to EventBridge for imported certificates. Route them to SNS or chat so an expiring certificate reaches a person. [AWS: ACM events](https://docs.aws.amazon.com/acm/latest/userguide/supported-events.html)

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `import-certificate` fails on re-import with a key error | ACM keeps the key type and size of the first import. Re-issuing with a different `--key-type` needs a new ACM certificate and new ARNs. |
| `certificate doesn't match the stored key` | The certificate was re-issued with a new key (step 1 run again) but the secret still holds the old one. Update the secret with `aws secretsmanager put-secret-value`. |
| CloudFront doesn't list the certificate | It was imported outside `us-east-1`. |
| Re-import fails about a key usage extension | ACM won't let a re-import drop key usages the first import had. It allows dropping Client Authentication and, for ECDSA, `keyEncipherment`, which covers Let's Encrypt's current certificates. |
| The job fails with the certificate `failed` | `krakenkey cert show <id>` gives the reason; after fixing it, `krakenkey cert retry <id> --wait` and the next run re-imports. |
