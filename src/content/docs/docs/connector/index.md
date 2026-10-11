---
title: KrakenKey Connector
description: Run the KrakenKey connector on your own infrastructure to renew certificates with keys that never leave it, deploy them to files, Azure Key Vault and Application Gateway, or AWS Certificate Manager, check each deployment over TLS, and roll back on failure.
sidebar:
  label: Set up the connector
  order: 1
---

The KrakenKey connector is a small service you run on your own network. It renews KrakenKey certificates with private keys it creates locally (or inside Azure Key Vault), installs each renewed certificate where it is served, checks over TLS that the endpoint serves it, and rolls the target back if it doesn't. The dashboard's **Connectors** page shows what is deployed where, and KrakenKey alerts you when a deployment fails or a connector stops checking in.

Source and releases: [github.com/KrakenKey/connector](https://github.com/KrakenKey/connector) (Apache-2.0). This page covers v0.1.0. The connector is pre-1.0, so its configuration may still change between minor versions; read the [changelog](https://github.com/KrakenKey/connector/blob/main/CHANGELOG.md) before you upgrade.

## When this fits

- You have certificates on several systems and want renewals to install themselves, with no scripts to maintain.
- The private key has to stay on your network or in your key vault.
- You serve from Azure Application Gateway, AWS load balancers or CloudFront, or servers that read PEM files (nginx, HAProxy, Caddy and similar).
- You want to know a renewal actually reached the endpoint, and to have a failed install undo itself instead of taking a site down.

If you have one server and can run the [CLI](/docs/cli/) on it, a [systemd timer](/docs/integrations/nginx-haproxy/) is simpler. See [How KrakenKey fits your stack](/docs/architecture/) for the other setups.

## How it works

- **Outbound only.** The connector calls the KrakenKey API over HTTPS. Nothing connects to it, and it opens no ports.
- **Keys stay with you.** For each renewal the connector's key store creates a new private key and a CSR. Only the CSR goes to KrakenKey.
- **Checked before deployed.** When the certificate is issued, the connector checks that it carries the key store's public key and exactly the names in your config. If not, nothing is deployed.
- **One target at a time, then verified.** Each target is staged, activated, and checked with a TLS handshake: the endpoint must serve the issued certificate, byte for byte, with a chain that validates. If it doesn't, that target is rolled back to its previous certificate and retried later with growing delays. Other targets aren't affected.
- **Survives interruptions.** Each step is recorded before it runs, so a pass that was cut off is finished or rolled back on the next run instead of being requested again.
- **Status in the dashboard.** After every pass the connector reports each target's state and the serial it serves, so the Connectors page shows what is deployed where and KrakenKey can alert on failures.

### What KrakenKey sees

KrakenKey sees CSRs, the issued certificates, certificate IDs, and the label and state of each target. It never sees private keys, your cloud credentials, or anything about a target beyond its label.

The connector holds the private keys and the access it needs to deploy (file permissions, a cloud identity), so run it where that access already lives. It doesn't store a long-lived API key either: at enrollment it creates its own Ed25519 identity key on the machine, and on each pass it trades a signed request for an API key that lasts an hour, stays in memory, and is limited to the scopes and certificates you set for the connector in the dashboard.

### Key stores and targets

| Name | Kind | Where it comes from | What it does |
| --- | --- | --- | --- |
| `local` | Key store | Built in | Creates keys on the machine and keeps them under the data directory. |
| `file` | Target | Built in | Writes the certificate, chain, full chain and key as PEM files, then runs a command such as a reload. |
| `exec` | Target | Built in | Runs your own command with the certificate files, and again to roll back. |
| [`azure-keyvault`](https://github.com/KrakenKey/connector/blob/v0.1.0/plugins/azure-keyvault/README.md) | Key store | Plugin | Key Vault creates the key and the CSR and keeps the certificate. |
| [`azure-appgateway`](https://github.com/KrakenKey/connector/blob/v0.1.0/plugins/azure-appgateway/README.md) | Target | Plugin | Points an Application Gateway v2 SSL certificate at a specific Key Vault secret version. |
| [`aws-acm`](https://github.com/KrakenKey/connector/blob/v0.1.0/plugins/aws-acm/README.md) | Target | Plugin | Re-imports into an existing ACM certificate, so load balancers, CloudFront and API Gateway keep the same ARN. |

Plugins are separate executables that the connector starts and talks to over gRPC, the same model Terraform uses for providers. The container image includes all three.

### When it renews

The connector renews a certificate once KrakenKey's `renewAfter` time has passed. For a certificate marked as managed by a connector, that is at least 30 days before expiry, or earlier if the CA asks for an early replacement through ACME Renewal Information (ARI). Between renewals, each pass is a quick check.

Two cases are different:

- **A new certificate** created for a connector waits in KrakenKey as *Awaiting CSR*. On its next pass the connector creates the key, sends the CSR, has the certificate issued and deploys it.
- **An existing certificate** was issued with a key the connector doesn't have, so on its first pass the connector renews it once with its own key, then deploys it.

## Requirements

- **A host or container runtime** on your network: Linux or macOS on amd64 or arm64, or anything that runs `linux/amd64` or `linux/arm64` containers. There are no Windows builds yet.
- **Outbound HTTPS** to `api.krakenkey.io`, and to the cloud APIs your plugins use.
- **An accurate clock.** The signed key exchange is refused if the clock is more than five minutes off, so keep NTP running.
- **Verified domains.** Each name on the certificate must be on a domain verified in KrakenKey, with its `_acme-challenge` CNAME in place. See [Getting started](/docs/getting-started/).
- **A cloud identity** for cloud targets: a managed identity or AKS workload identity for Azure, an instance profile or task role for AWS.

For each target type you also need:

- **Application Gateway:** a v2 gateway (`Standard_v2` or `WAF_v2`) with a user-assigned managed identity that has **Key Vault Secrets User** on the vault, and an SSL certificate entry that its HTTPS listeners already use. The connector updates that entry; it doesn't create one. Listener certificates must be RSA.
- **AWS Certificate Manager:** an imported ACM certificate already attached to your load balancer, distribution or API, which the connector re-imports over. Step 1 shows how to create a placeholder. Certificates ACM issued itself can't be re-imported over.
- **Files:** the target directory must exist, and the connector's user must be able to write to it and run the reload command.

## 1. Set up KrakenKey

Create or pick the certificate first, then a connector limited to it. Create the connector when you're ready to install: its enrollment token is shown once and expires after 24 hours.

### The certificate

**A new certificate:** go to **Certificates**, choose **Issued by a connector** under *Request a Certificate*, enter the names (for example `shop.example.com` and `www.shop.example.com`), and select **Create Pending Certificate**. Note the certificate ID. Nothing is sent to the CA until the connector's first pass.

**An existing certificate:** mark it as managed by a connector and turn KrakenKey's own auto-renewal off, so only the connector renews it and it gets the longer renewal window. With an API key from the dashboard in `KK_API_KEY`:

```bash
curl -fsS -X PATCH "https://api.krakenkey.io/certs/tls/1043" \
  -H "Authorization: Bearer $KK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"managedBy": "connector", "autoRenew": false}'
```

`validate` ([step 5](#5-enroll-validate-and-run-once)) warns about a certificate that still has auto-renewal on.

### The connector

1. Go to **Connectors** and select **New Connector**.
2. Give it a name, such as the host or environment it runs in. **Client label** is optional; it names the customer or site and appears in alerts.
3. Under **Access**, `certs:read` is always included. Keep `certs:renew` on: it lets the connector renew certificates and issue pending ones. Without it, the connector only deploys.
4. Under **Restrictions**, pick certificates, domains, or both. A connector can only use what it is limited to. Pick a domain if the connector should also handle certificates you create later under it; pick certificates to limit it to exactly those.
5. Copy the enrollment token (`kkce_...`). It is shown once. Keep it somewhere private, such as your password manager, until you enroll in [step 5](#5-enroll-validate-and-run-once).

The token works once. If it expires before you enroll, select **New enrollment token** on the connector's page. You can change access and restrictions later with **Edit restrictions**; saving revokes the connector's current short-lived keys, so the new limits apply at its next exchange.

### AWS only: import a placeholder certificate

The `aws-acm` plugin re-imports into a certificate that already exists, so attached services keep the same ARN. Import a short-lived self-signed placeholder once, attach it to your listener, distribution or custom domain, and note the ARN it prints:

```bash
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 7 \
  -subj /CN=api.example.com -addext subjectAltName=DNS:api.example.com \
  -addext keyUsage=critical,digitalSignature -addext extendedKeyUsage=serverAuth \
  -keyout placeholder.key -out placeholder.pem
aws acm import-certificate --region us-east-1 \
  --certificate fileb://placeholder.pem --private-key fileb://placeholder.key \
  --tags Key=managed-by,Value=krakenkey-connector
rm placeholder.key
```

- The placeholder's key type must match `key_type` in the config (ACM can't change it on re-import). For RSA, use `-newkey rsa:2048`.
- It must cover only names the KrakenKey certificate also covers.
- Keep the `keyUsage` and `extendedKeyUsage` options. ACM records a certificate without them as allowing any usage, then refuses every re-import of a certificate that restricts usage, which every KrakenKey certificate does.
- Tags can only be set on this first import.

### Azure only: the Key Vault certificate

Give the connector its own `certificate_name` in the vault and it creates the certificate on its first pass. To take over a Key Vault certificate that already exists, such as the one your gateway uses today, set `adopt: true` in the key store settings ([step 3](#azure-key-vault-and-application-gateway)). Without it, the connector refuses to touch a certificate it didn't create.

## 2. Install the connector

Use the container image unless the host has no container runtime. It carries the three plugins, pinned by a checksum lock, so there is nothing else to download. Pin a version tag rather than `latest`, so upgrades happen when you choose.

### Container image

`ghcr.io/krakenkey/connector`, for `linux/amd64` and `linux/arm64`. Images are signed with Sigstore by the release workflow. Checking the signature needs [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) v3 or later:

```bash
VERSION=0.1.0
docker pull ghcr.io/krakenkey/connector:v${VERSION}
cosign verify ghcr.io/krakenkey/connector:v${VERSION} \
  --certificate-identity "https://github.com/KrakenKey/connector/.github/workflows/release.yaml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The image runs as a non-root user, uid 10001, and keeps its data in the volume at `/var/lib/krakenkey-connector`. Directories you mount for `file` targets must be writable by that uid. Because it isn't root, a `file` target in the container can't set `owner` to another user such as `root:nginx`: leave `owner` out, or use a group that uid 10001 belongs to.

### Release binaries

Each [release](https://github.com/KrakenKey/connector/releases/tag/v0.1.0) has archives for Linux and macOS (amd64 and arm64) of the connector and each plugin, a `checksums.txt` covering them, and its Sigstore signature, `checksums.txt.sigstore.json`. There is no long-lived signing key: the signature is tied to the release workflow and the tag.

```bash
VERSION=0.1.0
OS=linux        # linux or darwin
ARCH=amd64      # amd64 or arm64
ARCHIVE="krakenkey-connector_${VERSION}_${OS}_${ARCH}.tar.gz"
BASE="https://github.com/KrakenKey/connector/releases/download/v${VERSION}"
curl -fsSLO "${BASE}/${ARCHIVE}"
curl -fsSLO "${BASE}/checksums.txt"
curl -fsSLO "${BASE}/checksums.txt.sigstore.json"

# 1. checksums.txt was signed by the release workflow for this tag
cosign verify-blob checksums.txt \
  --bundle checksums.txt.sigstore.json \
  --certificate-identity "https://github.com/KrakenKey/connector/.github/workflows/release.yaml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# 2. the archive matches checksums.txt (on macOS: shasum -a 256 -c)
grep " ${ARCHIVE}\$" checksums.txt | sha256sum -c

tar -xzf "${ARCHIVE}" krakenkey-connector
sudo install -m 0755 krakenkey-connector /usr/local/bin/krakenkey-connector
krakenkey-connector version
```

### Plugins on a host

Plugin archives come from the same release, named `krakenkey-connector-plugin-<name>_<version>_<os>_<arch>.tar.gz`, and are checked against the same `checksums.txt`. Install them as root in the system plugin directory, `/usr/lib/krakenkey-connector/plugins/<name>/<version>/`, and write a `plugins.lock` there:

```bash
VERSION=0.1.0
OS=linux
ARCH=amd64
PLUGIN=azure-keyvault   # or azure-appgateway, aws-acm
ARCHIVE="krakenkey-connector-plugin-${PLUGIN}_${VERSION}_${OS}_${ARCH}.tar.gz"
curl -fsSLO "https://github.com/KrakenKey/connector/releases/download/v${VERSION}/${ARCHIVE}"
grep " ${ARCHIVE}\$" checksums.txt | sha256sum -c   # checksums.txt verified above

tar -xzf "${ARCHIVE}" "krakenkey-connector-plugin-${PLUGIN}"
sudo install -d -m 0755 "/usr/lib/krakenkey-connector/plugins/${PLUGIN}/${VERSION}"
sudo install -m 0755 "krakenkey-connector-plugin-${PLUGIN}" "/usr/lib/krakenkey-connector/plugins/${PLUGIN}/${VERSION}/"

# After installing every plugin you need:
cd /usr/lib/krakenkey-connector/plugins
sudo sh -c 'sha256sum */*/krakenkey-connector-plugin-* > plugins.lock'
```

The binaries, `plugins.lock` and every directory up to `/` must be owned by root and not writable by group or others, so the connector's own user can't change them. Rewrite `plugins.lock` whenever you add or upgrade a plugin. With the lock in place, the config only needs each plugin's version. (You can also install plugins under the data directory instead, with a `sha256` for each in the config; see the [connector README](https://github.com/KrakenKey/connector/blob/v0.1.0/README.md#external-plugins).)

### Service user and data directory

The data directory holds the identity key, local private keys, state and the audit log. It must be owned by the connector's user with mode `0700`; the connector refuses anything looser.

```bash
sudo useradd --system --home-dir /var/lib/krakenkey-connector --shell /usr/sbin/nologin krakenkey-connector
sudo install -d -m 0700 -o krakenkey-connector -g krakenkey-connector /var/lib/krakenkey-connector
sudo install -d -m 0755 /etc/krakenkey-connector
```

Run `enroll` as this same user, so the identity files belong to it. Plugins and deploy commands run with the connector's permissions. A dedicated user is the right choice for cloud targets. For a `file` target that writes into a web server's config and reloads it, that user needs write access to the target directory and permission to run the reload command; running the connector as root is the simpler alternative.

## 3. Write the config

One YAML file per connector, at `/etc/krakenkey-connector/config.yaml` by default (`--config` or `KK_CONNECTOR_CONFIG` to change it). The only thing about a target KrakenKey ever sees is its `label`.

| Key | Default | Meaning |
| --- | --- | --- |
| `krakenkey.api_url` | `https://api.krakenkey.io` | API base URL. `KK_API_URL` overrides it. |
| `check_interval` | `6h` | Time between passes in `run` mode. Minimum `1m`. |
| `data_dir` | `/var/lib/krakenkey-connector` | Keys, identity, state and plugin binaries. Owned by the connector's user, mode `0700`. |
| `plugin_dir` | `/usr/lib/krakenkey-connector/plugins` | System plugin directory, root-owned, with a `plugins.lock`. `KK_PLUGIN_DIR` overrides it. |
| `audit_log` | `<data_dir>/audit.jsonl` | Audit log, one JSON object per line, mode `0600`. |
| `plugins` | | Plugins by name, with `version` and optionally `sha256`, `path` and `call_timeout` (default `5m`). |
| `certificates[].id` | | KrakenKey certificate ID. |
| `certificates[].names` | | DNS names. Must equal the certificate's names exactly. |
| `certificates[].key_store.plugin` | `local` | Key store. |
| `certificates[].key_store.key_type` | `ecdsa-p256` | `ecdsa-p256`, `ecdsa-p384`, `rsa-2048`, `rsa-3072`, or `rsa-4096` where the plugin supports it. |
| `certificates[].targets[].label` | | Name for logs, the audit log and the dashboard. Unique per certificate. |
| `certificates[].targets[].plugin` | | `file`, `exec`, or a plugin name. |
| `certificates[].targets[].then.exec` | | Command run after activation and again after a rollback, such as a reload. No shell. |
| `certificates[].targets[].then.timeout` | `2m` | Timeout for the `then` command. |
| `certificates[].targets[].verify` | | How to check the deployment. See below. |

Any other keys in a `key_store` or target block are settings for that plugin.

### Verify

Give every target a `verify` block. It is how the connector knows a deployment worked, and what triggers a rollback when it didn't. A target without one is activated with no check, and `validate` warns about it.

```yaml
verify:
  host: shop.example.com     # SNI name; must be one of the certificate's names
  address: 127.0.0.1:443     # optional: where to connect; default host:port
  port: 443                  # used when address is not set; default 443
  window: 10m                # how long to keep trying; default 10m
  ca_file: /etc/ssl/internal-roots.pem   # optional: trust only these roots for the chain
```

The connector connects, sends `host` as SNI, and keeps trying with growing delays until the endpoint serves exactly the issued certificate or the window ends. Then it validates the served chain against the system roots, or only the roots in `ca_file`. Set `address` when the name resolves somewhere other than the server you want to check, such as one server behind a load balancer.

### Files for nginx, HAProxy or Caddy

```yaml
check_interval: 6h
certificates:
  - id: 1041
    names: [shop.example.com, www.shop.example.com]
    key_store: { plugin: local, key_type: ecdsa-p256 }
    targets:
      - label: web-01
        plugin: file
        dir: /etc/nginx/tls/shop                # must exist
        files: { cert: cert.pem, chain: chain.pem, fullchain: fullchain.pem, key: key.pem }
        owner: "root:nginx"                     # optional: user, user:group or :group
        mode: "0640"                            # key file mode; default 0600
        then: { exec: [systemctl, reload, nginx] }
        verify: { host: shop.example.com, address: 127.0.0.1:443 }
```

`key` is required, and so is `cert` or `fullchain`. Each file is written to a temporary file and renamed into place, so the server never reads a partial file. Before that, the current files are copied to `<dir>/.krakenkey-previous/` for rollback. Certificate files get mode `0644`; quote `mode` so YAML keeps it as a string.

To install somewhere the `file` target doesn't cover, use the `exec` target: it runs your command with `KK_ACTION=deploy` and the paths in `KK_CERT_FILE`, `KK_CHAIN_FILE`, `KK_FULLCHAIN_FILE` and `KK_KEY_FILE`, and again with `KK_ACTION=rollback` and the previous files if the deployment fails. See the [README](https://github.com/KrakenKey/connector/blob/v0.1.0/README.md#built-in-target-exec).

### Azure Key Vault and Application Gateway

```yaml
check_interval: 6h
plugins:
  azure-keyvault: { version: 0.1.0 }
  azure-appgateway: { version: 0.1.0, call_timeout: 15m }   # gateway updates take minutes
certificates:
  - id: 1042
    names: [shop.example.com, www.shop.example.com]
    key_store:
      plugin: azure-keyvault
      key_type: rsa-2048            # Application Gateway serves RSA
      vault: kv-example-prod        # vault name or URL
      certificate_name: shop-example-com
      exportable: true              # default; Application Gateway needs it
      # adopt: true                 # only to take over an existing certificate
    targets:
      - label: appgw-prod
        plugin: azure-appgateway
        subscription_id: 00000000-0000-0000-0000-000000000000
        resource_group: rg-web-prod
        gateway: agw-web-prod
        ssl_certificate: shop-example-com    # the gateway's existing SSL certificate entry
        verify: { host: shop.example.com, window: 15m }
```

Key Vault creates the key and the CSR, and the connector merges the issued certificate back as a new version. The gateway gets the versioned secret ID, so the new certificate goes live with the gateway update, and rolling back points the entry at the previous version again. The connector never reads the key for this pair.

Two gateway settings change what can be rolled back:

- If the entry holds a certificate uploaded to the gateway instead of a Key Vault reference, the connector refuses to replace it unless you set `replace_uploaded_certificate: true` on the target. That first switch can't be rolled back, because Azure never returns uploaded certificates.
- If the entry points at a versionless ID of the same secret, rolling back that first activation isn't possible either. Later activations always use versioned IDs.

If the gateway is also managed by Terraform or another tool, tell it to ignore `sslCertificates[*].keyVaultSecretId`.

### AWS Certificate Manager

```yaml
check_interval: 6h
plugins:
  aws-acm: { version: 0.1.0 }
certificates:
  - id: 1043
    names: [api.example.com]
    key_store: { plugin: local, key_type: ecdsa-p256 }   # must match the placeholder's key type
    targets:
      - label: public-alb
        plugin: aws-acm
        region: us-east-1
        certificate_arn: arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-0000-0000-000000000000
        verify: { host: api.example.com, window: 10m }    # 30m for CloudFront
```

Load balancers serve a re-imported certificate within a few minutes; CloudFront can take longer to reach every edge location, so give distributions `window: 30m`. CloudFront and edge-optimized API Gateway domains use certificates in `us-east-1`. Check which key types your services accept: CloudFront doesn't take P-384, and API Gateway custom domains take RSA up to 2048 bits. `rsa-2048` is the safe choice for a certificate shared across services.

ACM never returns an imported private key, so for a rollback the connector hands the plugin the certificate and key it deployed before. That needs a key store that can export keys, like `local`. The very first deployment over the placeholder can't be rolled back.

## 4. Grant cloud permissions

Give the connector's identity only what its plugins call, scoped to the vault, gateway or certificate they manage.

### Key Vault

A custom role with only these data actions, assigned on the vault:

```json
{
  "Name": "KrakenKey connector Key Vault key store",
  "IsCustom": true,
  "Description": "Create Key Vault certificates, merge issued certificates and read them for the KrakenKey connector.",
  "Actions": [],
  "NotActions": [],
  "DataActions": [
    "Microsoft.KeyVault/vaults/certificates/read",
    "Microsoft.KeyVault/vaults/certificates/create/action",
    "Microsoft.KeyVault/vaults/certificates/update/action",
    "Microsoft.KeyVault/vaults/secrets/getSecret/action"
  ],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/<subscription-id>/resourceGroups/<resource-group>"]
}
```

Drop `secrets/getSecret/action` unless a target needs the key as PEM or PFX, such as a `file` target fed from Key Vault. Application Gateway doesn't: the gateway's own identity reads the secret. With vault access policies instead of Azure RBAC, grant certificate permissions **Get**, **Create** and **Update**, plus secret permission **Get** only for PEM or PFX.

### Application Gateway

A gateway update is a full update of the gateway resource, and Azure re-checks the caller's rights on everything it links to: the subnet, public IP address, WAF policy and user-assigned identity. That takes two custom roles.

Assign this one on the gateway only:

```json
{
  "Name": "KrakenKey Application Gateway certificate writer",
  "IsCustom": true,
  "Description": "Read and update Application Gateways.",
  "Actions": [
    "Microsoft.Network/applicationGateways/read",
    "Microsoft.Network/applicationGateways/write"
  ],
  "NotActions": [],
  "DataActions": [],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/<subscription-id>/resourceGroups/<gateway-resource-group>"]
}
```

And this one on the gateway's subnet, public IP address, WAF policy (if any) and user-assigned identity:

```json
{
  "Name": "KrakenKey Application Gateway linked resources",
  "IsCustom": true,
  "Description": "Let an Application Gateway update keep its subnet, public IP, WAF policy and identity.",
  "Actions": [
    "Microsoft.Network/virtualNetworks/subnets/read",
    "Microsoft.Network/virtualNetworks/subnets/join/action",
    "Microsoft.Network/publicIPAddresses/read",
    "Microsoft.Network/publicIPAddresses/join/action",
    "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/read",
    "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/join/action",
    "Microsoft.ManagedIdentity/userAssignedIdentities/assign/action"
  ],
  "NotActions": [],
  "DataActions": [],
  "NotDataActions": [],
  "AssignableScopes": [
    "/subscriptions/<subscription-id>/resourceGroups/<gateway-resource-group>",
    "/subscriptions/<subscription-id>/resourceGroups/<network-resource-group>",
    "/subscriptions/<subscription-id>/resourceGroups/<identity-resource-group>"
  ]
}
```

List every resource group that holds one of those resources in `AssignableScopes`; in hub-and-spoke networks the subnet is often in another one. The built-in **Network Contributor** role is much broader and still lacks the identity assign right. The connector needs no Key Vault access for this plugin; the gateway's own identity needs **Key Vault Secrets User** on the vault.

### AWS Certificate Manager

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["acm:DescribeCertificate", "acm:ImportCertificate"],
      "Resource": ["arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-0000-0000-000000000000"]
    }
  ]
}
```

List each certificate ARN the connector manages. It never creates, tags or deletes certificates.

### Credentials

- **Azure plugins** use the Azure SDK's default credential chain: environment variables, workload identity, managed identity, then Azure CLI logins. On a VM or container with a managed identity, set `AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential`, and `AZURE_CLIENT_ID` for a user-assigned identity.
- **The AWS plugin** uses the AWS SDK's default chain: environment, shared config, web identity, ECS task role, EC2 instance profile. Prefer a task role or instance profile to static keys.

Plugins inherit the connector's environment, minus its KrakenKey credentials. Some cloud SDK settings decide where a plugin sends private keys and tokens, such as `AWS_ENDPOINT_URL`, `AZURE_AUTHORITY_HOST`, `HTTPS_PROXY` and `SSL_CERT_FILE`. Whoever can set the connector's environment or the SDK config files is inside your trust boundary, so set these only on purpose. The [README](https://github.com/KrakenKey/connector/blob/v0.1.0/README.md#trust-boundary) has the full list.

## 5. Enroll, validate and run once

Enroll once with the token, run `validate` until it reports no problems, then run one pass by hand and watch it before putting the connector on a schedule.

### Enroll

The connector creates its identity key, stores it under `<data_dir>/identity/`, and spends the token. It reads the token from a file that only the connector's user can read.

On a host, as the connector's user:

```bash
sudo install -m 0600 -o krakenkey-connector /dev/null /etc/krakenkey-connector/enrollment-token
sudoedit /etc/krakenkey-connector/enrollment-token   # paste the kkce_... token
sudo -u krakenkey-connector env \
  KK_ENROLLMENT_TOKEN_FILE=/etc/krakenkey-connector/enrollment-token \
  krakenkey-connector enroll --config /etc/krakenkey-connector/config.yaml
sudo rm /etc/krakenkey-connector/enrollment-token   # it works only once
```

In a container, make the token file owned by the image's user (uid 10001), and mount it with the config and the data volume:

```bash
sudo install -m 0600 -o 10001 /dev/null /etc/krakenkey-connector/enrollment-token
sudoedit /etc/krakenkey-connector/enrollment-token   # paste the kkce_... token
docker run --rm \
  -e KK_ENROLLMENT_TOKEN_FILE=/run/secrets/kk_enrollment_token \
  -v /etc/krakenkey-connector/enrollment-token:/run/secrets/kk_enrollment_token:ro \
  -v /etc/krakenkey-connector/config.yaml:/etc/krakenkey-connector/config.yaml:ro \
  -v krakenkey-connector-data:/var/lib/krakenkey-connector \
  ghcr.io/krakenkey/connector:v0.1.0 enroll --config /etc/krakenkey-connector/config.yaml
sudo rm /etc/krakenkey-connector/enrollment-token
```

The connector's page in the dashboard changes from *Waiting to enroll* to *Active*.

### Validate

Run the same command with `validate` instead of `enroll` (and without the token). It loads the config, starts every plugin and shows where it was found and which checksum it matched, checks that each key store and target can work together, checks the identity, and asks KrakenKey about each certificate. A new certificate shows as *waiting for this connector to issue it*. It ends with a count; fix anything until it reads `0 problem(s)`, and read the warnings.

```bash
sudo -u krakenkey-connector krakenkey-connector validate --config /etc/krakenkey-connector/config.yaml
```

`validate --offline` skips the API checks.

### First pass

Run one pass with `run --once`. The connector creates the key, sends the CSR, waits for issuance (usually a few minutes), installs the certificate, checks the endpoint over TLS, and exits `0`. The connector's page shows the target as *Verified*.

```bash
sudo -u krakenkey-connector krakenkey-connector run --once --config /etc/krakenkey-connector/config.yaml
```

To renew now regardless of the schedule, for example to test a new target, add `--force`, and `--cert <id>` to limit the pass to one certificate:

```bash
krakenkey-connector run --once --force --cert 1042
```

## 6. Run on a schedule

Leave the connector running in `run` mode. It checks every `check_interval` (6 hours by default) and only renews when KrakenKey says a certificate is due.

### Container

The image runs `run` with the default config path, so no command is needed. Mount the same config and data volume, plus any directories a `file` target writes to:

```bash
docker run -d --name krakenkey-connector --restart unless-stopped \
  -v /etc/krakenkey-connector/config.yaml:/etc/krakenkey-connector/config.yaml:ro \
  -v krakenkey-connector-data:/var/lib/krakenkey-connector \
  ghcr.io/krakenkey/connector:v0.1.0
```

Pass cloud settings such as `AZURE_TOKEN_CREDENTIALS` with `-e`. When you upgrade the image, change the plugin versions in the config to match.

### systemd

```ini
# /etc/systemd/system/krakenkey-connector.service
[Unit]
Description=KrakenKey connector
Wants=network-online.target
After=network-online.target

[Service]
User=krakenkey-connector
ExecStart=/usr/local/bin/krakenkey-connector run --config /etc/krakenkey-connector/config.yaml
Restart=on-failure
RestartSec=60
# 3 and 5 mean KrakenKey refused the credentials; restarting won't help
RestartPreventExitStatus=3 5
# Environment=AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now krakenkey-connector
journalctl -u krakenkey-connector -f
```

You can also run `run --once` from cron or a systemd timer instead; the exit code tells you how the pass went. Only one connector process can use a data directory at a time.

### Exit codes

| Code | Meaning | What to do |
| --- | --- | --- |
| `0` | Every certificate and target succeeded. | Nothing. |
| `1` | A certificate or target failed. | Read the log or audit log. `run` mode keeps going and retries with backoff. |
| `2` | Usage or config error, including missing credentials, or `enroll` on an enrolled connector. | Fix the config and run `validate`. |
| `3` | KrakenKey rejected the API key, or refused the enrollment token. | For a refused token, get a new one with **New enrollment token** (or create a new connector) and enroll again. |
| `4` | KrakenKey asked the connector to back off for longer than it waits. | Nothing; `run` mode tries again at the next interval. |
| `5` | KrakenKey refused the connector's identity: it was revoked, its identity key isn't the one KrakenKey has, or the clock is more than five minutes off. | Check the clock. If the connector was revoked, create a new one and run `enroll --force`. |

`run` mode keeps running after `1` and `4` and exits on `3` and `5`. After a `401` the connector stops calling the API, so a bad credential can't get its IP address locked out.

## Monitoring and alerts

- **Connectors page:** each connector's status (*Waiting to enroll*, *Enrollment token expired*, *Active*, *Stale* after 24 hours without contact, *Revoked*), version, when it was last seen, and how many certificates it has deployed, with failing targets counted in red.
- **A connector's page:** every target with its state (*Pending*, *Staged*, *Activated*, *Verified*, *Activated (not verified)*, *Failed*, *Rolled back*), the serial it serves, and the error.
- **Certificates page:** a connector-managed certificate lists the connectors and targets it is deployed to.

Two alerts cover what needs a person. Both go by email (set under **Deployment Failed** and **Connector Offline** in your notification settings) and to Slack, Teams and webhook alert channels, which subscribe to them by default:

- **`deploy.failed`:** a target moved to *Failed* or *Rolled back*. At most one alert per target every 6 hours, and at most one email per connector per hour; later failures are counted in the next one.
- **`connector.stale`:** a connector hasn't checked in for 24 hours. Sent once, until it checks in again.

When issuance fails on KrakenKey's side, for example because of a missing `_acme-challenge` CNAME, the targets stay *Pending* with the error, and KrakenKey's usual certificate failure alert covers it.

On the host, logs go to stderr; add `--log-format json` for log shipping. The audit log (`<data_dir>/audit.jsonl`) records every step that changes something, with old and new serials and results. Neither ever contains key material.

## Troubleshooting

`validate` catches most of these before anything is deployed.

| Message or symptom | Cause | Fix |
| --- | --- | --- |
| Certificate fails with `ACME challenge delegation missing` | No `_acme-challenge` CNAME for that name | Create the record the message names, then run another pass. |
| `config names [...] differ from the names KrakenKey is waiting for` | `names` in the config doesn't match the pending certificate | Make `names` match exactly. The connector creates nothing until it does. |
| `the ACM certificate has no key usage restriction (ACM shows ANY)` | The placeholder was imported without key usage options | Import a new placeholder with the command in step 1, attach it, and use its ARN. |
| `ACM cannot change the key type on reimport` | `key_type` differs from the ACM certificate's key | Match `key_type` to it, or import a placeholder with the new key type. |
| `certificate "..." in https://... was not created by the connector` | A Key Vault certificate with that name already exists | Set `adopt: true` for the first run, or use a new `certificate_name`. |
| `the gateway has no user-assigned managed identity` | The gateway uses a system-assigned identity, or none | Add a user-assigned identity with **Key Vault Secrets User** on the vault. |
| `ssl certificate "..." holds a certificate uploaded to the gateway` | The listener uses an uploaded PFX, not Key Vault | Set `replace_uploaded_certificate: true`. That first switch can't be rolled back. |
| `no usable Azure credential` | No identity visible to the plugin | Check the identity is attached, then set `AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential` and, for a user-assigned identity, `AZURE_CLIENT_ID`. |
| Verify times out on CloudFront | Edge propagation is slow | Use `window: 30m`. |
| Exit code `5` | Connector revoked, or clock more than five minutes off | Fix NTP. If revoked, create a new connector and enroll again. |
| `insecure permissions: ... has mode 0755; run: chmod 700 ...` | Data directory or key files too open | Run the `chmod` it prints, and make sure the connector's user owns the path. |

## Removing a connector

Revoking the connector in the dashboard cuts off its access at once. Certificates already installed keep working until they expire.

1. Go to **Connectors**, open the connector, and select **Revoke**. Every key it was issued stops working, and its next check exits with code `5`. A revoked connector can't enroll again.
2. Stop the container or service, and delete the data directory. It holds the identity key, any local private keys and the state.
3. `file` targets keep copies of earlier keys in `<dir>/.krakenkey-previous/`. Delete them once you no longer need to roll back.
4. Remove the custom roles and the IAM policy from step 4.
5. Decide what serves those sites next. Certificates the connector managed aren't renewed until another connector takes them over. To hand one back to KrakenKey's own renewal, set `{"managedBy": null, "autoRenew": true}` with the same `PATCH` as in step 1. KrakenKey's renewal reuses the last CSR, so you still need its private key (the key file a `file` target wrote, or the Key Vault certificate) and another way to deploy. Otherwise, issue new certificates before these expire.

Nothing on the targets is removed: Key Vault keeps its certificate versions, and ACM keeps the imported certificate.

## Reference

- [Connector repository](https://github.com/KrakenKey/connector) and [README](https://github.com/KrakenKey/connector/blob/v0.1.0/README.md): every command, flag and config key.
- [Changelog](https://github.com/KrakenKey/connector/blob/main/CHANGELOG.md) and [releases](https://github.com/KrakenKey/connector/releases).
- Plugin READMEs: [azure-keyvault](https://github.com/KrakenKey/connector/blob/v0.1.0/plugins/azure-keyvault/README.md), [azure-appgateway](https://github.com/KrakenKey/connector/blob/v0.1.0/plugins/azure-appgateway/README.md), [aws-acm](https://github.com/KrakenKey/connector/blob/v0.1.0/plugins/aws-acm/README.md).
- [Writing a plugin](https://github.com/KrakenKey/connector/blob/v0.1.0/README.md#writing-a-plugin): the gRPC protocol and Go SDK.
