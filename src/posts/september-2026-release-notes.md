---
title: "September releases: DNS checks and renewal fixes"
description: "CLI, probe and certificate action releases tighten file permissions and failure handling. September app merges add DNS delegation checks and organization dissolution retry fixes."
pubDate: 2026-09-30
author: "KrakenKey Team"
tags: ["release-notes", "product", "acme"]
draft: false
---

September's releases cover local file permissions, container distribution and certificate workflow failures. The app changes below are September 24 merges to main; they are listed separately from tagged releases and do not establish production deployment status.

## CLI v0.4.0

[Released September 4](https://github.com/KrakenKey/cli/releases/tag/v0.4.0), with these changes documented in the [v0.4.0 changelog](https://github.com/KrakenKey/cli/blob/main/CHANGELOG.md):

- **Config permissions:** Permissions broader than `0600` now cause a configuration error and refusal to proceed, replacing the previous warning; this check is not enforced on Windows. For the default config location, use `chmod 600 ~/.config/krakenkey/config.yaml`; if `XDG_CONFIG_HOME` is set, apply the change to the config file under that directory.
- **Container images:** Images now come from `ghcr.io/krakenkey/cli`, and the Docker Hub image is no longer updated. A single OCI index covers `amd64` and `arm64`; separate per-architecture tags are no longer published.

## Probe v0.3.0

- **State-file permissions:** The [September 4 release](https://github.com/KrakenKey/probe/releases/tag/v0.3.0) changes the state file's creation mode from `0644` to `0600`, as recorded in the [changelog](https://github.com/KrakenKey/probe/blob/main/CHANGELOG.md). Existing state files retain their current permissions; the new creation mode applies when a file is first written.

## cert-action v1.2.0

- **Renewal errors:** The [September 4 release](https://github.com/KrakenKey/cert-action/releases/tag/v1.2.0) now surfaces CLI error output when renewal fails. These changes merged on August 31 and appear in the [v1.2.0 changelog](https://github.com/KrakenKey/cert-action/blob/main/CHANGELOG.md).
- **Download sequencing:** With waiting enabled, a successful renewal wait now triggers certificate downloads, even when the initial response still reports `renewing`; a failed wait stops the action. Without waiting, downloads require an `issued` status ([implementation](https://github.com/KrakenKey/cert-action/pull/25)).

## App: merged September 24

The app has no tagged releases; these entries describe merged changes.

- **Delegation preflight:** [PR #108](https://github.com/KrakenKey/app/pull/108) checks `_acme-challenge` CNAME delegation before creating an ACME account or order. It strips wildcard prefixes, deduplicates domains and follows CNAME chains up to five hops.
- **Incorrect delegation:** Missing or wrong targets produce a permanent failure with the exact corrective record in the error message, avoiding repeated validation for known incorrect delegation. Resolver errors such as timeouts or SERVFAIL warn and continue normal validation, so preflight does not replace CA validation or change the one-time delegation model.
- **Dissolution retries:** [PR #107](https://github.com/KrakenKey/app/pull/107) handles an owner's existing personal subscription and removes a failed queue job with the same ID before re-queueing, allowing the retry to execute. Conflicting live subscriptions still require manual resolution.