---
title: "Let's Encrypt Picks Merkle Tree Certificates for Post-Quantum TLS"
description: "On June 3, Let's Encrypt committed to adopting Merkle Tree Certificates as its path to post-quantum web authentication. Here is how MTCs work, why the handshake size math forces the choice, and what ACME operators need to track."
pubDate: 2026-06-24
author: "KrakenKey Team"
tags: ["post-quantum", "pki", "lets-encrypt", "mtc", "acme", "ietf"]
draft: false
---

On June 3, Let's Encrypt [published its plan](https://letsencrypt.org/2026/06/03/pq-certs) to adopt Merkle Tree Certificates (MTCs) as the architecture for post-quantum TLS authentication. The announcement commits the CA responsible for 54% of public TLS certificates to the protocol being standardized in the IETF PLANTS working group as [draft-ietf-plants-merkle-tree-certs-04](https://datatracker.ietf.org/doc/draft-ietf-plants-merkle-tree-certs/) (revised May 24, 2026). A staging environment issuing MTCs is targeted for late 2026, with production in 2027.

## What changed

The announcement is a commitment, not a deployment. Nothing in the current certificate issuance pipeline changes yet. What it does is align Let's Encrypt behind a specific architectural proposal originally developed jointly by Google and Cloudflare, rather than pursuing a naive port of today's X.509 chains to post-quantum algorithms.

The IETF PLANTS (PKI, Logs, And Tree Signatures) working group is the standards home for this work. Draft version 04 of the MTC specification was published on May 24, nine days before the Let's Encrypt announcement. Let's Encrypt also tracks ML-DSA-in-X.509 via [RFC 9881](https://datatracker.ietf.org/doc/rfc9881/) as a parallel path while the MTC spec matures through the IETF process.

## Why it matters operationally

The core problem MTCs solve is handshake size. Today's TLS handshakes use ECDSA-P256 (64 bytes per signature) or RSA-2048 (256 bytes per signature). The NIST post-quantum signature standard, ML-DSA-44 (FIPS 204), produces signatures of approximately 2,420 bytes and public keys of 1,312 bytes -- roughly 38 times and 20 times larger than their ECDSA equivalents, respectively.

A standard TLS certificate exchange carries five signatures and two public keys: the leaf certificate signature and public key, the intermediate CA signature and public key, two Certificate Transparency SCTs, and the server CertificateVerify signature. With ML-DSA-44 those five signatures alone add up to 12 kilobytes. Let's Encrypt's analysis found this exceeds 10 kilobytes in ways that cause handshake failures on real-world mobile and constrained networks.

MTCs restructure the model. Instead of signing each certificate individually, the CA batches certificates into a Merkle tree and signs only the tree root. The client proves its certificate belongs to that signed batch with an inclusion proof. The proof grows logarithmically with batch size: a batch of 10 million certificates requires approximately 23 hash values at 32 bytes each, around 740 bytes. The full MTC handshake presents one ML-DSA signature, one ML-DSA public key, and one inclusion proof, rather than five signatures and two keys:

| Authentication model | Sig material | Key material | CT overhead | Approx total |
|---|---|---|---|---|
| ECDSA-P256 (today) | 5 x 64 B = 320 B | 2 x 64 B = 128 B | 2 SCTs ~150 B | ~600 B |
| ML-DSA-44, traditional chain | 5 x 2,420 B = 12,100 B | 2 x 1,312 B = 2,624 B | 2 PQ SCTs ~5 KB | ~20 KB |
| ML-DSA-44, MTC | 1 x 2,420 B | 1 x 1,312 B | built-in | ~4.5 KB |

MTC handshakes with post-quantum algorithms end up smaller than today's ECDSA baseline is irrelevant -- what matters is that they avoid the ~20 KB figure that causes connection failures.

The MTC design also eliminates the external CT submission step. Certificate Transparency is structural in MTCs: a certificate cannot exist outside the log tree, so there is nothing separate to submit to an external log. Let's Encrypt has operated append-only Merkle tree CT logs since 2019; the infrastructure already exists.

For clients with outdated root stores that cannot verify an MTC inclusion proof, the spec defines a standalone fallback form that behaves like a traditional certificate. The fallback is larger than today's ECDSA certificates but smaller than a naive ML-DSA chain.

## What ACME operators need to track

The current ACME `tlsserver` profile that Let's Encrypt added in May 2026 (for 45-day certificate issuance) is unrelated to MTCs. MTCs require client-side changes for inclusion proof verification and are not a profile variant of the existing ACME flow. Expect a distinct mechanism when staging ships.

The PLANTS draft is still active. Between versions 03 and 04, the spec revised how `TBSCertificateLogEntry` structures are handled and updated the cosigner verification protocol. Client maintainers who want to implement MTC support before staging can subscribe to the PLANTS mailing list and track the draft changelog:

```bash
# Fetch the current MTC draft
curl -sS https://www.ietf.org/archive/id/draft-ietf-plants-merkle-tree-certs-04.txt | \
  grep -A5 "Changes since"
```

You can inspect your current certificate's algorithm to establish a baseline for later comparison:

```bash
openssl s_client -connect example.com:443 -showcerts 2>/dev/null | \
  openssl x509 -noout -text | grep "Signature Algorithm"
```

When the MTC staging environment ships, Let's Encrypt has indicated it will publish test endpoints and tooling for verifying inclusion proofs. Watch [letsencrypt.org/upcoming-features/](https://letsencrypt.org/upcoming-features/) for specifics.

## How KrakenKey's approach relates

MTCs do not change anything in KrakenKey's current issuance flow. KrakenKey issues certificates via ACME, and the ACME protocol is unchanged until Let's Encrypt ships MTC support. Operators running their own ACME clients -- certbot, acme.sh, or custom implementations -- should treat the PLANTS working group as active standards work that will require client updates before production MTCs are usable. Nothing is urgent today, but the staging environment arriving in late 2026 will be the first practical checkpoint.
