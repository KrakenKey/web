---
title: "Let's Encrypt's Generation Y Intermediates Go Live Today"
description: "On May 8, Let's Encrypt stopped issuing certificates for 2.5 hours due to a cross-signing problem with the new Generation Y root. Today the planned transition completes — here's what changes in your cert chain and what to check."
pubDate: 2026-05-13
author: "KrakenKey Team"
tags: ["lets-encrypt", "pki", "acme", "certificates", "incident", "generation-y"]
draft: false
---

On May 8, 2026, Let's Encrypt halted all certificate issuance at 18:37 UTC after a problem surfaced with the cross-signed certificate linking their Generation X root to the new Generation Y root. Issuance resumed at 21:03 UTC via a fallback to Generation X while the cross-signing issue was investigated. Today, May 13, the originally planned transitions go ahead: the `classic` ACME profile switches to Generation Y intermediates, and the opt-in `tlsserver` profile starts issuing 45-day certificates.

## The Generation Y hierarchy

The [new hierarchy](https://letsencrypt.org/2025/11/24/gen-y-hierarchy), generated in September 2025, adds two root CAs and six intermediates:

- **ISRG Root YR** — RSA 4096-bit, 20-year validity (counterpart to ISRG Root X1)
- **ISRG Root YE** — ECDSA P-384 (counterpart to ISRG Root X2)
- **Intermediates** — YE1, YE2, YE3 under Root YE; YR1, YR2, YR3 under Root YR

Both roots are cross-signed from X1 and X2, so the trust anchor doesn't shift for clients that haven't yet added the new roots. One structural change that matters: the Gen Y intermediates drop the `TLS Web Client Authentication` EKU. Root programs have been pushing CAs to stop issuing server-auth and client-auth certificates from the same intermediate; Gen Y enforces that split.

[Three changes take effect today](https://community.letsencrypt.org/t/upcoming-let-s-encrypt-profile-changes-on-may-13/247049):

1. **`classic` profile** (default): chains switch from E5/E6/R10/R11 to YE1–YE3 and YR1–YR3
2. **`tlsserver` profile**: validity drops from 90 days to 45 days
3. **`tlsclient` profile**: restricted to accounts that have previously used it; deprecated July 8, 2026

## What breaks

The most common failure point is anything that pins or inspects intermediates. HPKP is long dead, but the same pattern shows up in service mesh mTLS configs that pin issuer CNs, monitoring tools that check chain fingerprints, and custom TLS verification code — Go's `VerifyPeerCertificate`, Python's `ssl` module with manual chain inspection. After the first renewal after today, checks against E5, E6, R10, or R11 will fail.

Chain depth is a related edge case. The Gen Y intermediates are cross-signed, so the number of certificates in a full handshake can differ depending on which intermediate LE selects and whether your ACME client requests the short or full chain. Fixed chain depth assertions break here.

The May 8 outage is worth treating as a separate problem. Any renewal that ran against `tlsserver` or `shortlived` during the 18:37–21:03 UTC window got an ACME error. `classic` was also down. Clients with short retry budgets, or that mark a failed renewal terminal rather than retrying on the next scheduled run, may have failed silently. A 2.5-hour window is small, but if your renewal alerting only fires on expiry proximity rather than on renewal failure, you won't see it until the cert is close to expiring.

For anyone on `tlsserver` today: at the standard ~50% validity renewal threshold, 45-day certs mean renewing roughly every 22 days instead of every 45.

## Verifying the switch

After your next renewal, the issuer CN will change. Confirm it:

```bash
openssl s_client -connect yourdomain.com:443 </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer
# Before: issuer=C=US, O=Let's Encrypt, CN=R11
# After:  issuer=C=US, O=Let's Encrypt, CN=YR1
```

To verify the cross-signed chain is intact — that the Gen Y intermediate still chains back to X1 or X2:

```bash
openssl s_client -connect yourdomain.com:443 -showcerts </dev/null 2>/dev/null \
  | grep -E "^( s| i):"
```

If the cross-signed certificate is missing and your trust store doesn't carry ISRG Root YR or YE yet, handshakes will fail for clients that can't reach X1 or X2 independently. That's an unlikely scenario for most environments — X1 has been in trust stores since 2016 — but worth checking on any restricted or embedded client.

Profile selection is relevant if you want to explicitly stay on `classic` or opt into `tlsserver`. Most ACME clients don't expose this yet. Certbot has no stable `--profile` flag as of this writing; selecting a profile requires direct ACME API interaction per the [ACME Profiles Internet-Draft](https://www.ietf.org/archive/id/draft-aaron-acme-profiles-00.html). You can inspect available profiles from the LE directory:

```bash
curl -s https://acme-v02.api.letsencrypt.org/directory | jq '.meta.profiles'
```

## KrakenKey

KrakenKey issues through Let's Encrypt, so `classic` profile renewals will automatically start producing Gen Y intermediate chains — nothing to configure. The `tlsserver` validity reduction doesn't affect renewal scheduling since that's handled automatically regardless of cert lifetime. The May 8 incident is worth flagging directly: KrakenKey retries renewals with backoff, but a 2.5-hour ACME outage exceeds standard retry windows. For operators who need multi-CA fallback for renewal SLA guarantees, that's the exposure the incident made concrete — and it's worth modeling regardless of which tooling you use.
