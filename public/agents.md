# KrakenKey setup runbook for AI agents

You are setting up TLS certificates from KrakenKey (https://krakenkey.io) for your user. Follow this runbook top to bottom. It is written for agents that can run shell commands; if you can't, see "No shell access" at the end.

How KrakenKey works, in one paragraph: the user registers a domain and proves ownership with a TXT record. They delegate ACME DNS-01 challenges to KrakenKey with one CNAME per certificate name. After that, certificates are issued from a CSR in 2 to 5 minutes and renewed without further DNS changes. The `krakenkey` CLI generates the private key and CSR locally. The private key never leaves the machine.

## Rules

- Do everything you can yourself. Stop for the user only at the single **Hand-off** step below, and ask for everything in one message so they can do it all and reply "go".
- Never print, log, paste or upload a private key. Never ask the user to paste an API key into the chat. Sign in with `krakenkey auth login --web` (step 3): the user approves in their browser and the key never passes through the conversation.
- Put global flags before the command: `krakenkey --output json cert list` works, `krakenkey cert list --output json` does not.
- Use `--output json` and parse with `jq` when you need values. Errors in JSON mode go to stderr as `{"error":"..."}`.
- Exit codes: 0 ok, 1 error, 2 auth (no key or key rejected), 3 not found, 4 rate limited, 5 config error. `auth status` alone exits 5 when no key is configured.

## 1. Find out what's needed

You need the list of hostnames the certificate should cover, for example `example.com` and `www.example.com`, or `*.example.com`. Take them from the user's request or the project (server config, deploy files). Ask only if you can't tell.

Also note where the certificate will be used (nginx, Caddy, a load balancer, CI). You'll need this in step 7.

## 2. Install the CLI

Skip this if `krakenkey version` prints 0.6.0 or later. Older versions lack `auth login --web` and `domain check`, which this runbook uses.

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

Make sure `~/.local/bin` is on `PATH`. The CLI reads its key from `~/.config/krakenkey/config.yaml`, which is where `krakenkey auth login --web` saves it on the machine you run it on. `KK_API_KEY` in the environment also works. Windows (amd64) uses a `.zip` asset of the same name. Other options:

- `brew install krakenkey/tap/krakenkey` (macOS and Linux, if Homebrew is installed)
- `.deb` and `.rpm` packages on the same release, which install `/usr/bin/krakenkey`
- `go install github.com/krakenkey/cli/cmd/krakenkey@latest`
- `docker run --rm -e KK_API_KEY -v "$PWD:/out" -w /out ghcr.io/krakenkey/cli:latest <command>`

## 3. Check what already exists

```bash
krakenkey --output json auth status          # exit 5: no key configured, exit 2: key rejected
krakenkey --output json domain list          # [{id, hostname, isVerified, verificationCode}]
```

If `auth status` fails, start the browser login now, in the background, so its link can go into the hand-off. It waits up to 10 minutes for the user to approve, then saves a new API key to the config file:

```bash
krakenkey auth login --web --no-browser > /tmp/krakenkey-login.log 2>&1 &
sleep 3; cat /tmp/krakenkey-login.log    # the approval link and its code
```

If the user is at this machine, drop `--no-browser` and it opens their browser too. Don't run `domain add` while this login is pending; the user adds the domain in the dashboard during the hand-off (step 5).

If you have an API key, find a registered domain that covers each hostname. A verified domain covers itself and every subdomain under it, so a verified `example.com` covers `www.example.com` and `*.example.com`. If nothing covers the hostnames, register the zone the user controls, usually the apex:

```bash
krakenkey --output json domain add example.com    # returns {id, hostname, verificationCode, isVerified, dnsRecords}
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

Check what is already in place. Pass every name that will be on the certificate:

```bash
krakenkey --output json domain check example.com www.example.com --resolver 1.1.1.1
```

It works without an API key (the ownership TXT is then reported as `skipped`). It prints `{ready, records: [{type, name, expected, found, status, detail}]}` and exits 1 until every record is in place. For each record:

| `status` | Action |
| --- | --- |
| `ok` | nothing to do |
| `missing` | ask the user to add it |
| `wrong` | ask the user to change the existing record to `expected` (tell them the current value from `found`) |
| `conflict` | TXT records sit where the CNAME must go; the user must delete them, then add the CNAME |
| `unregistered` | no registered domain covers this name; run `domain add` (step 3) |
| `skipped` | no API key yet; the dashboard shows the TXT value (step 5) |

Only ask for what is missing or wrong.

Things to tell the user when they apply:

- On Cloudflare, the `_acme-challenge` CNAME must be **DNS only** (grey cloud), not proxied.
- Most DNS panels want the name relative to the zone: `_acme-challenge` or `_acme-challenge.www`, not the full name.
- If the zone has CAA records, they must allow `letsencrypt.org`. If they set `validationmethods`, it must include `dns-01`.

If you already have working access to the user's DNS provider (a Cloudflare API token, AWS credentials for Route 53, Terraform managing the zone, etc.), offer to create these records yourself. Then they drop out of the hand-off.

## 5. Hand-off: one message, then wait for "go"

Send one message with only the steps that are still open. Typical cases:

**Not signed in yet.** Put the approval link from step 3 first; it also works for a new account. The TXT value doesn't exist until the domain is registered, so have the user register it in the dashboard while they're there:

> To finish, please do these, then reply "go":
>
> 1. Open https://app.krakenkey.io/device?code=BCDF-GHJK, sign in (or sign up: free plan, no card), check the page shows code **BCDF-GHJK**, and click **Approve**. This lets me use KrakenKey for you; the link expires in 10 minutes.
> 2. In the dashboard, open **Domains** and add `example.com` if it isn't there yet. Add the TXT record it shows you at your DNS provider, unless that exact value is already in DNS.
> 3. Also add these CNAME records (DNS only, not proxied):
>    | Type | Name | Target |
>    | --- | --- | --- |
>    | CNAME | `_acme-challenge.example.com` | `example-com.acme.krakenkey.io` |
>    | CNAME | `_acme-challenge.www.example.com` | `www-example-com.acme.krakenkey.io` |

Add anything else you couldn't work out yourself, such as where the certificate will be deployed.

**Signed in, DNS not done.** Run `domain add` yourself first, then send only the DNS table, with the TXT value filled in.

**Everything already in place.** Skip the hand-off.

## 6. Verify and issue

After "go", confirm the login finished (`krakenkey auth status`). If `/tmp/krakenkey-login.log` says the request expired or was denied, start `auth login --web` again and send the user just the new link. Then wait for DNS. This re-checks every 30 seconds for up to 15 minutes and exits 0 once everything is in place:

```bash
krakenkey --output json domain check example.com www.example.com --resolver 1.1.1.1 --wait
krakenkey --output json domain list                 # get the domain id
krakenkey --output json domain verify <domain-id>   # checks the TXT record only
```

Then issue one certificate covering all the names:

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
- **Certificate status `failed`.** The `--wait` error and `krakenkey cert show <cert-id>` include the reason (`failureReason` in JSON). It is almost always a missing or wrong `_acme-challenge` CNAME, or a CAA record that blocks Let's Encrypt. Fix it, confirm with `domain check`, then run `krakenkey --output json cert retry <cert-id> --wait`.
- **`No verified domains` or names not authorized.** Every name on the certificate must be a verified domain or a subdomain of one.
- **402 or `plan_limit_exceeded`.** The plan limit is reached. The free plan allows 3 domains, 5 certificates per month and 2 concurrent pending orders. Tell the user; don't retry.
- **429 (exit 4).** Rate limited. Issuance, renewal, retry and verification are limited per hour, so back off before retrying.

## No shell access

Use the REST API at `https://api.krakenkey.io` with `Authorization: Bearer <kk_ API key>`.

- Spec: https://api.krakenkey.io/swagger-json
- Flow: `POST /domains` → DNS records → `POST /domains/{id}/verify` → `POST /certs/tls` with `{"csrPem": "..."}` → poll `GET /certs/tls/{id}` until `status` is `issued` (on `failed`, `failureReason` says why) → `GET /certs/tls/{id}/chain` for `fullChainPem`.
- The CSR and private key must be generated where the certificate will be used, never by KrakenKey.

## More

- Docs: https://krakenkey.io/docs/
- CLI reference: https://krakenkey.io/docs/cli/commands/
- Tool definitions for function calling: https://github.com/KrakenKey/KrakenKey/tree/main/tools
