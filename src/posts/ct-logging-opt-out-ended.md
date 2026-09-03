---
title: "Certificate Transparency Opt-Outs Are Gone"
description: "DigiCert removed CT logging opt-out options from CertCentral on June 1, 2026. Chrome Root Program Policy v1.8 Section 1.3.4.1 requires all Root Program participants to log precertificates before issuance by June 15. Internal hostnames on public certificates are now permanently visible in CT logs."
pubDate: 2026-06-03
author: "KrakenKey Team"
tags: ["pki", "certificate-transparency", "ct-logs", "chrome", "digicert", "privacy"]
draft: false
---

DigiCert removed the Certificate Transparency opt-out settings from CertCentral on June 1, 2026. Any public TLS certificate issued through DigiCert, GeoTrust, Thawte, RapidSSL, or Encryption Everywhere from that date forward is logged to a public CT log before issuance completes. Twelve days from now, [Chrome Root Program Policy v1.8 Section 1.3.4.1](https://googlechrome.github.io/chromerootprogram/) extends the same mandatory logging requirement to every CA participating in the Chrome Root Program.

## What changed

Until June 15, 2026, Section 1.3.4.1 of Chrome Root Program Policy v1.8 reads as a SHOULD:

> CA Owners SHOULD ensure that all TLS server authentication precertificates issued by such CAs are logged to at least one (1) CT log recognized by Chrome as Usable or Qualified within 24 hours of issuance.

After June 15, it becomes a MUST, and the timing changes from post-issuance to pre-issuance:

> CA Owners MUST ensure that all TLS server authentication precertificates issued by such CAs are logged to at least one (1) CT log recognized by Chrome as Usable or Qualified before issuing the corresponding certificate.

This is not a new concept. Chrome has enforced CT for publicly-trusted TLS certificates at the browser level since 2018 by requiring at least two SCTs embedded in the certificate or delivered via OCSP/TLS extension. What changes is that the policy now explicitly bans the issuance of the final certificate before the precertificate is logged, closing a window where a CA could issue a certificate and log it afterward (or not at all, in the case of an opt-out).

DigiCert's CertCentral previously offered opt-out controls at the account and product level. Those settings are gone. Sectigo and other major publicly-trusted CAs are following the same trajectory ahead of the June 15 policy date.

## Why it matters operationally

CT logs are public, append-only, and permanently queryable. If a certificate for `internal-api.corp.example.com` was issued with CT opt-out in 2024 and kept out of public logs, that hostname remained private. The same certificate issued today is in crt.sh, Google's Sunlight logs, and every CT log aggregator within seconds.

The operational concern is hostname disclosure. Internal subdomain naming schemes often encode information about infrastructure topology: `db-replica-2.us-east-1.prod.internal.example.com` tells an attacker which cloud region you use, that you have a replica, and that it's in production. CT logs make that structure queryable by anyone.

Affected configurations:

- **Staging and pre-production domains** issued under public TLS for browser compatibility, where the hostnames reveal internal naming conventions or project names
- **Internal API gateways** exposed to devices that need trusted certificates but run on non-routable addresses
- **VPN concentrators and jump hosts** that have publicly-trusted certificates for user convenience rather than strict PKI requirements
- **Test and canary certificates** that CAs are also now required to log, meaning certificate hygiene failures (issuance without proper purpose) are permanently visible

The issue is not that logging exposes certificate contents beyond the SANs and issuer metadata -- CT logs do not reveal private keys or private network addresses. But the SAN list, validity period, issuer chain, and issuance timestamp are all public. For organizations doing structured hostname labeling, that is enough.

## Finding what is already logged

Query crt.sh to see the current public CT log exposure for your domains:

```bash
# All certificates for a domain and its subdomains (replace example.com)
curl -s "https://crt.sh/?q=%25.example.com&output=json" \
  | jq -r '.[] | [.not_before, .common_name, .name_value] | @tsv' \
  | sort -k2

# Certificates issued in the last 30 days only
curl -s "https://crt.sh/?q=%25.example.com&output=json" \
  | jq -r '.[] | select(.not_before > "2026-05-01") | [.not_before, .name_value] | @tsv' \
  | sort
```

For a broader view across multiple SANs and deduplication:

```bash
# Enumerate unique hostnames that appear in CT logs for your domain
curl -s "https://crt.sh/?q=%25.example.com&output=json" \
  | jq -r '.[].name_value' \
  | tr ',' '\n' \
  | sed 's/^\s*//' \
  | sort -u
```

This is also useful defensively: if a hostname appears in CT logs that you did not issue a certificate for, that is evidence of misissuance and should trigger an investigation.

## Migrating out of public PKI for internal infrastructure

The correct response to this enforcement is not to avoid CT-logged certificates for internal infrastructure -- that path is now closed for publicly-trusted CAs. The correct response is to stop using public trust anchors for infrastructure that does not require browser trust.

Two practical options:

**Step-CA with ACME.** [Smallstep's step-ca](https://smallstep.com/docs/step-ca/) is a self-hosted CA that speaks ACME natively. ACME clients that work with Let's Encrypt work with step-ca. Internal hostnames never appear in a public CT log because the issuing CA is not in any browser root program. The operational overhead is running a CA and distributing a trust anchor to internal clients.

```bash
# Initialize a private CA
step ca init --name="Internal CA" --dns="ca.internal.example.com" \
  --address=":443" --provisioner="acme"

# Issue a certificate via ACME against your private CA
# (certbot example, pointing to internal CA)
certbot certonly --server https://ca.internal.example.com/acme/acme/directory \
  --standalone -d internal-api.corp.example.com
```

**Cloud managed private CAs.** AWS Private CA and GCP Certificate Authority Service provide managed private PKI that integrates with ACM and cert-manager respectively. Certificates issued from private hierarchies are not subject to Chrome's CT requirements and do not appear in public logs.

The relevant distinction: a certificate is only required to be CT-logged if it chains to a root in a public browser trust store. Private hierarchies, by definition, do not.

## How this relates to KrakenKey

Let's Encrypt has never offered CT opt-out. Every certificate issued through Let's Encrypt and therefore every certificate issued through KrakenKey has always been logged to CT. This enforcement does not change anything in KrakenKey's issuance flow.

What it does change is the availability of CT opt-out as a mechanism at other public CAs. Operators who have been managing certificates for internal infrastructure through a commercial CA with opt-out enabled need to act before June 15. The infrastructure migration -- distributing a private CA trust anchor, updating ACME configurations, potentially updating device trust stores -- takes time and should be underway now rather than after the enforcement date.
