---
title: "Introducing KrakenKey: Automated TLS Certificate Management"
description: "KrakenKey automates TLS certificate issuance for developers. Privacy-first with client-side CSR generation, automated DNS-01 challenges, and certificates issued in ~4 minutes."
pubDate: 2026-03-18
author: "KrakenKey Team"
tags: ["launch", "product", "certificates"]
draft: false
---

Today we're launching KrakenKey — an automated TLS certificate issuance platform built for developers, by developers.

## Why KrakenKey?

Managing TLS certificates shouldn't be a manual chore. Yet for most developers, it still is. You generate a CSR, copy DNS records, wait for validation, download the cert, install it, set a calendar reminder to renew... and hope nobody forgets.

With certificate lifetimes shrinking from 398 days to 200 days starting March 2026 — and eventually down to 47 days by 2029 — manual processes simply won't scale.

KrakenKey automates the hardest part: **issuance and renewal**. Submit a CSR via our dashboard or REST API, and KrakenKey handles DNS-01 domain validation automatically. Your certificate is issued and ready in approximately 4 minutes.

## Privacy-First by Design

Unlike many certificate management tools, KrakenKey generates Certificate Signing Requests entirely client-side using the WebCrypto API. Your private key is created in your browser and never touches our servers. We only receive the CSR containing your public key — the minimum needed to issue your certificate.

## Built for Automation

KrakenKey is API-native. Every action available in the dashboard is also available via our CLI and REST API.

### The KrakenKey CLI

The fastest way to manage certificates from the terminal. Install it, authenticate, and issue a cert in three commands:

```bash
# Authenticate with your API key
krakenkey auth login

# Register and verify your domain
krakenkey domain add example.com
krakenkey domain verify <id>

# Issue a certificate — generates the CSR locally, submits it, and waits for issuance
krakenkey cert issue --domain example.com --wait
```

The CLI generates your private key and CSR locally, so your private key never leaves your machine. You can also submit an existing CSR, download certs, toggle auto-renewal, and manage API keys -- all from the command line:

```bash
# Submit your own CSR and wait for the cert
krakenkey cert submit --csr ./example.csr --wait

# Download the issued certificate
krakenkey cert download 42 --out ./example.crt

# Enable auto-renewal
krakenkey cert update 42 --auto-renew=true

# List all issued certificates
krakenkey cert list --status issued
```

Output defaults to human-readable text, but pass `--output json` for machine-readable JSON that pipes cleanly into `jq` or your scripts.

### REST API

For direct integration, every endpoint is available over REST:

```bash
# Issue a certificate
curl -X POST https://api.krakenkey.io/certs/tls \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"csr": "-----BEGIN CERTIFICATE REQUEST..."}'

# Check status
curl https://api.krakenkey.io/certs/tls/abc123

# Download certificate
curl https://api.krakenkey.io/certs/tls/abc123/download -o cert.pem
```

Whether you use the CLI or the API directly, KrakenKey fits naturally into CI/CD pipelines, infrastructure-as-code workflows, and any environment where certificates need to be managed programmatically.

## Getting Started

1. **Sign up** at [app.krakenkey.io](https://app.krakenkey.io) — free, no credit card required
2. **Add your domain** and verify ownership via DNS TXT record
3. **Generate a CSR** using our in-browser generator or your own tooling
4. **Submit and wait** — KrakenKey handles DNS-01 challenges automatically
5. **Download your certificate** — ready in ~4 minutes

## What's Included

KrakenKey already handles the full certificate lifecycle:

- Certificate expiry monitoring and email notifications
- Automated renewal workflows
- REST API with scoped API keys
- Web dashboard with full certificate management
- Free tier with 3 domains, 10 active certs, and auto-renewal

Starter ($29/mo) and Teams ($79/mo) plans are available now with expanded limits, 30-day auto-renewal windows, and team access with RBAC. Check our [pricing page](/pricing) for details.

We'd love your feedback. Sign up at [app.krakenkey.io](https://app.krakenkey.io) and let us know what you think.

---

*KrakenKey is open source — [view on GitHub](https://github.com/krakenkey/krakenkey).*
