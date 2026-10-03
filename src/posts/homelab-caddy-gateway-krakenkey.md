---
title: "Case study: TLS for internal services without DNS credentials on the proxy"
description: "How we moved an internal Caddy gateway from per-host Let's Encrypt certificates and a DNS API token to a single KrakenKey wildcard certificate, and what the migration showed about reverse proxies, DNS-01 validation and our own product."
pubDate: 2026-10-03
author: "KrakenKey Team"
tags: ["engineering", "acme", "dns", "certificate-transparency", "product"]
draft: false
---

A common way to give internal services real certificates is to put them behind one reverse proxy that terminates TLS and obtains certificates through the ACME DNS-01 challenge. The services stay off the internet, and every device trusts them without a private CA.

We run this pattern in our own lab environment. One Caddy gateway serves 13 internal-only hostnames: a hypervisor console, the internal DNS resolvers, out-of-band server management, home automation, and several internal web applications. This post covers moving that gateway to KrakenKey:

- why the original setup was costly
- what the new design looks like
- how we staged the cutover
- the Caddy behaviors that matter for anyone doing the same
- the changes the migration drove in KrakenKey

The configuration itself is published as the [Caddy integration guide](/docs/integrations/caddy/).

## Starting point: DNS-01 from the proxy

The gateway used Caddy's Cloudflare plugin to get one Let's Encrypt certificate per hostname over DNS-01. It held a zone-scoped, IP-restricted API token for that. This is a standard configuration, and it carried three ongoing costs.

- **DNS write access on an edge system.** Even a narrowly scoped token can edit the zone. Whoever controls the proxy can create records, and with them obtain a certificate for any name in the domain.
- **Fragile under restricted DNS.** The network sends all DNS through internal resolvers and blocks direct outbound queries, a common policy. Caddy's propagation check queries the authoritative nameservers directly. Through the internal resolvers it received a cached negative answer for the challenge record, so adding a hostname failed until we replaced the check with a fixed delay.
- **Internal hostnames in Certificate Transparency logs.** Every per-host certificate publishes its name. Each new internal service, management interfaces included, became publicly discoverable on the day it went live.

## Target design: delegated validation and one certificate

KrakenKey answers DNS-01 challenges in its own zone. The domain owner creates one CNAME from `_acme-challenge` to a KrakenKey-managed record, once. From then on:

- **The proxy holds no DNS credentials.** It needs outbound HTTPS to the KrakenKey API and an API key, nothing else.
- **Issuance doesn't depend on local DNS.** The CA validates against KrakenKey's zone, so the internal resolver policy no longer matters.
- **One certificate covers every service.** `example.com` and `*.example.com` share a single CNAME and a single renewal, and new services add nothing to CT logs.

The KrakenKey CLI generates the private key on the gateway. Only the certificate signing request leaves the host.

### Reconsidering wildcards

Per-host certificates are often preferred because a compromised proxy then exposes only the names it serves. That argument assumes the proxy can't obtain other certificates. A proxy with DNS write access can obtain a certificate for any name. Once the DNS credentials are gone, a wildcard certificate is a smaller exposure than per-host certificates issued with them.

The credential that remains is the KrakenKey API key, and it got the same scrutiny. Until this migration, a user API key carried the same permissions as a dashboard session, including creating more keys. A leaked key could therefore create a replacement and survive its own revocation. We closed that gap before publishing: API keys can no longer manage keys, the account, organizations or billing, and revoking a key in the dashboard ends its access.

A key still covers every domain on its account. We contained that by giving the gateway a dedicated account that holds only its domain. Keys restricted to specific domains, certificates or source addresses are in development.

## Rollout

The rule for the cutover was to have the new certificate on the host and verified before anything served it.

1. **Prerequisites.**
   - The challenge CNAME, created next to the existing ownership TXT record.
   - The domain verified in KrakenKey.
   - An API key in a root-only file on the gateway.
   - A check that the gateway can reach the API.
2. **Issue alongside the existing setup.** We added a renewal script and a daily systemd timer, delivered through the gateway's existing configuration sync. A read-only mount gave the Caddy container the certificate directory. Caddy's configuration was unchanged at this stage. The first certificate was installed about two minutes after the timer fired and four minutes after the change merged, with no manual steps on the host. We then checked it in place: issuer, both names, and the chain with `openssl verify`.
3. **Switch every site in one change.** Caddy can't move a single site to a wildcard (see below), so the check on the host in step 2 served as the canary.
   - **Rollback:** Caddy keeps the previous Let's Encrypt certificates in its storage, so reverting one commit undoes the switch.
   - **Verification:** after the switch, we ran `openssl s_client -verify_return_error` from a client on the network against all 13 hostnames. Every one returned the new certificate with a trusted chain.

## Caddy behaviors to plan for

- **A reload doesn't pick up replaced certificate files.** If the configuration is unchanged, `caddy reload` does nothing and the old certificate stays in memory. `caddy reload --force` loads the new files without a restart. A renewal script that runs a plain reload installs every renewal and serves none of them.
- **A loaded certificate applies to every name it covers.** Once a manually loaded certificate matches a hostname, Caddy stops managing that hostname itself and serves the loaded certificate, whichever site block references it. A wildcard can't be rolled out one site at a time.
- **Certificate files must exist before the configuration references them.** `caddy validate` loads them, so issue first and change the configuration second.
- **Bind-mount the directory, not the files.** Renewal replaces files with an atomic rename. A single-file bind mount keeps pointing at the old file, so the container never sees the new certificate.

## Changes to KrakenKey

Running the integration the way a customer would surfaced several gaps.

Shipped:

- **API key privileges.** Keys can no longer create or delete keys, change the account, or make organization or billing changes.
- **DNS setup feedback.** `krakenkey domain add` now prints the challenge CNAME alongside the TXT record. `krakenkey domain check` (CLI v0.5.0) confirms both records before you request a certificate.

In progress, with the current workaround for each:

- **Scoped API keys.** Restriction to specific domains, certificates and source addresses. Until then, use a dedicated account for each environment.
- **Renewal that is safe to schedule.** `cert renew` always issues a new certificate. A renewal window check in the API will make a daily schedule safe on its own. Until then, let the client decide when to renew. The guide's script renews with a third of the lifetime remaining, which keeps it well within Let's Encrypt's limit of five duplicate certificates per week.
- **Downloading a renewed certificate.** `cert renew --wait` waits for the new certificate but doesn't download it, and the certificate can't be downloaded while a renewal is in progress. Keep the last good copy and download once the renewal completes, as the guide's script does.
- **Full chain output.** `cert issue --wait` can skip writing the full chain without an error if fetching it fails. Running `cert download --format fullchain` afterwards avoids this.
- **GitHub Action SAN input.** The `san` input is documented as comma-separated but is passed to the CLI as a single name. Until it's fixed, call the CLI directly and repeat `--san` for each name.

## Results

| | Before | After |
| --- | --- | --- |
| Certificates | One per hostname (13) | One, covering the apex and wildcard |
| DNS credentials on the gateway | Zone-edit API token | None in use |
| Local DNS during issuance | Required, and broken by resolver policy | Not involved |
| New hostnames in CT logs | One per new service | None |
| Merged change to installed certificate | n/a | About 4 minutes |

## Applying this to your environment

- **Delegate the challenge if your proxy holds a DNS API token only for ACME.** A delegated `_acme-challenge` CNAME takes DNS write access off the proxy entirely.
- **Delegate if your network restricts outbound DNS.** Delegated validation avoids propagation checks, so there's nothing to work around.
- **Weigh a wildcard when the hostnames themselves are sensitive.** Pair it with a dedicated account and key, so the credential on the proxy covers only that domain.
- **Stage the change.** Issue and verify on the host before switching any configuration, and keep the previous certificates available for rollback.
- **Monitor what is actually served.** The failure mode to watch for is a renewal that never reaches the live service. Our next step is a [connected probe](/blog/endpoint-monitoring/) inside the network that checks the certificate served on each hostname.

The [Caddy integration guide](/docs/integrations/caddy/) has the Caddyfile snippet, the renewal script and the systemd units used here.
