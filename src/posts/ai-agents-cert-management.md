---
title: "Your AI Agent Can Manage Your TLS Certificates"
description: "KrakenKey ships agent-ready API and CLI tool definitions so AI coding agents can issue, renew, and manage TLS certificates autonomously."
pubDate: 2026-03-25
author: "KrakenKey Team"
tags: ["ai", "agents", "automation", "certificates", "cli"]
draft: false
---

AI coding agents write your code, run your tests, fix your CI pipelines, and deploy your apps. But when the job calls for a TLS certificate, the workflow breaks. The agent stops. You alt-tab to a portal, click through a wizard, paste a CSR, wait, download a cert, and come back. The agent never learns how to do it.

We built KrakenKey so that doesn't have to happen.

## Certificates Are Becoming a Recurring Task

Certificate lifetimes are [shrinking fast](/blog/200-day-tls-certs-are-here). 200-day certs took effect March 15. Let's Encrypt is dropping to 45-day certs on May 13. By 2029, the industry maximum hits 47 days.

Certificate management is no longer a one-time setup. It's a recurring operational task. That makes it a perfect candidate for AI agents that already handle your other recurring operational work.

## What We Shipped

KrakenKey now includes everything an AI agent needs to manage certificates autonomously:

**AGENTS.md** — A single file at the repo root with full context: API endpoints, auth methods, rate limits, error formats, certificate lifecycle states, and environment setup. Point your agent at this file and it knows how KrakenKey works.

**Two skill sets, one repo.** The `tools/` directory ships two complete agent skill packages:

- **krakenkey-api** — Machine-readable function-calling schemas for the REST API. Compatible with the tool-use formats that Claude, GPT, Gemini, and open-source models already support. Each tool includes parameter types, auth requirements, and response schemas.
- **krakenkey-cli** — Tool definitions for the `krakenkey` command-line interface. Covers auth, domains, certificates, endpoint monitoring, and account management. Every command supports `--output json` for structured parsing.

Both include multi-step workflow guides: issue a certificate, register and verify a domain, set up endpoint monitoring, manage API keys, renew, revoke. These aren't documentation for humans. They're instructions an agent can follow without interpretation.

The agent picks whichever interface fits. Running in a terminal or CI pipeline? Use the CLI. Building an integration or working in a sandboxed environment? Use the API.

## Example: What an Agent Session Looks Like

Here's a realistic interaction. A developer asks their coding agent to set up TLS for a new service:

```
Developer: "Set up a TLS cert for staging.example.com"

Agent: I'll use KrakenKey to handle this. First, let me check if the domain is registered.

> krakenkey --output json domain list | jq '.[] | select(.hostname == "staging.example.com")'

The domain isn't registered yet. Let me add it.

> krakenkey domain add staging.example.com

You'll need to add two DNS records at your registrar:
  TXT @ → krakenkey-site-verification=abc123
  CNAME _acme-challenge → staging-example-com.acme.krakenkey.io

Let me know when those are in place.

Developer: "Done."

Agent: Verifying ownership now.

> krakenkey domain verify <domain-id>

Domain verified. Issuing the certificate.

> krakenkey cert issue --domain staging.example.com --wait

Certificate issued. Files written to:
  ./staging.example.com.key (private key — generated locally, never sent to KrakenKey)
  ./staging.example.com.crt (certificate)

Want me to install these into your nginx config?
```

The agent checked existing state, handled the human-in-the-loop DNS step, issued the cert, and offered to continue with installation. That's the kind of multi-step workflow these tool definitions are built for.

The same flow works with the REST API for agents in sandboxed environments that can't run shell commands. See the [workflow guides on GitHub](https://github.com/krakenkey/krakenkey/tree/main/tools) for both paths.

## Why Agent Tooling, Not Just an API

KrakenKey already had a REST API and a CLI. What's new is the layer on top: structured tool definitions and workflow guides designed specifically for how AI agents consume information.

An API reference tells a human developer what endpoints exist. An agent needs something different: typed parameter schemas it can validate against, explicit auth requirements per tool, multi-step procedures with clear success/failure conditions, and `--output json` so it can parse results without scraping text.

That's what the `tools/` directory provides. It's not a wrapper or a chatbot. It's the API and CLI, described in the format agents already understand.

If your agent is provisioning infrastructure, deploying an app, or setting up a new environment, it can issue the TLS certificate as part of that same workflow. No context switch. No separate toolchain.

## Get Started

1. **Create a free account** at [krakenkey.io](https://krakenkey.io) (3 domains, 10 certificates, no credit card)
2. **Create an API key** in the dashboard and set it as `KK_API_KEY` in your environment
3. **Point your agent** at [AGENTS.md](https://github.com/krakenkey/krakenkey/blob/main/AGENTS.md) for full context, and load whichever skill set fits:
   - `tools/krakenkey-cli/` if your agent runs in a terminal or CI pipeline
   - `tools/krakenkey-api/` if your agent makes HTTP requests directly

The free tier covers most individual and side-project use cases. If your agent is managing certificates across multiple domains or teams, paid plans start at $29/mo.

Star us on [GitHub](https://github.com/krakenkey/krakenkey) if this is useful. We'd love to hear what workflows you build.
