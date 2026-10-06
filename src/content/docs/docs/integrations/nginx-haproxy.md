---
title: Use KrakenKey certificates with nginx and HAProxy
description: Issue a certificate on the server with the KrakenKey CLI, point nginx or HAProxy at it, and renew it with a systemd timer. The private key never leaves the host and the host needs no DNS credentials.
sidebar:
  label: nginx and HAProxy
---

nginx and HAProxy don't fetch certificates themselves. The usual answer is certbot, which either needs port 80 open for HTTP-01 or a DNS plugin holding an API token that can edit your zone. With KrakenKey the server needs neither: it only makes HTTPS requests out to `api.krakenkey.io`, and the DNS-01 challenge is answered through the `_acme-challenge` CNAME you set up once. See [How KrakenKey fits your stack](/docs/architecture/) for the full picture.

This guide issues one certificate for `example.com` and `www.example.com` on the server, so the private key is created there and never copied anywhere, then adds a daily timer that renews it when it's due and reloads the proxy.

## Prerequisites

- A verified domain in KrakenKey with both DNS records from [Getting started](/docs/getting-started/): the ownership TXT record and the `_acme-challenge` CNAME.
- The [KrakenKey CLI](/docs/cli/) v0.7.0 or later on the server (`krakenkey --version`). The `.deb` and `.rpm` packages on the [releases page](https://github.com/KrakenKey/cli/releases) install it to `/usr/bin/krakenkey`.
- `openssl` and `jq`.
- A KrakenKey API key from the dashboard, in a root-only file such as `/etc/krakenkey/env` (mode `0600`) containing `KK_API_KEY=...`. An API key can manage domains and certificates but can't create other keys or change the account, so if the server is compromised, deleting the key in the dashboard cuts it off.

## 1. Issue the certificate on the server

`cert issue` generates the key and CSR locally and sends only the CSR. As root:

```bash
install -d -m 0700 /etc/ssl/krakenkey
cd /etc/ssl/krakenkey
set -a; . /etc/krakenkey/env; set +a

krakenkey cert issue --domain example.com --san www.example.com \
  --key-out example.com.key --csr-out example.com.csr \
  --out example.com.crt --chain-out example.com.chain.pem \
  --fullchain-out example.com.fullchain.pem --wait
```

Pass `--san` once per name. Issuance usually takes a few minutes. Save the certificate ID it prints, since renewals use it:

```bash
echo <id> > example.com.id
chmod 0600 example.com.key
```

Both nginx and HAProxy read certificates as root when they start or reload, before dropping privileges, so the key can stay root-only.

Check the result before pointing a server at it:

```bash
openssl x509 -in example.com.fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
openssl verify -untrusted example.com.fullchain.pem example.com.fullchain.pem
```

Always serve the **full chain** (leaf plus intermediates). A leaf on its own looks fine in most browsers but fails in `curl`, Go, Java and other clients that don't fetch missing intermediates.

## 2a. Configure nginx

Point the server block at the full chain and the key:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.com www.example.com;

    ssl_certificate     /etc/ssl/krakenkey/example.com.fullchain.pem;
    ssl_certificate_key /etc/ssl/krakenkey/example.com.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Test and reload:

```bash
nginx -t && systemctl reload nginx
```

A reload reads the certificate files again, and existing connections finish on the old certificate.

## 2b. Configure HAProxy

HAProxy is simplest with the full chain and key in one file. Build it with tight permissions:

```bash
install -d -m 0700 /etc/haproxy/certs
( umask 077; cat /etc/ssl/krakenkey/example.com.fullchain.pem \
    /etc/ssl/krakenkey/example.com.key > /etc/haproxy/certs/example.com.pem )
```

Reference it on the bind line. To serve several certificates, point `crt` at the directory instead and HAProxy picks one by SNI:

```text
frontend https
    bind :443 ssl crt /etc/haproxy/certs/example.com.pem alpn h2,http/1.1
    default_backend app
```

Check and reload:

```bash
haproxy -c -f /etc/haproxy/haproxy.cfg && systemctl reload haproxy
```

## 3. Renew with a timer

`krakenkey cert renew` reuses the certificate's original CSR, so the key on disk stays valid and only the certificate changes. With `--if-due` it renews only inside your plan's renewal window (30 days before expiry on paid plans, 5 days on Free) and otherwise exits cleanly, so it's safe to run every day.

The script below runs the renewal in a scratch directory, downloads whatever certificate KrakenKey currently holds, and installs it only if it expires later than the live one, matches the key and covers your names. That last check also picks up renewals done by KrakenKey's own auto-renew, so it works whichever side renews. Save it as `/usr/local/bin/krakenkey-renew` and make it executable:

```bash
#!/usr/bin/env bash
# Renew the KrakenKey certificate when it's due, then install it and reload.
set -euo pipefail

DIR=/etc/ssl/krakenkey
NAME=example.com
HOSTS=(example.com www.example.com)
PROXY=nginx            # or haproxy
CRT="$DIR/$NAME.fullchain.pem"
KEY="$DIR/$NAME.key"
ID=$(<"$DIR/$NAME.id")

export KK_OUTPUT=json
log() { echo "[krakenkey-renew] $*"; }
enddate() { date -d "$(openssl x509 -noout -enddate -in "$1" | cut -d= -f2)" +%s; }

# Work on the same filesystem so the final mv is atomic.
WORK=$(mktemp -d "$DIR/.work.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

status=$(krakenkey cert show "$ID" | jq -r .status)
case "$status" in
  pending|issuing|renewing) log "certificate $ID is $status; trying again next run"; exit 0 ;;
  issued) ;;
  *) log "certificate $ID is $status; see krakenkey cert show $ID"; exit 1 ;;
esac

# Renews only inside the plan's renewal window; otherwise a no-op.
(cd "$WORK" && krakenkey cert renew "$ID" --if-due --wait --poll-timeout 20m >/dev/null)
krakenkey cert download "$ID" --format fullchain --out "$WORK/new.pem" >/dev/null

if (( $(enddate "$WORK/new.pem") <= $(enddate "$CRT") )); then
  log "up to date; expires $(openssl x509 -noout -enddate -in "$CRT" | cut -d= -f2)"
  exit 0
fi

[[ "$(openssl x509 -noout -pubkey -in "$WORK/new.pem")" == "$(openssl pkey -pubout -in "$KEY")" ]] \
  || { log "new certificate doesn't match the key"; exit 1; }
for h in "${HOSTS[@]}"; do
  openssl x509 -noout -checkhost "$h" -in "$WORK/new.pem" | grep -q 'does match' \
    || { log "new certificate doesn't cover $h"; exit 1; }
done

cp -p "$CRT" "$CRT.prev"
chmod 0644 "$WORK/new.pem"
mv "$WORK/new.pem" "$CRT"
log "installed certificate expiring $(openssl x509 -noout -enddate -in "$CRT" | cut -d= -f2)"

case "$PROXY" in
  nginx)
    nginx -t && systemctl reload nginx ;;
  haproxy)
    ( umask 077; cat "$CRT" "$KEY" > "$WORK/haproxy.pem" )
    mv "$WORK/haproxy.pem" "/etc/haproxy/certs/$NAME.pem"
    haproxy -c -f /etc/haproxy/haproxy.cfg && systemctl reload haproxy ;;
esac
```

Run it daily with a oneshot service and a timer:

```ini
# /etc/systemd/system/krakenkey-renew.service
[Unit]
Description=Renew the KrakenKey certificate
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/krakenkey/env
ExecStart=/usr/local/bin/krakenkey-renew
TimeoutStartSec=30min
```

```ini
# /etc/systemd/system/krakenkey-renew.timer
[Unit]
Description=Check the KrakenKey certificate daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now krakenkey-renew.timer
systemctl start krakenkey-renew.service && journalctl -u krakenkey-renew -n 5
```

On a paid plan renewal starts 30 days out, so a missed day or a failed run doesn't matter: the next run tries again and the old certificate keeps serving. On Free the window is 5 days, so keep an eye on failed runs, or use the [Caddy guide's script](/docs/integrations/caddy/#3-renew-with-a-timer), which renews when a third of the lifetime is left instead of waiting for the plan window.

If you rebuild the server and lose the key, run step 1 again. That issues a new certificate with a new key; `cert renew` can't help, because the old CSR belongs to a key you no longer have.

## 4. Verify what's served

```bash
for h in example.com www.example.com; do
  echo | openssl s_client -connect "$h:443" -servername "$h" -verify_return_error 2>/dev/null \
    | openssl x509 -noout -subject -enddate
done
```

Each name should show the KrakenKey certificate's subject and expiry. To be told when one doesn't, add the hostnames as [monitored endpoints](/docs/cli/commands/#krakenkey-endpoint). For hosts only reachable on your network, assign a connected probe running inside it.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Old certificate still served after renewal | The proxy wasn't reloaded, or the script's reload step failed its config test. Check `journalctl -u krakenkey-renew`. |
| `curl` fails with `unable to get local issuer certificate` but browsers work | The server is sending the leaf only. Point nginx at `fullchain.pem`, or rebuild the HAProxy file from the full chain. |
| `key values mismatch` from nginx, or HAProxy refuses the PEM | The certificate and key don't belong together, usually after re-issuing with a new key while the config still points at the old one. |
| Issuance fails on the challenge | Run `krakenkey domain check example.com www.example.com`, or `dig CNAME _acme-challenge.example.com +short`, which should return `example-com.acme.krakenkey.io.` `krakenkey cert show <id>` gives the failure reason. |
| The script fails with the certificate `failed` | A renewal didn't go through. `krakenkey cert show <id>` gives the reason; after fixing it, `krakenkey cert retry <id> --wait` and the next run installs the result. |
