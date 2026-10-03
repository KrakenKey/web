---
title: Set up KrakenKey with an AI agent
description: Point your coding agent at the KrakenKey runbook, do the few steps that need a person, and let the agent issue and deploy the certificate.
sidebar:
  label: Set up with an AI agent
  order: 2
---

If you use a coding agent that can run shell commands (Claude Code, Codex, Cursor, Copilot agent mode and similar), it can do almost all of the KrakenKey setup for you: install the CLI, register your domain, work out the DNS records, issue the certificate and wire it into your server.

## Paste this into your agent

```text
Set up a TLS certificate from KrakenKey for example.com and www.example.com.
Follow https://krakenkey.io/agents.md
```

Swap in your own hostnames. If the agent is already working in your project, it can usually tell which hostnames and which server config it needs.

## What you'll be asked to do

The agent collects everything it needs from you into one message. Do those steps, then reply "go". Depending on what you already have, that message covers some of these:

1. **Approve the CLI login.** The agent sends a link to `app.krakenkey.io/device` with a short code. Open it, sign in (or sign up; the free plan doesn't need a card), check the code matches the one the agent gave you, and click **Approve**. That creates an API key for the agent's CLI. You never copy or paste the key, and you can revoke it under [API Keys](https://app.krakenkey.io/dashboard/api-keys).
2. **Add your domain** in the dashboard and **add the DNS records** the agent lists: a TXT record that proves you own the domain and one `_acme-challenge` CNAME per certificate name. You only do this once per domain. If your agent already has access to your DNS provider, it can create the records itself.

The agent does the rest. It waits for DNS, verifies the domain and issues the certificate with `--auto-renew`. Then it installs the key and full chain where your server expects them and checks the live certificate.

Only approve a login you or your agent just started. The approval page shows the requesting machine's name and IP address to help you check.

## What stays on your machine

The CLI generates the private key and the CSR locally. KrakenKey only receives the CSR. The runbook tells the agent never to print or upload the key, and to keep it out of version control.

## Renewals

With auto-renew on, KrakenKey renews the certificate before it expires, with no DNS changes. The renewed certificate still has to reach your server. Ask your agent to set up a scheduled `krakenkey cert download` and reload, or use the [GitHub Action](https://github.com/KrakenKey/cert-action) in CI.

## Agents without a shell

Agents that can only make HTTP requests can use the [REST API](/docs/api/) directly. The runbook includes that path. The CSR still has to be generated wherever the certificate will be used.

## For agent and tool builders

- [`/agents.md`](https://krakenkey.io/agents.md): the runbook above, written for agents.
- [`/llms.txt`](https://krakenkey.io/llms.txt): an index of the docs for LLMs.
- [Tool definitions](https://github.com/KrakenKey/KrakenKey/tree/main/tools): function-calling schemas for the API and CLI.
