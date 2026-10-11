---
title: KrakenKey Connector
description: Run the KrakenKey connector on your own infrastructure to renew certificates with keys that never leave it, deploy them to files, Azure Key Vault and Application Gateway, or AWS Certificate Manager, check each deployment over TLS, and roll back on failure.
sidebar:
  label: Set up the connector
  order: 1
---

The KrakenKey connector is a small service you run on your own network. It renews KrakenKey certificates with private keys it creates locally (or inside Azure Key Vault), installs each renewed certificate where it is served, checks over TLS that the endpoint serves it, and rolls the target back if it doesn't. The dashboard's **Connectors** page shows what is deployed where, and KrakenKey alerts you when a deployment fails or a connector stops checking in.

Source and releases: [github.com/KrakenKey/connector](https://github.com/KrakenKey/connector) (Apache-2.0). This page covers v0.3.0. The connector is pre-1.0, so its configuration may still change between minor versions; read the [changelog](https://github.com/KrakenKey/connector/blob/main/CHANGELOG.md) before you upgrade, and see [Upgrading](#upgrading).

## When this fits

- You have certificates on several systems and want renewals to install themselves, with no scripts to maintain.
- The private key has to stay on your network or in your key vault.
- You serve from Azure Application Gateway, Azure services that read Key Vault certificates (App Service, Container Apps, API Management, Front Door, AKS), AWS load balancers or CloudFront, or servers that read PEM files (nginx, HAProxy, Caddy and similar).
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

KrakenKey sees CSRs, the issued certificates, certificate IDs, and the label and state of each target. It never sees private keys or your cloud credentials.

From v0.3.0, an enrolled connector also shares a read-only summary of its config, which the connector's page in the dashboard shows. Nothing in KrakenKey can change the config: it lives on the host. The summary has the certificates with their names, the key store and targets of each (label, plugin, whether the key store added the target by itself, whether a command runs after deployment, and the `verify` host and port), the plugin versions, and a short list of settings:

| Plugin | Settings in the summary |
|---|---|
| `azure-keyvault` | `vault`, `certificate_name`, `exportable`, `reuse_key`, `adopt` |
| `azure-appgateway` | `resource_group`, `gateway`, `ssl_certificate`, `replace_uploaded_certificate` |
| `aws-acm` | `region` |
| `file` | `dir` and the file names under `files` |
| `exec`, `local`, any other plugin | none |

Commands and their arguments or environment, file owners and modes, Key Vault tags, the Application Gateway subscription ID, ACM ARNs, `verify.address` and `verify.ca_file`, plugin paths and checksums, and anything from the environment are never sent. To keep the config to yourself, set `share_config: false` under `krakenkey:`; the connector then deletes any summary it sent before. Connectors that use an API key instead of enrollment never send one.

The connector holds the private keys and the access it needs to deploy (file permissions, a cloud identity), so run it where that access already lives. It doesn't store a long-lived API key either: at enrollment it creates its own Ed25519 identity key on the machine, and on each pass it trades a signed request for an API key that lasts an hour, stays in memory, and is limited to the scopes and certificates you set for the connector in the dashboard.

### Key stores and targets

| Name | Kind | Where it comes from | What it does |
| --- | --- | --- | --- |
| `local` | Key store | Built in | Creates keys on the machine and keeps them under the data directory. |
| `file` | Target | Built in | Writes the certificate, chain, full chain and key as PEM files, then runs a command such as a reload. |
| `exec` | Target | Built in | Runs your own command with the certificate files, and again to roll back. |
| [`azure-keyvault`](https://github.com/KrakenKey/connector/blob/v0.3.0/plugins/azure-keyvault/README.md) | Key store and target | Plugin | As a key store, Key Vault creates the key and the CSR and keeps the certificate. As a target, it deploys certificates to Key Vault certificates for services that read them without a version, in the same vault or others. |
| [`azure-appgateway`](https://github.com/KrakenKey/connector/blob/v0.3.0/plugins/azure-appgateway/README.md) | Target | Plugin | Points an Application Gateway v2 SSL certificate at a specific Key Vault secret version. |
| [`aws-acm`](https://github.com/KrakenKey/connector/blob/v0.3.0/plugins/aws-acm/README.md) | Target | Plugin | Re-imports into an existing ACM certificate, so load balancers, CloudFront and API Gateway keep the same ARN. |

Plugins are separate executables that the connector starts and talks to over gRPC, the same model Terraform uses for providers. The Linux packages and the container image include all three, and each release ships them with the connector's version.

### When it renews

The connector renews a certificate once KrakenKey's `renewAfter` time has passed. For a certificate marked as managed by a connector, that is at least 30 days before expiry, or earlier if the CA asks for an early replacement through ACME Renewal Information (ARI). Between renewals, each pass is a quick check.

Two cases are different:

- **A new certificate** created for a connector waits in KrakenKey as *Awaiting CSR*. On its next pass the connector creates the key, sends the CSR, has the certificate issued and deploys it.
- **An existing certificate** was issued with a key the connector doesn't have, so on its first pass the connector renews it once with its own key, then deploys it.

## Requirements

- **A host or container runtime** on your network: Linux or macOS on amd64 or arm64, or anything that runs `linux/amd64` or `linux/arm64` containers. There are no Windows builds yet. The Linux packages support Debian 11+, Ubuntu 20.04+, RHEL, Rocky and Alma 8+, Fedora and Amazon Linux 2023.
- **Outbound HTTPS** to `api.krakenkey.io`, and to the cloud APIs your plugins use.
- **An accurate clock.** The signed key exchange is refused if the clock is more than five minutes off, so keep NTP running.
- **Verified domains.** Each name on the certificate must be on a domain verified in KrakenKey, with its `_acme-challenge` CNAME in place. See [Getting started](/docs/getting-started/).
- **A cloud identity** for cloud targets: a managed identity or AKS workload identity for Azure, an instance profile or task role for AWS.

For each target type you also need:

- **Application Gateway:** a v2 gateway (`Standard_v2` or `WAF_v2`) with a user-assigned managed identity that has **Key Vault Secrets User** on the vault, and an SSL certificate entry that its HTTPS listeners already use. The connector updates that entry; it doesn't create one. Listener certificates must be RSA.
- **Key Vault as a target:** for other vaults or certificate names, an identity that can import certificates there. Services that read the certificate without a version pick up new versions on their own schedule; see [when services pick up a new version](#when-services-pick-up-a-new-version).
- **AWS Certificate Manager:** an imported ACM certificate already attached to your load balancer, distribution or API, which the connector re-imports over. Step 1 shows how to create a placeholder. Certificates ACM issued itself can't be re-imported over.
- **Files:** the target directory must exist, and the connector's user must be able to write to it and run the reload command. With the Linux packages, the service also needs a drop-in that allows writing there; see [File targets and reload commands](#file-targets-and-reload-commands).

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

Give the connector its own `certificate_name` in the vault and it creates the certificate on its first pass (or on its first import, for a Key Vault target). To take over a Key Vault certificate that already exists, such as the one your gateway uses today, set `adopt: true` in the key store or target settings ([step 3](#azure-key-vault-and-application-gateway)). Without it, the connector refuses to touch a certificate it didn't create.

## 2. Install the connector

Pick one:

- **Linux host:** use the `.deb` or `.rpm` package from the KrakenKey apt or dnf repository. It installs the connector, the three plugins and a systemd service, and upgrades with the rest of the system.
- **Container runtime:** use the container image. It carries the same three plugins.
- **macOS:** use Homebrew. It installs the connector only; you add the plugins you need.
- **Anything else:** use the release archives.

### Debian, Ubuntu, Fedora, RHEL and Amazon Linux

**Debian and Ubuntu** (amd64 and arm64): add the KrakenKey apt repository, then install and upgrade with apt.

```bash
curl -fsSLo /tmp/krakenkey-archive-keyring.deb https://packages.krakenkey.io/keys/krakenkey-archive-keyring.deb
sudo apt install /tmp/krakenkey-archive-keyring.deb
sudo apt update && sudo apt install krakenkey-connector
```

**Fedora, RHEL, Rocky, Alma, Amazon Linux 2023** (x86_64 and aarch64): add the KrakenKey rpm repository, then install and upgrade with dnf.

```bash
sudo dnf install https://packages.krakenkey.io/keys/krakenkey-archive-keyring.rpm
sudo dnf install krakenkey-connector
```

`krakenkey-archive-keyring` installs the signing key and the repository settings (`/etc/apt/sources.list.d/krakenkey.sources`, or `/etc/yum.repos.d/krakenkey.repo`). It is the same repository as the [CLI](/docs/cli/)'s, so skip that step if the CLI is already installed from it. Supported: Debian 11+, Ubuntu 20.04+, RHEL/Rocky/Alma 8+, Fedora, Amazon Linux 2023. On older systems, use the [release binaries](#release-binaries).

The repositories are signed with this key. The first time dnf uses it, it asks you to confirm the key; check the fingerprint:

```
KrakenKey Packages <packages@krakenkey.io>
386E 2558 2384 DD74 692A  4EE9 F7BA 53A4 E94F A5DA
```

To check it yourself: `curl -fsSL https://packages.krakenkey.io/keys/krakenkey.asc | gpg --show-keys`. If you'd rather not add a repository, each [release](https://github.com/KrakenKey/connector/releases/tag/v0.3.0) also has the `.deb` and `.rpm` files (`krakenkey-connector_<version>_linux_<arch>.deb` and `.rpm`), covered by the signed `checksums.txt` described under [Release binaries](#release-binaries):

```bash
# Debian, Ubuntu
sudo apt install ./krakenkey-connector_*_linux_amd64.deb

# RHEL, Fedora, Amazon Linux
sudo dnf install ./krakenkey-connector_*_linux_amd64.rpm
```

Replace `amd64` with `arm64` on ARM machines.

The package sets up everything the connector needs to run as a service:

| Path | What it is |
| --- | --- |
| `/usr/bin/krakenkey-connector` | The connector. |
| `/usr/lib/krakenkey-connector/plugins/` | The three plugins, `<name>/<version>/krakenkey-connector-plugin-<name>`, with a `plugins.lock`. Owned by root, the same layout as the container image. |
| `/etc/krakenkey-connector/config.yaml` | The config. Mode `0640`, owned by `root:krakenkey-connector`, kept on upgrade. It has no certificates yet, so the connector refuses it until you add one. |
| `/etc/default/krakenkey-connector` (Debian, Ubuntu) or `/etc/sysconfig/krakenkey-connector` (RPM-based) | Environment for the service, such as cloud credentials for the plugins. Same owner and mode as the config. |
| `/var/lib/krakenkey-connector` | The data directory: keys, identity, state and the audit log. Mode `0700`, owned by the `krakenkey-connector` system user. |
| `krakenkey-connector.service` | Runs `krakenkey-connector run` as the `krakenkey-connector` user. Not enabled or started on install. |

You enroll and start it in steps 5 and 6.

### Container image

`ghcr.io/krakenkey/connector`, for `linux/amd64` and `linux/arm64`. Pin a version tag (`v0.3.0`, or `0.3` for the latest patch release) rather than `latest`, so upgrades happen when you choose. Images are signed with Sigstore by the release workflow. Checking the signature needs [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) v3 or later:

```bash
VERSION=0.3.0
docker pull ghcr.io/krakenkey/connector:v${VERSION}
cosign verify ghcr.io/krakenkey/connector:v${VERSION} \
  --certificate-identity "https://github.com/KrakenKey/connector/.github/workflows/release.yaml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The image runs as a non-root user, uid 10001, and keeps its data in the volume at `/var/lib/krakenkey-connector`. Directories you mount for `file` targets must be writable by that uid. Because it isn't root, a `file` target in the container can't set `owner` to another user such as `root:nginx`: leave `owner` out, or use a group that uid 10001 belongs to.

### Homebrew

On macOS (and Linux):

```bash
brew install krakenkey/tap/krakenkey-connector
```

Update with `brew upgrade krakenkey-connector`. The cask comes from [KrakenKey/homebrew-tap](https://github.com/KrakenKey/homebrew-tap), is updated by each release, and checks the download against the release checksums. It installs the connector only:

- Install the plugins you need from their release archives under the data directory, with their `version` and `sha256` in the config; see [Plugins on a host](#plugins-on-a-host).
- Homebrew doesn't run the connector as a service. Run `krakenkey-connector run` yourself, or `run --once` from launchd or cron.
- Set `data_dir` in the config to a directory you own, since the default, `/var/lib/krakenkey-connector`, doesn't exist on macOS.

On Linux, prefer the packages: they include the plugins and the systemd service.

### Release binaries

Each [release](https://github.com/KrakenKey/connector/releases/tag/v0.3.0) has archives for Linux and macOS (amd64 and arm64) of the connector and each plugin, a `checksums.txt` covering them, and its Sigstore signature, `checksums.txt.sigstore.json`. There is no long-lived signing key: the signature is tied to the release workflow and the tag.

```bash
VERSION=0.3.0
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

The packages and the container image already have the plugins. With Homebrew or the release binaries, download each plugin you need from the same release as the connector, named `krakenkey-connector-plugin-<name>_<version>_<os>_<arch>.tar.gz`, check it against the same `checksums.txt`, and install it under the data directory:

```bash
VERSION=0.3.0
OS=linux
ARCH=amd64
PLUGIN=azure-keyvault   # or azure-appgateway, aws-acm
ARCHIVE="krakenkey-connector-plugin-${PLUGIN}_${VERSION}_${OS}_${ARCH}.tar.gz"
curl -fsSLO "https://github.com/KrakenKey/connector/releases/download/v${VERSION}/${ARCHIVE}"
grep " ${ARCHIVE}\$" checksums.txt | sha256sum -c   # checksums.txt verified above

tar -xzf "${ARCHIVE}" "krakenkey-connector-plugin-${PLUGIN}"
DEST="/var/lib/krakenkey-connector/plugins/${PLUGIN}/${VERSION}"   # <data_dir>/plugins/...
sudo install -d -m 0755 "${DEST}"
sudo install -m 0755 "krakenkey-connector-plugin-${PLUGIN}" "${DEST}/"
sha256sum "${DEST}/krakenkey-connector-plugin-${PLUGIN}"
```

Then declare it in the config with that version and the checksum it printed:

```yaml
plugins:
  azure-keyvault: { version: 0.3.0, sha256: "<sha256 printed above>" }
```

A plugin under the data directory always needs both `version` and `sha256`. Connector upgrades don't touch it; to move it to a new release, install the new version the same way and update `version` and `sha256`.

To keep plugins out of the connector user's reach, install them as root in the system plugin directory instead, `/usr/lib/krakenkey-connector/plugins/<name>/<version>/`, and write its `plugins.lock` by running `sha256sum */*/krakenkey-connector-plugin-* > plugins.lock` in that directory. The binaries, `plugins.lock` and every directory up to `/` must be owned by root. Plugins there need no `sha256` in the config, and can be declared without a version, like the [bundled plugins](#plugin-versions). See the [connector README](https://github.com/KrakenKey/connector/blob/v0.3.0/README.md#external-plugins) for every rule.

### Service user and data directory

The packages create these for you. With the release binaries, create a system user and the data directory yourself. The data directory holds the identity key, local private keys, state and the audit log. It must be owned by the connector's user with mode `0700`; the connector refuses anything looser.

```bash
sudo useradd --system --home-dir /var/lib/krakenkey-connector --shell /usr/sbin/nologin krakenkey-connector
sudo install -d -m 0700 -o krakenkey-connector -g krakenkey-connector /var/lib/krakenkey-connector
sudo install -d -m 0755 /etc/krakenkey-connector
```

Run `enroll` as this same user, so the identity files belong to it. Plugins and deploy commands run with the connector's permissions. A dedicated user is the right choice for cloud targets. For a `file` target that writes into a web server's config and reloads it, that user needs write access to the target directory and permission to run the reload command.

## 3. Write the config

One YAML file per connector, at `/etc/krakenkey-connector/config.yaml` by default (`--config` or `KK_CONNECTOR_CONFIG` to change it). The packages install it with comments and an example; edit it with `sudoedit`. The only thing about a target KrakenKey ever sees is its `label`.

| Key | Default | Meaning |
| --- | --- | --- |
| `krakenkey.api_url` | `https://api.krakenkey.io` | API base URL. `KK_API_URL` overrides it. |
| `check_interval` | `6h` | Time between passes in `run` mode. Minimum `1m`. |
| `data_dir` | `/var/lib/krakenkey-connector` | Keys, identity, state and plugin binaries. Owned by the connector's user, mode `0700`. |
| `plugin_dir` | `/usr/lib/krakenkey-connector/plugins` | System plugin directory, root-owned, with a `plugins.lock`. `KK_PLUGIN_DIR` overrides it. |
| `audit_log` | `<data_dir>/audit.jsonl` | Audit log, one JSON object per line, mode `0600`. |
| `plugins` | | Plugins by name, with optional `version`, `sha256`, `path` and `call_timeout` (default `5m`). See [Plugin versions](#plugin-versions). |
| `certificates[].id` | | KrakenKey certificate ID. |
| `certificates[].names` | | DNS names. Must equal the certificate's names exactly. |
| `certificates[].key_store.plugin` | `local` | Key store. |
| `certificates[].key_store.key_type` | `ecdsa-p256` | `ecdsa-p256`, `ecdsa-p384`, `rsa-2048`, `rsa-3072`, or `rsa-4096` where the plugin supports it. |
| `certificates[].targets` | | Where the certificate goes. At least one, unless the key store adds one by itself, as `azure-keyvault` does (see [Key Vault as a target](#azure-key-vault-as-a-target)). |
| `certificates[].targets[].label` | | Name for logs, the audit log and the dashboard. Unique per certificate. |
| `certificates[].targets[].plugin` | | `file`, `exec`, or a plugin name. |
| `certificates[].targets[].then.exec` | | Command run after activation and again after a rollback, such as a reload. No shell. |
| `certificates[].targets[].then.timeout` | `2m` | Timeout for the `then` command. |
| `certificates[].targets[].verify` | | How to check the deployment. See below. |

Any other keys in a `key_store` or target block are settings for that plugin. Use absolute paths in `then.exec`, `exec` targets and plugin settings that point at files.

### Plugin versions

With the Linux packages or the container image, declare the plugins you use without a version. The connector then uses the bundled one, the only version of it in the system plugin directory, checked against `plugins.lock`:

```yaml
plugins:
  azure-keyvault: {}
  azure-appgateway: { call_timeout: 15m }
  aws-acm: {}
```

The config keeps working when you upgrade the package or the image. You can still pin a plugin by setting `version` to the connector's version (what `krakenkey-connector version` prints, without the leading `v`), but then you have to change it on every upgrade. A plugin without a version is never taken from `<data_dir>/plugins`; plugins installed there, as with Homebrew or the release binaries, always need `version` and `sha256`. `validate` shows which version it used.

The examples below declare plugins without a version. With Homebrew or the release binaries, use `{ version: 0.3.0, sha256: "..." }` instead, as in [Plugins on a host](#plugins-on-a-host).

### Verify

Give a target a `verify` block whenever its endpoint picks up the certificate within minutes. It is how the connector knows a deployment worked, and what triggers a rollback when it didn't. A target without one is activated with no check, and `validate` warns about it.

```yaml
verify:
  host: shop.example.com     # SNI name; must be one of the certificate's names
  address: 127.0.0.1:443     # optional: where to connect; default host:port
  port: 443                  # used when address is not set; default 443
  window: 10m                # how long to keep trying; default 10m
  ca_file: /etc/ssl/internal-roots.pem   # optional: trust only these roots for the chain
```

The connector connects, sends `host` as SNI, and keeps trying with growing delays until the endpoint serves exactly the issued certificate or the window ends. Then it validates the served chain against the system roots, or only the roots in `ca_file`. Set `address` when the name resolves somewhere other than the server you want to check, such as one server behind a load balancer.

A failed check rolls the target back, except on targets that pick up changes on their own schedule, such as a Key Vault certificate that a cloud service polls. There the new certificate stays, the target is reported as *Failed* with an error saying it wasn't rolled back, and every later pass checks it again until the check passes or a newer certificate replaces it.

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
        owner: ":nginx"                         # optional: user, user:group or :group
        mode: "0640"                            # key file mode; default 0600
        then: { exec: [systemctl, reload, nginx] }
        verify: { host: shop.example.com, address: 127.0.0.1:443 }
```

`key` is required, and so is `cert` or `fullchain`. Each file is written to a temporary file and renamed into place, so the server never reads a partial file. Before that, the current files are copied to `<dir>/.krakenkey-previous/` for rollback. Certificate files get mode `0644`; quote `mode` so YAML keeps it as a string.

A connector that doesn't run as root, such as the packaged service or the container, can only set `owner` to its own user or a group it belongs to. With the packaged service, the target directory and the reload command also need the setup in [File targets and reload commands](#file-targets-and-reload-commands).

To install somewhere the `file` target doesn't cover, use the `exec` target: it runs your command with `KK_ACTION=deploy` and the paths in `KK_CERT_FILE`, `KK_CHAIN_FILE`, `KK_FULLCHAIN_FILE` and `KK_KEY_FILE`, and again with `KK_ACTION=rollback` and the previous files if the deployment fails. See the [README](https://github.com/KrakenKey/connector/blob/v0.3.0/README.md#built-in-target-exec).

### Azure Key Vault and Application Gateway

```yaml
check_interval: 6h
plugins:
  azure-keyvault: {}
  azure-appgateway: { call_timeout: 15m }   # gateway updates take minutes
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

The Key Vault certificate itself also counts as a deployment: the connector adds a target labeled `azure-keyvault` for it and deploys it first. It shows up in `validate` and the dashboard next to `appgw-prod`. See [Key Vault as a target](#azure-key-vault-as-a-target).

Two gateway settings change what can be rolled back:

- If the entry holds a certificate uploaded to the gateway instead of a Key Vault reference, the connector refuses to replace it unless you set `replace_uploaded_certificate: true` on the target. That first switch can't be rolled back, because Azure never returns uploaded certificates.
- If the entry points at a versionless ID of the same secret, rolling back that first activation isn't possible either. Later activations always use versioned IDs.

If the gateway is also managed by Terraform or another tool, tell it to ignore `sslCertificates[*].keyVaultSecretId`.

### Azure Key Vault as a target

Many Azure services read a Key Vault certificate without a version and pick up each new version on their own: App Service and Functions, Container Apps, API Management, Front Door, Azure CDN, the AKS Secrets Store CSI driver and the VM Key Vault extension. For them, deploying means putting a new version in the vault.

**The key store's own certificate.** With the `azure-keyvault` key store, the connector merges every issued certificate into `certificate_name` as a new version, so the certificate is deployed the moment it is issued. The connector adds an implicit target for it, labeled `azure-keyvault`, so you need no `targets` at all:

```yaml
plugins:
  azure-keyvault: {}
certificates:
  - id: 1044
    names: [shop.example.com, www.shop.example.com]
    key_store:
      plugin: azure-keyvault
      key_type: rsa-2048
      vault: kv-example-prod
      certificate_name: shop-example-com
    # no targets: the key store adds one, labeled "azure-keyvault"
```

The implicit target is deployed before any other target and listed by `validate` as `implicit`. On a normal deployment it finds the certificate already in place and changes nothing, and it needs no exportable key. It has no `verify` or `then`, so it is reported as *Activated (not verified)*.

**Verify it, or run a command after it.** Configure a target with `plugin: azure-keyvault` and the key store's `vault` and `certificate_name` (in any spelling, such as the vault name or its URL). It takes the implicit target's place. Keep the label `azure-keyvault` to keep its deployment history:

```yaml
  - id: 1045
    names: [api.example.com]
    key_store:
      plugin: azure-keyvault
      key_type: ecdsa-p256
      vault: kv-example-prod
      certificate_name: api-example-com
    targets:
      - label: azure-keyvault       # keep the label to keep its deployment history
        plugin: azure-keyvault
        vault: https://kv-example-prod.vault.azure.net
        certificate_name: api-example-com
        verify: { host: api.example.com, window: 10m }   # an AKS cluster reading it with a 2 minute rotation interval
```

**Other vaults.** A target for another vault, or another `certificate_name` in the same vault, imports the certificate, its chain and its key as a new version (PKCS#12, which Application Gateway, App Service, Front Door and Azure CDN require). Use it to put the same certificate in several regions, a disaster recovery vault or another subscription, or to put a certificate whose key is on the host (`local` key store) into a vault. It needs the private key: with the `azure-keyvault` key store, the plugin reads it from the key store's secret itself, so the key store must have `exportable: true` (`validate` refuses the pair otherwise); with `local`, the connector hands it over.

```yaml
  - id: 1046
    names: ["*.shop.example.com", shop.example.com]
    key_store:
      plugin: azure-keyvault
      key_type: rsa-2048
      vault: kv-example-prod
      certificate_name: wildcard-shop-example-com
      exportable: true               # the key is copied to the other vaults
    targets:
      - label: kv-westeurope
        plugin: azure-keyvault
        vault: kv-example-prod-weu
        certificate_name: wildcard-shop-example-com
        tags: { site: westeurope }
      - label: kv-dr
        plugin: azure-keyvault
        vault: kv-example-dr
        certificate_name: wildcard-shop-example-com
```

Here the primary vault's certificate is still the implicit `azure-keyvault` target, deployed first, and the two configured targets import into the other vaults.

Target settings:

| Key | Default | Meaning |
| --- | --- | --- |
| `vault` | required | Vault name or URL, as for the key store. |
| `certificate_name` | required | Key Vault certificate to deploy to. Created by the first import. |
| `adopt` | `false` | Let the connector add versions to a certificate it didn't create. |
| `exportable` | `true` | Whether the private key of imported versions can be read from their secret. Application Gateway, App Service and Front Door need it. |
| `tags` | none | Extra tags on every imported version, at most 13. |

For the implicit target, all of these come from the key store's settings.

**Tags and ownership.** Every version the connector creates, merged by the key store or imported by a target, carries the tag `krakenkey-connector-certificate-id` (the KrakenKey certificate ID) and `krakenkey-connector-previous-version` (the version it replaced, which is what a rollback goes back to). That leaves 13 of Key Vault's 15 tags for `tags`. Before importing into a certificate that already exists, the plugin checks the ownership tag of its latest version, with the same rules as the key store: a certificate without the tag, or with another KrakenKey certificate's, is refused unless you set `adopt: true`.

**The new version is live before the other targets deploy.** Because the key store merges the certificate when it is issued, services that read it without a version can pick it up before the connector has deployed to any other target, whether or not those deployments succeed. If that order matters, have those services pin a version (as Application Gateway does), or use another `certificate_name` for the key store and import into the certificate the services read with a separate target.

#### Rollback

Key Vault always serves the latest enabled version to services that read without a version, and it can't make an older version current again. So a rollback imports the previous certificate and its key once more, as a new version:

| Case | Rollback |
| --- | --- |
| Key store's own certificate, `exportable: true` | The previous version's key is read from its secret and imported again with the previous certificate. |
| Key store's own certificate, `exportable: false` | Refused: the key can't be read. `validate` warns that rollback is unavailable, and a failed deployment keeps the new version and is reported as failed. |
| Another vault or certificate, `azure-keyvault` key store | As for the key store's own certificate. |
| Another vault or certificate, `local` key store | The previous key is handed over and imported again. |
| First deployment (no earlier version) | Refused: Key Vault can't delete a single version, so the new version stays. |

A failed `verify` check on a Key Vault target is not rolled back, because services pick up new versions on their own schedule and may already have the new one. The target is reported as *Failed* and checked again on later passes. A rollback happens when a `then` command fails, or when the connector finds an interrupted deployment of an older certificate that the vault doesn't serve yet.

If your policy requires it, you can disable old versions yourself, but only versions no target serves any more and that a rollback won't need.

#### When services pick up a new version

What Microsoft documents for services that reference a Key Vault certificate without a version:

| Service | Picks up a new version | Faster |
| --- | --- | --- |
| [Application Gateway v2](https://learn.microsoft.com/azure/application-gateway/key-vault-certs) | polls every 4 hours | any change to the gateway (for example a tag) makes it check at once |
| [App Service and Functions](https://learn.microsoft.com/azure/app-service/configure-ssl-certificate) | within 24 hours | **Sync** on the imported certificate in the portal |
| [Container Apps](https://learn.microsoft.com/azure/container-apps/key-vault-certificates-manage) | up to 12 hours | not documented |
| [API Management custom domains](https://learn.microsoft.com/azure/api-management/configure-custom-domain) | up to 1-2 days | **Sync certificates** in the portal |
| [API Management named values](https://learn.microsoft.com/azure/api-management/api-management-howto-properties) | within 4 hours | refresh in the portal or through the management REST API |
| [Front Door Standard/Premium](https://learn.microsoft.com/azure/frontdoor/domain), version **Latest** | up to 72 hours | not documented |
| [Azure CDN](https://learn.microsoft.com/azure/cdn/cdn-custom-ssl) (Standard Microsoft) | up to 72 hours | not documented |
| [AKS Secrets Store CSI driver](https://learn.microsoft.com/azure/aks/csi-secrets-store-configuration-options) | every 2 minutes, once rotation is enabled (`--enable-secret-rotation`; off by default) | `--rotation-poll-interval` |
| [VM Key Vault extension](https://learn.microsoft.com/azure/virtual-machines/extensions/key-vault-linux) | every hour by default (`pollingIntervalInS`, 5 to 60 minutes) | restart the extension's service |

The `verify` check keeps the pass waiting until the endpoint serves the new certificate or the window ends, and other certificates wait with it. So:

- For services that take hours or days, leave out `verify`. The target is reported as *Activated (not verified)*, and KrakenKey's own [endpoint monitoring](/docs/architecture/#watching-whats-actually-served) can watch the endpoint instead. With `verify`, a check that fails because the service hasn't picked up the version yet is reported as *Failed* until a later pass sees it.
- For services that poll within minutes (the CSI driver with rotation, the VM extension with a short interval), add `verify` with a window a little longer than the poll interval, for example `window: 10m` for a 2 minute rotation interval.
- To verify a slow service, make it pick up the version in a `then` command (for example a change to the Application Gateway, or a sync of the App Service certificate), and verify with a short window.

### AWS Certificate Manager

```yaml
check_interval: 6h
plugins:
  aws-acm: {}
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
  "Name": "KrakenKey connector Key Vault",
  "IsCustom": true,
  "Description": "Create, merge, import and read Key Vault certificates for the KrakenKey connector.",
  "Actions": [],
  "NotActions": [],
  "DataActions": [
    "Microsoft.KeyVault/vaults/certificates/read",
    "Microsoft.KeyVault/vaults/certificates/create/action",
    "Microsoft.KeyVault/vaults/certificates/update/action",
    "Microsoft.KeyVault/vaults/certificates/import/action",
    "Microsoft.KeyVault/vaults/secrets/getSecret/action"
  ],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/<subscription-id>/resourceGroups/<resource-group>"]
}
```

Drop `certificates/import/action` if no target imports certificates (the implicit `azure-keyvault` target alone doesn't, unless it rolls back). Drop `secrets/getSecret/action` if no target needs the key as PEM or PFX, imports it into another certificate, or rolls back. Application Gateway doesn't need it: the gateway's own identity reads the secret. You can scope the assignment to a single certificate (`<vault resource id>/certificates/<certificate_name>`) and its secret (`<vault resource id>/secrets/<certificate_name>`) once they exist; for the first issuance, scope it to the vault or create the certificate first.

With vault access policies instead of Azure RBAC: certificate permissions **Get**, **Create** and **Update** for the key store, plus **List** and **Import** for the target; secret permission **Get** only for PEM or PFX export, imports from this vault into another certificate, and rollbacks. Access policies apply to the whole vault.

What a Key Vault target needs, at least:

- **Implicit target, no rollback:** `certificates/read` (access policies: certificate **Get** and **List**). The key store's own permissions already include these. Without List, a deployment of a version without the `krakenkey-connector-previous-version` tag can't be rolled back.
- **Implicit target with rollback, or putting the certificate back after a rollback:** add `certificates/import/action` and `secrets/getSecret/action` (access policies: certificate **Import**, secret **Get**). The key store must be `exportable: true`.
- **Another vault or certificate name:** on the destination vault, `certificates/read` and `certificates/import/action` (access policies: certificate **Get**, **List** and **Import**); on the key store's vault, `secrets/getSecret/action` (secret **Get**). With the `local` key store, no secret permission is needed.

When Key Vault answers `403`, the error names the operation and the permission to grant, for example `grant the identity Microsoft.KeyVault/vaults/certificates/create/action on the vault (Azure RBAC), or certificate permission Create in the vault access policy`.

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

With the Linux packages, put these settings in the service's environment file: `/etc/default/krakenkey-connector` on Debian and Ubuntu, `/etc/sysconfig/krakenkey-connector` on RPM-based systems. It is readable only by root and the `krakenkey-connector` group, and has commented examples. Don't put an API key or enrollment token there.

Plugins inherit the connector's environment, minus its KrakenKey credentials. Some cloud SDK settings decide where a plugin sends private keys and tokens, such as `AWS_ENDPOINT_URL`, `AZURE_AUTHORITY_HOST`, `HTTPS_PROXY` and `SSL_CERT_FILE`. Whoever can set the connector's environment or the SDK config files is inside your trust boundary, so set these only on purpose. The [README](https://github.com/KrakenKey/connector/blob/v0.3.0/README.md#trust-boundary) has the full list.

## 5. Enroll, validate and run once

Enroll once with the token, run `validate` until it reports no problems, then run one pass by hand and watch it before leaving the connector running.

### Enroll

The connector creates its identity key, stores it under `<data_dir>/identity/`, and spends the token. Enroll as the user the connector runs as, so its identity belongs to that user. The token file must be readable by that user and not by others.

On a host, as the `krakenkey-connector` user:

```bash
sudo install -m 0640 -o root -g krakenkey-connector /dev/null /etc/krakenkey-connector/enrollment-token
sudoedit /etc/krakenkey-connector/enrollment-token   # paste the kkce_... token
sudo -u krakenkey-connector env KK_ENROLLMENT_TOKEN_FILE=/etc/krakenkey-connector/enrollment-token \
  krakenkey-connector enroll
sudo rm /etc/krakenkey-connector/enrollment-token    # it works only once
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
  ghcr.io/krakenkey/connector:v0.3.0 enroll --config /etc/krakenkey-connector/config.yaml
sudo rm /etc/krakenkey-connector/enrollment-token
```

The connector's page in the dashboard changes from *Waiting to enroll* to *Active*.

### Validate

`validate` loads the config, starts every plugin and shows which version it used, where it was found and which checksum it matched, checks that each key store and target can work together, checks the identity, and asks KrakenKey about each certificate. A new certificate shows as *waiting for this connector to issue it*, and an implicit Key Vault target as `implicit`. It ends with a count; fix anything until it reads `0 problem(s)`, and read the warnings.

```bash
sudo -u krakenkey-connector krakenkey-connector validate
```

If the plugins read credentials from the packaged environment file, load it the way the service does (on RPM-based systems the file is `/etc/sysconfig/krakenkey-connector`):

```bash
sudo -u krakenkey-connector sh -c 'set -a; . /etc/default/krakenkey-connector; exec krakenkey-connector validate'
```

`validate --offline` skips the API checks.

### First pass

Run one pass with `run --once`, loading the environment file the same way if your plugins need it. The connector creates the key, sends the CSR, waits for issuance (usually a few minutes), installs the certificate, checks the endpoint over TLS, and exits `0`. The connector's page shows the target as *Verified*.

```bash
sudo -u krakenkey-connector krakenkey-connector run --once
```

To renew now regardless of the schedule, for example to test a new target, add `--force`, and `--cert <id>` to limit the pass to one certificate:

```bash
sudo -u krakenkey-connector krakenkey-connector run --once --force --cert 1042
```

## 6. Run as a service

Leave the connector running in `run` mode. It checks every `check_interval` (6 hours by default) and only renews when KrakenKey says a certificate is due.

### systemd with the Linux packages

The packaged unit is ready to use. Once `validate` is clean, enable and start it, and follow its log:

```bash
sudo systemctl enable --now krakenkey-connector
journalctl -u krakenkey-connector -f
```

The service runs as the `krakenkey-connector` user, reads `/etc/krakenkey-connector/config.yaml` and the environment file, and restarts after a failure, except after exit code `3` (the API key or enrollment token was rejected) or `5` (KrakenKey refused the connector's identity), which a restart can't fix.

The unit runs the connector with most of the file system read-only (`ProtectSystem=strict`, `ProtectHome=yes`, a private `/tmp`), no capabilities, `NoNewPrivileges=yes`, and a system call filter. It can write only to `/var/lib/krakenkey-connector` and its private `/tmp`. Outbound network access isn't restricted, so the connector reaches the KrakenKey API, and plugins reach cloud APIs and instance metadata (`169.254.169.254`).

#### File targets and reload commands

A `file` target needs a drop-in that lets the service write to its directory. The directory must also be writable by the `krakenkey-connector` user, and `owner` can only name that user or a group it belongs to. For the nginx example above, with `owner: ":nginx"`:

```bash
sudo install -d -m 0750 -o krakenkey-connector -g nginx /etc/nginx/tls/shop
sudo usermod -aG nginx krakenkey-connector
sudo systemctl edit krakenkey-connector
```

```ini
[Service]
ReadWritePaths=/etc/nginx/tls/shop
```

A target under `/home` also needs `ProtectHome=no` there.

Reload commands such as `then: { exec: [systemctl, reload, nginx] }` run as the `krakenkey-connector` user, and `NoNewPrivileges` rules out `sudo`. Allow the reload with a polkit rule instead (polkit 0.106 or later; install `polkitd` on Debian and Ubuntu if it is missing):

```js
// /etc/polkit-1/rules.d/50-krakenkey-connector.rules
polkit.addRule(function (action, subject) {
  if (action.id == "org.freedesktop.systemd1.manage-units" &&
      subject.user == "krakenkey-connector" &&
      action.lookup("unit") == "nginx.service" &&
      action.lookup("verb") == "reload") {
    return polkit.Result.YES;
  }
});
```

Run `validate` again after adding a drop-in.

#### With an API key instead of enrollment

Keep the key in a file only root can read and hand it to the service as a systemd credential:

```bash
sudo install -m 0600 /dev/null /etc/krakenkey-connector/api-key
sudoedit /etc/krakenkey-connector/api-key           # paste the kk_... key
sudo systemctl edit krakenkey-connector
```

```ini
[Service]
LoadCredential=kk_api_key:/etc/krakenkey-connector/api-key
```

`LoadCredential` needs systemd 247 or later. On older systems (RHEL 8), make the key file mode `0640` with group `krakenkey-connector` and set `KK_API_KEY_FILE=/etc/krakenkey-connector/api-key` in the environment file instead. Connectors that use an API key don't report status to the dashboard.

### systemd without the packages

With the release binaries, write a unit yourself:

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

You can also run `run --once` from cron, a systemd timer or launchd instead; the exit code tells you how the pass went. Only one connector process can use a data directory at a time.

### Container

The image runs `run` with the default config path, so no command is needed. Mount the same config and data volume, plus any directories a `file` target writes to:

```bash
docker run -d --name krakenkey-connector --restart unless-stopped \
  -v /etc/krakenkey-connector/config.yaml:/etc/krakenkey-connector/config.yaml:ro \
  -v krakenkey-connector-data:/var/lib/krakenkey-connector \
  ghcr.io/krakenkey/connector:v0.3.0
```

Pass cloud settings such as `AZURE_TOKEN_CREDENTIALS` with `-e`. With plugins declared without a version, the config keeps working when you move to a new image tag.

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

## Upgrading

- **Linux packages:** `apt upgrade` or `dnf upgrade`. An upgrade replaces the bundled plugins with the new version and restarts a running service; plugins declared without a version pick up the new ones on their own. If the config pins a plugin to a version the upgrade removed, the package doesn't restart the service, which keeps running with the plugins it already started, and prints the plugins to fix. Remove their `version`, or set it to the new one (`krakenkey-connector version`), then run `sudo systemctl restart krakenkey-connector`. Plugins you installed under the data directory with `version` and `sha256` aren't affected by upgrades.
- **Container:** change the image tag. Plugins declared without a version keep working.
- **Homebrew:** `brew upgrade krakenkey-connector`. Plugins under the data directory stay as they are until you install a new version and update `version` and `sha256` in the config.

### Upgrading from v0.2.0

- An enrolled connector now shares a read-only summary of its config (see [What KrakenKey sees](#what-krakenkey-sees)). Nothing changes on the host. Set `share_config: false` under `krakenkey:` before upgrading if you don't want that.

### Upgrading from v0.1.0

- Plugins that ship with the container image or the packages can be declared without `version`; the connector uses the bundled one. Pinned versions keep working, but must be changed on every upgrade.
- A certificate with the `azure-keyvault` key store gets an implicit target labeled `azure-keyvault`, deployed before its other targets. If one of its configured targets already uses that label for another place, the implicit target is skipped and `validate` warns; rename that target to get it.
- Key Vault certificates the connector manages now get the tag `krakenkey-connector-previous-version`, which leaves 13 of Key Vault's 15 tags for your own.

## Monitoring and alerts

- **Connectors page:** each connector's status (*Waiting to enroll*, *Enrollment token expired*, *Active*, *Stale* after 24 hours without contact, *Revoked*), version, when it was last seen, and how many certificates it has deployed, with failing targets counted in red.
- **A connector's page:** a read-only **Configuration** section from the config summary (certificates, key stores, targets and plugin versions, with hints when the config lists certificates the connector isn't allowed to manage, or misses ones it is), and every target with its state (*Pending*, *Staged*, *Activated*, *Verified*, *Activated (not verified)*, *Failed*, *Rolled back*), the serial it serves, and the error.
- **Certificates page:** a connector-managed certificate lists the connectors and targets it is deployed to.

Two alerts cover what needs a person. Both go by email (set under **Deployment Failed** and **Connector Offline** in your notification settings) and to Slack, Teams and webhook alert channels, which subscribe to them by default:

- **`deploy.failed`:** a target moved to *Failed* or *Rolled back*. At most one alert per target every 6 hours, and at most one email per connector per hour; later failures are counted in the next one.
- **`connector.stale`:** a connector hasn't checked in for 24 hours. Sent once, until it checks in again.

When issuance fails on KrakenKey's side, for example because of a missing `_acme-challenge` CNAME, the targets stay *Pending* with the error, and KrakenKey's usual certificate failure alert covers it.

On the host, logs go to stderr (the journal, for the packaged service); add `--log-format json` for log shipping. The audit log (`<data_dir>/audit.jsonl`) records every step that changes something, with old and new serials and results. Neither ever contains key material.

## Troubleshooting

`validate` catches most of these before anything is deployed.

| Message or symptom | Cause | Fix |
| --- | --- | --- |
| Certificate fails with `ACME challenge delegation missing` | No `_acme-challenge` CNAME for that name | Create the record the message names, then run another pass. |
| `config names [...] differ from the names KrakenKey is waiting for` | `names` in the config doesn't match the pending certificate | Make `names` match exactly. The connector creates nothing until it does. |
| `the ACM certificate has no key usage restriction (ACM shows ANY)` | The placeholder was imported without key usage options | Import a new placeholder with the command in step 1, attach it, and use its ARN. |
| `ACM cannot change the key type on reimport` | `key_type` differs from the ACM certificate's key | Match `key_type` to it, or import a placeholder with the new key type. |
| `certificate "..." in https://... was not created by the connector` | A Key Vault certificate with that name already exists, without the connector's ownership tag (or with another certificate's). Applies to the key store and to Key Vault targets. | Set `adopt: true` for the first run, or use a new `certificate_name`. |
| A Key Vault call fails with `grant the identity ... on the vault (Azure RBAC), or ... in the vault access policy` | Key Vault answered `403` | Grant the permission the message names; see [step 4](#key-vault). The next pass picks it up. |
| `validate` refuses a target for a Key Vault certificate with `exportable: false` | The target needs the key, such as Application Gateway or a Key Vault target for another vault | Set `exportable: true`. It applies to keys created afterwards. |
| `validate` warns that rollback is unavailable | The key store has `exportable: false`, so the previous certificate can't be imported again | Accept it (a failed deployment keeps the new version), or set `exportable: true`. |
| A Key Vault target is *Failed* with an error saying it wasn't rolled back | `verify` ran before the service picked up the new version | Leave out `verify` for slow services, lengthen `window`, or make the service pick it up in a `then` command. See [when services pick up a new version](#when-services-pick-up-a-new-version). |
| Rollback fails with `this version is disabled in Key Vault` | An old version that a rollback needs was disabled | Enable it again while a target may still need it. |
| `validate` warns that the implicit target was not added | A configured target already uses the label `azure-keyvault` for another place | Rename that target. |
| A plugin declared without a version doesn't start | The system plugin directory has no version of it, or more than one | Set `version` to choose one, or install the plugin with the package or image. |
| After a package upgrade, the service wasn't restarted and the upgrade listed plugins | The config pins a plugin version the upgrade removed | Remove `version` from those plugins, or set it to the new one, then restart the service. |
| A `file` target can't write its files under the packaged service | The unit only allows writes to the data directory and its private `/tmp` | Add a `ReadWritePaths=` drop-in for the target directory; see [File targets and reload commands](#file-targets-and-reload-commands). |
| `the gateway has no user-assigned managed identity` | The gateway uses a system-assigned identity, or none | Add a user-assigned identity with **Key Vault Secrets User** on the vault. |
| `ssl certificate "..." holds a certificate uploaded to the gateway` | The listener uses an uploaded PFX, not Key Vault | Set `replace_uploaded_certificate: true`. That first switch can't be rolled back. |
| `no usable Azure credential` | No identity visible to the plugin | Check the identity is attached, then set `AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential` and, for a user-assigned identity, `AZURE_CLIENT_ID`. |
| Verify times out on CloudFront | Edge propagation is slow | Use `window: 30m`. |
| Exit code `5` | Connector revoked, or clock more than five minutes off | Fix NTP. If revoked, create a new connector and enroll again. |
| `insecure permissions: ... has mode 0755; run: chmod 700 ...` | Data directory or key files too open | Run the `chmod` it prints, and make sure the connector's user owns the path. |

## Removing a connector

Revoking the connector in the dashboard cuts off its access at once. Certificates already installed keep working until they expire.

1. Go to **Connectors**, open the connector, and select **Revoke**. Every key it was issued stops working, and its next check exits with code `5`. A revoked connector can't enroll again.
2. Stop the container or service, and delete the data directory. It holds the identity key, any local private keys and the state. With the Linux packages, `apt remove` or `dnf remove` stops and disables the service but keeps the config, the data directory and the `krakenkey-connector` user (`dnf remove` saves an edited config as `config.yaml.rpmsave`). `apt purge` also deletes the config files the package installed and `/var/lib/krakenkey-connector`, including the identity and private keys.
3. `file` targets keep copies of earlier keys in `<dir>/.krakenkey-previous/`. Delete them once you no longer need to roll back.
4. Remove the custom roles and the IAM policy from step 4, and any drop-ins and polkit rules you added.
5. Decide what serves those sites next. Certificates the connector managed aren't renewed until another connector takes them over. To hand one back to KrakenKey's own renewal, set `{"managedBy": null, "autoRenew": true}` with the same `PATCH` as in step 1. KrakenKey's renewal reuses the last CSR, so you still need its private key (the key file a `file` target wrote, or the Key Vault certificate) and another way to deploy. Otherwise, issue new certificates before these expire.

Nothing on the targets is removed: Key Vault keeps its certificate versions, and ACM keeps the imported certificate.

## Reference

- [Connector repository](https://github.com/KrakenKey/connector) and [README](https://github.com/KrakenKey/connector/blob/v0.3.0/README.md): every command, flag and config key.
- [Changelog](https://github.com/KrakenKey/connector/blob/main/CHANGELOG.md) and [releases](https://github.com/KrakenKey/connector/releases).
- Plugin READMEs: [azure-keyvault](https://github.com/KrakenKey/connector/blob/v0.3.0/plugins/azure-keyvault/README.md), [azure-appgateway](https://github.com/KrakenKey/connector/blob/v0.3.0/plugins/azure-appgateway/README.md), [aws-acm](https://github.com/KrakenKey/connector/blob/v0.3.0/plugins/aws-acm/README.md).
- [Writing a plugin](https://github.com/KrakenKey/connector/blob/v0.3.0/README.md#writing-a-plugin): the gRPC protocol and Go SDK.
