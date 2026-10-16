---
title: "Introducing KrakenKey Connector"
description: "The customer-hosted connector renews and deploys certificates, checks the served certificate over TLS, and reports deployment state. Version 0.3.0 adds a read-only configuration summary."
pubDate: 2026-10-14
author: "KrakenKey Team"
tags: ["product", "engineering", "acme"]
draft: false
---

We've released [KrakenKey Connector v0.3.0](https://github.com/KrakenKey/connector/releases/tag/v0.3.0), a service you run on your own infrastructure to renew KrakenKey certificates and deploy them to your systems. It checks the certificate returned by issuance, installs it on configured targets, and can verify what the TLS endpoint actually serves.

The connector is explicitly **pre-release and pre-1.0**. Its configuration, plugin protocol and parts of the API it uses can change before v1. Version 0.3.0 adds a read-only configuration summary for enrolled connectors; the renewal and deployment lifecycle described here builds on the earlier v0 releases.

## From issuance to a checked deployment

The connector opens no listening ports. It calls KrakenKey over outbound HTTPS and uses the access available on its host to deploy certificates.

For a renewal, the configured key store creates the private key and CSR. KrakenKey receives the CSR and returns the issued certificate. Before deploying anything, the connector checks that the certificate contains the key store's public key and exactly the names in the configuration. A mismatch stops deployment.

Each target then goes through staging and activation. With a `verify` block configured, the connector makes a TLS connection using the specified hostname as SNI. The endpoint must serve the issued leaf certificate byte for byte. By default, its chain must also validate for that hostname against the system roots, or the roots configured for that check.

That distinction matters during a reload or a load balancer update: a successful write can leave an endpoint serving an older certificate. The verification window gives the target time to start serving the new one. Disabling chain validation still leaves the exact leaf comparison in place, and produces a warning.

## Failure handling has explicit limits

Targets deploy one at a time. For a target that supports the normal rollback path, a failed verification restores the previous certificate and schedules a later retry with increasing delays. Other targets are unaffected. The connector will not roll back to a previous certificate that expires within a day.

We record each lifecycle step before taking it. If issuance completes after the connector stops waiting, the next pass picks it up. If the process stops between activation and verification, the next run finishes the deployment or rolls it back using the recorded previous certificate. Previous keys remain available until all targets have moved to the new certificate.

Some cloud services poll a vault on their own schedule. For these asynchronous targets, a failed check leaves the new certificate in place and reports the target as failed, without rollback. Later passes check again until verification succeeds or another certificate replaces it. The [connector documentation](https://krakenkey.io/docs/connector/) covers service-specific pickup behavior and verification windows.

A target without a `verify` block receives no endpoint check. Its state is `activated_unverifiable`, and `validate` warns about it. Operators need to choose a verification endpoint and window that match how the target consumes certificates.

## The private-key boundary

KrakenKey never receives private keys or credentials for your systems. Key handling remains within your infrastructure and the deployment destinations you select.

The built-in `local` key store generates keys on the connector host. The Azure Key Vault key store has the vault create the key and CSR. Exportable keys can leave that vault when a configured target needs them, including deployment to files or an imported certificate service. The connector therefore needs the permissions required by those destinations.

Plugins and deployment commands run with the connector's permissions. Cloud SDK configuration and environment settings also sit inside this trust boundary because they can affect where plugins send credentials and keys.

Enrollment gives the connector an Ed25519 identity created on its host. It exchanges signed requests for scoped API keys that last an hour and stay in memory. The dashboard controls which certificates and scopes that connector can use.

## Supported stores and targets

We include the cloud plugins in the Linux packages and container image, versioned with the connector. The supported paths are:

- **Files and commands:** built-in `file` targets write PEM material for systems such as nginx and HAProxy. An `exec` target runs your deployment command.
- **Azure Key Vault:** a plugin works as both key store and target. It can retain the issued certificate where versionless consumers read it, or import into another configured vault or certificate name.
- **Azure Application Gateway v2:** a target points an existing SSL certificate entry at a specific Key Vault secret version. Its rollback restores the previous reference. This integration requires an exportable RSA Key Vault certificate and supports public Azure cloud; the gateway retrieves the key.
- **AWS Certificate Manager:** a target re-imports into an existing imported ACM certificate, preserving its ARN for attached services. It cannot overwrite an ACM-issued certificate. On the first deployment, rollback is unavailable without previous certificate and key material.

Key Vault also adds an implicit target when it serves as the key store. That makes the stored certificate part of deployment tracking even without an explicit target. The implicit target has no endpoint verification. Initial placement needs no key export, but restoring a certificate version during recovery or rollback requires export permission. An explicit target for the same destination can provide verification.

## What the dashboard receives

Enrolled connectors report target states and certificate serials after passes, including failed passes, subject to the documented authentication and backoff exceptions. Reports contain no private key material.

In v0.3.0, enrolled connectors also share a read-only configuration summary **by default**. It includes certificate IDs and names, plugin versions, target labels, verification hosts and ports, and allowlisted settings such as file directories and vault names. Commands, environment variables, cloud account IDs and ACM ARNs are excluded. KrakenKey cannot edit the host's configuration.

Set `krakenkey.share_config: false` to disable this summary. On startup, the connector requests deletion of any previously stored summary and sends none. This setting is separate from status reporting. Connectors using an API key instead of enrollment send neither status reports nor configuration summaries.

## Validate before the first pass

Start with verified domains and their challenge CNAMEs in place. Create a connector in the dashboard, restrict its certificate access, and enroll with its one-time token. Configure matching certificate IDs and names, key stores and targets. Run validation and one pass as the connector's service user:

```sh
krakenkey-connector validate --config /etc/krakenkey-connector/config.yaml
krakenkey-connector run --once --config /etc/krakenkey-connector/config.yaml
```

Validation starts the plugins, checks store/target compatibility and credentials, and asks KrakenKey about each configured certificate. A first pass renews an existing certificate so the connector has its key; a pending certificate is issued from the connector's CSR.

The [setup guide](https://krakenkey.io/docs/connector/) covers permissions and service configuration. Releases provide Linux packages, Linux and macOS binaries, and a Linux container image. Windows is unsupported. A separate [Azure deployment template](https://github.com/KrakenKey/connector/tree/main/deploy/azure) has been merged into the source repository. It deploys an Ubuntu VM in your subscription. The [reported live test](https://github.com/KrakenKey/connector/pull/33#issuecomment-6135156595) covered enrollment, renewal into Key Vault and Application Gateway serving the renewed certificate; connector verification blocks were not tested.
