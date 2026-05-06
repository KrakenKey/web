---
title: "Microsoft Defender Silently Removed DigiCert Root CAs from Windows Trust Stores"
description: "A faulty Defender signature update on April 30 quarantined two DigiCert root certificates from Windows AuthRoot stores, breaking TLS and code-signing verification silently across enterprise environments."
pubDate: 2026-05-06
author: "KrakenKey Team"
tags: ["tls", "pki", "trust-store", "incident", "windows"]
draft: true
---

On April 30, 2026, Microsoft shipped Security Intelligence update 1.449.424.0, which introduced a detection for `Trojan:Win32/Cerdigent.A!dha`. The signature was intended to flag compromised DigiCert code-signing certificates linked to a recent misissuance incident. Instead, it matched two legitimate DigiCert root CAs and automatically quarantined them from the Windows AuthRoot certificate store. Reports of broken TLS validation and code-signing failures began surfacing on May 3.

## What Changed

Microsoft Defender's standard remediation workflow treats a positive detection as a file or registry threat and removes it. When that detection erroneously matched root CA registry entries, Defender deleted them from:

```
HKLM\SOFTWARE\Microsoft\SystemCertificates\AuthRoot\Certificates\
```

The two affected root certificates, by thumbprint:

| Certificate | Thumbprint |
|---|---|
| DigiCert Assured ID Root CA | `0563B8630D62D75ABBC8AB1E4BDFB5A899B24D43` |
| DigiCert Trusted Root G4 | `DDFB16CD4931C973A2037D3FC83A4D7D775D05E4` |

The removals were silent — no user prompt, no UAC dialog, no event log entry that most operations teams would have been watching. Affected machines continued to appear healthy from a Defender perspective; from a PKI perspective, they were missing two of the most widely deployed trust anchors in enterprise Windows environments.

Sources: [DigiCert incident blog post](https://www.digicert.com/blog/microsoft-defender-incorrectly-flagged-digicert-root-certificates-as-malware), [BleepingComputer technical report](https://www.bleepingcomputer.com/news/security/microsoft-defender-wrongly-flags-digicert-certs-as-trojan-win32-cerdigentadha/).

## Why It Matters Operationally

DigiCert Trusted Root G4 is the parent of DigiCert's ECC and modern RSA hierarchies. DigiCert Assured ID Root CA underpins a large portion of enterprise and public-internet certificates. Removing them from a machine's trust store breaks:

- **TLS handshakes** against any server whose chain terminates at either root — browsers, `curl`, Go's `net/tls`, Java's `SSLContext`, anything that relies on the Windows CryptoAPI trust store rather than a bundled root list
- **Code-signing verification** for binaries signed through DigiCert's Authenticode chain
- **OCSP and CRL fetches** that themselves use TLS, potentially cascading into certificate status failures

The insidious part: the failure mode depends on the client. Go applications on Windows that use `crypto/x509` with system roots will throw `x509: certificate signed by unknown authority`. Browsers backed by the Windows store will display an `ERR_CERT_AUTHORITY_INVALID` warning. Applications that ship their own root bundle (Firefox, Node.js with bundled OpenSSL, most JVMs with `cacerts`) were unaffected — which made the failure pattern confusing to diagnose.

## Checking and Remediating Affected Systems

Verify whether the roots are present using `certutil` or PowerShell:

```powershell
# Check for both affected roots in the machine trust store
Get-ChildItem Cert:\LocalMachine\Root |
  Where-Object {
    $_.Thumbprint -in @(
      '0563B8630D62D75ABBC8AB1E4BDFB5A899B24D43',
      'DDFB16CD4931C973A2037D3FC83A4D7D775D05E4'
    )
  } |
  Select-Object Subject, Thumbprint, NotAfter
```

If the command returns nothing, the roots were removed. To check the Defender signature version that is currently active:

```powershell
(Get-MpComputerStatus).AntivirusSignatureVersion
```

The bad signature was introduced in **1.449.424.0**. The fix landed in **1.449.430.0**. Any version from 1.449.430.0 onward both corrects the detection logic and automatically restores the quarantined registry entries. To force an immediate update rather than waiting for the next scheduled signature pull:

```powershell
Update-MpSignature
# Then verify
(Get-MpComputerStatus).AntivirusSignatureVersion
```

Or through the UI: **Windows Security → Virus & threat protection → Protection updates → Check for updates**.

If you need to restore the roots without waiting for a signature update — for example, to recover a host that cannot reach Microsoft's signature distribution infrastructure due to the very TLS failures caused by the removal — you can re-import directly:

```powershell
# Export from an unaffected machine first:
certutil -store Root 0563B8630D62D75ABBC8AB1E4BDFB5A899B24D43 DigiCertAssuredIDRootCA.cer
certutil -store Root DDFB16CD4931C973A2037D3FC83A4D7D775D05E4 DigiCertTrustedRootG4.cer

# Then on the affected machine:
certutil -addstore Root DigiCertAssuredIDRootCA.cer
certutil -addstore Root DigiCertTrustedRootG4.cer
```

## The Broader Problem

This incident is a clean illustration of why trust store integrity is not a one-time concern. The roots were in place when your monitoring last checked. The incident happened at 3 AM on a Wednesday. The failure surfaced at 9 AM when developers started getting SSL errors they couldn't explain.

Two structural lessons here. First, AV software operates at a layer below most application-level observability. A detection that removes a registry key from `HKLM\SOFTWARE\Microsoft\SystemCertificates` generates a Defender log entry, not an application-level alert. Most operations teams are not routing Windows Security event logs (Event ID 1116, 1117) into their incident management systems. Second, client-side trust store mutation is orthogonal to certificate issuance automation. Issuing and renewing certificates automatically — via ACME or any other mechanism — does nothing to protect against the trust anchor being removed on the consuming end.

KrakenKey's endpoint monitoring detects the downstream symptom: a probe connecting to your TLS endpoint from outside the affected machine will see a broken chain from that host and alert. That's the relevant signal here — not because the cert changed, but because the chain validation result did. If you are running connected probes on Windows hosts, the Defender removal would have caused those probes to fail chain validation on outbound connections, surfacing the issue as a broken endpoint rather than a certificate problem. The fix is client-side, but the detection path runs through external TLS observation.

Operators not using KrakenKey should instrument Windows Security event log (specifically Event ID 1116 — malware detected, and 1117 — malware action taken) and route those alerts to wherever TLS incidents land in your on-call stack.
