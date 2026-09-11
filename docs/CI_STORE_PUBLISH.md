# GitHub Actions: Auto Version & Store Publishing (Chrome Web Store & Firefox Add-ons)

This repository contains automated CI/CD workflows for version management and store publishing:

1. `.github/workflows/bump-version.yml` (`Bump Version and Tag`)
   - **Trigger**: Push to `main` modifying extension code or dependencies (`package.json`, `packages/shared/**`, `apps/extension/**`).
   - **Action**: Bumps minor version in `package.json` and manifests, tags `v<version>`, pushes commit and tag, and creates GitHub Release via `release.yml`.
   - **Downstream**: Triggers `store-publish.yml` via `workflow_run`.

2. `.github/workflows/store-publish.yml` (`Extension Store Publish`)
   - **Trigger**: 
     - Push tag `v*`
     - `workflow_run` when `Bump Version and Tag` finishes on `main`
     - Manual dispatch (`workflow_dispatch`) with a tag input (e.g. `v0.26.0`)
   - **Action**: Runs two parallel jobs:
     - `publish-to-chrome-store`: Builds Chrome extension package, mints Google OAuth access token using Service Account key, uploads and submits to Chrome Web Store.
     - `publish-to-firefox-addons`: Builds Firefox extension package and signs/submits to Mozilla Add-ons (AMO) via `web-ext sign`.

---

## Required GitHub Secrets

Configure these secrets in your repository settings (**Settings > Secrets and variables > Actions**):

### Chrome Web Store (CWS)

- `GCP_SERVICE_ACCOUNT_KEY` (Required)
  - Full JSON private key content for the Google Cloud Service Account authorized for the Chrome Web Store API.
  - The workflow exchanges this key for an access token with scope `https://www.googleapis.com/auth/chromewebstore`.
- `CWS_EXTENSION_ID` (Required)
  - Extension ID from the Chrome Web Store developer dashboard or store URL.
- `CWS_PUBLISHER_ID` (Optional, recommended)
  - Your Chrome Web Store Publisher ID (found in Developer Dashboard > Account).
  - Used to automatically call `cancelSubmission` if an upload encounters `ITEM_NOT_UPDATABLE` (pending review lock), allowing automatic retry.
- `CWS_PUBLISH_TARGET` (Optional)
  - Publish target: `default` (public) or `trustedTesters`. Defaults to `default`.

### Mozilla Firefox Add-ons (AMO)

- `AMO_API_KEY` (Required, alias `AMO_JWT_ISSUER` or `WEB_EXT_API_KEY`)
  - JWT issuer key created in [AMO Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/).
- `AMO_API_SECRET` (Required, alias `AMO_JWT_SECRET` or `WEB_EXT_API_SECRET`)
  - JWT secret corresponding to `AMO_API_KEY`.
- `AMO_EXTENSION_ID` (Optional)
  - Firefox add-on ID / UUID (e.g. `arcable@extension.local` or registered AMO UUID).
- `AMO_CHANNEL` (Optional)
  - `listed` (public add-on) or `unlisted` (self-hosted signed xpi). Defaults to `listed`.

### Git / Version Bumping

- `RELEASE_PUSH_TOKEN` (Optional)
  - GitHub Personal Access Token (PAT) with `repo` and `workflow` scopes.
  - When provided, allows `bump-version.yml` to trigger tag-based workflows. If omitted, `store-publish.yml` automatically triggers via `workflow_run`.

---

## One-Time Credential Setup

### 1. Google Cloud Service Account for Chrome Web Store

1. In the [Google Cloud Console](https://console.cloud.google.com/), select or create a project.
2. Enable the **Chrome Web Store API** under **APIs & Services > Library**.
3. Under **APIs & Services > Credentials**, create a **Service Account**:
   - Grant role: Can be left empty.
4. Go to the created Service Account > **Keys** tab > **Add Key** > **Create new key** > **JSON**.
5. Save the downloaded JSON as secret `GCP_SERVICE_ACCOUNT_KEY` in GitHub.
6. Open the [Chrome Web Store Developer Dashboard](https://chromewebstore.google.com/devconsole):
   - Go to **Account** > **API access** (or grant permissions to the service account email).
   - Ensure the service account email has permission to manage the extension.
7. Add `CWS_EXTENSION_ID` and `CWS_PUBLISHER_ID` as GitHub secrets.

### 2. Mozilla Add-ons (AMO) API Keys

1. Sign in to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/).
2. Navigate to **Tools > Manage API Keys** (`https://addons.mozilla.org/developers/addon/api/key/`).
3. Generate new API credentials.
4. Copy **JWT issuer** into GitHub secret `AMO_API_KEY`.
5. Copy **JWT secret** into GitHub secret `AMO_API_SECRET`.
6. (Optional) Set `AMO_EXTENSION_ID` if overriding manifest Gecko ID.

---

## Troubleshooting

- **Google auth fails (`google-github-actions/auth`)**: Check that `GCP_SERVICE_ACCOUNT_KEY` is the raw, valid JSON content without trailing characters.
- **Upload fails with `401` or `403`**: Check that the service account is associated with your publisher account in the Chrome Web Store dashboard and has edit permissions.
- **`ITEM_NOT_UPDATABLE`**: The extension is currently pending review. Ensure `CWS_PUBLISHER_ID` is set so the script can cancel the pending submission and retry.
- **Firefox `web-ext sign` failure**: Verify `AMO_API_KEY` and `AMO_API_SECRET` are valid. Ensure the manifest version is higher than any previously submitted version on AMO.
