---
title: "ACME's New Proof-of-Possession Extension Drops the CSR for KEM Keys"
description: "draft-ietf-acme-pop-00 lets ACME clients prove key possession without a PKCS#10 CSR, fixing the fact that ML-KEM keys can't self-sign one. Here's the mechanism and what it means for anyone piloting post-quantum certificates."
pubDate: 2026-09-02
author: "KrakenKey Team"
tags: ["acme", "pki", "post-quantum", "ietf", "ml-kem", "protocol"]
draft: false
---

The ACME working group published [draft-ietf-acme-pop-00](https://datatracker.ietf.org/doc/draft-ietf-acme-pop/00/) on September 1. It defines an optional extension that lets a client prove possession of a certificate's private key without constructing a PKCS#10 CSR. The motivation is specific: ACME's finalize step has always assumed the client can self-sign a CSR with the key it wants certified, and that assumption fails outright for ML-KEM and other key-encapsulation keys, which cannot produce a signature at all.

## What changed

[RFC 8555 §7.4](https://datatracker.ietf.org/doc/html/rfc8555#section-7.4) requires a CSR at finalization: the client signs a CSR with the private key it wants certified, and the CA extracts the public key from that signature-verified structure. That works for RSA and ECDSA. It doesn't work for ML-KEM, because a KEM key can encapsulate and decapsulate but cannot sign anything, including its own CSR.

draft-ietf-acme-pop-00 adds a parallel path. The client declares its public key directly in the `newOrder` request via a `popKey` field, paired with a new `pop` identifier type (empty-string value, purely a signal). The CA opens a dedicated `pop-01` challenge with two modes: for signature-capable keys, the client signs a nonce; for KEM keys, the CA performs an ML-KEM encapsulation and returns `challenge_ciphertext`, the client decapsulates it, and both sides derive an HMAC via HKDF-SHA-256 that the client returns as proof. Once that authorization is valid, finalize takes an empty JSON payload, `{}`, instead of a CSR. Supported ML-KEM parameter sets (512/768/1024, per FIPS 203) are listed with their OIDs and key/ciphertext sizes in the draft's Section 5.2.

## Why it matters operationally

This isn't shipping anywhere yet: it's a -00 draft, first IETF revision, standards track. But it's the piece that was missing for ML-KEM TLS certificates to be issuable through ACME at all, which is relevant if you've been tracking post-quantum certificate timelines: a CA can publish support for ML-KEM key types all it wants, but without something like this extension, no ACME client can actually request one, because the finalize step has no way to prove possession of a key that can't sign.

Concretely, three things change if this lands:

- **ACME client libraries** (certbot, acme.sh, lego, cert-manager, step-ca's client tooling) need new challenge-handling code, because `pop-01` isn't a drop-in replacement for `http-01`/`dns-01`. It runs after order creation and gates finalize rather than gating identifier authorization.
- **ACME server implementations** (Boulder, step-ca, smallstep) need to add `popSupported` to directory metadata, implement the encapsulation/HKDF proof logic server-side, and handle key-equivalence checks (the draft requires the CA verify `popKey` differs from the account key by canonical DER comparison).
- **Revocation gets more fragile for KEM certs.** A signature key can revoke its own certificate by signing a revocation request with the certificate's private key. A KEM key can't sign anything, so revocation authority collapses entirely onto the ACME account key (Section 7.5). Lose the account key and you've lost your only in-protocol revocation path until the cert expires. Worth planning for before anyone runs ML-KEM certs on anything short-lived-renewal doesn't already cover.

## Before/after: what finalize actually sends

RFC 8555 today, any key type:

```json
POST /acme/order/1234/finalize
{
  "protected": "<JWS header>",
  "payload": "<base64url({ \"csr\": \"<base64url(DER CSR)>\" })>",
  "signature": "<account-key signature>"
}
```

Under draft-ietf-acme-pop-00, once the `pop-01` challenge has validated a KEM key, finalize carries no certificate data at all. The CA already has the validated `popKey` on file from the order:

```json
POST /acme/order/1234/finalize
{
  "protected": "<JWS header>",
  "payload": "e30",
  "signature": "<account-key signature>"
}
```

`e30` is `{}`, base64url-encoded. The `newOrder` that started it looks like this:

```json
{
  "identifiers": [
    { "type": "dns", "value": "example.com" },
    { "type": "pop", "value": "" }
  ],
  "popKey": "<base64url(DER SubjectPublicKeyInfo)>"
}
```

No CSR construction, no ASN.1 encoding on the client for the certificate request itself. That's also why the draft calls out resource-constrained devices as a secondary motivation, independent of the KEM problem.

## How KrakenKey's approach relates

This doesn't change anything in KrakenKey's flow today. Our ACME issuance is signature-key only (RSA and ECDSA), and we don't yet issue ML-KEM certificates, so there's no finalize step to modify. It's relevant if you're running your own ACME client and have PQC certificate pilots on your roadmap: the draft is one WG revision old, the pop-01 mechanics could still change before it stabilizes, and building client support against -00 today means you should expect to revise it. Worth tracking, not worth implementing against yet.
