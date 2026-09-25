# Google Drive Sync — Design

Status: Accepted (design only; implementation pending)
Date: 2026-09-25

## 1. Context

Arcable currently syncs the workspace (spaces, folders, tabs, widgets, custom
CSS, run-code rules, space themes) to Raindrop.io using a Raindrop-native
mapping:

- Spaces and folders are Raindrop collections under an `Arcable v2` root.
- Tabs are bookmarks; URL variants use the `name ||| variant` title convention
  and group metadata lives in bookmark notes.
- Widgets, custom CSS, run-code rules and space themes are encoded as tagged /
  link-prefixed bookmarks in system collections (`_custom_css`, `_run_code`,
  `_space_themes`).
- Entities carry `raindropId`; the workspace carries
  `raindropRootCollectionId` and friends.

The generic parts — the local operation outbox with Lamport clocks
(`getStoredPendingOperations`, `savePendingOperation`), `applyOperation` and
`replayOperations` in `packages/shared/src/utils/syncEngine.ts` — are not tied
to Raindrop.

A Supabase backend was previously tried and removed mainly because of hosting
cost. Google Drive is free for users and needs no Arcable-operated storage.

## 2. Goals / Non-goals

Goals

- Let a user choose **Google Drive** instead of Raindrop as the sync backend,
  from both the browser extension and the web app.
- Support **migrating** the workspace between backends in either direction.
- Keep the existing Raindrop behaviour unchanged.

Non-goals

- Syncing to both backends simultaneously (or Drive as a secondary mirror).
- A browsable/editable per-tab representation inside Drive.
- Removing `raindropId` fields from the core model (deferred cleanup).
- Syncing temporary tabs (they stay local-only, as today).

## 3. Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Remote data layout | **Single snapshot file** `workspace.json` with read‑merge‑write |
| D2 | Backends at once | **One active backend**; explicit migration between them |
| D3 | Abstraction | **`SyncProvider` interface** with capability flags; Raindrop code wrapped, not rewritten |
| D4 | OAuth scope / location | **`drive.file`**, visible `Arcable/` folder in the user's My Drive |
| D5 | Extension auth | **oh-auth** (`https://oh-auth.vercel.app/auth/google`) — already supports Google, no oh-auth code change |
| D5b | Web app auth | **New Next.js route** `api/auth/callback/google`, mirroring the Raindrop callback, httpOnly cookies |
| D6 | Raindrop-only features | Hidden via provider capabilities when Drive is active |
| D7 | Change detection / backups | Poll file `version`; backups as files in `Arcable/backups/` |
| D8 | Migration safety | **Non-destructive** — source data is never deleted by a migration |

### Rationale highlights

- **D1** — One file means one or two API calls per sync, no partial-write
  states, and the JSON is the in-memory model verbatim (no bookmark encoding).
  Drive v3 has no reliable conditional write (If-Match), so concurrent writers
  from two devices inside the same few hundred milliseconds can lose the
  earlier write. This is accepted: Arcable is single-user, and the window is
  narrowed by checking `version` immediately before upload (see §6.3).
- **D4** — `drive.file` is a non-sensitive scope (no CASA security assessment)
  and gives access only to files Arcable created. Access is scoped to the
  Google Cloud project, so the extension (via oh-auth) and the web app must use
  the **same** Google OAuth client/project.
- **D5** — `chrome.identity.getAuthToken` only works in Google Chrome, not in
  Firefox, Arc, Brave, Zen, etc. The existing oh-auth broker already does the
  code exchange with the client secret, delivers tokens to the extension
  (`chrome.runtime.sendMessage` + `postMessage` fallback for Firefox) and
  exposes `POST /auth/google/refresh` with CORS.
- **D5b** — oh-auth's `webRedirectTo` only accepts same-origin relative paths,
  so it cannot hand tokens to `arcable.vercel.app`. A local callback route keeps
  tokens in httpOnly cookies, consistent with the Raindrop web flow.

## 4. Architecture

```
            ┌───────────────── packages/shared ─────────────────┐
 useWorkspace / WorkspaceManager / background worker / web API
                          │
                          ▼
                  getSyncProvider(activeProvider)
                   ┌──────┴────────┐
                   ▼               ▼
        RaindropSyncProvider   DriveSyncProvider
        (wraps raindropSync)   (driveSync + driveClient)
                   │               │
         api.raindrop.io    www.googleapis.com/drive/v3
                                   /upload/drive/v3
            └───────────────────────────────────────────────────┘
      shared: syncEngine (outbox, Lamport, applyOperation, replayOperations)
```

### 4.1 `SyncProvider` interface

New file `packages/shared/src/types/syncProvider.ts`:

```ts
export type SyncProviderId = 'raindrop' | 'drive';

export interface SyncProviderCapabilities {
  /** Full-text search over the user's non-Arcable bookmarks. */
  bookmarkSearch: boolean;
  /** Remote icon catalogue for space/folder covers. */
  collectionCoverSearch: boolean;
  /** Server-side page metadata parsing when saving a tab. */
  remoteLinkParsing: boolean;
  /** Save an arbitrary page as a bookmark outside the workspace. */
  saveBookmark: boolean;
  backups: boolean;
}

export interface SyncProviderAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface SyncRequest {
  localState?: ArcableWorkspaceData;
  pendingOps?: WorkspaceOperation[];
  deviceId?: string;
  deviceName?: string;
  /** Overwrite remote with localState (restore / migration target). */
  replaceBaseline?: boolean;
  isInitialSync?: boolean;
}

export interface SyncProvider {
  readonly id: SyncProviderId;
  readonly capabilities: SyncProviderCapabilities;
  fetchWorkspace(auth: SyncProviderAuth, activeSpaceId?: string): Promise<FetchWorkspaceResult>;
  sync(auth: SyncProviderAuth, request: SyncRequest): Promise<SyncResult>;
  createBackup(auth: SyncProviderAuth, data: ArcableWorkspaceData, deviceName: string): Promise<BackupResult>;
  listBackups(auth: SyncProviderAuth): Promise<BackupListResult>;
  restoreBackup(auth: SyncProviderAuth, backupId: string): Promise<FetchWorkspaceResult>;
}
```

- `RaindropSyncProvider` delegates to the existing `fetchRaindropWorkspace`,
  `syncWorkspaceWithRaindrop`, `createRaindropBackup`, `fetchRaindropBackups`,
  `restoreRaindropBackup`. No behavioural change; Raindrop tests keep passing.
- `SyncResult` gains an optional `remoteVersion?: string` (Drive file
  version); `collectionId`/`dataItemId` remain Raindrop-only.
- Provider-specific extras (Raindrop search, cover search, save bookmark) stay
  as their existing functions and are gated by `capabilities`.

### 4.2 Active provider state

- Stored as `arcable_active_sync_provider` (`'raindrop' | 'drive'`), default
  `'raindrop'` so existing users are unaffected.
- Extension: `chrome.storage.local`, alongside `arcable_raindrop_auth` and a
  new `arcable_google_auth` (`GoogleAuthState`, same shape as
  `RaindropAuthState` minus Raindrop fields, with `user.email/name/avatarUrl`
  from the OpenID `userinfo` endpoint).
- Web app: cookie `arcable_sync_provider` plus Google token cookies
  (`google_access_token`, `google_refresh_token`).
- Switching the active provider is only done through the migration flow or an
  explicit "use this backend" action on first login (§7).

## 5. Drive layout and file format

```
My Drive/
└── Arcable/                          (folder, appProperties.arcable=root)
    ├── workspace.json                (appProperties.arcable=workspace)
    └── backups/                      (appProperties.arcable=backups)
        └── backup-<device>-<YYYYMMDDHHmmss>.json
```

- Files are located by `appProperties` query
  (`appProperties has { key='arcable' and value='workspace' } and trashed=false`),
  not by name, so renames/moves by the user don't break sync. The resolved
  file IDs are cached locally (`driveWorkspaceFileId`, `driveRootFolderId`) and
  re-resolved on 404.
- If multiple `workspace` files are found (e.g. two first-time devices racing),
  the one with the latest `modifiedTime` wins and the others are renamed
  `workspace-conflict-<timestamp>.json` (kept, not deleted).
- The Drive-specific IDs are stored in local sync metadata, **not** in
  `ArcableWorkspaceData`, to avoid growing the Raindrop-style coupling.

`workspace.json`:

```jsonc
{
  "format": "arcable-workspace",
  "schemaVersion": 1,
  "arcableVersion": "0.133.0",       // ARCABLE_VERSION of the writer
  "updatedAt": 1790000000000,
  "updatedBy": { "deviceId": "device_…", "deviceName": "Arc on macOS" },
  "lamportSeq": 1234,                 // max Lamport seq applied
  "data": {                           // ArcableWorkspaceData minus local-only fields
    "spaces": [], "folders": [], "tabs": [],
    "widgets": [], "customCodeRules": [], "runCodeInPageRules": [],
    "activeSpaceId": "…", "version": 1
  }
}
```

- Stripped before upload: `tmpTabs`, all `raindrop*` workspace-level IDs, and
  folder `isExpanded` (already local via `setLocalFolderExpanded`).
  Entity-level `raindropId` fields are left as-is (harmless, and useful after
  migrating back).
- A reader that sees `schemaVersion` greater than it supports refuses to write
  and prompts the user to update Arcable (read-only mode), preventing an old
  client from truncating newer data.
- Payload is plain JSON (`application/json`), so sticky-note content, custom
  CSS and scripts need no escaping tricks.

## 6. Sync algorithm (Drive)

Implemented in `packages/shared/src/utils/driveSync.ts` on top of a thin REST
client `driveClient.ts` (fetch-based, no `googleapis` dependency; shared retry
policy modelled on `raindropClient`'s transport retries; handles 401 → refresh
→ retry once, 403 `rateLimitExceeded`/429 → exponential backoff).

### 6.1 Pull (`fetchWorkspace`)

1. Resolve the workspace file (cached ID or `appProperties` query).
2. `GET files/{id}?fields=id,version,modifiedTime` → if `version` equals the
   locally cached `lastPulledVersion`, return "unchanged" (one cheap request).
3. Otherwise `GET files/{id}?alt=media`, validate `format`/`schemaVersion`,
   return `data` and the new `version`.
4. No file → return empty result with `exists: false` (caller decides between
   first-time setup and migration).

### 6.2 Initial sync on a new device

Same rule as Raindrop today: if the remote file exists, adopt it as the source
of truth and discard pre-login local pending ops (`clearStoredPendingOperations`).
If it doesn't exist, offer "Start fresh" (upload local state) or
"Migrate from Raindrop" (§7).

### 6.3 Push (`sync` with pending ops)

```
remoteMeta = GET version
if remoteMeta.version != lastPulledVersion:
    remote = download()
    base   = remote.data
else:
    base   = lastPulledSnapshot            // cached copy of what we last saw
next = replayOperations(base, sortOperations(pendingOps))
verify = GET version                        // narrow the race window
if verify.version != remoteMeta.version: restart (max 3 attempts)
PATCH upload/drive/v3/files/{id}?uploadType=media  body = serialize(next)
lastPulledVersion  = response.version
lastPulledSnapshot = next
return { success, latestSnapshot: next, remoteVersion }
```

- The caller only clears the outbox (`removeStoredPendingOperations`) after a
  successful upload, exactly as today.
- `replaceBaseline: true` skips the merge and uploads `localState` directly
  (used by restore and by migration into Drive).
- Rebasing on the remote snapshot and replaying local ops is what prevents
  most lost updates; the residual race is between the verify `GET` and the
  `PATCH` (sub-second).
- Deletions are carried by `*_DELETE` ops, so a stale device cannot resurrect
  deleted entities as long as it replays ops rather than uploading its whole
  cache. A full-cache upload happens only on `replaceBaseline`.

### 6.4 Scheduling

Unchanged: the extension's `SYNC_ALARM_NAME` alarm (every 5 minutes) and the
existing debounced sync after local edits call `provider.sync(...)` instead of
`syncWorkspaceWithRaindrop`. The extension keeps serialising syncs through the
existing queue (`syncWorkspaceWithRaindropQueued` becomes provider-agnostic).

### 6.5 Backups

- `createBackup` uploads `backups/backup-<device>-<timestamp>.json` (same
  naming as `formatBackupFileName`, `.json` extension).
- `listBackups` lists files in the backups folder; `restoreBackup` downloads
  one and then syncs with `replaceBaseline: true`.
- Retention: keep the latest 30, delete older ones created by Arcable
  (applies to Drive only).

## 7. Migration

Entry point: Settings → Sync → "Switch backend…", available when signed into
both providers.

Raindrop → Drive

1. Flush the Raindrop outbox (normal sync) so Raindrop is up to date.
2. `RaindropSyncProvider.fetchWorkspace` → authoritative snapshot.
3. Automatically create a Raindrop backup (safety net).
4. `DriveSyncProvider.sync({ localState: snapshot, replaceBaseline: true })`.
   If a `workspace.json` already exists, ask the user to confirm overwrite
   (a Drive backup of the existing file is taken first).
5. Set `activeProvider = 'drive'` and clear the outbox.

Drive → Raindrop

1. Flush the Drive outbox; `DriveSyncProvider.fetchWorkspace`.
2. Create a Drive backup.
3. Strip entity `raindropId`s that no longer resolve (or all of them if the
   Raindrop `Arcable v2` root is absent) and push via
   `syncWorkspaceWithRaindrop({ localState, replaceBaseline: true })` — the
   existing restore path.
4. Set `activeProvider = 'raindrop'`; the next sync re-hydrates Raindrop IDs.

Rules

- **Non-destructive**: the source backend's data is never deleted. The UI tells
  the user where the old copy remains and that it will no longer be updated.
- Entity `id`s are preserved, so extension tab associations survive.
- Other devices must not keep writing to the old backend. The migration
  writes a marker on the source (a `migratedTo: 'drive'` marker item in the
  Raindrop `Arcable v2` root, or a `migratedTo: 'raindrop'` field in
  `workspace.json`). A device that sees the marker during sync stops syncing
  and prompts the user to switch backends.

## 8. Authentication

### 8.1 Extension

- Start: open
  `https://oh-auth.vercel.app/auth/google?scope=https://www.googleapis.com/auth/drive.file&state={"extensionId":"…"}`
  (resulting scope: `openid email profile drive.file`).
- Receive tokens via the existing `oauth_success` message handler, branching on
  `payload.provider === 'google'`.
- Refresh: `POST https://oh-auth.vercel.app/auth/google/refresh` with
  `refresh_token`. Google's refresh response omits `refresh_token`; keep the
  stored one.
- Profile: `GET https://openidconnect.googleapis.com/v1/userinfo`.
- Manifest: add host permissions `https://www.googleapis.com/*` and
  `https://openidconnect.googleapis.com/*` (Chrome and Firefox manifests).
- New background messages: `GOOGLE_GET_AUTH_STATE`, `GOOGLE_START_OAUTH`,
  `GOOGLE_LOGOUT`, plus provider-agnostic `SYNC_GET_PROVIDER`,
  `SYNC_SET_PROVIDER`, `SYNC_MIGRATE`. Existing `RAINDROP_SYNC_WORKSPACE` /
  `RAINDROP_FETCH_WORKSPACE` are generalised to `SYNC_WORKSPACE` /
  `FETCH_WORKSPACE` (old names kept as aliases for one release).

### 8.2 Web app

- `api/auth/login?provider=google` → Google authorize URL (same client ID as
  oh-auth, `access_type=offline`, `prompt=consent`, state cookie).
- `api/auth/callback/google` → exchange code, set httpOnly cookies, redirect
  with `?auth=success`, modelled on `api/auth/callback/raindrop/route.ts`.
- `api/drive/sync` (GET/POST) and `api/drive/backups` mirror the Raindrop
  routes and run the shared `DriveSyncProvider` server-side, refreshing the
  access token from the refresh cookie when expired.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

### 8.3 Google Cloud setup (manual)

- Enable the Google Drive API on the oh-auth Google Cloud project.
- Add `.../auth/drive.file` to the OAuth consent screen scopes.
- Add the web app redirect URIs (prod + `http://localhost:3000/api/auth/callback/google`).
- Publish the consent screen to **Production** — refresh tokens for apps in
  "Testing" expire after 7 days.
- Note: every app using this Google client can see files created under it with
  `drive.file`, and the consent screen shows the project's app name.

## 9. UI changes

- Settings: a "Sync backend" section with provider cards (Raindrop / Google
  Drive), sign-in state, active badge, and "Switch backend…".
- `GoogleAuthCard` next to the existing `RaindropAuthCard`.
- Header sync button label: "Sync" with provider icon instead of
  "Raindrop Sync".
- Capability gating when Drive is active:
  - `RaindropSearchInput` → searches the local workspace only.
  - Space/folder cover search → emoji / favicon picker only.
  - "Save to Raindrop" context menu → hidden.
  - `pleaseParse` → skipped; the tab keeps the browser-provided title/favicon.

## 10. Implementation plan

1. **Provider seam (no behaviour change)** — add `SyncProvider` types,
   `RaindropSyncProvider`, `getSyncProvider`; route `useWorkspace`,
   `WorkspaceManager`, the extension background and web routes through it.
2. **Drive client + provider** — `driveClient.ts`, `driveSync.ts`,
   `DriveSyncProvider`, backups; unit tests with a mocked fetch.
3. **Extension auth + provider switch** — Google auth state, oh-auth flow,
   manifest permissions, messages, settings UI, capability gating.
4. **Web app auth + routes** — Google login/callback, `api/drive/*`, UI.
5. **Migration flow** — both directions, markers, backups, confirmation UI.
6. **Docs** — README / PRIVACY.md updates (Drive data handling, scope).

## 11. Testing

- Unit (mock-first, `packages/shared/tests`): `driveSync` pull unchanged/changed,
  push rebase + replay, verify-version retry, `replaceBaseline`, schema-version
  read-only guard, duplicate workspace-file resolution, 401 refresh, 429 backoff,
  backup retention.
- Migration: Raindrop → Drive and Drive → Raindrop round trip preserves
  spaces/folders/tabs/variants/widgets/custom code/themes (reuse fixtures from
  `raindropNativeArchitecture.test.ts`).
- Regression: all existing Raindrop tests pass unchanged after step 1.
- Manual: two devices (Chrome + Firefox) editing concurrently; token expiry
  after 1 hour; sign-out and re-sign-in.

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Lost update on truly simultaneous writes | Rebase + replay, verify-version check, pre-migration backups |
| Old client overwrites newer schema | `schemaVersion` read-only guard |
| Consent screen left in Testing mode | Setup checklist §8.3 |
| Users edit/delete `workspace.json` in Drive | Validation on read; fall back to latest backup with a prompt |
| Devices still on the old backend after migration | `migratedTo` marker on the source |
