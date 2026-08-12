---
title: "SC100 Passes: DNSSEC Validation Requirements Move to Section 4.2.2.2"
description: "CA/Browser Forum Ballot SC100 passed on August 6, consolidating scattered DNSSEC validation language into a single section and clarifying that DNSSEC validation is mandatory only on the Primary Network Perspective. Here's what that means for DNSSEC-signed zones."
pubDate: 2026-08-12
author: "KrakenKey Team"
tags: ["dnssec", "caa", "pki", "cabforum", "dns", "mpic"]
draft: false
---

CA/Browser Forum Ballot SC100 passed on August 6, 2026, with unanimous support from both Certificate Issuers and Certificate Consumers. The ballot doesn't change what CAs are required to validate. It consolidates DNSSEC validation language that was scattered across Section 3.2.2 of the Baseline Requirements into a single new Section 4.2.2.2, and in doing so it settles a question that the old structure left ambiguous: DNSSEC validation is mandatory only on a CA's Primary Network Perspective, not on the Remote Network Perspectives used for Multi-Perspective Issuance Corroboration.

## What changed

[SC100](https://cabforum.org/2026/08/06/ballot-sc100-dnssec-clarification-and-consolidation/) was proposed by Rich Smith (DigiCert) and endorsed by Trev Ponds-White (Amazon) and Scott Rea (eMudhra). Discussion ran June 30 through July 30, voting closed August 6 with 22 Certificate Issuer YES votes and unanimous support from Apple, Cisco, and Mozilla on the Certificate Consumer side, and the [redline](https://github.com/cabforum/servercert/compare/9270ad7887b48d58bf0954336de32c265a934d66...b6dd09f33c3ef9a88672332faca3c4cbcb391276) is now in its 30-day review period through September 5. There's no new effective date attached because the ballot explicitly disclaims any intent to change existing requirements.

The requirement itself dates back further, to Ballot SC-085v2, which made DNSSEC validation mandatory for CAA and domain control lookups effective March 15, 2026. What SC100 fixes is that the operative language was split across at least three places in the Baseline Requirements, with the actual normative text now consolidated into 4.2.2.2:

> DNSSEC validation MUST be performed in accordance with Section 4.2.2.2 on all DNS queries associated with the validation of domain authorization or control, and CAA record lookups by the Primary Network Perspective.

Two other lines carried over from the pre-existing requirement matter as much as the reorganization itself:

> CAs MUST NOT use local policy to disable DNSSEC validation on any DNS query associated with CAA record lookups.

> DNSSEC-validation errors observed by the Primary Network Perspective (e.g., SERVFAIL) MUST NOT be treated as permission to issue.

SC100's contribution is scoping all of this explicitly to the Primary Network Perspective, and stating that Remote Network Perspectives *may* perform DNSSEC validation but aren't required to.

## Why it matters operationally

Since Multi-Perspective Issuance Corroboration became mandatory in 2025, CAs have to corroborate a domain control determination from multiple network vantage points before issuing, specifically to defend against BGP-hijack-based misissuance. Before SC100, it wasn't clearly stated anywhere in one place whether the hard-fail DNSSEC rule applied to every perspective in that corroboration or just the one making the final call. It's the latter: a Remote Network Perspective can validate DNSSEC or skip it, but the Primary Network Perspective's DNSSEC check is a hard gate. If it hits SERVFAIL, that CA has no path to issue regardless of what the remote perspectives saw.

For anyone running a DNSSEC-signed zone and relying on automated issuance, this means a single validation failure at the perspective the CA designates as primary is sufficient to block a renewal, independent of the health of the zone as observed from anywhere else. That's most likely to bite during key rollovers, DS record changes at the registrar, or TTL misconfigurations that leave a window where the chain of trust doesn't validate cleanly.

## Reproducing the failure mode

A common way to trigger this: rotating a Zone Signing Key and updating the DS record at the parent zone before the new RRSIGs have propagated and the old key has aged out, so a validating resolver briefly can't build a clean chain of trust.

Check whether your zone's DNSKEY and the parent's DS record are in sync before you touch either:

```bash
# what the zone itself is currently serving
dig DNSKEY example.com +short

# what the parent zone (registry) has on file
dig DS example.com @<parent-ns> +short

# ask a validating resolver to actually build the chain
delv @1.1.1.1 example.com A
```

A clean chain returns `; fully validated` from `delv`. A broken one returns something like:

```
;; resolution failed: SERVFAIL
```

That SERVFAIL is exactly the condition Section 4.2.2.2 addresses. Per the BR text above, if the CA's Primary Network Perspective sees it while resolving your CAA or domain-control records, the CA cannot fall back to unvalidated resolution and cannot treat the error as permission to issue. Your ACME client's renewal attempt fails, and depending on how much of this context is visible in the CA's error response, it can look like a generic timeout rather than a DNSSEC chain-of-trust problem, since the client only sees an issuance failure, not the validating resolver's SERVFAIL.

## How KrakenKey's flow relates

SC100 doesn't change anything in KrakenKey's issuance flow. It's a consolidation of language describing behavior our upstream CAs already implement, and KrakenKey doesn't apply any special handling to DNSSEC-signed zones today. What it does change is how easy it is to find the actual rule when you're debugging a renewal failure: if you run DNSSEC and a DNS-01 renewal fails for no obvious reason, checking `delv` against your zone before opening a support ticket is now a documented first step, since Section 4.2.2.2 is the single place that rule lives.
