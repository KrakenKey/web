---
title: CLI command reference
description: Every krakenkey CLI command and flag for auth, domains, certificates, endpoints and account.
sidebar:
  label: Command reference
  order: 2
---

Install and configuration are covered in [KrakenKey CLI](/docs/cli/).

## `krakenkey auth`

```text
krakenkey auth login --web [--no-browser]     Approve a login in the browser; creates and saves a new API key
krakenkey auth login [--api-key <key>]        Save API key (prompts interactively if omitted)
krakenkey auth logout                         Remove stored API key
krakenkey auth status                         Show auth status and resource counts
krakenkey auth keys list                      List API keys
krakenkey auth keys create --name <name>      Create a new API key
krakenkey auth keys delete <id>               Delete an API key
```

Creating and deleting keys needs a dashboard session. The CLI always calls the API with an API key, including the one `auth login --web` saves, so the API refuses `auth keys create` and `auth keys delete`. To get a new key for the CLI, use `auth login --web` (you approve it in the dashboard); to delete one, use **API Keys** in the dashboard. This stops a leaked key from minting a replacement for itself.

`auth keys create` flags:

| Flag | Description |
| --- | --- |
| `--name` | Name for the API key (required) |
| `--expires-at` | Expiry date in ISO 8601 format (optional) |

## `krakenkey domain`

```text
krakenkey domain add <hostname>    Register a domain and print the TXT and challenge CNAME records
krakenkey domain list              List all domains
krakenkey domain show <id>         Show domain details and verification record
krakenkey domain check <name>...   Check DNS records for the names on a certificate
krakenkey domain verify <id>       Trigger DNS TXT verification
krakenkey domain delete <id>       Delete a domain
```

Each name on a certificate needs a CNAME from `_acme-challenge.<name>` to `<name with dots as dashes>.acme.krakenkey.io`. A `*.` prefix shares its parent's record. KrakenKey checks these before every order. `domain check` takes the certificate names and resolves each challenge CNAME. With a working API key it also checks the ownership TXT of the registered domain that covers them. Each record is reported as `ok`, `missing`, `wrong` (points elsewhere) or `conflict` (TXT records sit where the CNAME should go), and the command exits 1 until everything is in place.

`domain check` flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--resolver` | system resolver | DNS server to query, e.g. `1.1.1.1` |
| `--wait` | `false` | Re-check until every record is in place |
| `--poll-interval` | `30s` | How often to re-check |
| `--poll-timeout` | `15m` | Maximum time to wait |

```bash
krakenkey domain check example.com www.example.com --resolver 1.1.1.1 --wait
```

## `krakenkey cert`

```text
krakenkey cert issue --domain <domain>              Generate key + CSR locally, submit, and optionally wait
krakenkey cert submit --csr <file>                  Submit an existing CSR PEM file
krakenkey cert list [--status <status>]             List certificates (filter: pending|issuing|issued|failed|renewing|revoking|revoked)
krakenkey cert show <id>                            Show certificate details (and the failure reason if it failed)
krakenkey cert download <id> [--out path]           Download certificate PEM
                              [--format cert|chain|fullchain]
krakenkey cert renew <id> [--wait]                  Trigger manual renewal
krakenkey cert revoke <id> [--reason N]             Revoke a certificate (RFC 5280 reason code 0–10)
krakenkey cert retry <id> [--wait]                  Retry failed issuance
krakenkey cert update <id>                          Update certificate settings
krakenkey cert delete <id>                          Delete a certificate (failed or revoked only)
```

`cert issue` flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--domain` | | Primary domain (CN), required |
| `--san` | | Additional SAN (repeat for multiple) |
| `--key-type` | `ecdsa-p256` | Key type: `rsa-2048`, `rsa-4096`, `ecdsa-p256`, `ecdsa-p384` |
| `--org` | | Organization (O) |
| `--ou` | | Organizational unit (OU) |
| `--locality` | | Locality (L) |
| `--state` | | State or province (ST) |
| `--country` | | Country code (C, e.g. US) |
| `--key-out` | `./<domain>.key` | Private key output path |
| `--csr-out` | `./<domain>.csr` | CSR output path |
| `--out` | `./<domain>.crt` | Leaf certificate output path |
| `--chain-out` | `./<domain>.chain.pem` | Intermediate CA chain output path |
| `--fullchain-out` | `./<domain>.fullchain.pem` | Full chain output path (leaf + intermediates) |
| `--auto-renew` | `false` | Enable automatic renewal |
| `--wait` | `false` | Wait for issuance to complete |
| `--poll-interval` | `15s` | How often to poll for status |
| `--poll-timeout` | `10m` | Maximum time to wait |

`cert submit` flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--csr` | | Path to CSR PEM file, required |
| `--out` | `./<cn>.crt` | Leaf certificate output path |
| `--chain-out` | `./<cn>.chain.pem` | Intermediate CA chain output path |
| `--fullchain-out` | `./<cn>.fullchain.pem` | Full chain output path (leaf + intermediates) |
| `--auto-renew` | `false` | Enable automatic renewal |
| `--wait` | `false` | Wait for issuance to complete |
| `--poll-interval` | `15s` | How often to poll for status |
| `--poll-timeout` | `10m` | Maximum time to wait |

`cert download` flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--out` | `./<cn>.crt` | Output file path |
| `--format` | `cert` | `cert` (leaf only), `chain` (intermediates only), `fullchain` (leaf + intermediates) |

## `krakenkey endpoint`

```text
krakenkey endpoint add <host> [flags]               Add a monitored endpoint
krakenkey endpoint list                              List all endpoints
krakenkey endpoint show <id>                         Show endpoint details
krakenkey endpoint scan <id>                         Request an on-demand TLS scan
krakenkey endpoint probes                            List your connected probes
krakenkey endpoint enable <id>                       Re-enable a disabled endpoint
krakenkey endpoint disable <id>                      Disable an endpoint
krakenkey endpoint delete <id>                       Delete an endpoint
krakenkey endpoint probe add <id> <probe-id>         Assign a connected probe
krakenkey endpoint probe remove <id> <probe-id>      Remove a connected probe
krakenkey endpoint region add <id> <region>          Add a hosted probe region (Starter+)
krakenkey endpoint region remove <id> <region>       Remove a hosted probe region
```

`endpoint add` flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--port` | `443` | Port to monitor |
| `--sni` | | SNI override (optional) |
| `--label` | | Human-readable label (optional) |
| `--probe` | | Connected probe ID to assign (repeat for multiple) |

## `krakenkey account`

```text
krakenkey account show    Show profile, email, plan, and resource counts
krakenkey account plan    Show subscription details and plan limits
```

## Global flags

```text
--api-url string    API base URL (env: KK_API_URL, default: https://api.krakenkey.io)
--api-key string    API key (env: KK_API_KEY)
--output string     Output format: text, json (env: KK_OUTPUT, default: text)
--no-color          Disable colored output
--verbose           Enable verbose logging
--version           Print version and exit
```
