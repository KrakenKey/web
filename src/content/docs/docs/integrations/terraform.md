---
title: Manage KrakenKey with Terraform
description: Use the KrakenKey Terraform provider to register domains, publish their DNS records, issue certificates from a CSR, and set up endpoint monitoring and alerts, without putting a private key in Terraform state.
sidebar:
  label: Terraform
---

The [KrakenKey Terraform provider](https://registry.terraform.io/providers/KrakenKey/krakenkey/latest) manages the KrakenKey side of your setup as code: domains, the DNS records they need, certificates, monitored endpoints and alert channels. It sits next to the provider for your DNS host and the one for wherever the certificate ends up, so a single `terraform apply` can take a new hostname from nothing to a monitored, issued certificate. See [How KrakenKey fits your stack](/docs/architecture/) for how this compares with the other setups.

## When this fits

- Your DNS zones and cloud resources are already in Terraform, and you want certificates and monitoring reviewed and applied the same way.
- You add hostnames often and want the domain, its DNS records, the certificate and its monitoring to arrive in one change.
- You want endpoint monitoring and alert routing defined in code, even for certificates issued some other way.

If a server can run the [CLI](/docs/cli/) itself, a [systemd timer on the host](/docs/integrations/nginx-haproxy/) is still the simplest way to keep it renewed. Terraform can set up the domain and monitoring around it.

## How it works

- **KrakenKey never sees the private key.** `krakenkey_certificate` takes a CSR. The key comes from wherever you create it: the server, a key vault, or Terraform itself as shown below.
- **The key doesn't have to be in state.** With Terraform 1.11 or later, an ephemeral key and write-only arguments let Terraform create the key, hand it to a secret store and build the CSR without writing the key to state or to a saved plan.
- **KrakenKey renews, Terraform reads.** With `auto_renew` on, KrakenKey renews the certificate itself, reusing the same CSR. The next `terraform plan` or `apply` picks up the new `fullchain_pem` and expiry. Getting it onto the server is covered in [step 5](#5-deliver-renewals).
- **Destroy keeps the certificate.** Destroying or replacing `krakenkey_certificate` removes it from state and leaves it valid in KrakenKey, so a refactor can't take a certificate out from under a live server. Set `revoke_on_destroy = true` to revoke instead.

| Resource or data source | What it manages |
| --- | --- |
| `krakenkey_domain` | A domain, plus the names and values of its TXT and CNAME records |
| `krakenkey_domain_verification` | Verifying the domain once its TXT record is published |
| `krakenkey_certificate` | A certificate issued from a CSR, kept current by KrakenKey |
| `krakenkey_endpoint`, `krakenkey_endpoint_region` | A monitored TLS endpoint, and hosted probe regions for it (Starter plan and above) |
| `krakenkey_alert_channel` | Alerts sent to a webhook, Slack, Discord or Microsoft Teams |
| `data.krakenkey_certificate`, `data.krakenkey_endpoint` | Reading a certificate or endpoint by ID |

The [Registry docs](https://registry.terraform.io/providers/KrakenKey/krakenkey/latest/docs) list every argument and attribute.

## Prerequisites

- Terraform 1.11 or later, for the write-only arguments used here.
- A KrakenKey API key from the dashboard. A key limited to certain scopes needs `domains:read` and `domains:write` for domains, `certs:read` and `certs:issue` for certificates, `endpoints:read` and `endpoints:write` for monitoring, and `account:read` and `account:write` for alert channels.
- Terraform access to your DNS host. The examples use Cloudflare (provider v5); any DNS provider that can create TXT and CNAME records works.
- A secret store for the private key. The examples use HashiCorp Vault; [step 4](#4-issue-the-certificate) lists the equivalent arguments for AWS, Azure and Google Cloud.

## 1. Configure the provider

```hcl
terraform {
  required_version = ">= 1.11"
  required_providers {
    krakenkey = {
      source  = "krakenkey/krakenkey"
      version = "~> 0.1"
    }
    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.4.0"
    }
  }
}

# Reads the API key from KK_API_KEY.
provider "krakenkey" {}
```

Set `KK_API_KEY` in the environment that runs Terraform, from your CI secret store or password manager. Don't put the key in a `.tf` or `.tfvars` file.

## 2. Register the domain and publish its DNS records

```hcl
resource "krakenkey_domain" "example" {
  hostname = "example.com"
}

resource "cloudflare_dns_record" "kk_verify" {
  zone_id = var.cloudflare_zone_id
  name    = krakenkey_domain.example.txt_record_name
  type    = "TXT"
  content = krakenkey_domain.example.txt_record_value
  ttl     = 1
}

resource "cloudflare_dns_record" "kk_acme" {
  zone_id = var.cloudflare_zone_id
  name    = krakenkey_domain.example.cname_record_name
  type    = "CNAME"
  content = krakenkey_domain.example.cname_record_value
  ttl     = 1
  proxied = false
}
```

These are the same two records as in [Getting started](/docs/getting-started/): the TXT record proves you own the domain, and the `_acme-challenge` CNAME lets KrakenKey answer DNS-01 challenges for every certificate under it. Leave both in place. KrakenKey re-checks the TXT record daily, and every renewal uses the CNAME. The CNAME must not be proxied.

If the domain is already in your KrakenKey account, import it instead of creating it: `terraform import krakenkey_domain.example <domain-id>`.

## 3. Verify the domain

```hcl
resource "krakenkey_domain_verification" "example" {
  domain_id = krakenkey_domain.example.id

  timeouts = {
    create = "15m"
  }

  depends_on = [cloudflare_dns_record.kk_verify]
}
```

Terraform can't see that verification depends on the TXT record, because the link runs through DNS, so `depends_on` states it. The resource retries until the record has propagated, backing off between attempts. Verification counts toward the hourly rate limit for expensive operations, so the retries are spaced out.

## 4. Issue the certificate

```hcl
variable "key_version" {
  description = "Bump to rotate the private key."
  type        = number
  default     = 1
}

# A new key is generated on every run, but it's only used when key_version
# changes. Ephemeral: it never reaches plan or state.
ephemeral "tls_private_key" "web" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

# Store the key. Write-only, so state keeps no copy.
resource "vault_kv_secret_v2" "key" {
  mount                = "secret"
  name                 = "tls/example.com/key"
  data_json_wo         = jsonencode({ private_key_pem = ephemeral.tls_private_key.web.private_key_pem })
  data_json_wo_version = var.key_version
}

# The CSR, from the same key in the same run. The CSR is public, so it stays in
# state and later runs reuse it.
resource "tls_cert_request" "web" {
  private_key_pem_wo         = ephemeral.tls_private_key.web.private_key_pem
  private_key_pem_wo_version = var.key_version

  subject {
    common_name = "example.com"
  }
  dns_names = ["example.com", "www.example.com"]
}

resource "krakenkey_certificate" "web" {
  csr_pem = tls_cert_request.web.cert_request_pem

  # Every name in the CSR must be on a verified domain, and the CNAME must be
  # in place before issuance starts.
  depends_on = [
    krakenkey_domain_verification.example,
    cloudflare_dns_record.kk_acme,
  ]
}
```

`apply` waits for the certificate to be issued, which usually takes a few minutes. After that, `fullchain_pem` holds the leaf and its intermediates. That's what nginx, HAProxy, Caddy and most other servers want.

Two rules keep the key stable:

- **Pin everything that uses the ephemeral key to `key_version`.** The key is new on every run; only the version argument decides whether it's used. Bump `key_version` to rotate: Terraform stores a new key, builds a new CSR and issues a new certificate, and the old certificate stays valid until it expires.
- **Read the key back from the store, never from the ephemeral resource.** Anything that needs the key later, like the deploy step below, reads the stored copy.

Other secret stores work the same way through their write-only arguments:

| Store | Resource and argument |
| --- | --- |
| AWS Secrets Manager | `aws_secretsmanager_secret_version.secret_string_wo` |
| Azure Key Vault | `azurerm_key_vault_secret.value_wo` |
| Google Secret Manager | `google_secret_manager_secret_version.secret_data_wo` |
| HashiCorp Vault | `vault_kv_secret_v2.data_json_wo` |

If the key comes from somewhere else, like a host that generates its own or a vault that only hands out a CSR, pass that CSR to `csr_pem` and skip the key resources. Terraform then never touches the key at all.

## 5. Deliver renewals

KrakenKey renews the certificate inside your plan's renewal window, but Terraform only sees the new certificate when it runs. Pick one of these to get it onto your servers:

- **The server pulls it.** The host runs `krakenkey cert download` on a daily timer, as in the [nginx and HAProxy guide](/docs/integrations/nginx-haproxy/), or a workflow uses the [GitHub Action](/docs/integrations/github-actions/). Terraform only sets things up. This is the most reliable option, because it doesn't depend on anyone running Terraform.
- **A scheduled apply pushes it.** A daily `terraform apply` in CI refreshes `fullchain_pem`, and whatever consumes it updates. `expires_at_unix` changes whenever the certificate does, so it can drive a write-only version argument that re-sends the key with each new certificate:

  ```hcl
  ephemeral "vault_kv_secret_v2" "key" {
    mount = vault_kv_secret_v2.key.mount
    # Tied to the computed id, so the read waits for the secret on the first run.
    name = vault_kv_secret_v2.key.id != null ? vault_kv_secret_v2.key.name : null
  }

  resource "vault_kv_secret_v2" "deployed" {
    mount = "secret"
    name  = "deploy/example.com"
    data_json_wo = jsonencode({
      certificate = krakenkey_certificate.web.fullchain_pem
      private_key = ephemeral.vault_kv_secret_v2.key.data.private_key_pem
    })
    data_json_wo_version = krakenkey_certificate.web.expires_at_unix
  }
  ```

  The same pattern feeds `aws_acm_certificate`, which takes the key through `private_key_wo` and `private_key_wo_version`. If the schedule stops running, nothing fails loudly, so pair this with monitoring.

- **An alert triggers your pipeline.** A webhook alert channel sends `cert.renewed` to a small relay that starts your deploy job.

Whichever you pick, KrakenKey keeps renewing on its side. If a run fails or is skipped, the next one still gets the current certificate.

## 6. Monitor the endpoint and route alerts

```hcl
resource "krakenkey_endpoint" "web" {
  host  = "example.com"
  label = "Public site"
}

variable "slack_webhook_url" {
  type      = string
  sensitive = true
  ephemeral = true
}

resource "krakenkey_alert_channel" "ops" {
  type           = "slack"
  name           = "Ops alerts"
  url_wo         = var.slack_webhook_url
  url_wo_version = 1
}
```

The endpoint checks what the server actually presents, so a renewal that never reached the server shows up as an expiring certificate before it becomes an outage. The Slack URL is a credential: `url_wo` keeps it out of state, and `ephemeral = true` keeps the variable out of the plan. Increment `url_wo_version` to send a new URL. On the Starter plan and above, `krakenkey_endpoint_region` adds hosted probes from KrakenKey's regions.

## Bring existing resources under Terraform

Every resource can be imported, so you can adopt certificates, domains and endpoints you created in the dashboard or with the CLI:

```bash
terraform import krakenkey_certificate.web 42
terraform import krakenkey_domain.example <domain-id>
terraform import krakenkey_endpoint.web <endpoint-id>
```

An imported certificate keeps its CSR, so a matching `tls_cert_request` isn't needed: set `csr_pem` to the CSR the certificate was issued from.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `This API key needs the certs:issue scope` (403) | The API key is limited to scopes that don't cover this resource. Add the scope in the dashboard or use another key. |
| `Total active certificate limit reached` (402) | The account is at its plan's limit for issued certificates. Destroy keeps certificates, so replaced ones still count. Revoke the ones you no longer need with `krakenkey cert revoke <id>`, or set `revoke_on_destroy = true`. |
| `rate limited; try again in ...` (429) | Issuance, renewal, revocation and domain verification share an hourly limit. A plan that creates or replaces several certificates can run out partway through. Apply again after the time shown. |
| Certificate `failed` with `ACME challenge delegation missing` | The `_acme-challenge` CNAME wasn't visible when issuance started. Keep `depends_on` on the CNAME record. Once `dig CNAME _acme-challenge.example.com` shows it, run `krakenkey cert retry <id> --wait`, then `terraform untaint krakenkey_certificate.web` and apply again. |
| `KrakenKey already has this domain` | The domain exists in the account. Import it with the ID in the message instead of creating it. |
| Domain verification times out | The TXT record hasn't propagated, or the zone isn't authoritative for the name. Check with `dig TXT example.com`, then apply again. |
| Every run replaces the certificate | Something that uses the ephemeral key isn't pinned to `key_version`, so the CSR changes on each run. |
