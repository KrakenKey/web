---
title: "The clientAuth EKU Is Gone from Public TLS Intermediates"
description: "Sectigo and DigiCert revoked their multi-purpose intermediate CAs on May 15. Chrome's June 15 CCADB deadline arrives in 19 days. Here's what breaks on your next certificate renewal and what needs to move to private PKI."
pubDate: 2026-05-27
author: "KrakenKey Team"
tags: ["pki", "tls", "eku", "digicert", "chrome", "mtls", "certificates"]
draft: false
---

Sectigo stopped issuing TLS certificates with the `clientAuth` extended key usage on May 15, 2026. DigiCert did the same, and also revoked its multi-purpose G2 and G3 intermediate CAs the same day, replacing them with dedicated serverAuth-only intermediates. Both moves are driven by [Chrome Root Program Policy v1.8](https://googlechrome.github.io/chromerootprogram/), which requires any new subordinate CA disclosed to the CCADB on or after June 15, 2026 to assert only `id-kp-serverAuth`. If you are using public TLS certificates to authenticate clients, either the certificates already stopped working, or they will when they next renew.

## What changed

[Chrome Root Program Policy v1.8](https://googlechrome.github.io/chromerootprogram/), published February 5, 2026, sets a two-phase enforcement schedule:

- **June 15, 2026** (19 days out): Any new subordinate CA disclosed to the CCADB must include only the `id-kp-serverAuth` EKU. Disclosing a multi-purpose intermediate after this date is a policy violation; Chrome can phase out that hierarchy with 90 days' notice.
- **March 15, 2027**: New subscriber (leaf) certificates must also assert only `id-kp-serverAuth`. Leaf certificates issued before that date can carry `clientAuth` until they expire naturally.

DigiCert acted ahead of both deadlines. On May 15, it revoked `DigiCert Global CA G2`, its primary public TLS multi-purpose intermediate, along with several G3 code signing and S/MIME intermediates. Replacement intermediates are dedicated-use: `DigiCert Global G2 TLS RSA SHA256 2020 CA1` for TLS, separate chains for S/MIME and code signing. Any certificate issued after May 15 from a DigiCert public TLS hierarchy comes from one of those replacement intermediates. Sectigo enforced the same hard cutoff on leaf certificates the same day.

Let's Encrypt completed the same structural change with its Generation Y intermediates earlier this month (covered [previously](/blog/lets-encrypt-generation-y-transition)): the YE and YR intermediates carry only `serverAuth`.

## Why it matters operationally

Any system using public CA certificates for TLS client authentication is now operating against an expiring window. Certificates with `clientAuth` issued before May 15 from multi-purpose intermediates remain valid until expiry. The break happens on the **next renewal**: the replacement certificate will not have `clientAuth`, and any component that requires it for authentication will fail on the subsequent handshake.

The affected use cases:

- **VPN gateways using EAP-TLS** with publicly-issued client certificates
- **mTLS service-to-service authentication** where both sides present publicly-issued certificates; the server side is unaffected, but client certs issued for machine identity from a public CA will lose `clientAuth` on renewal
- **802.1X network access control** (Cisco ISE, Aruba ClearPass, Microsoft NPS) that relies on public CA certs for device or user authentication
- **Any code that inspects EKU** on peer certificates, including custom TLS verification in Go (`VerifyPeerCertificate`), Python (`ssl` module), or Java (`X509ExtendedTrustManager`) that checks for `id-kp-clientAuth`

The failure mode is silent on renewal rather than at issuance, which is what makes it operationally dangerous. If your automation renews certificates without post-renewal validation of the resulting certificate's properties, you won't know until something stops authenticating.

## Auditing your certificates

Check whether your end-entity certificates or intermediates still carry `clientAuth`:

```bash
# Check the leaf certificate served by a host
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -ext extendedKeyUsage

# Before May 15 renewal (from multi-purpose intermediate):
# X509v3 Extended Key Usage:
#     TLS Web Server Authentication, TLS Web Client Authentication

# After renewal (from dedicated TLS intermediate):
# X509v3 Extended Key Usage:
#     TLS Web Server Authentication
```

For client certificate files:

```bash
# Check a stored client certificate for clientAuth EKU
openssl x509 -in client.crt -noout -ext extendedKeyUsage
```

To inspect the intermediate that issued your certificate:

```bash
# Extract and inspect the intermediate (second cert in the chain)
echo | openssl s_client -connect example.com:443 -showcerts 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/{c++} c==2{print} /-----END CERTIFICATE-----/ && c==2{exit}' \
  | openssl x509 -noout -subject -ext extendedKeyUsage
```

Before/after for the DigiCert intermediate:

```
# DigiCert Global CA G2 (revoked May 15, 2026)
X509v3 Extended Key Usage:
    TLS Web Server Authentication, TLS Web Client Authentication

# DigiCert Global G2 TLS RSA SHA256 2020 CA1 (replacement)
X509v3 Extended Key Usage:
    TLS Web Server Authentication
```

## Migrating client authentication to private PKI

Public CA certificates were never architecturally suited for client authentication at scale. The enforcement just makes the limitation explicit and removes the ability to continue using them even in degraded configurations.

For operators who need to migrate:

- **[step-ca](https://smallstep.com/docs/step-ca/)** is a full-featured private CA with ACME support and short-lived certificate issuance built in. Reasonable operational overhead for teams that want control.
- **HashiCorp Vault PKI secrets engine** integrates well into existing Vault deployments and handles automated certificate issuance with role-based access.
- **Cloud-native options**: AWS ACM Private CA and GCP Certificate Authority Service for teams preferring managed infrastructure.
- **Service mesh internal CAs**: Istio's istiod and Linkerd's identity issuer issue client certificates inside the mesh boundary transparently; no separate CA operation required if you're already running a mesh.

## KrakenKey

KrakenKey issues through Let's Encrypt. Let's Encrypt's Generation Y intermediates, now serving all ACME profiles, carry only `serverAuth`. If you were using KrakenKey-issued certificates for mutual TLS client authentication, that path has already closed with the Generation Y transition. This does not change anything in KrakenKey's issuance flow, but operators running any public CA for client auth need a migration plan before the current certificate generation expires. The June 15 Chrome CCADB deadline means no public CA will be disclosing new multi-purpose intermediates going forward.
