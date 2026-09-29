---
title: KrakenKey CLI
description: Install and configure the KrakenKey CLI, then issue certificates from your terminal or CI/CD pipeline.
sidebar:
  label: Install and configure
  order: 1
---

The `krakenkey` CLI manages the TLS certificate lifecycle from your terminal. It generates CSRs locally with Go's crypto standard library, so private keys never leave your machine. It submits them to the KrakenKey API, polls for issuance, and downloads the issued certificates. Anything you can do in the dashboard, you can do with it from a terminal or a CI job.

Source and releases: [github.com/KrakenKey/cli](https://github.com/KrakenKey/cli) (AGPL-3.0).

## Installation

**Binary download** (Linux, macOS, Windows): download the latest release from [github.com/KrakenKey/cli/releases](https://github.com/KrakenKey/cli/releases).

```bash
# Linux amd64 example
curl -Lo krakenkey.tar.gz https://github.com/KrakenKey/cli/releases/latest/download/krakenkey_linux_amd64.tar.gz
tar -xzf krakenkey.tar.gz
sudo mv krakenkey /usr/local/bin/
```

**go install:**

```bash
go install github.com/krakenkey/cli/cmd/krakenkey@latest
```

**Docker:**

```bash
docker pull ghcr.io/krakenkey/cli:latest
```

## Quick start

```bash
# 1. Set your API key (create one at app.krakenkey.io/dashboard → API Keys)
krakenkey auth login

# 2. Register and verify your domain
krakenkey domain add example.com
krakenkey domain verify <id>

# 3. Issue a certificate
krakenkey cert issue --domain example.com
```

Every command and flag is listed in the [command reference](/docs/cli/commands/).

## Configuration

The CLI stores its configuration in `~/.config/krakenkey/config.yaml` (it respects `XDG_CONFIG_HOME`). The file is created by `krakenkey auth login` with `0600` permissions.

```yaml
api_url: "https://api.krakenkey.io"
api_key: "kk_..."
output: "text"
```

**Precedence** (highest to lowest): CLI flags, environment variables, config file, defaults.

| Setting | Flag | Env var |
| --- | --- | --- |
| API URL | `--api-url` | `KK_API_URL` |
| API key | `--api-key` | `KK_API_KEY` |
| Output format | `--output` | `KK_OUTPUT` |

**Permissions:** on non-Windows systems, the CLI refuses to load a config file with permissions broader than `0600` (readable or writable by group or other). It exits with a configuration error (exit code 5) instead. Fix with:

```bash
chmod 600 ~/.config/krakenkey/config.yaml
```

## Certificate chain

`cert issue` and `cert submit` write three files alongside the private key:

| File | Flag | Default | Contents |
| --- | --- | --- | --- |
| Leaf certificate | `--out` | `./<domain>.crt` | End-entity certificate only |
| Intermediate chain | `--chain-out` | `./<domain>.chain.pem` | Intermediate CA certificates |
| Full chain | `--fullchain-out` | `./<domain>.fullchain.pem` | Leaf + intermediates |

Most web servers (nginx, Caddy, HAProxy) expect the full chain. Use `--fullchain-out` in production deployments.

`cert download` takes `--format` with `cert` (default), `chain` or `fullchain` for an already-issued certificate:

```bash
# Download full chain for deployment
krakenkey cert download 42 --format fullchain --out ./fullchain.pem

# Download intermediates only
krakenkey cert download 42 --format chain --out ./chain.pem
```

## Key types

The CLI generates CSRs with Go's `crypto` standard library. Private keys are saved locally with `0600` permissions and are never sent to the API or printed to stdout.

| `--key-type` | Algorithm | Key / curve | Signature |
| --- | --- | --- | --- |
| `ecdsa-p256` (default) | ECDSA | P-256 | ECDSA with SHA-256 |
| `ecdsa-p384` | ECDSA | P-384 | ECDSA with SHA-384 |
| `rsa-2048` | RSA | 2048-bit | SHA-256 with RSA |
| `rsa-4096` | RSA | 4096-bit | SHA-256 with RSA |

## Output formats

**Text** (default): colored, human-readable output with aligned tables and spinners.

**JSON** (`--output json` or `KK_OUTPUT=json`): machine-readable JSON on stdout, with no color or spinners. Every command outputs a JSON object or array. Errors are `{"error":"..."}` on stderr.

```bash
# CI/CD example: set KK_API_KEY from your secrets manager
export KK_OUTPUT=json

CERT_ID=$(krakenkey cert issue --domain "$DOMAIN" --key-type ecdsa-p256 | jq -r '.id')
```

## CI/CD

**GitHub Actions:**

```yaml
- name: Issue certificate
  uses: docker://ghcr.io/krakenkey/cli:latest
  env:
    KK_API_KEY: ${{ secrets.KK_API_KEY }}
    KK_OUTPUT: json
  with:
    args: cert issue --domain example.com --key-out ./example.com.key --out ./example.com.crt --fullchain-out ./example.com.fullchain.pem
```

**Generic shell:**

```bash
docker run --rm \
  -e KK_API_KEY \
  -e KK_OUTPUT=json \
  -v "$(pwd)/certs:/out" \
  ghcr.io/krakenkey/cli:latest \
  cert issue --domain example.com \
    --key-out /out/example.com.key \
    --out /out/example.com.crt \
    --fullchain-out /out/example.com.fullchain.pem
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | General error (API error, validation failure, issuance failed) |
| 2 | Authentication error (no API key, 401) |
| 3 | Not found (404) |
| 4 | Rate limited (429) |
| 5 | Configuration error |
