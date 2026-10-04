---
title: "Your AI Agent Can Manage Your TLS Certificates"
description: "KrakenKey ships agent-ready API and CLI tool definitions so AI coding agents can issue, renew, and manage TLS certificates autonomously."
pubDate: 2026-03-25
updatedDate: 2026-10-03
author: "KrakenKey Team"
tags: ["product", "certificate-lifetimes"]
draft: false
---

AI coding agents write your code, run your tests, fix your CI pipelines, and deploy your apps. But when the job calls for a TLS certificate, the workflow breaks. The agent stops. You alt-tab to a portal, click through a wizard, paste a CSR, wait, download a cert, and come back. The agent never learns how to do it. We built KrakenKey's agent tooling so that step can stay inside the agent's workflow.

## Certificates Are Becoming a Recurring Task

Certificate lifetimes are [shrinking fast](/blog/200-day-tls-certs-are-here). 200-day certs took effect March 15. Let's Encrypt is dropping to 45-day certs on May 13. By 2029, the industry maximum hits 47 days.

Certificate management is now a recurring operational task rather than a one-time setup, which makes it a good fit for AI agents that already handle your other recurring operational work.

## What We Shipped

KrakenKey now includes everything an AI agent needs to manage certificates autonomously:

**AGENTS.md**: a single file at the repo root with full context: API endpoints, auth methods, rate limits, error formats, certificate lifecycle states, and environment setup. Point your agent at this file and it knows how KrakenKey works.

The `tools/` directory ships two complete agent skill packages:

- **krakenkey-api**: machine-readable function-calling schemas for the REST API. Compatible with the tool-use formats that Claude, GPT, Gemini, and open-source models already support. Each tool includes parameter types, auth requirements, and response schemas.
- **krakenkey-cli**: tool definitions for the `krakenkey` command-line interface. Covers auth, domains, certificates, endpoint monitoring, and account management. Every command supports `--output json` for structured parsing.

Both include multi-step workflow guides: issue a certificate, register and verify a domain, set up endpoint monitoring, manage API keys, renew, revoke. They are written as instructions an agent can follow without interpretation.

The agent picks whichever interface fits: the CLI in a terminal or CI pipeline, the API when building an integration or working in a sandboxed environment.

## Example: What an Agent Session Looks Like

In this realistic interaction, a developer asks their coding agent to set up TLS for a new service:

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
  ./staging.example.com.key (private key, generated locally, never sent to KrakenKey)
  ./staging.example.com.crt (certificate)

Want me to install these into your nginx config?
```

The agent checked existing state, handled the human-in-the-loop DNS step, issued the cert, and offered to continue with installation. These tool definitions are built for that kind of multi-step workflow.

The same flow works with the REST API for agents in sandboxed environments that can't run shell commands. See the [workflow guides on GitHub](https://github.com/krakenkey/krakenkey/tree/main/tools) for both paths.

## Agent Tooling on Top of the API

KrakenKey already had a REST API and a CLI. What's new is the layer on top: structured tool definitions and workflow guides designed specifically for how AI agents consume information.

An API reference tells a human developer what endpoints exist. An agent needs something different: typed parameter schemas it can validate against, explicit auth requirements per tool, multi-step procedures with clear success/failure conditions, and `--output json` so it can parse results without scraping text.

The `tools/` directory provides that: the same API and CLI, described in the format agents already understand.

If your agent is provisioning infrastructure, deploying an app, or setting up a new environment, it can issue the TLS certificate as part of that same workflow, without a context switch or a separate toolchain.

## Get Started

Paste this into your agent, with your own hostnames:

```text
Set up a TLS certificate from KrakenKey for example.com and www.example.com.
Follow https://krakenkey.io/agents.md
```

The runbook at [krakenkey.io/agents.md](https://krakenkey.io/agents.md) tells the agent how to install the CLI, check what you already have, and work out the exact DNS records. It then asks you, in one message, for the steps that need a person: approve the agent's login in your browser (which also creates a free account: 3 domains, no credit card) and add the DNS records. Reply "go" and the agent verifies the domain, issues the certificate, and deploys it. The [AI agent setup guide](/docs/ai-agents/) walks through what to expect.

Building your own integration? Load the skill set that fits from [`tools/`](https://github.com/KrakenKey/KrakenKey/tree/main/tools):

- `tools/krakenkey-cli/` if your agent runs in a terminal or CI pipeline
- `tools/krakenkey-api/` if your agent makes HTTP requests directly

The free tier covers most individual and side-project use cases. If your agent is managing certificates across multiple domains or teams, paid plans start at $29/mo.

Star us on [GitHub](https://github.com/krakenkey/krakenkey) if this is useful. We'd love to hear what workflows you build.
