---
title: "SSL.com Revoked 2,700 Certificates Over Missing MPIC Evidence"
description: "An annual WebTrust audit sampled four certificates and found no Multi-Perspective Issuance Corroboration evidence behind their domain validation. The investigation reached 2,700 certificates, all revoked inside 24 hours. The MPIC quorum steps up again on December 15."
pubDate: 2026-09-16
author: "KrakenKey Team"
tags: ["ca-incidents", "cabforum", "pki"]
draft: false
---

SSL.com filed a preliminary incident report on September 11 after its annual WebTrust audit found four sampled TLS certificates with no Multi-Perspective Issuance Corroboration evidence recorded for their domain control validation. The investigation widened to 2,700 unexpired, unrevoked certificates issued through the same DCV path. SSL.com invoked its Mass Revocation Plan and revoked all 2,700 less than 24 hours after discovery.

## What changed

The incident is tracked in [Mozilla Bugzilla bug 2071491](https://bugzilla.mozilla.org/show_bug.cgi?id=2071491), whiteboarded `[ca-compliance] [dv-misissuance]`. The cited policies are [TLS Baseline Requirements](https://github.com/cabforum/servercert/blob/main/docs/BR.md) v2.3.0 Section 3.2.2.9 and SSL.com CP/CPS v1.33 Section 3.2.2.13. The preliminary report does not identify which validation method the affected path used; the full incident report is due on or before September 25.

**Update, September 25, 2026:** SSL.com had not yet posted its full incident report to [bug 2071491](https://bugzilla.mozilla.org/show_bug.cgi?id=2071491) as of today's deadline, so the root cause and the affected validation method are still unpublished.

Section 3.2.2.9 arrived with [Ballot SC-067](https://cabforum.org/2024/08/05/ballot-sc067v3-require-domain-validation-and-caa-checks-to-be-performed-from-multiple-network-perspectives-corroboration/) and requires that the domain validation and CAA determinations made by a CA's Primary Network Perspective be corroborated from remote Network Perspectives before issuance. Perspectives count as distinct only when the straight-line distance between them is at least 500 km, results from one perspective cannot be reused or cached by another, and the relied-upon DNS resolvers must fall in the same Regional Internet Registry service region as the perspective using them. The defense it buys is against equally-specific prefix BGP hijacks, where an attacker who can pull traffic for a prefix along one path cannot pull it along all of them.

The requirement is phased, and the current step landed three months ago:

| Effective | Minimum remote perspectives | Additional constraint |
|---|---|---|
| 2025-03-15 | 2 | Quorum advisory, issuance may proceed |
| 2025-09-15 | 2 | Quorum enforced, no issuance on failure |
| 2026-03-15 | 3 | Passing perspectives span 2+ RIRs |
| 2026-06-15 | 4 | Passing perspectives span 2+ RIRs |
| 2026-12-15 | 5 | Passing perspectives span 2+ RIRs |

The Quorum Requirements table sets the failure budget separately, and it does not scale with the first column. Two through five remote perspectives all permit exactly one non-corroboration. Six or more permit two. So the December 15 step from four perspectives to five tightens the tolerance rather than loosening it: today you need 3 of 4 to agree, and in December you will need 4 of 5, with the fifth vantage point added to the set that can fail you.

## Why it matters operationally

Two separate exposures come out of this, and they land on different teams.

The first is that nothing observable from outside the CA records whether MPIC ran. It is not an extension in the certificate, it is not logged to CT, and it leaves no trace in the ACME order object. The evidence lives in the CA's internal validation records, which is exactly why an auditor sampling four certificates was the detection mechanism here rather than the CA's own monitoring or a third-party report. For a subscriber, the first and only signal is the revocation itself, arriving on a clock measured in hours. SSL.com's response was fast and correct, and it is also a working demonstration of the capability that Section 5.7.1.2 requires CAs to test annually.

The second is that MPIC's cost lands on your edge, and it has been growing. An `http-01` validation is no longer one request for the challenge token. Let's Encrypt, which has run multi-perspective validation since 2020, currently issues one request from the primary datacenter and four from remote perspectives, arriving at close to the same moment from unrelated networks in at least two RIR regions. Anything at your edge that treats those requests differently from each other is a validation failure waiting for a renewal. In practice that means geo-blocking rules, per-path or per-IP rate limits that trip on five near-simultaneous requests for the same URI, WAF reputation scoring, and origin caches that serve a stale 404 to the perspectives arriving behind the first one. Let's Encrypt does not publish its validation source addresses and [states plainly](https://letsencrypt.org/docs/faq/) that they change without notice, so an allowlist is not available as a workaround.

## Checking what actually reaches your origin

After any successful `http-01` issuance, count distinct source addresses per challenge token in your access logs. Each token should show the full set of perspectives:

```bash
awk '$7 ~ /^\/\.well-known\/acme-challenge\// {print $7, $1}' /var/log/nginx/access.log \
  | sort -u \
  | awk '{count[$1]++} END {for (t in count) print count[t], t}' \
  | sort -rn
```

```
5 /.well-known/acme-challenge/8kQ3rYw2p1N_example
5 /.well-known/acme-challenge/dT7mLx9Qa4V_example
1 /.well-known/acme-challenge/Zb2nHs6Kc8R_example
```

A token with a count of 1 means only the primary perspective reached you and the order succeeded on a cached authorization, or the remote perspectives were dropped somewhere ahead of your logging. Either way you have no margin left the next time validation runs cold.

When the remotes are blocked and the primary is not, Boulder tags the failure distinctly. Its `va.go` wraps the underlying problem detail with a fixed prefix before returning it, so the ACME error reads:

```
urn:ietf:params:acme:error:unauthorized
During secondary validation: 198.51.100.24: Invalid response from
http://example.com/.well-known/acme-challenge/8kQ3rYw2p1N_example: 403
```

`During secondary validation:` is the part that matters. A 403 that only some vantage points see is not an ACME client bug and not a CA outage; it is your edge behaving differently by source network. Serving the challenge path ahead of every filtering rule removes the whole class:

```nginx
# Must precede geo, rate-limit, and WAF locations. ^~ stops regex matching.
location ^~ /.well-known/acme-challenge/ {
    allow all;
    limit_req  off;
    limit_conn off;
    root /var/www/acme;
    access_log /var/log/nginx/acme.log;
}
```

If your edge cannot be opened worldwide on port 80, `dns-01` is the alternative, since it requires your authoritative nameservers to answer from everywhere rather than your web tier.

## Where KrakenKey fits

This doesn't change anything in KrakenKey's flow. We issue through Let's Encrypt, which is not implicated here and has operated remote validation perspectives for six years. But operators running their own ACME clients should know about it, and the December 15 step to five remote perspectives is worth treating as a dated change rather than background compliance news. The five-line nginx block above and one pass over the geo and rate-limit rules in front of your challenge path is most of the work, and it is cheaper to do now than during a renewal that fails at 4 of 5.
