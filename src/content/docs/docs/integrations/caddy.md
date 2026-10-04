---
title: Use KrakenKey certificates with Caddy
description: Issue a KrakenKey wildcard certificate on the Caddy host, load it with the tls directive, and renew it with a systemd timer. No DNS credentials on the server.
sidebar:
  label: Caddy
---

Caddy normally gets its own certificates over ACME. That works well for a public site, but for internal-only hosts it means either opening port 80 or giving Caddy a DNS provider plugin and an API token that can edit your zone. With KrakenKey, the Caddy host only needs HTTPS out to `api.krakenkey.io`. KrakenKey answers the DNS-01 challenge in its own zone through your `_acme-challenge` CNAME, and Caddy serves the result as a manually loaded certificate.

This guide sets up one certificate for `example.com` and `*.example.com`, issued on the Caddy host so the private key never leaves it, and a daily timer that renews it and reloads Caddy. It's the setup we run on our own lab gateway; [the case study](/blog/homelab-caddy-gateway-krakenkey/) covers why we moved and what we found along the way.

## When this fits

- Internal or private services that can't answer HTTP-01, where you don't want DNS credentials on the proxy.
- Networks that block outbound DNS. Caddy's DNS-01 propagation check queries authoritative nameservers directly; KrakenKey's issuance needs no DNS lookups from your host.
- Many subdomains behind one proxy. One wildcard means one renewal, and new services don't each show up in public Certificate Transparency logs.

If Caddy can already reach Let's Encrypt over HTTP-01, its built-in ACME is simpler and you don't need this.

## Prerequisites

- A verified domain in KrakenKey with both DNS records from [Getting started](/docs/getting-started/): the ownership TXT record and the `_acme-challenge` CNAME. One CNAME covers both the apex and the wildcard.
- The [KrakenKey CLI](/docs/cli/) on the Caddy host, or Docker to run `ghcr.io/krakenkey/cli`.
- `openssl` and `jq`.
- A KrakenKey API key from the dashboard in a root-only file, for example `/etc/krakenkey/env` (mode `0600`) containing `KK_API_KEY=...`. A key can manage domains and certificates but can't create other keys or change the account, so if the host is ever compromised, deleting the key in the dashboard cuts it off. It does cover every domain on its account; a separate KrakenKey account for the host keeps it to the domains it serves.

## 1. Issue the certificate on the host

`cert issue` generates the key and CSR locally and sends only the CSR. As root, put the files in a directory of their own:

```bash
install -d -m 0750 -g caddy /etc/caddy/certs
cd /etc/caddy/certs
set -a; . /etc/krakenkey/env; set +a

krakenkey cert issue --domain example.com --san '*.example.com' \
  --key-out example.com.key --csr-out example.com.csr --wait
```

Pass `--san` once per name; a comma-separated list is treated as a single name. Save the certificate ID it prints, since renewals use it, then download the full chain so the leaf and intermediates are in one file:

```bash
echo <id> > example.com.id
krakenkey cert download <id> --format fullchain --out example.com.fullchain.pem
chgrp caddy example.com.key && chmod 0640 example.com.key
```

`--wait` also writes the leaf, chain and full chain as `.crt` files. This guide uses the downloaded `.pem`, so the `.crt` files can be deleted. CLI versions before v0.7.0 could skip the full chain without an error, which is another reason to download it explicitly.

Check what you got before Caddy sees it:

```bash
openssl x509 -in example.com.fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
openssl verify -untrusted example.com.fullchain.pem example.com.fullchain.pem
```

## 2. Point Caddy at the files

Add a snippet and import it in every site the certificate covers:

```text
(tls_krakenkey) {
	tls /etc/caddy/certs/example.com.fullchain.pem /etc/caddy/certs/example.com.key
}

example.com {
	import tls_krakenkey
	reverse_proxy portal:3000
}

grafana.example.com {
	import tls_krakenkey
	reverse_proxy grafana:3000
}
```

`caddy validate` and `caddy reload` read the certificate files, so they have to exist before any site references them. Issue first, then change the Caddyfile.

Once a loaded certificate covers a name, Caddy skips its own ACME for that name and serves the loaded certificate, whether or not that site imports the snippet. You can't trial a wildcard on one site while the others keep their old certificates. Check the certificate on disk first, then switch every site in one change. Caddy keeps its previous ACME certificates in storage, so reverting the Caddyfile is the rollback.

### Running Caddy in Docker

Mount the certificate directory, not the individual files, and point the snippet at the container path:

```yaml
services:
  caddy:
    volumes:
      - /etc/caddy/certs:/certs:ro
```

A single-file bind mount follows the file's inode. Renewal replaces the files with `mv`, so a file mount would keep showing the container the old certificate. A directory mount picks up the new files.

## 3. Renew with a timer

`krakenkey cert renew` reuses the certificate's existing CSR, so the key on disk stays valid and only the certificate changes. On its own it always requests a new certificate. CLI v0.7.0 adds `--if-due`, which renews only inside your plan's renewal window (30 days before expiry on paid plans, 5 on Free), so a daily `krakenkey cert renew <id> --if-due --wait --fullchain-out ...` is safe on its own. The script below decides when renewal is due itself, which keeps a wider margin on the Free plan and works with older CLI versions, and adds the checks below. A few things shape it:

- **Renew at a third of the lifetime remaining.** For a 90-day certificate that's about 30 days out, which leaves weeks for retries. It also adjusts on its own as certificate lifetimes shrink. If KrakenKey's own auto-renew gets there first, the script sees the newer certificate and downloads it instead of renewing again.
- **Download after renewing.** The script downloads the new certificate into a work directory instead of using the files `cert renew --wait` writes (CLI v0.7.0 and later), so it can check the result before Caddy sees it. The renew call also runs in that directory, so those extra files are cleaned up with it.
- **Keep the served copy until the new one checks out.** While a renewal is in progress, KrakenKey holds no downloadable certificate. The script writes into a work directory, checks that the new certificate matches the key, covers the names and is newer than the live one, then moves it into place.
- **Reload with `--force`.** A plain `caddy reload` does nothing when the Caddyfile hasn't changed, so Caddy keeps serving the old certificate from memory. `caddy reload --force` loads the new files without a restart.

Save this as `/usr/local/bin/krakenkey-renew` and make it executable:

```bash
#!/usr/bin/env bash
# Renew the KrakenKey certificate for Caddy when a third of its lifetime is left.
set -euo pipefail

DIR=/etc/caddy/certs
NAME=example.com
HOSTS=(example.com check.example.com)   # one made-up label tests the wildcard
CRT="$DIR/$NAME.fullchain.pem"
KEY="$DIR/$NAME.key"
ID=$(<"$DIR/$NAME.id")
RELOAD=(caddy reload --force --config /etc/caddy/Caddyfile)
# Docker: RELOAD=(docker exec caddy caddy reload --force --config /etc/caddy/Caddyfile)

export KK_OUTPUT=json
log() { echo "[krakenkey-renew] $*"; }
epoch() { date -d "$(openssl x509 -noout "-$1" -in "$2" | cut -d= -f2)" +%s; }

start=$(epoch startdate "$CRT"); end=$(epoch enddate "$CRT"); now=$(date +%s)
if (( end - now > (end - start) / 3 )); then
  log "not due; expires $(date -d @"$end")"
  exit 0
fi

# Work on the same filesystem so the final mv is atomic.
WORK=$(mktemp -d "$DIR/.work.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

krakenkey cert show "$ID" > "$WORK/show.json"
status=$(jq -r .status "$WORK/show.json")
expires=$(jq -r '.expiresAt // empty' "$WORK/show.json")
case "$status" in
  pending|issuing|renewing) log "certificate $ID is $status; next run"; exit 0 ;;
esac

# An earlier run, or KrakenKey's auto-renew, may already have a newer cert.
if [[ $status == issued && -n $expires ]] && (( $(date -d "$expires" +%s) > end + 86400 )); then
  log "KrakenKey already has a newer certificate; downloading it"
else
  log "renewing certificate $ID"
  # Run in $WORK: CLI v0.7.0+ also saves renewed .crt files to the current directory.
  (cd "$WORK" && krakenkey cert renew "$ID" --wait --poll-timeout 20m >/dev/null)
fi

krakenkey cert download "$ID" --format fullchain --out "$WORK/new.pem" >/dev/null

[[ "$(openssl x509 -noout -pubkey -in "$WORK/new.pem")" == "$(openssl pkey -pubout -in "$KEY")" ]] \
  || { log "new certificate doesn't match the key"; exit 1; }
for h in "${HOSTS[@]}"; do
  openssl x509 -noout -checkhost "$h" -in "$WORK/new.pem" | grep -q 'does match' \
    || { log "new certificate doesn't cover $h"; exit 1; }
done
(( $(epoch enddate "$WORK/new.pem") > end )) || { log "new certificate isn't newer"; exit 1; }

cp -p "$CRT" "$CRT.prev"
chmod 0644 "$WORK/new.pem"
mv "$WORK/new.pem" "$CRT"
log "installed certificate expiring $(openssl x509 -noout -enddate -in "$CRT" | cut -d= -f2)"
"${RELOAD[@]}"
```

Run it daily with a oneshot service and a timer:

```ini
# /etc/systemd/system/krakenkey-renew.service
[Unit]
Description=Renew the KrakenKey certificate for Caddy
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
Description=Check the KrakenKey certificate for Caddy daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now krakenkey-renew.timer
sudo systemctl start krakenkey-renew.service && journalctl -u krakenkey-renew -n 5
```

Most runs only read the certificate's dates and exit. Renewal starts with weeks to spare, so a missed day or a failed run doesn't matter; the next run tries again and the old certificate keeps serving. Because each renewal is a new issuance, the script never renews twice for the same expiry, which keeps it within your plan's limits.

If you rebuild the host and lose the key, run step 1 again. That issues a new certificate with a new key; `cert renew` can't help, because the old CSR belongs to a key you no longer have.

## 4. Verify what Caddy serves

```bash
for h in example.com grafana.example.com; do
  echo | openssl s_client -connect "$h:443" -servername "$h" -verify_return_error 2>/dev/null \
    | openssl x509 -noout -subject -enddate
done
```

Each name should show the KrakenKey certificate's subject and expiry. To be told when one doesn't, add the hostnames as [monitored endpoints](/docs/cli/commands/#krakenkey-endpoint). For hosts only reachable on your network, assign a connected probe running inside it.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Old certificate still served after renewal | Caddy was reloaded without `--force`, or a Docker single-file bind mount is pinned to the old inode. |
| `caddy validate` fails with a file error | The Caddyfile references the certificate before step 1 wrote it. |
| One site switched and all the others did too | Expected: a loaded wildcard covers every matching site. |
| Issuance fails on the challenge | Run `krakenkey domain check example.com '*.example.com'` (CLI v0.5.0 or later), or `dig CNAME _acme-challenge.example.com +short`, which should return `example-com.acme.krakenkey.io.` `krakenkey cert show <id>` gives the failure reason. |
| Caddy can't read the key | The key needs to be readable by the user Caddy runs as (`caddy` for the distribution packages). |
