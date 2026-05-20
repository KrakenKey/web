---
title: "SC-098v2 Passes: RFC 8657 CAA Parameters Are Mandatory from March 2027"
description: "CA/Browser Forum Ballot SC-098v2 passed on May 13, requiring all publicly-trusted CAs to process the accounturi and validationmethods CAA parameters from RFC 8657. Here's what changes operationally."
pubDate: 2026-05-20
author: "KrakenKey Team"
tags: ["caa", "pki", "acme", "cabforum", "rfc8657", "dns"]
draft: false
---

CA/Browser Forum Ballot SC-098v2 passed on May 13, 2026, with 22 of 23 Certificate Issuer votes in favor and unanimous support from the three Certificate Consumer members (Apple, Google, Mozilla). Starting March 15, 2027, every publicly-trusted CA must process the `accounturi` and `validationmethods` parameters defined in RFC 8657 when those parameters appear in a CAA record. CAs that currently ignore these parameters and issue certificates anyway will be out of compliance.

## What changed

[RFC 8657](https://datatracker.ietf.org/doc/html/rfc8657) defined two extensions to the `issue` and `issuewild` CAA DNS record properties in 2019. Support has been optional since then, and adoption across CAs has been inconsistent. SC-098v2 ([cabforum.org](https://cabforum.org/2026/05/13/ballot-sc098v2-process-rfc-8657-caa-parameters/)) closes that gap by amending the Baseline Requirements to require CAs to enforce them.

**`accounturi`** restricts issuance to a specific ACME account identified by its URI. If a CA receives an order from an account not listed in the CAA record, it must refuse.

**`validationmethods`** restricts which domain validation methods the CA may use to satisfy an order. A record specifying `dns-01` means the CA cannot use `http-01` or `tls-alpn-01`, even if the ACME client requests one.

SC-098v2 also adds language to the BRs defining a specific syntax for non-ACME validation method identifiers (Section 4.2.2.1.3), preventing naming collisions between CAs that might otherwise interpret the same string differently. CAs that support non-ACME accounts must document their accepted `accounturi` format in their CP or CPS.

The 30-day IPR review period runs through June 12, 2026. Barring a patent claim, this takes effect March 15, 2027.

## Why it matters operationally

A bare `CAA 0 issue "letsencrypt.org"` record today authorizes any ACME account to issue certificates for your domain from that CA. If your ACME credentials were compromised or a misconfigured client was pointed at the wrong domain, you'd get an unexpected certificate issued with no DNS-layer control stopping it. The `accounturi` parameter closes that gap.

Three scenarios where this becomes operationally significant:

**Multi-team domains.** Large organizations where multiple teams share a DNS zone but only one team should own certificate issuance for a given subdomain. RFC 8657 lets you encode that ownership in DNS rather than relying on access controls in your automation layer to be correctly configured.

**Validation method constraints.** Some security postures require all certificates to use DNS-based validation exclusively. A `validationmethods=dns-01` restriction enforces this at the CA level rather than depending on your ACME client configuration being correct across every environment.

**Post-incident hardening.** After a credential leak or rogue issuance event, adding `accounturi` to your CAA records prevents re-issuance from any account except your current one while you rotate credentials and audit your certificate inventory.

The enforcement date is the key operational risk. If you have RFC 8657 parameters in your CAA records today and your CA ignores them (which most currently do), that behavior changes on March 15, 2027. Records that were previously advisory become enforced. An `accounturi` pointing to a decommissioned account, or a `validationmethods` value with a typo, will produce issuance failures rather than silent pass-throughs.

## Before/after CAA configuration

**Current behavior for most CAs (parameters parsed but ignored):**

```dns
example.com. IN CAA 0 issue "letsencrypt.org; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1726001367; validationmethods=dns-01"
```

Today, a request from any account using any validation method will succeed as long as the CA name matches. The parameters after the semicolon are effectively decorative for most CAs.

**After March 15, 2027:**

The same record has enforcement teeth. An order from account `/acct/9999999` is rejected. An `http-01` order from the correct account is also rejected. The CA is required to check both parameters.

To find your Let's Encrypt account URI before adding it to your CAA records:

```bash
# certbot
certbot show_account

# acme.sh
acme.sh --info | grep ACCOUNT_URL

# acme.sh (registered account directory)
cat ~/.acme.sh/ca/acme-v02.api.letsencrypt.org/acme/acct/account.json | python3 -m json.tool | grep '"id"'
```

For wildcards, apply the same parameters to `issuewild`:

```dns
example.com. IN CAA 0 issue    "letsencrypt.org; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1726001367; validationmethods=dns-01"
example.com. IN CAA 0 issuewild "letsencrypt.org; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1726001367; validationmethods=dns-01"
```

Let's Encrypt and Google Trust Services already enforce RFC 8657 parameters when they appear. You can test enforcement behavior now against those CAs: add a CAA record with a nonexistent `accounturi` value and attempt issuance. The CA should reject the order. If it doesn't, the CA is treating the parameters as optional, which is behavior that will change by March 2027.

## How KrakenKey's flow relates

KrakenKey issues certificates via a fixed ACME account per user, so operators who want to add `accounturi` restrictions to their CAA records can pin that account URI directly. SC-098v2 does not change anything in KrakenKey's issuance flow. What it does change is the risk profile for operators who already have RFC 8657 parameters in their CAA records without verifying they're accurate: those records will start causing failures rather than being silently ignored when the enforcement date arrives. A CAA audit before Q1 2027 is worth putting on the calendar.
