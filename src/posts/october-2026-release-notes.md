---
title: "October 2026: renewal failure reporting, GitHub OIDC and probe scheduling"
description: "CLI and GitHub Action releases report failed renewals when an older certificate remains available. October also brings GitHub OIDC authentication, per-endpoint probe scheduling and the first Terraform provider release."
pubDate: 2026-10-28
author: "KrakenKey Team"
tags: ["release-notes", "product", "acme"]
draft: false
---

October's releases through October 28 update renewal failure reporting in the CLI and GitHub Action, add OIDC authentication for workflows, and change probe scheduling. The app change below is a merged PR; its production deployment has not been independently confirmed.

## App: preserve a still-valid certificate during renewal

[PR #201](https://github.com/KrakenKey/app/pull/201), merged October 14, preserves the current certificate and chain during renewal. A failed renewal keeps a still-valid certificate in `issued` status with `renewalFailedAt` and `failureReason`; expiry monitoring continues. Only a successful renewal replaces it. An expired certificate's renewal failure remains `failed`.

That retained `issued` status is the failure shape addressed by the CLI and Action patches below. The app has no tagged releases.

## CLI: report renewal failures to waiting callers

- [v0.8.2, October 14](https://github.com/KrakenKey/cli/releases/tag/v0.8.2): `renew` and `retry` with `--wait` now detect a failed renewal when the old certificate remains available. A detected renewal failure produces exit code 1 and writes no files, as detailed in [PR #65](https://github.com/KrakenKey/cli/pull/65).
- [v0.8.1, October 7](https://github.com/KrakenKey/cli/releases/tag/v0.8.1): `issue` and `submit` honor `--auto-renew=false`.
- [v0.8.0, October 6](https://github.com/KrakenKey/cli/releases/tag/v0.8.0): releases add deb/rpm packages and a Homebrew cask. Key listing includes scopes and limits.

## GitHub Action: OIDC and renewal result checks

- [v1.4.0, October 6](https://github.com/KrakenKey/cert-action/releases/tag/v1.4.0): omitting `api-key` enables GitHub OIDC authentication. Configure a repository trust policy in the dashboard and grant the job `id-token: write`; the exchange returns a 15-minute KrakenKey API key.
- The [Action README](https://github.com/KrakenKey/cert-action/blob/v1.4.2/README.md) documents optional branch, tag, environment, scope and resource restrictions, plus `trust-id` when multiple policies exist. The private key is generated on the runner and is not uploaded to KrakenKey.
- [v1.4.1, October 7](https://github.com/KrakenKey/cert-action/releases/tag/v1.4.1): the Action honors `auto-renew: false`.
- [v1.4.2, October 14](https://github.com/KrakenKey/cert-action/releases/tag/v1.4.2): before/after renewal checks detect failure even when the old certificate is retained. With `wait: true`, the step fails and downloads nothing. With `wait: false`, it cannot detect the final result.

## Probe: per-endpoint scan intervals

[v0.4.0, October 15](https://github.com/KrakenKey/probe/releases/tag/v0.4.0) adds per-endpoint API intervals. The [tagged README](https://github.com/KrakenKey/probe/blob/v0.4.0/README.md) distinguishes modes: hosted uses the API interval; connected uses the slower of the local and API intervals. Standalone keeps its local interval. The release also adds deb/rpm packages with a systemd service.

## Terraform provider: initial resource support

[v0.1.0, October 6](https://github.com/KrakenKey/terraform-provider-krakenkey/releases/tag/v0.1.0) adds resources for domains, domain verification, certificates, endpoints, endpoint regions and alert channels, plus certificate and endpoint data sources.

The [provider README](https://github.com/KrakenKey/terraform-provider-krakenkey/blob/v0.1.0/README.md) documents CSR input and waiting for issuance. Private keys remain where the caller creates them; KrakenKey receives the CSR. Names, types and behavior may change in minor releases before 1.0. Examples using write-only arguments require Terraform or OpenTofu 1.11.
