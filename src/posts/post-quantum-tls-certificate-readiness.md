---
title: "Post-Quantum TLS Is Coming. Every Certificate You Own Will Be Reissued."
description: "Two forces are converging on certificate management: shrinking lifetimes (47 days by 2029) and mandatory post-quantum migration (by 2035). Here's what that means and how to prepare."
pubDate: 2026-04-19
author: "KrakenKey Team"
tags: ["post-quantum", "certificates", "PQC", "compliance", "NIST", "ML-DSA", "automation"]
draft: false
---

Last week at Elevate IT in Tampa, a session on post-quantum cryptography put into words something we've been thinking about for a while. The speaker laid out the timeline: NIST has finalized the post-quantum standards, the deprecation clock is ticking, and every organization's TLS certificates will need to migrate to new algorithms. Not eventually. Within the next decade.

We walked out of that talk thinking about how this intersects with the shrinking certificate lifecycle. And the conclusion is uncomfortable: two massive forces are about to hit certificate management at the same time.

## The Two Forces

### Force 1: Certificates are expiring faster

You already know this one if you've been following our work. CA/Browser Forum Ballot SC-081 is shortening TLS certificate lifetimes on a fixed schedule:

| Date | Max Lifetime | Renewals/Year |
|------|-------------|---------------|
| March 2026 (now) | 200 days | ~2 |
| March 2027 | 100 days | ~4 |
| March 2029 | 47 days | ~8 |

By 2029, your certificates expire roughly every six weeks. Domain validation can only be reused for 10 days. At that frequency, manual renewal processes break.

### Force 2: Every certificate will need new algorithms

In August 2024, NIST finalized three post-quantum cryptography standards:

- **ML-KEM** (FIPS 203): Key encapsulation for key exchange. Replaces ECDH/X25519.
- **ML-DSA** (FIPS 204): Digital signatures. Replaces RSA and ECDSA in certificates.
- **SLH-DSA** (FIPS 205): Stateless hash-based signatures. A conservative alternative to ML-DSA.

NIST IR 8547 mandates that all quantum-vulnerable cryptographic algorithms, including RSA and ECDSA (the algorithms in virtually every TLS certificate issued today), be deprecated by 2035.

This is not hypothetical. The standards are published. The deprecation timeline is official. Every certificate in your infrastructure will eventually be reissued with quantum-resistant algorithms.

### Why They Compound

If these were happening at different times, each would be manageable. But they're converging:

- **2027:** You're renewing certificates 4x per year AND major CAs begin offering post-quantum hybrid certificates.
- **2028-2029:** You're renewing certificates 8x per year AND you need to start migrating those renewals to PQC algorithms.
- **2030-2035:** Monthly renewal cycles are the norm AND every remaining classical certificate must be transitioned.

An organization that's still manually managing certificate renewals in 2028 doesn't just have a renewal problem. It has a renewal problem and a cryptographic migration problem. Those compound into an operational crisis.

## What's Actually Changing in Certificates

Post-quantum cryptography changes the mathematical foundations of the signatures and key types in your TLS certificates. Here's the practical translation:

| What You Use Today | What Replaces It | NIST Standard |
|--------------------|-----------------|---------------|
| RSA-2048/4096 (certificate signatures) | ML-DSA-44/65/87 | FIPS 204 |
| ECDSA P-256/P-384 (certificate signatures) | ML-DSA or SLH-DSA | FIPS 204 / 205 |
| ECDH / X25519 (key exchange during TLS handshake) | ML-KEM-512/768/1024 | FIPS 203 |

The transition won't be a hard cutover. During the migration period, **hybrid certificates** will contain both a classical signature (RSA or ECDSA) and a post-quantum signature (ML-DSA). Clients that support PQC verify both. Legacy clients verify only the classical signature. This ensures backward compatibility while adding quantum resistance.

Browsers are already moving. Chrome and Firefox ship X25519+ML-KEM hybrid key exchange today. The TLS handshake already uses PQC for key agreement. The next step is PQC in the certificates themselves, and that depends on CAs issuing hybrid or PQC-native certificates. DigiCert and others already offer test PQC certificates. Production availability is expected in 2027-2028.

## What This Means for Your Team

### If you manage fewer than 10 certificates

You probably handle renewals manually today, and that's fine for now. But when renewal frequency quadruples (March 2027) and you also need to migrate to new key types, manual processes will struggle. The good news: automating now means you'll barely notice either transition.

### If you manage 10-100 certificates

This is where the compound effect hits hardest. You have enough certificates that manual tracking is already painful, but probably not enough to justify a $50K/year enterprise CLM platform. You need automation at an accessible price point, and you need it to handle algorithm transitions, not just renewals.

### If you manage 100+ certificates

You likely already use (or are evaluating) a CLM platform. The question is whether your platform supports PQC certificate issuance, hybrid certificate handling, and migration planning. If it doesn't, you'll be migrating your CLM platform at the same time you're migrating your certificates.

## What We're Building

At KrakenKey, we've been building certificate lifecycle management with automation as the foundation, not a bolt-on feature. Our architecture was designed for a world where certificates are issued, renewed, and replaced frequently. That same architecture positions us well for the PQC transition.

Here's what we're shipping, in phases:

### Phase 1: PQC Visibility (2026)

You can't migrate what you can't see. We're adding post-quantum readiness detection to our endpoint monitoring:

- **Algorithm detection:** When KrakenKey monitors your TLS endpoints, it identifies which key exchange and signature algorithms are in use: classical, hybrid, or PQC.
- **Quantum vulnerability scoring:** Each monitored endpoint gets a readiness score: Quantum-Vulnerable, Partially Ready (PQC key exchange but classical cert), or Quantum-Ready.
- **Dashboard view:** See your entire certificate estate's PQC posture at a glance. "42 of 50 endpoints are quantum-vulnerable." Filter, sort, prioritize.

This ships before any CA offers production PQC certificates. You don't need PQC certs to start understanding your exposure.

### Phase 2: Stronger Defaults (Early 2027)

We're shifting our default key algorithm recommendation from RSA-2048 to ECDSA P-384. This is not post-quantum, but it is the strongest classical option, produces smaller certificates, and prepares your infrastructure for the key size changes PQC will bring. Every new certificate you issue through KrakenKey will use a stronger algorithm by default.

Behind the scenes, we're building PQC key generation into our CLI and agent tooling using production-grade cryptographic libraries.

### Phase 3: Hybrid Certificate Support (Late 2027 - 2028)

When CAs begin offering production hybrid certificates, KrakenKey will support them end-to-end:

- **PQC key generation** in our CLI, deployment agents, and (when browser APIs support it) in-browser CSR generator. Always client-side, always zero-knowledge. Your private keys never touch our servers, whether they're RSA, ECDSA, or ML-DSA.
- **Hybrid certificate issuance** via ACME or CA partner APIs.
- **Migration planning tools:** See all your certificates grouped by algorithm. Plan and execute bulk migrations. Renew your RSA-2048 certificates as hybrid or PQC on their next renewal cycle.

### Phase 4: Automated Migration (2028-2029)

Migration policies that run on autopilot: "On next renewal, upgrade from RSA-2048 to hybrid ML-DSA-65." Gradual rollout with automatic rollback if issues are detected. NIST IR 8547 compliance reporting so you can demonstrate migration progress to auditors.

## The Window Is Now

The biggest mistake organizations make with cryptographic transitions is waiting until the deadline. The transition from SHA-1 to SHA-256 certificates took over a decade and still caused outages when browsers finally enforced it. The PQC transition will be larger. Every certificate. Every algorithm. Every organization.

But unlike SHA-1, this transition comes with a clear, published timeline. You know the deadlines. You know the algorithms. The standards are final.

The organizations that automate their certificate lifecycle management now, while certificate lifetimes are still 200 days and PQC is still optional, will absorb both transitions as routine renewal operations. Those that wait will face a 2029 where certificates expire monthly, algorithms must change, and there's no time left to automate.

We built KrakenKey because we believe certificate management should be automated, accessible, and ready for what's next. The post-quantum transition is the clearest proof that "what's next" arrives faster than most teams expect.

## Resources

- [NIST IR 8547: Transition to Post-Quantum Cryptography](https://csrc.nist.gov/pubs/ir/8547/final)
- [FIPS 204: ML-DSA (Module-Lattice-Based Digital Signature Algorithm)](https://csrc.nist.gov/pubs/fips/204/final)
- [CA/Browser Forum Ballot SC-081: Certificate Lifetime Reduction](https://cabforum.org/2025/04/11/ballot-sc-081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/)
- [KrakenKey: Free Certificate Lifecycle Management](https://krakenkey.io)

[**Start automating your certificates today. Free at krakenkey.io.**](https://krakenkey.io)

_KrakenKey is free for individuals and open-source projects. No credit card required._
