---
title: "Two Mass Revocations in Ten Days: HARICA's CP/CPS Drift Problem"
description: "HARICA revoked 66,105 certificates for a stale clientAuth EKU on July 20, then forced replacement of every cert issued since March for a missing OCSP AIA pointer on July 25. Both incidents trace to the same root cause: policy documents and issuance systems that stopped agreeing with each other."
pubDate: 2026-07-29
author: "KrakenKey Team"
tags: ["pki", "tls", "incident", "harica", "acme", "ari", "ocsp", "cabforum"]
draft: false
---

HARICA ran two mass-revocation events ten days apart in July 2026. On July 20 it revoked 66,105 server certificates that carried the `id-kp-clientAuth` EKU past its own compliance deadline. On July 25 it forced replacement of every certificate issued since late March for missing an OCSP AIA pointer its CP/CPS required. Neither was a compromise. Both were the same failure mode: the CA's policy document and its issuance pipeline stopped agreeing with each other, and nobody had automation watching for the gap.

## What changed

The first incident is documented in [Mozilla Bugzilla bug 2055551](https://bugzilla.mozilla.org/show_bug.cgi?id=2055551). Chrome Root Store Policy v1.6 (February 2025) required CAs to stop issuing TLS certificates with the client authentication EKU by June 15, 2026. HARICA updated its CP/CPS to match. In February 2026, Chrome Root Store Policy v1.8 pushed that deadline out to March 15, 2027, and HARICA's compliance team was notified of the extension on February 6. The CP/CPS was never updated. Issuance systems kept following the old June 15 cutoff internally in one direction while the CP/CPS said something else, and the net effect was that certificates issued between June 15 and July 15, 2026 continued carrying the prohibited EKU, in violation of HARICA's own governing document. A third party flagged the inconsistency on July 15 at 15:07 UTC; profiles were corrected two hours later; revocation of the 66,105 affected certificates began July 20.

The second incident, [bug 2056668](https://bugzilla.mozilla.org/show_bug.cgi?id=2056668), runs the drift in the opposite direction. HARICA stopped including the AIA OCSP URI access method in issued certificates around March 27, 2026, but its CP/CPS still committed to including it. Every server certificate issued from March 27 through July 20, 2026 without that pointer was non-compliant. Per the [GWDG status advisory](https://status.gwdg.de/incidents/243235?lang=en), HARICA gave affected subscribers until July 25 at 10:00 UTC to replace, after which remaining non-compliant certificates were revoked automatically per the Baseline Requirements.

## Why it matters operationally

If you have any certificate from HARICA issued in either window, check it now, don't wait for a renewal reminder. The two incidents affect different fields and different symptom sets:

- **clientAuth EKU (June 15 to July 15 issuance window):** only matters if you were relying on a server cert's client-auth EKU for mTLS, which is unusual but not rare in service-mesh and internal API setups that predate dedicated client certs.
- **Missing OCSP AIA (March 27 to July 20 issuance window):** matters far more broadly. Any load balancer or terminator doing OCSP stapling (nginx, HAProxy, Envoy) against an affected cert has been stapling nothing, silently, for months. If you also run OCSP-must-staple or strict revocation checking anywhere in that chain, clients started hard-failing the moment HARICA's July 25 revocation cutoff passed for any cert that wasn't replaced in time.

## Check your own inventory

Don't trust the incident writeups to tell you whether your certs were caught. Check directly:

```bash
# EKU check: flag anything with clientAuth alongside serverAuth
openssl x509 -in cert.pem -noout -ext extendedKeyUsage

# AIA check: flag anything missing an OCSP URI
openssl x509 -in cert.pem -noout -ext authorityInfoAccess
```

A clean cert's AIA extension looks like this:

```
Authority Information Access:
    OCSP - URI:http://ocsp.harica.gr
    CA Issuers - URI:http://repo.harica.gr/certs/HARICA-issuing.crt
```

An affected cert from the March 27 to July 20 window is missing the `OCSP -` line entirely, CA Issuers only. If you're scripting this across a fleet, `grep -L 'OCSP -'` over a batch of `openssl x509 -noout -ext authorityInfoAccess` outputs gets you a fast list of exposure.

If your ACME client supports RFC 9773 (ARI), you also had a second, earlier signal available: HARICA could have used ARI's `suggestedWindow` to push affected certs into an accelerated renewal window ahead of the hard revocation deadline, the exact scenario ARI was designed for. GWDG's advisory specifically calls out acme.sh 3.1.4+, Certbot 4.1.0+, and Caddy 2.8.0+ as clients that absorbed the July 25 cutoff automatically via renewal info polling. Clients on static 30-day renewal thresholds with no ARI support had no such signal and depended entirely on someone reading the incident bug in time.

## Where KrakenKey fits

This doesn't change anything in KrakenKey's flow, we issue through Let's Encrypt, which isn't implicated in either incident. But if you're running your own ACME client against HARICA or any other CA, this is a good week to check that client's ARI support specifically, not just whether it renews before expiry, but whether it reacts to a CA-initiated forced renewal signal without a human reading a Bugzilla bug first. The `authorityInfoAccess` and `extendedKeyUsage` checks above are also exactly the class of chain anomaly our endpoint monitoring flags on a schedule, so if you're already scanning your fleet with KrakenKey, this incident wouldn't have needed a manual audit to surface.
