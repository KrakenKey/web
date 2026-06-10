---
title: "Let's Encrypt Picks Merkle Tree Certificates as Its Post-Quantum Issuance Path"
description: "On June 3, Let's Encrypt published their PQ plan: Merkle Tree Certificates, not ML-DSA in X.509. The architecture difference has direct consequences for migration planning and tooling assumptions."
pubDate: 2026-06-10
author: "KrakenKey Team"
tags: ["post-quantum", "lets-encrypt", "pki", "merkle-tree-certificates", "tls", "acme"]
draft: false
---

On June 3, Let's Encrypt published their post-quantum certificate plan, and the answer is not what most PQ migration timelines assume. Instead of issuing X.509 certificates with ML-DSA signatures, as standardized in [RFC 9881](https://datatracker.ietf.org/doc/rfc9881/), Let's Encrypt is committing to Merkle Tree Certificates (MTCs), a fundamentally different issuance architecture. Staging deployment is targeted for late 2026, with production in 2027.

## What changed

The sizing math explains why. ML-DSA-44, the smallest post-quantum signature variant in FIPS 204, produces 2,420-byte signatures and 1,312-byte public keys. A typical TLS handshake involves five signatures and two public keys. Replacing those with ML-DSA equivalents pushes a single handshake past 10 kilobytes. Cloudflare measured that at that scale, a meaningful fraction of connections fail on real-world networks, not just slow down.

MTCs solve this by separating where signing happens from where its cost is paid. Instead of signing each certificate individually, a CA batches certificates and signs the entire batch with one ML-DSA signature. The per-batch signature stays at the CA; browsers receive periodic Merkle tree root updates, called landmarks, through a separate update mechanism. During a TLS handshake, the server presents a public key and a short inclusion proof that its key is covered by a batch the client's current landmark already validates. For up-to-date clients, no CA signature crosses the wire. The overhead per handshake drops below what traditional RSA/ECDSA X.509 costs today, despite using post-quantum algorithms.

The specification is [draft-davidben-tls-merkle-tree-certs](https://datatracker.ietf.org/doc/draft-davidben-tls-merkle-tree-certs/), an individual submission now being adopted by the IETF PLANTS working group. Cloudflare and Chrome have been running feasibility experiments on real traffic. Chrome has publicly named MTCs as its preferred path for post-quantum public web certificates.

Revocation in this model does not use OCSP or CRLs. A revoked key is excluded from future batch updates; relying parties operating within the landmark update window are the trust boundary. The ACME protocol also needs changes to accommodate batch issuance, and that work is proceeding in the IETF ACME working group in parallel.

## Why it matters operationally

If your PQ migration plan reads "obtain ML-DSA certificates when your CA supports them," that plan applies to some CAs but not to Let's Encrypt. Let's Encrypt issues the majority of publicly-trusted TLS certificates on the internet. Their production path is MTCs, not ML-DSA-in-X.509.

The operational dependencies that will break when MTCs become the default:

**Chain inspection.** Traditional X.509 has a leaf, intermediate(s), and root. An MTC inclusion proof is not a certificate and will not parse as one. Any tooling that walks the chain, counts its depth, checks issuer CN, or validates path length constraints will fail against MTC issuance. This includes monitoring systems, custom TLS verification code (Go's `VerifyPeerCertificate`, Python's `ssl` module), and mTLS configurations that inspect peer chain structure.

**Revocation tooling.** OCSP responders, CRL distribution points, and must-staple configurations have no equivalent in the MTC model. Any compliance control written against those mechanisms needs to be reconsidered.

**Intermediate pinning.** Like the Generation Y intermediate transition in May, any system that pins an intermediate by CN or fingerprint breaks on the next renewal after the issuing intermediate changes. With MTCs, there is no intermediate to pin.

## What to do now

The PQ mitigation with immediate operational value is in key exchange, not certificate signatures. Quantum attacks on certificate signatures require real-time computation at a scale that does not exist yet. The near-term threat is harvest-now-decrypt-later against session keys. Enabling `X25519MLKEM768` key exchange is the concrete step.

In nginx (requires nginx 1.27+ with OpenSSL 3.5+):

```nginx
ssl_ecdh_curve X25519MLKEM768:X25519:secp384r1;
```

Verify what the server negotiates:

```bash
openssl s_client -connect yourdomain.com:443 -groups X25519MLKEM768 2>&1 \
  | grep "Server Temp Key"
# When working: Server Temp Key: X25519MLKEM768, 1216 bits
# If not:       Server Temp Key: X25519, 253 bits
```

If you get `X25519` rather than `X25519MLKEM768`, either OpenSSL on the server is below 3.5 or the configuration is not active. The group was named `X25519Kyber768Draft00` in earlier draft implementations; servers advertising only the draft name are not interoperable with the standardized version.

## KrakenKey

KrakenKey issues certificates through Let's Encrypt via ACME. When Let's Encrypt begins MTC production issuance in 2027, that will flow through to new and renewed certificates automatically. The ACME protocol changes needed to support batch issuance are in-progress; KrakenKey will track PLANTS WG output and update the issuance pipeline ahead of the production date. Nothing in KrakenKey's current flow changes in 2026. Operators wanting to get ahead of post-quantum exposure today should enable hybrid key exchange on TLS termination, not wait for the certificate format to change.
