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

**Homebrew** (macOS and Linux):

```bash
brew install krakenkey/tap/krakenkey
```

Update with `brew upgrade krakenkey`. The cask comes from [KrakenKey/homebrew-tap](https://github.com/KrakenKey/homebrew-tap) and checks the download against the release checksums.

**Debian and Ubuntu** (amd64 and arm64): add the KrakenKey apt repository, then install and upgrade with apt.

```bash
curl -fsSLo /tmp/krakenkey-archive-keyring.deb https://packages.krakenkey.io/keys/krakenkey-archive-keyring.deb
sudo apt install /tmp/krakenkey-archive-keyring.deb
sudo apt update && sudo apt install krakenkey
```

**Fedora, RHEL, Rocky, Alma, Amazon Linux 2023** (x86_64 and aarch64): add the KrakenKey rpm repository, then install and upgrade with dnf.

```bash
sudo dnf install https://packages.krakenkey.io/keys/krakenkey-archive-keyring.rpm
sudo dnf install krakenkey
```

`krakenkey-archive-keyring` installs the signing key and the repository settings (`/etc/apt/sources.list.d/krakenkey.sources`, or `/etc/yum.repos.d/krakenkey.repo`). After that, `apt upgrade` or `dnf upgrade` keeps the CLI current, and a future key change arrives the same way. Supported: Debian 11+, Ubuntu 20.04+, RHEL/Rocky/Alma 8+, Fedora, Amazon Linux 2023. On older systems, such as Amazon Linux 2 or RHEL 7, use the binary download below.

The repositories are signed with this key. The first time dnf uses it, it asks you to confirm the key; check the fingerprint:

```
KrakenKey Packages <packages@krakenkey.io>
386E 2558 2384 DD74 692A  4EE9 F7BA 53A4 E94F A5DA
```

To check it yourself: `curl -fsSL https://packages.krakenkey.io/keys/krakenkey.asc | gpg --show-keys`. If you'd rather not add a repository, each [release](https://github.com/KrakenKey/cli/releases) also has the `.deb` and `.rpm` files to install directly.

**Binary download** (Linux, macOS, Windows): release archives are named `krakenkey_<version>_<os>_<arch>.tar.gz` (`.zip` for Windows). Check the archive against `checksums.txt` before installing it:

```bash
VERSION=0.8.0
ASSET=krakenkey_${VERSION}_linux_amd64.tar.gz   # or darwin_arm64, linux_arm64, ...
BASE=https://github.com/KrakenKey/cli/releases/download/v$VERSION

curl -fLO "$BASE/$ASSET" && curl -fLO "$BASE/checksums.txt"
grep " $ASSET\$" checksums.txt | sha256sum -c -   # macOS: shasum -a 256 -c -
tar -xzf "$ASSET" krakenkey
sudo install -m 0755 krakenkey /usr/local/bin/
```

Every release is also mirrored at `https://packages.krakenkey.io/releases/cli/v<version>/`, with a signature for `checksums.txt`. To check that signature as well:

```bash
curl -fsSL https://packages.krakenkey.io/keys/krakenkey.asc | gpg --import
curl -fLO "https://packages.krakenkey.io/releases/cli/v$VERSION/checksums.txt.asc"
gpg --verify checksums.txt.asc checksums.txt
```

**go install:**

```bash
go install github.com/krakenkey/cli/cmd/krakenkey@latest
```

**Docker:**

```bash
docker run --rm -e KK_API_KEY ghcr.io/krakenkey/cli:latest --version
```

Check the install with `krakenkey --version`.

## Quick start

```bash
# 1. Sign in: approve the login in your browser
krakenkey auth login --web

# 2. Register and verify your domain
krakenkey domain add example.com
krakenkey domain verify <id>

# 3. Issue a certificate
krakenkey cert issue --domain example.com
```

Every command and flag is listed in the [command reference](/docs/cli/commands/).

## Signing in

`krakenkey auth login --web` prints a link to `app.krakenkey.io/device` with a short code and opens it in your browser (`--no-browser` only prints it). Sign in, check the code matches, and click **Approve**. The dashboard creates an API key named `CLI login: <hostname>`, and the CLI saves it to the config file. The request expires after 10 minutes. Revoke it under **API Keys** in the dashboard. The CLI can't delete keys itself: the API only accepts key changes from a dashboard session.

To use a key you already have, run `krakenkey auth login` and paste it, or set `KK_API_KEY`. That suits CI, where nobody is around to approve.

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
