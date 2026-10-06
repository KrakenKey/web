---
title: Issue and renew certificates in GitHub Actions
description: Use the KrakenKey GitHub Action to issue a certificate once, renew it on a schedule, and deploy it to your servers over SSH only when the live certificate is older.
sidebar:
  label: GitHub Actions
---

If GitHub Actions already deploys the service that terminates TLS, it can own the certificate too. The [KrakenKey cert action](https://github.com/KrakenKey/cert-action) wraps the CLI: it issues, renews or downloads a certificate and hands the file paths to later steps. Your runners need no DNS credentials and your servers need no inbound port 80. See [How KrakenKey fits your stack](/docs/architecture/) for how this compares with the other setups.

This guide sets up two workflows for a web server at `example.com`:

1. **Issue**, run once by hand. It creates the key and certificate and installs both on the server.
2. **Renew**, run daily. It renews the certificate when it's due and deploys it whenever the server is serving an older one.

## When this fits, and the trade-off

The `issue` command creates the private key on the runner, so the key passes through GitHub's runner and your SSH connection once, at issuance. Renewals reuse the same key, so after that only certificates travel. GitHub-hosted runners are discarded after each job.

If the key should never exist anywhere but the server, run the CLI on the server instead: see [nginx and HAProxy](/docs/integrations/nginx-haproxy/) or [Caddy](/docs/integrations/caddy/). For AWS load balancers and CloudFront, see [AWS ACM](/docs/integrations/aws-acm/), which uses the same action.

## Prerequisites

- A verified domain in KrakenKey with both DNS records from [Getting started](/docs/getting-started/).
- In the repository's **Settings → Secrets and variables → Actions**:
  - Secret `KRAKENKEY_API_KEY`: an API key from the KrakenKey dashboard.
  - Secret `DEPLOY_SSH_KEY`: a private SSH key for a deploy user on the server.
  - Variable `DEPLOY_KNOWN_HOSTS`: the server's host key line, from `ssh-keyscan web1.example.com` checked against the server itself.
- On the server, a deploy user that owns `/srv/tls` and can reload the web server without a password. For nginx, a sudoers file like:

  ```text
  deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
  ```

- nginx (or your server) pointed at `/srv/tls/example.com.fullchain.pem` and `/srv/tls/example.com.key`. The [nginx guide](/docs/integrations/nginx-haproxy/#2a-configure-nginx) has a server block. Until step 1 has run those files don't exist, so add the config after it.

## 1. Issue the certificate once

Save as `.github/workflows/tls-issue.yml`:

```yaml
name: Issue TLS certificate
on: workflow_dispatch

permissions:
  contents: read

jobs:
  issue:
    runs-on: ubuntu-latest
    steps:
      - name: Issue certificate
        id: cert
        uses: krakenkey/cert-action@v1
        with:
          api-key: ${{ secrets.KRAKENKEY_API_KEY }}
          domain: example.com
          san: www.example.com
          auto-renew: 'false'
          key-path: ${{ runner.temp }}/example.com.key
          fullchain-path: ${{ runner.temp }}/example.com.fullchain.pem

      - name: Install on the server
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ vars.DEPLOY_KNOWN_HOSTS }}
          KEY: ${{ steps.cert.outputs.key-path }}
          FULLCHAIN: ${{ steps.cert.outputs.fullchain-path }}
        run: |
          install -d -m 700 ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/deploy && chmod 600 ~/.ssh/deploy
          printf '%s\n' "$KNOWN_HOSTS" >> ~/.ssh/known_hosts
          ssh() { command ssh -i ~/.ssh/deploy deploy@web1.example.com "$@"; }

          ssh 'umask 077; cat > /srv/tls/example.com.key.new' < "$KEY"
          ssh 'umask 022; cat > /srv/tls/example.com.fullchain.pem.new' < "$FULLCHAIN"
          ssh 'cd /srv/tls && mv example.com.key.new example.com.key \
            && mv example.com.fullchain.pem.new example.com.fullchain.pem'
          rm -f "$KEY"

      - name: Record the certificate ID
        run: echo "Certificate ID: ${{ steps.cert.outputs.cert-id }}" >> "$GITHUB_STEP_SUMMARY"
```

Run it from the **Actions** tab. When it finishes, copy the certificate ID from the run summary into a repository variable named `KK_CERT_ID`. Then add the TLS config to the server and reload it.

`auto-renew: 'false'` makes the renew workflow the only thing that renews this certificate, so there's one place to look when something goes wrong. Leaving KrakenKey's auto-renew on also works, because the deploy step below compares certificates instead of trusting the `renewed` output.

The key and certificate are written to the runner's temp directory, not the workspace, so a later step can't accidentally upload them as an artifact.

## 2. Renew and deploy on a schedule

Save as `.github/workflows/tls-renew.yml`:

```yaml
name: Renew TLS certificate
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency: tls-example-com

jobs:
  renew:
    runs-on: ubuntu-latest
    steps:
      - name: Renew if due
        id: cert
        uses: krakenkey/cert-action@v1
        with:
          api-key: ${{ secrets.KRAKENKEY_API_KEY }}
          command: renew
          cert-id: ${{ vars.KK_CERT_ID }}
          if-due: 'true'
          poll-timeout: 20m
          fullchain-path: ${{ runner.temp }}/example.com.fullchain.pem

      - name: Deploy if the server has an older certificate
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ vars.DEPLOY_KNOWN_HOSTS }}
          FULLCHAIN: ${{ steps.cert.outputs.fullchain-path }}
          HOST: web1.example.com
          NAME: example.com
        run: |
          fp() { openssl x509 -noout -fingerprint -sha256; }
          new=$(fp < "$FULLCHAIN")
          live=$(openssl s_client -connect "$HOST:443" -servername "$NAME" </dev/null 2>/dev/null | fp || true)
          if [ "$new" = "$live" ]; then
            echo "Server already serves this certificate (renewed=${{ steps.cert.outputs.renewed }})"
            exit 0
          fi

          install -d -m 700 ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/deploy && chmod 600 ~/.ssh/deploy
          printf '%s\n' "$KNOWN_HOSTS" >> ~/.ssh/known_hosts
          ssh() { command ssh -i ~/.ssh/deploy "deploy@$HOST" "$@"; }

          ssh "umask 022; cat > /srv/tls/$NAME.fullchain.pem.new" < "$FULLCHAIN"
          ssh "mv /srv/tls/$NAME.fullchain.pem.new /srv/tls/$NAME.fullchain.pem \
            && sudo /usr/sbin/nginx -t && sudo /usr/bin/systemctl reload nginx"
          echo "Deployed certificate expiring ${{ steps.cert.outputs.expires }}"
```

How it behaves:

- **Most days nothing happens.** With `if-due: 'true'` the action renews only inside your plan's renewal window (30 days before expiry on paid plans, 5 on Free). Outside it, it still downloads the current certificate and sets `renewed` to `false`.
- **The deploy compares fingerprints with what the server actually serves.** If a renewal ran but the deploy failed, or someone restored an old file, the next run notices and deploys again. Connect to the server's own address in `HOST`, not a load balancer or CDN in front of it.
- **Only the certificate moves.** Renewal reuses the original CSR, so the key already on the server still matches.
- **One run at a time.** The `concurrency` group stops a manual run and a scheduled one from renewing together.

For several servers, turn the deploy step into a matrix over hostnames, or loop over them in the script.

## Things to know

- **Scheduled workflows can stop.** GitHub disables `schedule` triggers in a public repository after 60 days with no activity, and delays or drops runs when its queue is busy. Add the hostnames as [monitored endpoints](/docs/cli/commands/#krakenkey-endpoint) in KrakenKey so a stalled schedule shows up as an expiring certificate long before it becomes an outage.
- **Pin the CLI if you want repeatable runs.** The action installs the latest `krakenkey` CLI by default. Set `cli-version: v0.8.0` (or another release) to pin it.
- **Treat the API key like a deploy credential.** It can manage the account's domains and certificates. Keep it in a repository or environment secret, and use a [GitHub environment](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment) with required reviewers if pull requests from forks or other branches shouldn't be able to reach it.
- **Lost the key?** Run the issue workflow again. That creates a new key and a new certificate, so update `KK_CERT_ID` afterwards.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Renew step fails with `Certificate must be in 'issued' state to renew` | The certificate is mid-renewal, or a renewal failed. `krakenkey cert show <id>` gives the status and any failure reason; `krakenkey cert retry <id>` retries a failed one. |
| Deploy runs every day | The fingerprint check never matches. Check `HOST` reaches the server itself, and that nginx was reloaded and points at `/srv/tls`. |
| `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` doesn't match the server. Regenerate it and compare with `ssh-keygen -lf` on the server. |
| `sudo: a password is required` | The sudoers line doesn't match the exact command paths used in the workflow. |
| Issuance fails on the challenge | Run `krakenkey domain check example.com www.example.com` locally, or `dig CNAME _acme-challenge.example.com +short`, which should return `example-com.acme.krakenkey.io.` |
