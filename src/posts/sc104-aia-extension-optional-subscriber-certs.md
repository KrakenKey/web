---
title: "SC104 Passes: The AIA Extension Is No Longer Mandatory in Subscriber Certificates"
description: "CA/Browser Forum Ballot SC104 changes authorityInformationAccess from MUST to SHOULD in TLS subscriber certificates. Two lines of redline, and the practical effect is that AIA chain repair stops being something you can rely on."
pubDate: 2026-09-09
author: "KrakenKey Team"
tags: ["cabforum", "pki"]
draft: false
---

CA/Browser Forum Ballot SC104 passed on September 3, 2026, unanimously: 21 Certificate Issuers in favor with none opposed, and all 5 Certificate Consumers in favor. It changes the `authorityInformationAccess` extension in TLS Subscriber Certificates from MUST to SHOULD. The redline is two lines, and the consequence is that a publicly-trusted certificate can now ship with no AIA extension at all and remain compliant.

## What changed

[Ballot SC104](https://cabforum.org/2026/09/03/ballot-sc104-set-presence-of-aia-extension-to-should-for-subscriber-certificates/) was proposed by Ethan Davis (Google Trust Services) and endorsed by SwissSign and DigiCert. It amends the Baseline Requirements from version 2.2.9 via [this redline](https://github.com/cabforum/servercert/compare/ad77bf1975fe1dffebb9cbdb7280eb80b94f5c45..a0f9a7e16894df52db6278952244944390c2c83d). Both edits are in Section 7.1.2.7:

- In the Subscriber Certificate Extensions table (§7.1.2.7.6), the `authorityInformationAccess` presence column goes from `MUST` to `SHOULD`.
- In §7.1.2.7.7, "The `AuthorityInfoAccessSyntax` MUST contain one or more `AccessDescription`s" becomes "If present, the `AuthorityInfoAccessSyntax` MUST contain one or more `AccessDescription`s."

This resolves a contradiction that has been sitting in the profile since OCSP became optional. §7.1.2.7.7 lists exactly two permitted access methods for subscriber certificates: `id-ad-ocsp` at MAY, and `id-ad-caIssuers` at SHOULD. Neither is mandatory. But the extension itself was MUST, and its contents had to be non-empty (RFC 5280 defines `AuthorityInfoAccessSyntax ::= SEQUENCE SIZE (1..MAX) OF AccessDescription`, so an empty AIA is not even encodable). A CA that declined OCSP, which is now entirely allowed, had no way to also decline `caIssuers`. The SHOULD was operationally a MUST. SC104 fixes that by relaxing the outer requirement rather than tightening the inner ones, which brings the subscriber profile in line with §7.1.2.10.3, where CA certificates already read "If present" with both access methods at MAY.

The IPR Review Period runs September 3 to October 3, 2026. The change lands in the Baseline Requirements after that. For reference, BR 2.3.0 (SC100, DNSSEC consolidation) took effect on September 7.

## Why it matters operationally

Nothing breaks on the effective date. SHOULD is not MUST NOT, and every major public CA populates `caIssuers` today. What SC104 removes is the guarantee that they always will, and a fair amount of TLS tooling has quietly depended on that guarantee.

The `caIssuers` URL in a leaf certificate points at the issuing intermediate. That is the repair path for a server that presents an incomplete chain. Clients split cleanly into two groups:

**Repair the chain by fetching AIA:** Windows CryptoAPI and Schannel (which also caches the fetched intermediate machine-wide), macOS Security.framework, and Chrome's built-in certificate verifier.

**Never fetch AIA:** OpenSSL, Go's `crypto/x509`, and Firefox, which [declined the feature deliberately](https://bugzilla.mozilla.org/show_bug.cgi?id=399324) on the grounds that it rewards misconfigured servers, and instead preloads known intermediates through Remote Settings. Java's PKIX validator is in this group unless you explicitly set `com.sun.security.enableAIAcaIssuers=true`.

That split is the mechanism behind the oldest bug in TLS operations: the site loads fine in a browser on a laptop and fails in curl, in a Go service, and in CI. If CAs begin exercising the new SHOULD, the first group collapses into the second and the failure mode becomes uniform. Uniform is better in the long run, because a broken chain fails everywhere instead of failing only in the places nobody tests. The transition is where the breakage lands, and monitoring that treats "Chrome is happy" as the pass condition will get less forgiving without any change on your side.

There is a second-order effect worth checking. BR §7.1.2.11.2 requires `crlDistributionPoints` in subscriber certificates that are not Short-lived and that do not carry an AIA extension with an `id-ad-ocsp` accessMethod. Dropping AIA entirely means dropping `id-ad-ocsp`, so a non-short-lived certificate with no AIA must carry a CRLDP. Revocation checking that parses an OCSP URL out of the leaf needs a CRLDP fallback path.

## Checking your own certificates

Pull what a server actually presents and inspect the leaf's AIA:

```bash
openssl s_client -connect www.example.com:443 -servername www.example.com </dev/null 2>/dev/null \
  | openssl x509 -out leaf.pem

openssl x509 -in leaf.pem -noout -ext authorityInfoAccess
```

```
Authority Information Access:
    OCSP - URI:http://ocsp.demo-ca.example/
    CA Issuers - URI:http://cacerts.demo-ca.example/IssuingCAR1.crt
```

One gotcha if you script this. On OpenSSL 3.0.13, when the requested extension is absent but others are present, `-ext` prints `No extensions in certificate`, which reads like the certificate has no extensions at all. It exits 0 either way, so test the output text, not `$?`:

```bash
openssl x509 -in leaf.pem -noout -ext authorityInfoAccess \
  | grep -q 'CA Issuers' || echo "no caIssuers: chain must be served complete"
```

The failure this protects against, reproduced against a locally generated chain:

```
$ openssl verify -CAfile root.pem leaf.pem
CN = www.example.com
error 20 at 0 depth lookup: unable to get local issuer certificate
error leaf.pem: verification failed

$ openssl verify -CAfile root.pem -untrusted int.pem leaf.pem
leaf.pem: OK
```

Error 20 is what every client in the second group returns when the intermediate is missing and there is no AIA to rescue it. The fix has always been the same: serve the full chain from the server rather than relying on the client to reconstruct it. SC104 just moves that from best practice to the only practice that is guaranteed to work.

## How KrakenKey's approach relates

This doesn't change anything in KrakenKey's flow. We deliver the full chain on issuance and renewal, and whether a given public CA continues to populate `caIssuers` is its decision, not ours. Operators running their own ACME clients should know about it, particularly anyone assembling chain files by hand or pinning deployment scripts to a fixed `fullchain.pem` layout: verify with a client that does not do AIA fetching, because that is the behavior you are actually shipping to.

Sources: [Ballot SC104](https://cabforum.org/2026/09/03/ballot-sc104-set-presence-of-aia-extension-to-should-for-subscriber-certificates/), [Baseline Requirements §7.1.2.7](https://github.com/cabforum/servercert/blob/main/docs/BR.md), [RFC 5280 §4.2.2.1](https://datatracker.ietf.org/doc/html/rfc5280#section-4.2.2.1).
