---
title: "We Built a Free TLS Scanner (And Why We're Giving It Away)"
description: "Scan any TLS endpoint for free — certificate details, chain validation, cipher suites, and trust status in seconds. Here's what it does, how it compares to alternatives, and why it's free."
pubDate: 2026-05-02
author: "KrakenKey Team"
tags: ["product", "scanner", "tls", "open-source"]
draft: false
---

We just shipped a free TLS scanner at [krakenkey.io/scanner](/scanner). No signup, no account, no email capture. Enter a hostname and get results in seconds.

## What It Checks

The scanner performs a real TLS handshake against your endpoint and reports:

- **Certificate details** — subject, SANs, issuer, validity dates, key type and size, signature algorithm, fingerprint
- **Chain validation** — depth, completeness (is the root self-signed?), and system trust verification
- **Connection metadata** — TLS version, cipher suite, OCSP stapling status, handshake latency
- **Overall health** — a simple green/yellow/red assessment based on trust, expiry, and protocol version

It runs on the same [open-source probe](https://github.com/krakenkey/probe) that powers KrakenKey's paid monitoring product. The results you see in the free scanner are identical to what our monitoring probes report.

## Why Free?

Honestly? We need users.

KrakenKey is a new platform and we're building in public. A free scanner gets our probe into more hands and gives us a channel for feedback. If you use it and think "I wish this also did X," that's exactly the kind of signal we need.

If you end up wanting continuous monitoring — automated alerts when certs expire, scans from multiple regions, historical trends — that's what the paid product does. But the scanner stands on its own as a useful tool with no strings attached.

## How It Compares to SSL Labs

[SSL Labs](https://www.ssllabs.com/ssltest/) by Qualys is the gold standard for TLS testing. Let's be transparent about where we overlap and where we don't.

**What SSL Labs does that we don't:**

- Full protocol support matrix (which TLS versions are accepted, which are refused)
- Vulnerability scanning (BEAST, POODLE, Heartbleed, ROBOT, etc.)
- Cipher preference order analysis
- HSTS header detection and preload status
- Certificate Transparency log verification
- DNS CAA record checks
- Overall letter grade (A+ through F)

That's a lot. SSL Labs is comprehensive and we're not trying to replace it.

**Where we think we add value:**

- **Speed** — our scan takes 2-5 seconds vs. 60-90 seconds for SSL Labs
- **API-friendly** — the scanner is backed by a REST API, so you can `curl` it from CI or scripts
- **Self-hostable** — the probe is open source. Run it behind your firewall in standalone mode with no account, no rate limits, and no data leaving your network
- **Same tool as monitoring** — if you upgrade to paid monitoring, the results match exactly because it's the same probe engine

We cover the most common failure modes: expired certs, broken chains, untrusted issuers, weak TLS versions. For most developers doing a quick "is my cert working?" check, that's enough. For a full audit, use SSL Labs.

## Self-Host the Probe

The scanner on our website calls a hosted instance of our probe. But you can run the same probe yourself:

```bash
docker run -d \
  -e KK_PROBE_MODE=standalone \
  -e KK_PROBE_ENDPOINTS=example.com:443,api.example.com:443 \
  -e KK_PROBE_INTERVAL=60m \
  ghcr.io/krakenkey/probe:latest
```

In standalone mode, the probe scans your configured endpoints on an interval and logs results locally. No API key, no account, no phone-home. Add it to your Docker Compose stack or run it as a systemd service.

The full source is at [github.com/krakenkey/probe](https://github.com/krakenkey/probe).

## What We Want From You

This is v1 of the scanner. We want to know:

- What checks are missing that you'd expect?
- Is the result format useful? What would you change?
- Would you use an API endpoint for this in CI/CD?
- Would a CLI flag like `krakenkey scan example.com` be useful?

Email us at <a href="mailto:feedback@krakenkey.io?subject=TLS Scanner Feedback">feedback@krakenkey.io</a> or open an issue on [GitHub](https://github.com/krakenkey/probe/issues). Every piece of feedback directly shapes what we build next.

[Try the scanner now →](/scanner)
