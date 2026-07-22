---
title: "HARICA's clientAuth Incident Shows What Chrome Actually Wants From CP/CPS Compliance"
description: "HARICA kept issuing TLS certificates with the clientAuth EKU for a month past its own CP/CPS cutoff. Chrome's response in the incident bug rejects training and manual review outright. Here's what that means for anyone relying on a CA's published compliance posture."
pubDate: 2026-07-22
author: "KrakenKey Team"
tags: ["pki", "cabforum", "harica", "eku", "chrome", "incident", "compliance"]
draft: false
---

HARICA, a CA in Chrome's and Mozilla's root programs, issued TLS certificates carrying the `id-kp-clientAuth` EKU for roughly a month after its own CP/CPS said it would stop. The certificates were reported around July 17, HARICA began revoking them July 20, and Chrome's reply in the incident bug is unusually direct about what it will and won't accept as a fix.

## What changed

The incident is tracked in [Mozilla Bugzilla bug 2055551](https://bugzilla.mozilla.org/show_bug.cgi?id=2055551). The relevant timeline, from HARICA's filing and Chrome's replies:

- Chrome Root Store Policy v1.6 (effective February 2025) set June 15, 2026 as the date newly disclosed subordinate CAs, and eventually leaf certificates, must drop `id-kp-clientAuth` and carry `serverAuth` only.
- HARICA updated its CP/CPS in March 2025 to commit to that June 15, 2026 cutoff for its own issuance.
- Chrome Root Store Policy v1.8 later extended the leaf certificate deadline to March 15, 2027, the same extension behind [DigiCert and Sectigo's intermediate cutover](/blog/public-ca-eku-separation-june-2026) that we covered in May. HARICA never updated its CPS to reflect the extension.
- HARICA's CPS still said June 15, 2026, but its issuance systems kept producing clientAuth-capable leaf certificates past that date anyway. The result is a straightforward CP/CPS non-conformance: HARICA was out of compliance with its own published policy, independent of what Chrome's current deadline actually permitted.
- Every TLS certificate issued with `id-kp-clientAuth` after 2026-06-15 00:00:01 UTC is in scope. HARICA committed to replacing and revoking them within five days of the report; CRL entries at `crl.harica.gr/HARICA-GEANT-TLS-R1.crl` started appearing July 20. A full root cause report is due July 24.

The part worth reading closely is Chrome's response. Quoting directly: "If per-profile CP/CPS conformance controls existed and functioned as desired, this incident could not have occurred," and "responses proposing additional training, additional human review, or enhanced monitoring of upstream policy communications will be considered non-responsive." Chrome is asking HARICA to demonstrate the specific control that catches this failure mode now, not to describe a process improvement.

## Why it matters operationally

This isn't really an EKU story; we already covered that transition in May. It's a story about a CA's published compliance commitments drifting out of sync with the root program requirements behind them, and nobody catching it until a third party audited the output.

Two things are worth pulling out of that if you consume CA output rather than run a CA:

**A CA's CP/CPS is not a reference you check once and file away.** If you've ever cited a CA's CP/CPS section number in vendor risk documentation or a security questionnaire response, treat that citation as perishable. Chrome ships a new root program policy version every few months, and a CA's public compliance document can end up describing a rule that no longer matches its actual obligations, in either direction: too strict, as happened here, or too permissive.

**Chrome's posture on remediation is a signal beyond this one incident.** Explicitly rejecting "training" and "human review" as adequate responses to a policy-tracking failure tells you where root program enforcement is heading: automated, per-profile conformance checks that tie CP/CPS text directly to certificate profile configuration, verifiable by an outside party. If you evaluate CAs as vendors, it's now fair to ask directly whether they can show the control, not the process document, that keeps issuance profiles in sync with their CPS.

## Checking for it yourself

If you hold certificates from HARICA, or any CA, for client authentication, check the EKU and issuance date directly rather than assuming a June 2026 cutoff was honored:

```bash
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null \
  | openssl x509 -noout -ext extendedKeyUsage -issuer -startdate
```

Cross-reference the `notBefore` date against 2026-06-15. If the certificate was issued after that date and still shows `TLS Web Client Authentication`, it falls inside this incident's scope and will be revoked within HARICA's five-day window regardless of its stated expiry.

## KrakenKey

KrakenKey issues through Let's Encrypt, which isn't involved in this incident, so nothing changes in KrakenKey's issuance flow. But if you're auditing any vendor CA's compliance posture from its published CP/CPS, this incident is a concrete example of why the document alone isn't sufficient evidence: ask what automated control actually ties the policy text to the certificate profiles being issued, because that's the bar root programs are now enforcing to.
