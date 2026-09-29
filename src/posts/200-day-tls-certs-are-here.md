---
title: "The 200-Day TLS Era Is Here, and Shorter Lifetimes Are Coming"
description: "CA/B Forum SC-081 is now in effect. TLS certificate lifetimes have dropped to 200 days, then drop to 100 and 47. What changed, where certbot stops, and what KrakenKey adds on top of ACME."
pubDate: 2026-03-27
author: "KrakenKey Team"
tags: ["certificate-lifetimes", "product", "lets-encrypt"]
draft: false
---

For the last decade, TLS certificates lasted up to 398 days. You'd issue a cert, set a reminder, maybe set up a cron job, and move on. Most years, that worked.

CA/B Forum Ballot SC-081 took effect on March 15, 2026. Any TLS certificate issued since that date has a maximum lifetime of 200 days, roughly 6.5 months. What took one renewal per year now requires two, and two more reductions are already scheduled.

| Date | Max Lifetime | Renewals/Year |
|------|-------------|---------------|
| Until March 15 | 398 days | ~1 |
| **March 15, 2026** | **200 days** | **~2** |
| March 15, 2027 | 100 days | ~4 |
| March 15, 2029 | **47 days** | **~8** |

By 2029, certificates expire roughly every six weeks. Domain Control Validation can only be reused for 10 days, so CAs will need to re-validate your domain almost continuously. At that frequency, manual certificate management stops being workable.

SC-081 passed the CA/Browser Forum in April 2025. The 47-day deadline is adopted policy, three years out.

---

## ACME Automation Solved Issuance

Let's Encrypt and the ACME protocol changed how certificates get issued. Certbot, acme.sh, and cert-manager made it possible for any developer to get a free TLS certificate without touching a CA's web portal. HTTPS went from 40% of web traffic in 2015 to over 95% today, largely because of ACME.

ACME automation covers issuance. As certificate lifetimes shrink and renewal frequency goes up, a different set of questions comes up:

- Which certificates expire in the next 30 days, across every server, domain and service?
- Did last night's renewal succeed, or did it fail silently?
- How does a team issue certs without giving every developer SSH access to the cert server?
- The cert for `api.mycompany.com` expired this morning. Why was there no email?
- Who requested which certificate, and when?

Certbot is a mature Let's Encrypt client, and if you have one server and one domain, it's the right tool. But Certbot runs on a single machine. It has no dashboard, no team access model, no API, no alerting beyond a local log. When you're managing certs across multiple services, and those certs renew every few months, you need a management layer on top of ACME automation. KrakenKey is that layer.

---

## What We Built

KrakenKey is certificate lifecycle management for developers and teams. Get started on the free tier, with paid plans for teams that need more.

### Issue certificates without server access

Submit a CSR via the web dashboard or REST API. KrakenKey handles the ACME DNS-01 challenge automatically. Your certificate is ready in about 4 minutes, with no SSH access, cron job or server-side tooling required.

The in-browser CSR generator uses the WebCrypto API to generate your key pair locally. Your private key never leaves your device and is never transmitted to KrakenKey's servers.

### Automatic renewal

Renewal doesn't depend on a cron job that can time out or a renewal script that can lose file permissions after a system update. KrakenKey monitors every certificate you manage and renews them on schedule. Paid tiers get a 30-day renewal window, which leaves a month for a transient failure to clear before expiry. Free tier renews at 5 days before expiry. Either way, you get email notifications when a cert is issued, when a renewal triggers, and when anything goes wrong.

### One dashboard, every certificate

The dashboard lists every cert, domain and pending request, with status: healthy, approaching expiry, or renewal in flight. Filter by domain, search by common name, and download in PEM or PKCS#12, instead of grepping logs on five different servers.

### REST API + API keys

Every operation is available via REST API, so you can issue certs from deployment scripts and check cert status in CI. API keys are scoped per application and can be revoked without touching your cert infrastructure. Full API reference at [krakenkey.io/docs/api](https://krakenkey.io/docs/api).

---

## The Free Tier

The free tier needs no credit card and has no trial expiry:

| What | Limit |
|------|-------|
| Verified domains | 3 |
| Total active certificates | 10 |
| Certificates + renewals per month | 5 |
| API keys | 2 |
| Auto-renewal | ✓ (5-day window) |
| Email notifications | ✓ |
| In-browser CSR generator | ✓ |

That covers most personal projects, homelabs and small open-source services.

---

## Paid Plans

Paid tiers lift the limits and add team features:

| | Starter | Team | Business |
|-|---------|------|----------|
| **Price** | $29/mo | $79/mo | $199/mo |
| Domains | 10 | 25 | 75 |
| Active certs | 75 | 375 | 1,500 |
| Certs+renewals/mo | 50 | 250 | 1,000 |
| Auto-renewal window | 30 days | 30 days | 30 days |
| RBAC (team access) | No | ✓ | ✓ |
| Audit logs | No | No | ✓ |
| Priority ACME queue | ✓ | ✓ | ✓ |

---

## Why Now

Enterprise CLM platforms exist and work well. Keyfactor Command and CyberArk's certificate management (which absorbed Venafi in 2024) are sold on quote-based annual contracts built for organizations managing tens of thousands of certificates. That kind of contract is hard to justify for a 10-person engineering team.

At the other end, Certbot and cert-manager are free and work well, but they are issuance clients without a management layer. Little exists between the two, and that gap matters more with each lifetime reduction. The 200-day deadline that took effect March 15 doubles renewal frequency. The 100-day deadline in 2027 doubles it again. By the time certs are 47 days in 2029, organizations that haven't automated their certificate lifecycle will be firefighting renewals full-time. Putting automation in place before the 100-day step in March 2027 is the easier path.

---

[**Sign up free at app.krakenkey.io →**](https://app.krakenkey.io)

*Get started on the free tier. No credit card required.*

---

*Stack: NestJS · React · PostgreSQL · BullMQ · Let's Encrypt ACME · Cloudflare DNS · Terraform. [View on GitHub](https://github.com/krakenkey/krakenkey)*

*Last updated: March 27, 2026*
