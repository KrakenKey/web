---
title: "Let's Encrypt's Generation Y Intermediates Go Live Today — After a 2.5-Hour Issuance Halt Last Week"
description: "On May 8, Let's Encrypt stopped issuing certificates for 2.5 hours due to a cross-signing problem with the new Generation Y root. Today the planned transition completes. Here's what changes in your cert chain, what broke during the incident, and what to check."
pubDate: 2026-05-13
author: "KrakenKey Team"
tags: ["lets-encrypt", "pki", "acme", "certificates", "incident", "generation-y"]
draft: true
---

On May 8, 2026, Let's Encrypt halted all certificate issuance at 18:37 UTC after engineers identified a problem with the cross-signed certificate linking their Generation X root to the new Generation Y root. Issuance resumed at 21:03 UTC — roughly 2.5 hours later — via a fallback to the Generation X hierarchy while the cross-signing issue was investigated. Today, May 13, the originally planned transitions complete: the `classic` ACME profile (the default for the vast majority of ACME clients) switches to Generation Y intermediates, and the opt-in `tlsserver` profile begins issuing 45-day certificates.

## What Changed

The Generation Y hierarchy was [announced in November 2025](https://letsencrypt.org/2025/11/24/gen-y-hierarchy) and introduces two new root CAs and six new intermediates:

- **ISRG Root YR** — RSA 4096-bit, 20-year validity; counterpart to ISRG Root X1
- **ISRG Root YE** — ECDSA P-384; counterpart to ISRG Root X2
- **Intermediates** — YE1, YE2, YE3 (signed by Root YE) and YR1, YR2, YR3 (signed by Root YR)

The new intermediates are cross-signed from the Generation X roots (X1 and X2), so the trust anchor does not change for clients that don't yet carry the new roots in their trust stores. The critical structural difference: **Generation Y intermediates do not carry the `TLS Web Client Authentication` Extended Key Usage.** Root programs are phasing out intermediates that can issue both server-auth and client-auth certificates; the Gen Y hierarchy enforces this separation at the intermediate level.

The [three changes effective today](https://community.letsencrypt.org/t/upcoming-let-s-encrypt-profile-changes-on-may-13/247049):

1. **`classic` profile** (default): certificate chains switch from Gen X intermediates (E5, E6, R10, R11) to Gen Y intermediates (YE1–YE3, YR1–YR3)
2. **`tlsserver` profile**: certificate validity drops from 90 days to 45 days
3. **`tlsclient` profile**: restricted to ACME accounts that have previously used it; full deprecation July 8, 2026

## Why It Matters Operationally

**Pinned intermediates are the primary failure mode.** HPKP is gone, but equivalent logic persists in several places: service mesh mTLS configurations that pin issuer CNs, monitoring tools that assert specific chain fingerprints, and custom TLS verification code in languages like Go (`tls.Config` with custom `VerifyPeerCertificate`) or Python (`ssl` module with manual chain inspection). After the first renewal post-May 13, any of these checks against E5, E6, R10, or R11 will fail.

**Chain depth and cross-signing.** The Gen Y intermediates are cross-signed, meaning the full TLS handshake may present a different number of certificates depending on which intermediate LE selects and whether your ACME client requests the short or full chain. Code or tooling that asserts a fixed chain depth will break.

**The May 8 outage exposed renewal timing risk.** Any automated renewal that targeted the `tlsserver` or `shortlived` profiles during the 18:37–21:03 UTC window received an ACME error. The `classic` profile was also unavailable during this window. ACME clients with short retry budgets or that treat a failed renewal as terminal (rather than retrying on the next run) may have silently failed. If you don't have alerting on renewal failures independent of expiry monitoring, a 2.5-hour outage window is enough to miss a renewal without any immediate visible symptom — especially for certificates with weeks of remaining validity.

For `tlsserver` adopters: 45-day validity starts today. At the recommended renewal threshold of roughly 50% remaining validity, that's a renewal cycle of approximately 22 days — versus 45 days for a 90-day certificate.

## Verifying the Chain Switch

After your first renewal post-May 13, confirm the issuer has changed:

```bash
# Check current issuer (should show Gen X intermediate before renewal)
openssl s_client -connect yourdomain.com:443 </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer
# Before: issuer=C=US, O=Let's Encrypt, CN=R11
# After:  issuer=C=US, O=Let's Encrypt, CN=YR1

# Verify the cross-signed chain is intact (Gen Y intermediate still chains to X1/X2)
openssl s_client -connect yourdomain.com:443 -showcerts </dev/null 2>/dev/null \
  | grep -E "^( s| i):"
```

If the cross-signed certificate is absent from the chain and your client trust store doesn't yet carry ISRG Root YR or ISRG Root YE, TLS handshakes will fail for any client that doesn't trust X1 or X2 independently. In practice this is unlikely — X1 has been in trust stores for years — but worth verifying on any restricted or embedded client environment.

To check whether a specific ACME client supports profile selection (required to explicitly request the `tlsserver` or `shortlived` profile rather than `classic`):

```bash
# Inspect the LE directory for available profiles
curl -s https://acme-v02.api.letsencrypt.org/directory | jq '.meta.profiles'
```

Most current ACME clients default to `classic` and do not expose profile selection in their configuration surface. Certbot as of this writing does not have a stable `--profile` flag; profile selection requires direct ACME API interaction following the [ACME Profiles Internet-Draft](https://www.ietf.org/archive/id/draft-aaron-acme-profiles-00.html).

## How KrakenKey's Approach Relates

KrakenKey issues certificates through Let's Encrypt, so `classic` profile renewals will automatically begin producing certificates from Generation Y intermediates — no configuration change needed. The `tlsserver` 45-day reduction doesn't change anything in KrakenKey's renewal flow, since the platform handles scheduling regardless of validity period. What the May 8 incident does highlight: during the outage window, KrakenKey's renewal pipeline retried with exponential backoff, but a 2.5-hour gap exceeds standard retry windows. For operators with strict renewal SLAs who want multi-CA fallback, single-CA dependency is the exposure that incident made concrete — and it's an architectural gap worth modeling, independent of which certificate management platform you use.
