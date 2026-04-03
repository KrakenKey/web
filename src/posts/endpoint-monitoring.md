---
title: "Endpoint Monitoring: Know When Your TLS Is Broken Before Your Users Do"
description: "KrakenKey now monitors your TLS endpoints from multiple regions, catching misconfigurations, expiring certificates, and broken chains before they cause outages."
pubDate: 2026-04-01
author: "KrakenKey Team"
tags: ["product", "monitoring", "tls", "endpoints"]
draft: false
---

Issuing a certificate is one step. Knowing it's actually working — on every endpoint, from every region, every day — is the step most teams skip until something breaks.

Today we're shipping endpoint monitoring in KrakenKey.

## The Problem

You renewed your cert. You deployed it. It works on your laptop. But the load balancer in eu-west-1 is still serving the old one that expires tomorrow. Or your CDN is sending an incomplete chain that Android rejects. Or someone pushed a config change that downgraded your TLS version to 1.0.

These aren't hypothetical. They're the kinds of issues that show up as a Slack message at 2 AM: "the site is down." And the root cause is always something a simple external check would have caught hours earlier.

## What We Built

KrakenKey now lets you register any TLS endpoint — yours or anyone else's — and monitor it continuously from distributed probes. Each scan captures:

- **Connection health** — success/failure, latency, TLS version, cipher suite, OCSP stapling status
- **Certificate details** — subject, SANs, issuer, serial number, expiry date, days until expiry, key type and size, signature algorithm, fingerprint
- **Chain validation** — depth, completeness, and trust verification against system root stores

You're not just checking "is port 443 open." You're getting the full picture of your TLS posture from the perspective of real clients in real locations.

### Two Ways to Monitor

**Hosted probes** — KrakenKey runs probes in multiple regions. Add a region to your endpoint and we scan it on a schedule. No infrastructure to manage.

**Connected probes** — Run the open-source [probe](https://github.com/krakenkey/probe) on your own infrastructure. It connects back to KrakenKey and scans endpoints from inside your network. This is how you monitor internal services, staging environments, or anything not reachable from the public internet.

You can assign both types to the same endpoint. Monitor `api.example.com` from our hosted regions *and* from a probe running in your datacenter to catch issues that only affect certain paths.

### On-Demand Scans

Don't want to wait for the next scheduled scan? Hit the scan endpoint and get results immediately:

```bash
# Trigger an on-demand scan
krakenkey endpoint scan <endpoint-id>

# Get the latest result from each probe
krakenkey endpoint results <endpoint-id> --latest
```

Or via the API:

```bash
curl -X POST https://api.krakenkey.io/endpoints/<id>/scan \
  -H "Authorization: Bearer $API_KEY"

curl https://api.krakenkey.io/endpoints/<id>/results/latest \
  -H "Authorization: Bearer $API_KEY"
```

### Export Everything

Need to feed results into your own dashboards or compliance tooling? Export scan history as JSON or CSV:

```bash
krakenkey endpoint results <endpoint-id> --export csv > results.csv
```

Every field from every scan, in a format you can drop into a spreadsheet, pipe into `jq`, or ingest into your observability stack.

## How It Works

The probe is a lightweight Go binary that runs a real TLS handshake against each endpoint. It's not simulating a connection or parsing a config file — it connects the same way a browser or API client would, then extracts the certificate chain and connection metadata.

Chain validation uses the system certificate store, so trust results reflect what actual clients see. If the probe says the chain is broken, your users are seeing certificate warnings.

Results flow back to KrakenKey, where you can view them in the dashboard, query them via the API, or export them for offline analysis.

## Getting Started

```bash
# Register an endpoint
krakenkey endpoint add api.example.com:443

# Add a hosted monitoring region
krakenkey endpoint region add <endpoint-id> --region us-east-1

# Or connect your own probe
krakenkey probe register --name "dc-west-probe"
```

Endpoint monitoring is available on all plans. The free plan includes 3 monitored endpoints with connected probes. Starter ($29/mo) gets 10 endpoints with 2 hosted probe regions and 5 hosted endpoints — enough to monitor your production services without running your own probe. Team and above expand from there with more regions, faster scan intervals, and longer retention. Check our [pricing page](/pricing) for full details.

If you're already using KrakenKey for certificate issuance, this is the natural next step: issue the cert, deploy it, and verify it's actually working everywhere it needs to be.

---

*KrakenKey is open source — [view on GitHub](https://github.com/krakenkey/krakenkey).*
