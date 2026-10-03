# KrakenKey setup runbook for AI agents

You are setting up TLS certificates from KrakenKey (https://krakenkey.io) for your user. Follow this runbook top to bottom. It is written for agents that can run shell commands; if you can't, see "No shell access" at the end.

How KrakenKey works, in one paragraph: the user registers a domain and proves ownership with a TXT record. They delegate ACME DNS-01 challenges to KrakenKey with one CNAME per certificate name. After that, certificates are issued from a CSR in 2 to 5 minutes and renewed without further DNS changes. The `krakenkey` CLI generates the private key and CSR locally. The private key never leaves the machine.

## Rules

- Do everything you can yourself. Stop for the user only at the single **Hand-off** step below, and ask for everything in one message so they can do it all and reply "go".
- Never print, log, paste or upload a private key. Don't ask the user to paste an API key into the chat; have them run `krakenkey auth login` in their own terminal instead.
- Put global flags before the command: `krakenkey --output json cert list` works, `krakenkey cert list --output json` does not.
- Use `--output json` and parse with `jq` when you need values. Errors in JSON mode go to stderr as `{"error":"..."}`.
- Exit codes: 0 ok, 1 error, 2 auth (no key or key rejected), 3 not found, 4 rate limited, 5 config error. `auth status` alone exits 5 when no key is configured.

## 1. Find out what's needed

You need the list of hostnames the certificate should cover, for example `example.com` and `www.example.com`, or `*.example.com`. Take them from the user's request or the project (server config, deploy files). Ask only if you can't tell.

Also note where the certificate will be used (nginx, Caddy, a load balancer, CI). You'll need this in step 7.

## 2. Install the CLI

Skip this if `krakenkey version` works.

```bash
VERSION=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/KrakenKey/cli/releases/latest | sed 's#.*/tag/v##')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$(uname -m)" in x86_64|amd64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "unsupported arch, use go install or docker"; exit 1 ;; esac
ASSET="krakenkey_${VERSION}_${OS}_${ARCH}.tar.gz"
BASE="https://github.com/KrakenKey/cli/releases/download/v${VERSION}"
TMP=$(mktemp -d) && cd "$TMP"
curl -fsSLO "$BASE/$ASSET" && curl -fsSLO "$BASE/checksums.txt"
grep " $ASSET\$" checksums.txt | sha256sum -c -    # macOS: shasum -a 256 -c -
tar -xzf "$ASSET" krakenkey
mkdir -p "$HOME/.local/bin" && mv krakenkey "$HOME/.local/bin/"
cd - >/dev/null && rm -rf "$TMP"
```

Make sure `~/.local/bin` is on `PATH`. The CLI reads its key from `~/.config/krakenkey/config.yaml`, which is where the user's `krakenkey auth login` writes it. If you run in a separate sandbox or container, pass the key in as `KK_API_KEY` instead. Windows (amd64) uses a `.zip` asset of the same name. Other options:

- `go install github.com/krakenkey/cli/cmd/krakenkey@latest`
- `docker run --rm -e KK_API_KEY -v "$PWD:/out" -w /out ghcr.io/krakenkey/cli:latest <command>`

## 3. Check what already exists

```bash
krakenkey --output json auth status          # exit 5: no key configured, exit 2: key rejected
krakenkey --output json domain list          # [{id, hostname, isVerified, verificationCode}]
```

`KK_API_KEY` in the environment also works as the API key.

If you have an API key, find a registered domain that covers each hostname. A verified domain covers itself and every subdomain under it, so a verified `example.com` covers `www.example.com` and `*.example.com`. If nothing covers the hostnames, register the zone the user controls, usually the apex:

```bash
krakenkey --output json domain add example.com    # returns {id, hostname, verificationCode, isVerified}
```

## 4. Work out the DNS records

**Ownership TXT** (only if the domain isn't verified yet):

| Type | Name | Value |
| --- | --- | --- |
| TXT | the registered hostname, e.g. `example.com` (`@` in most DNS panels) | `verificationCode` from step 3 |

This record stays in DNS permanently. KrakenKey re-checks it daily. Several `krakenkey-site-verification=` records can sit on one name; verification passes if any of them matches. Without an API key you can't tell whether an existing one belongs to this user's account, so let the dashboard value decide (step 5).

**Challenge CNAMEs**: one per name on the certificate. Strip a leading `*.`, then remove duplicates:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `_acme-challenge.<name>` | `<name with every . replaced by ->.acme.krakenkey.io` |

Examples:

- `example.com` and `*.example.com` share one record: `_acme-challenge.example.com` → `example-com.acme.krakenkey.io`.
- `www.example.com`: `_acme-challenge.www.example.com` → `www-example-com.acme.krakenkey.io`.

KrakenKey checks these CNAMEs before every order. If one is missing or wrong, issuance fails.

Check what is already in place:

```bash
dig +short TXT example.com @1.1.1.1
dig +short CNAME _acme-challenge.example.com @1.1.1.1
```

For each challenge CNAME:

| `dig +short CNAME` returns | Action |
| --- | --- |
| the expected target (dig adds a trailing dot) | nothing to do |
| a different target | ask the user to change the existing record to the expected target (tell them the current value) |
| nothing | run `dig +short TXT _acme-challenge.<name> @1.1.1.1`; if that prints anything, the user must delete those TXT records, then add the CNAME. Otherwise just add the CNAME |

Only ask for what is missing or wrong.

Things to tell the user when they apply:

- On Cloudflare, the `_acme-challenge` CNAME must be **DNS only** (grey cloud), not proxied.
- Most DNS panels want the name relative to the zone: `_acme-challenge` or `_acme-challenge.www`, not the full name.
- If the zone has CAA records, they must allow `letsencrypt.org`. If they set `validationmethods`, it must include `dns-01`.

If you already have working access to the user's DNS provider (a Cloudflare API token, AWS credentials for Route 53, Terraform managing the zone, etc.), offer to create these records yourself. Then they drop out of the hand-off.

## 5. Hand-off: one message, then wait for "go"

Send one message with only the steps that are still open. Typical cases:

**No account or API key yet.** The TXT value doesn't exist until the domain is registered, so have the user register it in the dashboard while they're there:

> To finish, please do these, then reply "go":
>
> 1. Sign in at https://app.krakenkey.io, or sign up if you don't have an account (free plan, no card needed).
> 2. In the dashboard, open **Domains** and add `example.com` if it isn't there yet. Add the TXT record it shows you at your DNS provider, unless that exact value is already in DNS.
> 3. Also add these CNAME records (DNS only, not proxied):
>    | Type | Name | Target |
>    | --- | --- | --- |
>    | CNAME | `_acme-challenge.example.com` | `example-com.acme.krakenkey.io` |
>    | CNAME | `_acme-challenge.www.example.com` | `www-example-com.acme.krakenkey.io` |
> 4. Create an API key under **API Keys** (https://app.krakenkey.io/dashboard/api-keys), then run `krakenkey auth login` in your terminal and paste the key when asked.

Add anything else you couldn't work out yourself, such as where the certificate will be deployed.

**Has an API key, DNS not done.** Run `domain add` yourself first, then send only the DNS table, with the TXT value filled in.

**Everything already in place.** Skip the hand-off.

## 6. Verify and issue

After "go", confirm the key works (`krakenkey auth status`). Then wait for DNS: poll the `dig` commands from step 4 every 30 seconds, for up to 15 minutes. Once the TXT is visible:

```bash
krakenkey --output json domain list                 # get the domain id
krakenkey --output json domain verify <domain-id>   # checks the TXT record only
```

Once every challenge CNAME resolves to its target, issue one certificate covering all the names:

```bash
mkdir -p certs
krakenkey --output json cert issue \
  --domain example.com --san www.example.com \
  --key-out certs/example.com.key \
  --fullchain-out certs/example.com.fullchain.pem \
  --auto-renew --wait
```

- `--domain` is the common name. Repeat `--san` for each extra name.
- `--key-type` defaults to `ecdsa-p256`. Use `rsa-2048` if the target platform needs RSA.
- `--wait` polls every 15 seconds for up to 10 minutes (`--poll-interval`, `--poll-timeout`). The JSON result includes `id`, `status` and `expiresAt`.
- `--auto-renew` lets KrakenKey renew the certificate before expiry with the same CSR and key. Renewed certificates still have to be fetched where they are deployed (step 7).
- Keep the key file out of version control; add it to `.gitignore` if it sits inside a repo.

## 7. Deploy and confirm

- Point the server at the full chain and the key. Most servers (nginx, Caddy, HAProxy) want the full chain, not the leaf alone. Then reload the server.
- Check it from outside:

  ```bash
  openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -enddate
  ```

- Renewals: `krakenkey cert download <cert-id> --format fullchain --out <path>` fetches the current certificate. Suggest a daily cron job or CI step that downloads it and reloads the server, or use the GitHub Action `KrakenKey/cert-action` in CI.
- Optional monitoring: `krakenkey endpoint add example.com` makes KrakenKey watch the live certificate. Free plans use a self-hosted probe; hosted probes start on the Starter plan.

Finish by telling the user:

- the certificate ID and expiry date;
- where the key and full chain files are;
- how renewal will reach the server.

## Troubleshooting

- **`domain verify` fails.** The TXT isn't visible yet, or it is on the wrong name. It must sit on the registered hostname itself. Wait and retry.
- **Certificate status `failed`.** Almost always a missing or wrong `_acme-challenge` CNAME, or a CAA record that blocks Let's Encrypt. The API doesn't return the reason yet; the account owner gets it by email. Check with `dig`, fix, then run `krakenkey --output json cert retry <cert-id> --wait`.
- **`No verified domains` or names not authorized.** Every name on the certificate must be a verified domain or a subdomain of one.
- **402 or `plan_limit_exceeded`.** The plan limit is reached. The free plan allows 3 domains, 5 certificates per month and 2 concurrent pending orders. Tell the user; don't retry.
- **429 (exit 4).** Rate limited. Issuance, renewal, retry and verification are limited per hour, so back off before retrying.

## No shell access

Use the REST API at `https://api.krakenkey.io` with `Authorization: Bearer <kk_ API key>`.

- Spec: https://api.krakenkey.io/swagger-json
- Flow: `POST /domains` → DNS records → `POST /domains/{id}/verify` → `POST /certs/tls` with `{"csrPem": "..."}` → poll `GET /certs/tls/{id}` until `status` is `issued` → `GET /certs/tls/{id}/chain` for `fullChainPem`.
- The CSR and private key must be generated where the certificate will be used, never by KrakenKey.

## More

- Docs: https://krakenkey.io/docs/
- CLI reference: https://krakenkey.io/docs/cli/commands/
- Tool definitions for function calling: https://github.com/KrakenKey/KrakenKey/tree/main/tools
