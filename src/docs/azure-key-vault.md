KrakenKey can issue a public TLS certificate from a certificate signing request (CSR) created in Azure Key Vault. Key Vault keeps the private key; App Service or Container Apps imports the completed Key Vault certificate for custom-domain TLS. This guide covers **manual issuance and renewal**. No KrakenKey VM image or always-on container is required.

> **Key boundary:** KrakenKey receives the CSR (public key), never the private key. The Azure service terminating TLS must be able to use the key through Key Vault, so choose an **exportable software key**, not a non-exportable/HSM-backed key, for this integration.

The `<details>` sections below provide Portal, CLI, and Terraform routes. Terraform can provision the vault policy, access, and workload bindings, but **the external-CA CSR signing and merge are imperative operations**. Do not run a Terraform apply against a pending Key Vault certificate and assume that issuance or renewal is complete.

## Prerequisites and architecture

- A verified domain in KrakenKey with its one-time DNS setup complete; the requested CSR names must match your verified domains.
- A Key Vault and either an App Service app or Container Apps environment with a custom domain you control.
- A KrakenKey API key for `krakenkey cert submit`, provided securely via `KK_API_KEY`, and the [KrakenKey CLI](https://github.com/KrakenKey/cli).
- A Key Vault certificate policy with issuer **Unknown** (non-integrated CA), **exportable software key**, **PKCS#12** secret content type, and all hostnames in the SAN list. RSA 2048 is a conservative shared choice. Container Apps does not support ECDSA P-384/P-521 certificates.
- DNS records for the App Service or Container App custom domain, following that service's validation instructions. KrakenKey's DNS-01 setup and Azure's custom-domain validation are separate checks.

Flow: **Key Vault key + CSR → KrakenKey DNS-01 issuance → merge signed chain into Key Vault → Azure service imports the certificate → live TLS endpoint**.

If Azure's managed certificate already fits your use case, compare it before choosing an external CA. KrakenKey is useful when you want its DNS-01 workflow, portability across targets, or issuance and endpoint monitoring.

## 1. Create a pending Key Vault certificate and obtain its CSR

Use a stable certificate name. Set `issuer=Unknown`; the operation remains pending until the signed response is merged. Inspect the CSR's subject, SANs, and public key before submission.

<details>
<summary>Azure portal</summary>

Open **Key Vault → Certificates → Generate/Import → Generate**. Set **Certificate issued by a non-integrated CA**, the subject and SANs, an exportable software key, and PKCS#12 content type. Create the certificate; open its pending **Certificate Operation** and download the CSR as `request.csr.pem`. [Microsoft: create a CSR in the portal](https://learn.microsoft.com/en-us/azure/key-vault/certificates/create-certificate-signing-request).

</details>

<details>
<summary>Azure CLI</summary>

Create a policy with issuer `Unknown`, the desired subject/SANs, exportable software key, and PKCS#12 content type. Then use `az keyvault certificate create --vault-name <vault> --name <certificate> --policy @policy.json` and `az keyvault certificate pending show --vault-name <vault> --name <certificate> --query csr --output tsv`. The `csr` field is base64-encoded DER; decode it and convert to PEM before passing it to KrakenKey. Do not pass the literal base64 string as a PEM file. [Microsoft: CLI certificate-create workflow](https://learn.microsoft.com/en-us/azure/key-vault/certificates/create-certificate) · [CLI: certificate policy](https://learn.microsoft.com/en-us/cli/azure/keyvault/certificate/policy?view=azure-cli-latest) · [CLI: pending show](https://learn.microsoft.com/en-us/cli/azure/keyvault/certificate/pending?view=azure-cli-latest#az-keyvault-certificate-pending-show).

</details>

<details>
<summary>Terraform</summary>

Use Terraform to provision the vault, RBAC/access policies, and workload resources. The AzureRM [`azurerm_key_vault_certificate`](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/key_vault_certificate) policy accepts issuer `Unknown`, but it does **not** expose a complete CSR → external signing → pending merge lifecycle. For this guide, perform certificate creation/CSR extraction with the Portal or Azure CLI above; manage that certificate's lifecycle **outside Terraform** rather than configuring a competing `azurerm_key_vault_certificate` resource for the same name. [Microsoft: non-integrated issuer workflow](https://learn.microsoft.com/en-us/azure/key-vault/certificates/create-certificate-signing-request).

</details>

Inspect the request with `openssl req -in request.csr.pem -noout -text -verify`. Keep the private key in Key Vault.

## 2. Submit the CSR to KrakenKey

Use `cert submit`, not `cert issue`: the latter generates a separate local key that will not match Key Vault's pending operation.

```bash
krakenkey cert submit --csr request.csr.pem --wait \
  --out issued.crt \
  --chain-out chain.pem \
  --fullchain-out fullchain.pem
```

If issuance is still pending, use `krakenkey cert list`/`show`, then `krakenkey cert download <id> --format fullchain --out fullchain.pem`. Keep the certificate ID for tracking. Inspect `issued.crt` with `openssl x509 -in issued.crt -noout -subject -dates -ext subjectAltName`; confirm the names and key correspond to the pending CSR. [KrakenKey CLI](https://github.com/KrakenKey/cli).

<details>
<summary>Azure portal</summary>

There is no Azure Portal button that submits a CSR to KrakenKey. Download the CSR from the Portal as in step 1, then submit it through the KrakenKey CLI shown above. The Azure Portal is used again for the merge in step 3.

</details>

<details>
<summary>CLI</summary>

Run the `krakenkey cert submit` command above with `KK_API_KEY` supplied from your secret store. Do not commit the key or place it in shell history. [KrakenKey CLI](https://github.com/KrakenKey/cli).

</details>

<details>
<summary>Terraform</summary>

Terraform has no KrakenKey CSR-submission resource in this workflow. Keep issuance as an explicit external step; a `local-exec` provisioner would hide a security-sensitive, asynchronous CA operation inside `terraform apply` and would not provide reliable renewal semantics. [Terraform provisioner guidance](https://developer.hashicorp.com/terraform/language/provisioners).

</details>

## 3. Merge the signed chain into the **same pending operation**

The response must start with the issued leaf certificate and include the required intermediates. Do not upload a private key or PFX: Key Vault already has the matching key. If a merge fails, check that the chain matches this CSR and that the Key Vault policy is compatible; a certificate issued for another key cannot be merged into this operation.

<details>
<summary>Azure portal</summary>

Open the pending **Certificate Operation → Merge Signed Request** and upload the CA-issued chain (`fullchain.pem`, or the format the Portal requests). Then inspect the issued certificate version, expiry, and thumbprint. [Microsoft: merge a signed request](https://learn.microsoft.com/en-us/azure/key-vault/certificates/create-certificate-signing-request).

</details>

<details>
<summary>Azure CLI</summary>

Use `az keyvault certificate pending merge --vault-name <vault> --name <certificate> --file fullchain.pem`. Confirm the new version with `az keyvault certificate show --vault-name <vault> --name <certificate>`. [CLI: pending merge](https://learn.microsoft.com/en-us/cli/azure/keyvault/certificate/pending?view=azure-cli-latest#az-keyvault-certificate-pending-merge) · [CLI: certificate show](https://learn.microsoft.com/en-us/cli/azure/keyvault/certificate?view=azure-cli-latest#az-keyvault-certificate-show).

</details>

<details>
<summary>Terraform</summary>

The AzureRM Key Vault certificate resource has no pending-request merge operation. Merge in the Portal or CLI, then let Terraform consume the resulting **versionless Key Vault secret ID** for bindings. Avoid pinning a certificate version in the workload configuration, or renewal may not propagate. [AzureRM Key Vault certificate resource](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/key_vault_certificate) · [Microsoft: Key Vault certificate structure](https://learn.microsoft.com/en-us/azure/key-vault/certificates/about-certificates).

</details>

## 4A. Import and bind in App Service

App Service imports a private certificate from Key Vault, then binds it to an already validated custom hostname. Grant the **Microsoft Azure App Service resource provider** access as Microsoft's import guide specifies; this is not the app's managed identity. The App Service plan must support private certificates. Azure says Key Vault updates are synchronized within **24 hours**. [Microsoft: App Service import and sync](https://learn.microsoft.com/en-us/azure/app-service/configure-ssl-certificate#import-a-certificate-from-key-vault).

<details>
<summary>Azure portal</summary>

In the app, go to **Certificates → Bring your own certificates (.pfx) → Add certificate → Import from Key Vault**. Select the vault and certificate. Add and validate the custom domain, then create an **SNI TLS** binding using the imported certificate. Follow the Portal prompts for vault access if required. [Microsoft: import from Key Vault](https://learn.microsoft.com/en-us/azure/app-service/configure-ssl-certificate#import-a-certificate-from-key-vault) · [Microsoft: custom domain and TLS binding](https://learn.microsoft.com/en-us/azure/app-service/configure-ssl-bindings).

</details>

<details>
<summary>Azure CLI</summary>

After granting the App Service resource provider access and validating the hostname, use `az webapp config ssl import --resource-group <rg> --name <app> --key-vault <vault> --key-vault-certificate-name <certificate>`. Obtain the imported certificate thumbprint, then use `az webapp config ssl bind --resource-group <rg> --name <app> --certificate-thumbprint <thumbprint> --ssl-type SNI`. The import alone does not bind TLS. [CLI: import](https://learn.microsoft.com/en-us/cli/azure/webapp/config/ssl?view=azure-cli-latest#az-webapp-config-ssl-import) · [CLI: bind](https://learn.microsoft.com/en-us/cli/azure/webapp/config/ssl?view=azure-cli-latest#az-webapp-config-ssl-bind) · [CLI: custom hostname](https://learn.microsoft.com/en-us/cli/azure/webapp/config/hostname?view=azure-cli-latest).

</details>

<details>
<summary>Terraform</summary>

Use [`azurerm_app_service_certificate`](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/app_service_certificate) with the **versionless** Key Vault secret ID, plus [`azurerm_app_service_custom_hostname_binding`](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/app_service_custom_hostname_binding) and [`azurerm_app_service_certificate_binding`](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/app_service_certificate_binding). Grant the Microsoft Web App service principal the documented vault access first; use its tenant-specific **object ID**, not its fixed application ID, in an access policy. Follow the provider's certificate-binding example for the hostname binding's `ssl_state`/`thumbprint` drift handling. The Key Vault secret must already contain a completed certificate before Terraform imports it. [Microsoft: required vault access](https://learn.microsoft.com/en-us/azure/app-service/configure-ssl-certificate#import-a-certificate-from-key-vault).

</details>

## 4B. Import and bind in Container Apps

Enable a managed identity on the **Container Apps environment** and grant it **Key Vault Secrets User** on the vault (or equivalent secret-get access). Import the Key Vault **certificate secret** using a versionless secret URL, then bind it to a validated custom hostname. Azure says rotation is applied within **12 hours**. [Microsoft: Key Vault certificates in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/key-vault-certificates-manage).

<details>
<summary>Azure portal</summary>

On the **Container Apps environment**, enable a managed identity and grant vault secret access. Go to **Certificates → Bring your own certificates (.pfx) → Add certificate → Import from Key Vault** and select the certificate and identity. On the Container App, add and validate the custom domain, then select the imported certificate for TLS. [Microsoft: import from Key Vault](https://learn.microsoft.com/en-us/azure/container-apps/key-vault-certificates-manage) · [Microsoft: custom domains](https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-certificates).

</details>

<details>
<summary>Azure CLI</summary>

After identity, role assignment, and hostname validation, use `az containerapp env certificate upload --resource-group <rg> --name <environment> --certificate-name <certificate-name> --akv-url https://<vault>.vault.azure.net/secrets/<certificate-secret> --identity system` (or a user-assigned identity ID). Then bind with `az containerapp hostname bind --resource-group <rg> --name <app> --hostname <host> --certificate <environment-certificate-name-or-id>`. Check the installed `containerapp` CLI extension; Microsoft's Key Vault import options may be marked Preview. [CLI: environment certificate upload](https://learn.microsoft.com/en-us/cli/azure/containerapp/env/certificate?view=azure-cli-latest#az-containerapp-env-certificate-upload) · [CLI: hostname bind](https://learn.microsoft.com/en-us/cli/azure/containerapp/hostname?view=azure-cli-latest#az-containerapp-hostname-bind).

</details>

<details>
<summary>Terraform</summary>

Use [`azurerm_container_app_environment_certificate`](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app_environment_certificate) with its `certificate_key_vault` block (`identity` and a **versionless** `key_vault_secret_id`), then [`azurerm_container_app_custom_domain`](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app_custom_domain) with `container_app_environment_certificate_id` and `certificate_binding_type = "SniEnabled"`. Assign the environment identity **Key Vault Secrets User** before the certificate resource is created. Do not put PFX data in Terraform state. The completed Key Vault certificate secret and Azure custom-domain DNS validation must exist before the binding can succeed.

</details>

## 5. Renew and verify the live certificate

**This is not hands-off Key Vault renewal today.** Key Vault cannot automatically obtain a new certificate from KrakenKey as a non-integrated CA, and KrakenKey's normal auto-renew setting does not perform the Key Vault **new version → new CSR → sign → merge** sequence. Start well before expiry and leave margin for issuance, merge, Azure propagation, and retries. [Microsoft: renew a non-integrated CA certificate](https://learn.microsoft.com/en-us/azure/key-vault/certificates/overview-renew-certificate).

<details>
<summary>Azure portal</summary>

Start a new certificate version under the **same Key Vault certificate name**, keeping the policy and required SANs. Download its new CSR from the pending operation, submit it to KrakenKey as in step 2, and merge that new signed response as in step 3. Confirm the new version and thumbprint. Allow the Azure service to sync, then verify the live endpoint. [Microsoft: manual renewal](https://learn.microsoft.com/en-us/azure/key-vault/certificates/overview-renew-certificate).

</details>

<details>
<summary>Azure CLI</summary>

Start a new pending version with the same certificate name and intended policy (`az keyvault certificate create`), retrieve the **new** CSR with `az keyvault certificate pending show`, submit it with `krakenkey cert submit`, and merge its matching chain with `az keyvault certificate pending merge`. Confirm the latest version with `az keyvault certificate show`. Do not reuse the previous CSR or certificate chain. [CLI: create](https://learn.microsoft.com/en-us/cli/azure/keyvault/certificate?view=azure-cli-latest#az-keyvault-certificate-create) · [CLI: pending](https://learn.microsoft.com/en-us/cli/azure/keyvault/certificate/pending?view=azure-cli-latest).

</details>

<details>
<summary>Terraform</summary>

Keep the Key Vault issuance/merge step outside Terraform. If the Azure bindings use a **versionless** secret ID, a new version under the same name can be picked up by the Azure service within its documented sync window. Terraform can continue managing the access grants and bindings, but `terraform apply` does not trigger a new CSR or prove that the service rotated. [App Service sync](https://learn.microsoft.com/en-us/azure/app-service/configure-ssl-certificate#import-a-certificate-from-key-vault) · [Container Apps sync](https://learn.microsoft.com/en-us/azure/container-apps/key-vault-certificates-manage).

</details>

Verify the certificate actually served to clients, not merely the Key Vault record:

```bash
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates -fingerprint -sha256
```

Replace `example.com` with the bound hostname. Compare the live certificate's fingerprint and expiry with the new Key Vault version. Monitor both the Key Vault certificate and the public endpoint; alert if the served certificate has not rotated.

A future Azure-hosted renewal job could run this sequence with a managed identity for Key Vault and a KrakenKey API key stored in Key Vault. That bridge is **not part of this guide** and is not claimed as an existing product feature.
