---
title: "Post-Quantum TLS Is Coming. Every Certificate You Own Will Be Reissued."
description: "Two changes are converging on certificate management: shrinking lifetimes (47 days by 2029) and mandatory post-quantum migration (by 2035). What that means for certificate operations and how to prepare."
pubDate: 2026-04-19
author: "KrakenKey Team"
tags: ["post-quantum", "certificate-lifetimes"]
draft: false
---

Last week at Elevate IT in Tampa, a session on post-quantum cryptography covered something we've been thinking about for a while. The speaker laid out the timeline: NIST has finalized the post-quantum standards, deprecation dates for classical algorithms are set, and every organization's TLS certificates will need to migrate to new algorithms within the next decade.

We left that talk thinking about how this intersects with shrinking certificate lifetimes. Both changes will hit certificate management in the same window.

## Two Overlapping Changes

### Certificates are expiring faster

CA/Browser Forum Ballot SC-081 is shortening TLS certificate lifetimes on a fixed schedule:

| Date | Max Lifetime | Renewals/Year |
|------|-------------|---------------|
| March 2026 (now) | 200 days | ~2 |
| March 2027 | 100 days | ~4 |
| March 2029 | 47 days | ~8 |

By 2029, your certificates expire roughly every six weeks. Domain validation can only be reused for 10 days. At that frequency, manual renewal processes break.

### Every certificate will need new algorithms

In August 2024, NIST finalized three post-quantum cryptography standards:

- **ML-KEM** (FIPS 203): Key encapsulation for key exchange. Replaces ECDH/X25519.
- **ML-DSA** (FIPS 204): Digital signatures. Replaces RSA and ECDSA in certificates.
- **SLH-DSA** (FIPS 205): Stateless hash-based signatures. A conservative alternative to ML-DSA.

NIST IR 8547 mandates that all quantum-vulnerable cryptographic algorithms, including RSA and ECDSA (the algorithms in virtually every TLS certificate issued today), be deprecated by 2035. The standards are published and the deprecation timeline is official, so every certificate in your infrastructure will eventually be reissued with quantum-resistant algorithms.

### Where they overlap

Either change on its own would be manageable. The timelines overlap:

- **2027:** You're renewing certificates 4x per year, and major CAs begin offering post-quantum hybrid certificates.
- **2028-2029:** You're renewing certificates 8x per year, and you need to start migrating those renewals to PQC algorithms.
- **2030-2035:** Monthly renewal cycles are the norm, and every remaining classical certificate must be transitioned.

An organization still renewing certificates by hand in 2028 will be doing that at 8x per year while also planning a cryptographic migration.

## What's Actually Changing in Certificates

Post-quantum cryptography changes the mathematical foundations of the signatures and key types in your TLS certificates. In practical terms:

| What You Use Today | What Replaces It | NIST Standard |
|--------------------|-----------------|---------------|
| RSA-2048/4096 (certificate signatures) | ML-DSA-44/65/87 | FIPS 204 |
| ECDSA P-256/P-384 (certificate signatures) | ML-DSA or SLH-DSA | FIPS 204 / 205 |
| ECDH / X25519 (key exchange during TLS handshake) | ML-KEM-512/768/1024 | FIPS 203 |

The transition won't be a hard cutover. During the migration period, hybrid certificates will contain both a classical signature (RSA or ECDSA) and a post-quantum signature (ML-DSA). Clients that support PQC verify both. Legacy clients verify only the classical signature. That keeps backward compatibility while adding quantum resistance.

Browsers are already moving. Chrome and Firefox ship X25519+ML-KEM hybrid key exchange today. The TLS handshake already uses PQC for key agreement. The next step is PQC in the certificates themselves, and that depends on CAs issuing hybrid or PQC-native certificates. DigiCert and others already offer test PQC certificates. Production availability is expected in 2027-2028.

## What This Means for Your Team

### If you manage fewer than 10 certificates

You probably handle renewals manually today, and that's fine for now. But when renewal frequency quadruples (March 2027) and you also need to migrate to new key types, manual processes will struggle. If renewal is automated before then, both transitions become routine renewals.

### If you manage 10-100 certificates

This is where the overlap hurts most. You have enough certificates that manual tracking is already painful, but probably not enough to justify an enterprise CLM platform, which is sold on annual contracts sized for much larger estates. You need automation at an accessible price point that handles algorithm transitions as well as renewals.

### If you manage 100+ certificates

You likely already use (or are evaluating) a CLM platform. The question is whether your platform supports PQC certificate issuance, hybrid certificate handling, and migration planning. If it doesn't, you'll be migrating your CLM platform at the same time you're migrating your certificates.

## What We're Building

KrakenKey was designed around automated issuance and renewal, for a world where certificates are issued, renewed and replaced frequently. The PQC transition fits the same model. We're shipping support in phases.

### Phase 1: PQC Visibility (2026)

Migration starts with an inventory. We're adding post-quantum readiness detection to our endpoint monitoring:

- **Algorithm detection:** When KrakenKey monitors your TLS endpoints, it identifies which key exchange and signature algorithms are in use: classical, hybrid, or PQC.
- **Quantum vulnerability scoring:** Each monitored endpoint gets a readiness score: Quantum-Vulnerable, Partially Ready (PQC key exchange but classical cert), or Quantum-Ready.
- **Dashboard view:** See the PQC status of your whole certificate estate in one view (for example, "42 of 50 endpoints are quantum-vulnerable"), then filter and sort to prioritize.

This ships before any CA offers production PQC certificates, since measuring exposure doesn't require PQC certs.

### Phase 2: Stronger Defaults (Early 2027)

We're changing our default key recommendation from RSA-2048 to ECDSA P-384. P-384 is not post-quantum, but it offers about 192-bit classical security, compared with about 112 bits for RSA-2048, with much smaller keys and signatures. The CSR generator in the dashboard now uses it by default; the CLI still defaults to P-256, and you can choose P-384 with `--key-type ecdsa-p384`.

In parallel, we're building PQC key generation into our CLI and agent tooling using production-grade cryptographic libraries.

### Phase 3: Hybrid Certificate Support (Late 2027 - 2028)

When CAs begin offering production hybrid certificates, KrakenKey will support them end-to-end:

- **PQC key generation** in our CLI, deployment agents, and (when browser APIs support it) in-browser CSR generator. Key generation stays client-side: your private keys never touch our servers, whether they're RSA, ECDSA, or ML-DSA.
- **Hybrid certificate issuance** via ACME or CA partner APIs.
- **Migration planning tools:** See all your certificates grouped by algorithm. Plan and execute bulk migrations. Renew your RSA-2048 certificates as hybrid or PQC on their next renewal cycle.

### Phase 4: Automated Migration (2028-2029)

Migration policies that apply automatically, such as "On next renewal, upgrade from RSA-2048 to hybrid ML-DSA-65." Gradual rollout with automatic rollback if issues are detected. NIST IR 8547 compliance reporting so you can demonstrate migration progress to auditors.

## Timing

The transition from SHA-1 to SHA-256 certificates took over a decade and still caused outages when browsers finally enforced it. The PQC transition is larger, since it touches every certificate. Unlike SHA-1, it comes with a published timeline: the deadlines, algorithms and standards are all final.

The organizations that automate their certificate lifecycle management now, while certificate lifetimes are still 200 days and PQC is still optional, can handle both transitions as routine renewals. Teams that wait will reach 2029 with certificates expiring every six weeks, algorithms to change, and little time left to automate.

## Resources

- [NIST IR 8547: Transition to Post-Quantum Cryptography Standards](https://csrc.nist.gov/pubs/ir/8547/ipd)
- [FIPS 204: ML-DSA (Module-Lattice-Based Digital Signature Algorithm)](https://csrc.nist.gov/pubs/fips/204/final)
- [CA/Browser Forum Ballot SC-081: Certificate Lifetime Reduction](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/)
- [KrakenKey: Free Certificate Lifecycle Management](https://krakenkey.io)

[**Start automating your certificates today. Free at krakenkey.io.**](https://krakenkey.io)

_Get started on the free tier. No credit card required._
