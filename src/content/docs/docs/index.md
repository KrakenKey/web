---
title: KrakenKey documentation
description: Guides and reference for issuing, deploying and renewing TLS certificates with KrakenKey.
sidebar:
  label: Overview
---

KrakenKey issues TLS certificates through ACME DNS-01. You do a one-time DNS setup per domain, and certificates arrive in about four minutes. Your private keys stay with you: KrakenKey only ever sees the certificate signing request.

## Start here

- **[Getting started](/docs/getting-started/)**: add a domain, set up its DNS records, and issue your first certificate.
- **[How KrakenKey fits your stack](/docs/architecture/)**: how issuance works, where the private key can live, and which setup matches what you run.
- **[Set up with an AI agent](/docs/ai-agents/)**: point your coding agent at the runbook, do the few steps that need a person, and say go.
- **[KrakenKey CLI](/docs/cli/)**: issue, submit, download and renew certificates from a terminal or CI job.
- **[API reference](/docs/api/)**: every endpoint in the KrakenKey REST API.

## Integrations

- **[nginx and HAProxy](/docs/integrations/nginx-haproxy/)**: issue on the server, point the proxy at the files, and renew with a systemd timer.
- **[Caddy](/docs/integrations/caddy/)**: load a KrakenKey wildcard with the `tls` directive for internal hosts, with no DNS credentials on the proxy.
- **[GitHub Actions](/docs/integrations/github-actions/)**: issue once, renew on a schedule, and deploy to servers over SSH only when they serve an older certificate.
- **[AWS Certificate Manager, ALB, and CloudFront](/docs/integrations/aws-acm/)**: import into ACM, keep the key in Secrets Manager, and re-import each renewal to the same ARN.
- **[Azure Key Vault, App Service, and Container Apps](/docs/integrations/azure-key-vault/)**: keep the private key in Key Vault, have KrakenKey sign its CSR, and bind the certificate in App Service or Container Apps.
