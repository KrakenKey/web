---
title: "The 200-Day TLS Era Is Here — And It's Just the Beginning"
description: "CA/B Forum SC-081 is now in effect. TLS certificate lifetimes have dropped to 200 days, then 100, then 47. Here's what changed, why certbot isn't enough, and how KrakenKey keeps you ahead of it."
pubDate: 2026-03-27
author: "KrakenKey Team"
tags: ["certificates", "compliance", "automation", "SC-081v3", "lets-encrypt"]
draft: false
---

For the last decade, TLS certificates lasted up to 398 days. You'd issue a cert, set a reminder, maybe set up a cron job, and move on. Most years, that worked.

That era is over.

CA/B Forum Ballot SC-081 took effect on March 15, 2026. Any TLS certificate issued since that date has a maximum lifetime of **200 days** — roughly 6.5 months. What took one renewal per year now requires two. And this is not the last change.

| Date | Max Lifetime | Renewals/Year |
|------|-------------|---------------|
| Until March 15 | 398 days | ~1 |
| **March 15, 2026** | **200 days** | **~2** |
| March 15, 2027 | 100 days | ~4 |
| March 15, 2029 | **47 days** | **~8** |

By 2029, certificates expire roughly every six weeks. Domain Control Validation can only be reused for 10 days — CAs will need to re-validate your domain almost continuously. At that frequency, manual certificate management doesn't just become inconvenient. It becomes impossible.

This is not speculative. SC-081 passed the CA/Browser Forum in April 2025. The 47-day deadline is confirmed policy, already on the books, three years out.

---

## ACME Automation Solved Issuance. That's Only Half the Problem.

Let's Encrypt and the ACME protocol were a genuine revolution. Certbot, acme.sh, and cert-manager made it possible for any developer to get a free TLS certificate without touching a CA's web portal. HTTPS went from 40% of web traffic in 2015 to over 95% today. That happened because of ACME.

But ACME automation answers one question: *how do I issue a certificate?*

As certificate lifetimes shrink and renewal frequency compounds, you start running into a different set of questions:

- **Which of my certificates expire in the next 30 days?** Across all my servers, all my domains, all my services?
- **Did that renewal actually succeed?** Or did it silently fail while I was offline?
- **I manage certificates across a team. How do I issue certs without giving every developer SSH access to the cert server?**
- **The cert for `api.mycompany.com` expired this morning. Why didn't I get an email?**
- **I need to audit who requested which certificate and when.**

Certbot is excellent at what it does. It's a battle-tested Let's Encrypt client, and if you have one server and one domain, it's the right tool. But Certbot runs on a single machine. It has no dashboard, no team access model, no API, no alerting beyond a local log. When you're managing certs across multiple services — and those certs are renewing every two months — you need a management layer on top of ACME automation.

That's the gap KrakenKey fills.

---

## What We Built

KrakenKey is certificate lifecycle management for developers and teams. Free for individuals and open-source projects. Paid plans for teams that need more.

### Issue certificates without server access

Submit a CSR via the web dashboard or REST API. KrakenKey handles the ACME DNS-01 challenge automatically. Your certificate is ready in about 4 minutes. No SSH. No cron job. No server-side tooling to install.

The in-browser CSR generator uses the WebCrypto API to generate your key pair locally. Your private key never leaves your device — it's never transmitted to KrakenKey's servers.

### Automatic renewal — actually automatic

Not "automatic unless the cron job timed out" or "automatic unless the renewal script lost file permissions after a system update." KrakenKey monitors every certificate you manage and renews them on schedule. Paid tiers get a 30-day renewal window — a full month of buffer before expiry, so a transient failure has time to self-correct before it matters. Free tier renews at 5 days before expiry. Either way, you get email notifications when a cert is issued, when a renewal triggers, and when anything goes wrong.

### One dashboard, every certificate

See every cert, every domain, every pending request in one place. Know which certs are healthy, which are approaching expiry, which renewals are in flight. Filter by domain, search by common name, download in PEM or PKCS#12. No grepping through logs on five different servers.

### REST API + API keys

Every operation is available via REST API. Issue certs from your deployment scripts. Check cert status in CI. Scope API keys per application and revoke them without touching your cert infrastructure. Full API reference at [krakenkey.io/docs/api](https://krakenkey.io/docs/api).

---

## The Free Tier

Free is genuinely free — no credit card, no expiring trial:

| What | Limit |
|------|-------|
| Verified domains | 3 |
| Total active certificates | 10 |
| Certificates + renewals per month | 5 |
| API keys | 2 |
| Auto-renewal | ✓ (5-day window) |
| Email notifications | ✓ |
| In-browser CSR generator | ✓ |

If you're running a personal project, a homelab, or an open-source service, the free tier covers you.

---

## Paid Plans (Live This Month)

Stripe billing launches this month. Paid tiers lift the limits and add team features:

| | Starter | Team | Business |
|-|---------|------|----------|
| **Price** | $29/mo | $79/mo | $199/mo |
| Domains | 10 | 25 | 75 |
| Active certs | 75 | 375 | 1,500 |
| Certs+renewals/mo | 50 | 250 | 1,000 |
| Auto-renewal window | 30 days | 30 days | 30 days |
| RBAC (team access) | — | ✓ | ✓ |
| Audit logs | — | — | ✓ |
| Priority ACME queue | ✓ | ✓ | ✓ |

---

## Why Now

Enterprise CLM platforms exist and work well. Keyfactor Command starts at $25K/year for SaaS, scaling to $50K–100K+ for on-premise deployments. Venafi/CyberArk starts at $50K/year and can exceed $500K for large estates. These price points make sense for organizations managing tens of thousands of certificates. They make no sense for a 10-person engineering team.

On the other end, Certbot and cert-manager are free and excellent — but they're issuance clients, not management platforms.

There's nothing in between.

That gap matters more every year. The 200-day deadline that took effect March 15 doubles renewal frequency. The 100-day deadline in 2027 doubles it again. By the time certs are 47 days in 2029, organizations that haven't automated their certificate lifecycle will be firefighting renewals full-time.

The right time to get certificate automation in place is now — before the next deadline hits.

---

[**Sign up free at app.krakenkey.io →**](https://app.krakenkey.io)

*KrakenKey is free for individuals and open-source projects. No credit card required.*

---

*Stack: NestJS · React · PostgreSQL · BullMQ · Let's Encrypt ACME · Cloudflare DNS · Terraform — [View on GitHub](https://github.com/krakenkey/krakenkey)*

*Last updated: March 27, 2026*
