---
title: "Mozilla Root Store Policy v3.1: Mass Revocation Planning Becomes a Trust Requirement"
description: "CA/Browser Forum Ballot SC-089 required CAs to build and test a Mass Revocation Plan starting December 2025. Mozilla's Root Store Policy v3.1, effective July 1, folds that requirement into Firefox's trust criteria. Here's what changed and how to check whether your own certificates are revoked before your monitoring notices."
pubDate: 2026-07-08
author: "KrakenKey Team"
tags: ["pki", "mozilla", "root-store", "cabforum", "revocation", "compliance"]
draft: false
---

Mozilla published [Root Store Policy v3.1](https://blog.mozilla.org/security/2026/06/29/improving-transparency-and-assurance-in-the-web-pki-mozilla-root-store-policy-v3-1/) on June 29, 2026, effective July 1. The most operationally relevant change folds an existing CA/Browser Forum requirement, mass revocation planning, into Mozilla's own trust criteria for Firefox's root program. A CA that can't demonstrate a tested mass revocation capability is no longer just out of compliance with the Baseline Requirements; it risks losing root inclusion.

## What changed

[CA/Browser Forum Ballot SC-089](https://cabforum.org/2025/07/22/ballot-sc-089-mass-revocation-planning/) passed on July 22, 2025, adding Section 5.7.1.2 to the TLS Baseline Requirements. It requires every CA to develop, maintain, and annually test a Mass Revocation Plan covering activation criteria, roles and responsibilities, subscriber communication, and documented processes. CAs were required to assert in their CPS that such a plan existed starting December 1, 2025.

Mozilla's Root Store Policy v3.1 closes the gap between that BR requirement and Mozilla's own policy text, stating it "aligns Mozilla's mass revocation planning requirements with the corresponding CA/Browser Forum Baseline Requirements." Three other changes ship in the same version: Section 3.3 now requires CP/CPS documentation to be "explicit, bounded, auditable, and sufficiently detailed" with version control and ongoing maintenance obligations; Detailed Controls Reports become mandatory for TLS-enabled root operators for audit periods starting July 1, 2027; and root CA key pairs submitted for inclusion must have been generated within the previous five years.

## Why it matters operationally

Certificate lifecycle automation is built around a renewal clock: reissue somewhere around 50-66% of validity, alert if that window is missed. Mass revocation planning exists because that model breaks down when the trigger isn't expiry but a CA-side event: a validation bug, a compromised intermediate, a key compromise, a misissuance discovered days or weeks after the fact. Section 4.9.1.1 of the [Baseline Requirements](https://cabforum.org/working-groups/server/baseline-requirements/requirements/) gives CAs 24 hours to revoke for the most severe reasons (key compromise, CA compromise) and 5 days for a longer list including misissuance and inaccurate certificate data. When one of those reasons applies to a batch of certificates instead of one, every affected subscriber hits that clock at the same time, not on their own renewal schedule.

This isn't hypothetical. DigiCert's April 2026 incident, tracked in [Bugzilla 2033170](https://bugzilla.mozilla.org/show_bug.cgi?id=2033170), is the reference case: a compromised support analyst endpoint gave attackers access to certificate initialization codes through DigiCert's support portal, and 60 code-signing certificates ended up revoked, 27 tied directly to malware-signing activity and 33 more as a precaution. That was code signing, not TLS server auth, but the mechanics of a fleet-wide, unscheduled revocation are identical, and it's exactly the scenario Section 5.7.1.2 and MRSP v3.1 are written for.

If you operate certificates from a public CA at any real scale, the question this policy is implicitly asking your CA, and by extension you, is how fast every certificate from a given issuer could be replaced on demand, outside the normal renewal schedule. ACME rate limits during a burst of forced reissuance, ordering across hosts when you can't cut over everything simultaneously, and detecting revocation before it shows up as a broken handshake in production are the actual operational surfaces here, not paperwork.

## Checking for revocation directly

Most renewal automation only checks certificate expiry. It's worth checking revocation status independently too, since a revoked-but-not-yet-expired certificate is the failure mode a mass revocation event actually produces. If the server staples OCSP:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -status 2>/dev/null \
  | grep -E "OCSP Response Status|Cert Status"
```

If it doesn't staple, query the responder directly using the certificate's Authority Information Access extension:

```bash
openssl x509 -in leaf.pem -noout -ocsp_uri
# https://ocsp.example-ca.com

openssl ocsp -issuer intermediate.pem -cert leaf.pem \
  -url "$(openssl x509 -in leaf.pem -noout -ocsp_uri)" -no_nonce -text
```

A `Cert Status: revoked` result on a certificate your monitoring still considers valid, because it hasn't crossed its expiry threshold, is the exact gap a scheduled-renewal-only setup has.

## KrakenKey

This is a CA-side and root-program-side change; it doesn't add anything to KrakenKey's ACME issuance flow, which already reissues per certificate rather than on a fixed batch schedule. But it's worth using as a prompt regardless of what you run: whether you can say, right now, how long it would take to replace every certificate you have from a single CA if that CA had to revoke all of them today. If the honest answer is "however long it takes the renewal cron to notice," the mass revocation readiness Mozilla is now requiring CAs to test annually is a gap on the subscriber side too.
