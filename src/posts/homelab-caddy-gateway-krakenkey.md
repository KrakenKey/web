---
title: "Case study: moving a homelab's Caddy gateway to one KrakenKey certificate"
description: "We replaced 13 per-name Let's Encrypt certificates and a DNS API token on our lab gateway with one KrakenKey wildcard. What changed, what Caddy did that we didn't expect, and what we're fixing in KrakenKey."
pubDate: 2026-10-03
author: "KrakenKey Team"
tags: ["engineering", "acme", "dns", "certificate-transparency", "product"]
draft: false
---

We run KrakenKey on our own homelab. Its gateway is a single Caddy server that terminates TLS for 13 internal-only names: a portal at the apex domain, plus Proxmox, two Pi-holes, Plex, Home Assistant, a server's iDRAC, a couple of AI agents, a torrent UI and a few small web apps. Nothing in the lab accepts connections from the internet, yet every name gets a normal browser padlock with no private CA installed on any device.

Until this week, Caddy got those certificates itself. This post covers why we moved them to KrakenKey, how the cutover went, and what the move showed us about our own product. The setup is written up as a [Caddy integration guide](/docs/integrations/caddy/).

## The starting point

Caddy used Let's Encrypt's DNS-01 challenge through the Cloudflare plugin, with a zone-scoped, IP-filtered API token on the gateway. It worked, with three standing costs:

- **DNS credentials on the proxy.** The token could edit the zone. Anyone who took the gateway could create records, and with them get a certificate for any name in the domain.
- **Blocked outbound DNS.** The lab sends all DNS through two Pi-holes. Caddy's propagation check wants to query the authoritative nameservers directly, and through the Pi-holes it read a cached NXDOMAIN for the challenge record. Adding a new service broke issuance, and the fix was to turn the check off and sleep 30 seconds instead.
- **Every service in public CT logs.** One certificate per name meant every new hostname, the iDRAC and the torrent UI included, was published in Certificate Transparency logs the day it went live.

## Why KrakenKey fit

KrakenKey answers DNS-01 in its own zone. The domain owner creates one CNAME, `_acme-challenge` pointing at KrakenKey, and never touches DNS for issuance again. For the gateway, that meant:

- **No DNS credentials.** The gateway needs HTTPS to `api.krakenkey.io` and an API key. It can't edit DNS at all.
- **No DNS lookups during issuance.** Let's Encrypt validates against KrakenKey's zone, so the Pi-hole problem went away instead of being worked around.
- **One certificate.** `example.com` plus `*.example.com` covers all 13 names with one renewal, and new services no longer show up in CT logs. One CNAME covers both the apex and the wildcard.

The key is generated on the gateway by `krakenkey cert issue`, and only the CSR leaves the host.

### The wildcard trade-off

Our old gateway docs preferred per-name certificates over a wildcard, on the grounds that a compromised gateway only exposes the names it serves. That reasoning didn't hold. With a DNS token that can edit the zone on the box, an attacker could already mint a certificate for any name. Moving to KrakenKey takes the DNS-edit power off the gateway, so a wildcard with no DNS credentials is a smaller exposure than per-name certificates with them.

What remains is the KrakenKey API key, which is account-wide: it can issue for every domain verified on its account. We gave the lab its own KrakenKey account holding only its domain. Scoped keys, limited to specific domains, certificates or source addresses, are the top item from this project for the product.

## The rollout

We staged it so each step could be checked before the next one depended on it.

**Prerequisites, by hand.** The `_acme-challenge` CNAME next to the existing verification TXT record, a verified domain in KrakenKey, an API key in a root-only file on the gateway, and a check that the gateway could reach the API.

**Stage 1: issue and renew, without touching Caddy.** A renewal script and a daily systemd timer, delivered by the gateway's existing config sync, plus a read-only mount of the certificate directory into the Caddy container. No Caddyfile change, because `caddy validate` reads the certificate files and would fail if they didn't exist yet.

The first run issued the certificate about two minutes after it started, and about four minutes after the change merged, with no manual steps on the host. We checked it there before anything served it: issuer, both SANs, `openssl verify` against the system trust store.

**Stage 2: switch every site at once.** We planned to move one site first as a canary. Caddy doesn't allow that. Once a loaded certificate covers a name, Caddy skips its own ACME for that name and serves the loaded certificate, whichever site imported it. Pointing one site at the wildcard moved all 13. So the canary became the stage 1 check on the host, and the switch was a single change. Caddy keeps the old Let's Encrypt certificates in its storage, so rollback is reverting one commit.

From a LAN client, `openssl s_client -verify_return_error` against all 13 names showed the KrakenKey certificate with a trusted chain, and every upstream answered through Caddy.

## What Caddy taught us

- **`caddy reload` doesn't reload certificates.** If the Caddyfile hasn't changed, a reload is a no-op and Caddy keeps serving the old certificate from memory. `caddy reload --force` loads the new files without a restart. We tested this before cutover; a renewal script that used plain reload would install every renewal and serve none of them.
- **Wildcards are all or nothing.** As above, a loaded certificate takes over every name it covers.
- **Files before config.** `caddy validate` loads the certificate files, so they have to exist before any site references them.
- **Mount directories, not files.** Renewal replaces the files with `mv`. A Docker single-file bind mount follows the old inode, so the container would never see the new certificate. The gateway already mounted its Caddyfile as a directory for the same reason.

## What we're fixing in KrakenKey

Using the product the way a customer would turned up rough edges. None of them stopped the rollout, but each cost time, and each is on our list:

- **API key scope.** Covered above: keys are account-wide today.
- **Renewal hands-off.** `cert renew --wait` waits for the new certificate but doesn't download it, and the certificate isn't downloadable while a renewal is in progress. A client has to keep its last good copy and download after the renewal finishes. Our renewal script does that, and so does the one in the guide.
- **`renew` always issues.** It's a forced renewal, not "renew if due", so the client decides when. Let's Encrypt allows five duplicate certificates a week, so a script that renews on every run can lock itself out. A renewal window check on the API side would make a daily schedule safe.
- **Comma-separated SANs.** Our GitHub Action documents its `san` input as comma-separated, then passes the whole list to the CLI as one name. With the CLI directly, repeat `--san` per name.
- **`cert issue --wait` can skip the full chain** if fetching it fails, without an error. Downloading with `--format fullchain` afterwards avoids it.
- **`domain add` text output** doesn't show the CNAME you need to create, only the TXT record.
- **Free-tier renewal window.** One of our docs said 30 days; the free tier auto-renews 5 days before expiry. The gateway renews itself with a third of the lifetime left, about 30 days for a 90-day certificate, so it doesn't depend on either.

## Results

| | Before | After |
| --- | --- | --- |
| Certificates | 13, one per name | 1, apex plus wildcard |
| DNS credentials on the gateway | Zone-edit API token | None (old token retired after a soak) |
| DNS lookups during issuance | Required, broken by the lab's DNS policy | None |
| New service in CT logs | Every one | None |
| Change merged to certificate on the host | n/a | About 4 minutes |

Next we'll retire the Cloudflare token and the custom Caddy image built for its plugin, then point a connected KrakenKey probe inside the lab at the gateway's names, so a certificate that didn't rotate gets noticed by something other than a browser.

If you run Caddy for internal services, the [integration guide](/docs/integrations/caddy/) has the Caddyfile snippet, the renewal script and the systemd units.
