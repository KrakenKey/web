---
title: "ACME's Persistent DNS Challenge Drops the Plaintext Account URL"
description: "draft-ietf-acme-dns-persist-02 replaces the accounturi in _validation-persist records with a hash bound to the account key and the domain it sits on. Records provisioned against -01 stop validating, and the value can no longer be templated across a fleet."
pubDate: 2026-09-23
author: "KrakenKey Team"
tags: ["acme", "dns", "pki"]
draft: false
---

The ACME working group published [draft-ietf-acme-dns-persist-02](https://datatracker.ietf.org/doc/draft-ietf-acme-dns-persist/02/) on September 20. The `accounturi` parameter in a `_validation-persist` TXT record is no longer an ACME account URL in cleartext: it is now a hashed URI computed over the account key, the account URL, and the domain the record is published at. The old form is not deprecated for a transition window, it is rejected.

## What changed

Under -01, the record was a straight transcription of your account URL into DNS, in [RFC 8659](https://datatracker.ietf.org/doc/html/rfc8659#section-4.2) `issue-value` syntax:

```
_validation-persist.example.com. IN TXT ("authority.example;"
  " accounturi=https://ca.example/acct/123")
```

[Section 4.1 of -02](https://www.ietf.org/archive/id/draft-ietf-acme-dns-persist-02.html#section-4.1) replaces that value with `<accountHashPrefix><hash-alg>/<base64url hash value>`:

```
_validation-persist.example.com. IN TXT ("authority.example;"
  " accounturi=https://ca.example/account-hash/"
  "sha-256/5SQm7n6tPh2-PlLbCKGnViTXX5z19SCN4cPGQHSk-kw")
```

The digest is `H(length_of_domain || domain_name || key || account_URL)`, where `key` is the 43 ASCII octets of the unpadded base64url SHA-256 JWK thumbprint (the same encoding already used in an ACME key authorization), and `domain_name` is the FQDN the record sits at, not the FQDN on the certificate. The `accountHashPrefix` comes from the CA's directory `meta` object. The algorithm token is a Hash Name String from the [RFC 6920](https://datatracker.ietf.org/doc/html/rfc6920#section-9.4) registry, with `sha-256` mandatory on both ends.

Section 7.2.3 gives two reasons. A raw account URL is only a URL commitment, so its integrity is no better than the channel that delivered it: poison that channel and the record binds to an account the owner never intended, which breaks RFC 8555 non-transferability. Hashing the account key closes that, because the CA recomputes the digest over the requesting account's own key. The second reason is correlation. A shared cleartext account URL appears verbatim in every domain's record, so anyone enumerating DNS can group a fleet by string match. Binding `domain_name` into the digest makes each record's value unique.

Four other wire-level changes ride along in the same revision. The challenge object's `issuer-domain-names` array is renamed `issuerDomainNames` for camelCase consistency with RFC 8555, and the CA must now also advertise `issuerDomainNames` and `accountHashPrefix` in its directory metadata. The `keyRotationPeriod` and `keyRolloverWindow` metadata fields are gone, replaced by a CA data retention obligation to keep every thumbprint an account has used for the account's lifetime. CAs must clamp an authorization's `expires` to `persistUntil` rather than treating reuse as unaffected. DNS TTL is no longer a validation data reuse limit.

## Why it matters operationally

Records in the -01 shape are already in production zones. Let's Encrypt's [February announcement](https://letsencrypt.org/2026/02/18/dns-persist-01) documents the cleartext form, and its staging environment has been serving the challenge type since spring. Anything provisioned against that example will fail a -02 validation with nothing more diagnostic than a failed challenge, because from the CA's side an unrecognized `accounturi` and a wrong one look identical.

The change that matters more for anyone managing zones at scale is that the value is now per-domain. Under -01, one TXT record value could be templated into every zone you own. Under -02, a thousand domains need a thousand distinct hashes. If your zone files come out of Terraform, an IPAM, or a hand-maintained template, the `accounturi` stops being a constant and becomes a computed field. The draft provides an opt-out (set `domain_name` to the single octet `*`, which CAs must accept) that restores a single reusable value, at the explicit cost of the correlation protection.

Account key rotation is the other trap. Rotating the account key changes every hashed URI you have ever published. The spec requires the CA to keep retaining old thumbprints so existing records keep validating, but that is a CA-side guarantee you now depend on rather than something you control, and it is subordinate to account deactivation: deactivating an account stops every one of its `_validation-persist` records immediately, evaluated from live account state at each attempt. That is the intended response to a suspected key compromise, and it is now the fastest global kill switch you have for standing authorizations.

## Computing the value

The draft's Section 10.2 doubles as a test vector. This reproduces it:

```bash
python3 - <<'EOF'
import hashlib, base64

domain      = "example.com"
thumbprint  = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
account_url = "https://ca.example/acct/123"
prefix      = "https://ca.example/account-hash/"

d = domain.encode("ascii")
msg = bytes([len(d)]) + d + thumbprint.encode("ascii") + account_url.encode("ascii")
h = base64.urlsafe_b64encode(hashlib.sha256(msg).digest()).rstrip(b"=").decode()
print(f"{prefix}sha-256/{h}")
EOF
```

```
https://ca.example/account-hash/sha-256/5SQm7n6tPh2-PlLbCKGnViTXX5z19SCN4cPGQHSk-kw
```

Swap `domain` for `*` and the length prefix becomes `0x01`, yielding `NpDnSwUthQK8zCgFdefYxAdAVPnygMLbs9US6oO-5ug`, the cross-domain reusable form. Note that no private key operation is involved. The inputs are all public or shareable, which is why -02 explicitly allows delegating record computation and publication to a DNS operator that holds no ACME credentials. It also adds a precondition before you delegate: send an authenticated POST-as-GET with an empty payload to the exact account URL you are about to hash, and confirm the account reports `status: valid`. Hashing a mistyped or attacker-supplied account URL produces a record that looks perfectly well formed and never validates.

## How KrakenKey's approach relates

This doesn't change anything in KrakenKey's flow today. We validate with `dns-01` through a one-time CNAME delegation of `_acme-challenge`, which already gives customers a set-once DNS record that works with any ACME CA, and `dns-persist-01` is not in production at any CA we issue against. We'll evaluate it once the draft stabilizes and CAs support it in production. It matters now if you run your own ACME client and have been prototyping against Let's Encrypt staging or Pebble: the records you have already published are the wrong shape, the fix requires code rather than a search and replace, and a draft that has broken its own record format once between revisions is not one to bake into zone templates yet.
