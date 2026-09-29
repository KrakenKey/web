---
title: KrakenKey documentation
description: Guides and reference for issuing, deploying and renewing TLS certificates with KrakenKey.
sidebar:
  label: Overview
---

KrakenKey issues TLS certificates through ACME DNS-01. You do a one-time DNS setup per domain, and certificates arrive in about four minutes. Your private keys stay with you: KrakenKey only ever sees the certificate signing request.

## Start here

- **[Getting started](/docs/getting-started/)**: add a domain, set up its DNS records, and issue your first certificate.
- **[KrakenKey CLI](/docs/cli/)**: issue, submit, download and renew certificates from a terminal or CI job.
- **[API reference](/docs/api/)**: every endpoint in the KrakenKey REST API.

## Integrations

- **[Azure Key Vault, App Service, and Container Apps](/docs/integrations/azure-key-vault/)**: keep the private key in Key Vault, have KrakenKey sign its CSR, and bind the certificate in App Service or Container Apps.
