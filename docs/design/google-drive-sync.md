# Google Drive Sync — Design

Status: Implemented
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

`packages/shared/src/types/syncProvider.ts`; implementations in
`packages/shared/src/utils/syncProviders.ts`:

```ts
export type SyncProviderId = 'raindrop' | 'drive';

export interface SyncProvider {
  readonly id: SyncProviderId;
  readonly label: string;
  readonly capabilities: SyncProviderCapabilities; // bookmarkSearch, collectionCoverSearch,
                                                    // remoteLinkParsing, saveBookmark
  fetchWorkspace(token: string, activeSpaceId?: string): Promise<FetchWorkspaceResult>;
  sync(token: string, request: SyncRequest): Promise<SyncResult>;
  createBackup(token: string, data: ArcableWorkspaceData, deviceName?: string): Promise<CreateBackupResult>;
  /** True when `data` has never been hydrated from this backend on this device. */
  isInitialSync(data: ArcableWorkspaceData | undefined | null): boolean;
}
```

- Providers take a plain access token; the caller (extension background,
  web route) is responsible for refreshing it.
- `raindropSyncProvider` delegates to the existing `fetchRaindropWorkspace`,
  `syncWorkspaceWithRaindrop` and `createRaindropBackup` without behavioural
  change. `isInitialSync` = no `raindropRootCollectionId`.
- `driveSyncProvider` delegates to `driveSync.ts`. `isInitialSync` = no
  `driveWorkspaceFileId`.
- `FetchWorkspaceResult` carries `exists` (backend has no workspace yet) and
  `migratedTo`; `SyncResult` gains `migratedTo`.
- Remote backup listing/restore is not part of the interface: the existing
  Backup & Restore modal is local-file based and doesn't use it.
- Provider-specific extras (Raindrop search, cover search, save bookmark) stay
  as their existing functions; surfaces pass them to `WorkspaceManager` only
  when Raindrop is the active backend.

### 4.2 Active provider state

- Key `arcable_sync_provider` (`'raindrop' | 'drive'`), default `'raindrop'` so
  existing users are unaffected.
- Extension: `browser.storage.local`, alongside `arcable_raindrop_auth` and
  `arcable_google_auth` (`GoogleAuthState`: tokens, `expiresAt`, and
  `user.id/name/email/avatarUrl` from the OpenID `userinfo` endpoint).
- Web app: httpOnly cookies `arcable_sync_provider`, `google_access_token`,
  `google_refresh_token` (plus the existing Raindrop cookies).
- Signing in to a backend makes it active unless the currently active backend
  is still signed in; switching between two signed-in backends goes through
  the migration flow (§7). A "Use …" action switches without copying when the
  active backend is signed out.

## 5. Drive layout and file format

```
My Drive/
└── Arcable/                          (folder, appProperties.arcable=root)
    ├── workspace.json                (appProperties.arcable=workspace)
    ├── archive.json                  (appProperties.arcable=archive)
    └── backups/                      (appProperties.arcable=backups)
        └── backup-<device>-<YYYYMMDDHHmmss>.json   (appProperties.arcable=backup)
```

- Files are located by `appProperties` query
  (`appProperties has { key='arcable' and value='workspace' } and trashed=false`),
  not by name, so renames/moves by the user don't break sync.
- If multiple `workspace` files are found (e.g. two first-time devices racing),
  the one with the latest `modifiedTime` wins and the others are renamed
  `workspace-conflict-<timestamp>.json` with `arcable=conflict` (kept, not deleted).
- The device's view of the remote file is stored in the workspace itself as
  `driveWorkspaceFileId` / `driveWorkspaceVersion`, mirroring how
  `raindropRootCollectionId` already drives Raindrop's initial-sync detection.
  Both are stripped before upload. `applyOperation`, `replayOperations`, the
  workspace storage reader and `applyLatestSnapshot` preserve them.

`workspace.json`:

```jsonc
{
  "format": "arcable-workspace",
  "schemaVersion": 1,
  "arcableVersion": "0.133.0",       // ARCABLE_VERSION of the writer
  "updatedAt": 1790000000000,
  "updatedBy": { "deviceId": "device_…", "deviceName": "Arc on macOS" },
  "lamportSeq": 1234,                 // max Lamport seq of the ops in this write
  "migratedTo": "raindrop",           // only after migrating away (read-only)
  "data": {                           // ArcableWorkspaceData minus local-only fields
    "spaces": [], "folders": [], "tabs": [],
    "widgets": [], "customCodeRules": [], "runCodeInPageRules": [],
    "activeSpaceId": "…", "version": 1
  }
}
```

- Stripped before upload: `tmpTabs`, `devices`, all workspace-level
  `raindrop*` IDs and the `drive*` IDs. Entity-level `raindropId` fields are
  left as-is (harmless).
- A reader that sees `schemaVersion` greater than it supports refuses to write
  (read-only mode, error asks the user to update Arcable).
- A bare `ArcableWorkspaceData` JSON (e.g. a backup copied in by hand) is also
  accepted on read.

## 6. Sync algorithm (Drive)

`packages/shared/src/utils/driveSync.ts` on top of a thin fetch-based REST
client `driveClient.ts` (no `googleapis` dependency). The client retries
429, 5xx and 403 `rateLimitExceeded`/`userRateLimitExceeded` with exponential
backoff, and transport failures for GETs. 401 surfaces as `DriveApiError`
(`isDriveAuthError`); callers refresh tokens proactively before they expire.

### 6.1 Pull (`fetchWorkspace`)

1. Resolve the layout by `appProperties` (one list call each for the folder and
   the workspace file).
2. No workspace file → `{ success: true, exists: false }`. The extension
   background and the web page then seed Drive from the device's cache with a
   `replaceBaseline` sync (first use of an empty Drive).
3. Otherwise download, validate `format`/`schemaVersion`, and return the
   hydrated workspace (`tmpTabs: []`, `driveWorkspaceFileId/Version` set).
   A `migratedTo` marker returns `{ success: false, migratedTo }`.

### 6.2 Push (`sync`)

```
for attempt in 1..3:
  meta = resolve layout                       // includes file version
  no file            → create workspace.json from localState, done
  replaceBaseline    → upload localState, done
  initial            = no local driveWorkspaceFileId (or a different file)
  remoteChanged      = initial || meta.version != local.driveWorkspaceVersion
  remote             = download() if remoteChanged or archive ops pending
  remote.migratedTo  → fail with migratedTo
  initial            → return remote (caller discards pre-login outbox)
  no pending ops     → return remote if changed, else nothing
  next = remoteChanged ? replayOperations(remote, pendingOps) : localState
  if GET version != meta.version: retry       // narrow the race window
  PATCH upload/drive/v3/files/{id}?uploadType=media  body = serialize(next)
  append archived subtrees to archive.json
  return next with the new version
```

- **Fast path**: when nobody else wrote since this device's last read, the
  exact local state is uploaded, so edits that don't emit operations (e.g.
  ordering) are never lost.
- **Rebase path**: when another device wrote, this device's queued operations
  are replayed on the freshly downloaded remote snapshot.
- The caller only clears the outbox after a successful upload, exactly as
  today. `WorkspaceManager` applies Drive results as full snapshots (it only
  uses `mergeIncrementalSyncSnapshot` for Raindrop).
- The residual race is between the verify `GET` and the `PATCH` (sub-second).

### 6.3 Scheduling

Unchanged: the extension's 5-minute alarm and the debounced sync after local
edits go through the same serialized queue (`runQueuedWorkspaceSync`), which
now calls `provider.sync(...)` for the active backend.

### 6.4 Archive and backups

- `*_ARCHIVE` operations append the removed subtree (taken from the remote
  snapshot before the operation) to `Arcable/archive.json`.
- `createDriveBackup` writes `backups/backup-<device>-<timestamp>.json` and keeps
  the newest 30 (`DRIVE_BACKUP_RETENTION`). Used by migration.

## 7. Migration

`migrateWorkspace({ from, to, fromToken, toToken, localState, pendingOps })` in
`syncProviders.ts`, called by the extension background (`SYNC_MIGRATE`) and the
web route `POST /api/sync/migrate`. Entry points: Extension Settings → Sync →
Sync Backend, and the **Backend** button in the web app (shared
`SyncBackendCard`, with a confirmation dialog).

1. Flush the local outbox to the source backend.
2. Read the source workspace; create a source backup (abort if it fails).
3. Write the target:
   - **→ Drive**: back up an existing `workspace.json`, then write with
     `replaceBaseline`.
   - **→ Raindrop**: rename an existing `Arcable v2` root to
     `Arcable v2 (replaced YYYY-MM-DD)` (never deleted), then materialize the
     workspace in a fresh root through the existing restore path
     (`replaceBaseline`). Remote identities are stripped and every
     space/folder/tab is marked changed, so Raindrop creates them all.
4. Mark the source as migrated:
   - Raindrop: a `data-v2-migrated-to-drive.json.txt` file in the Arcable root.
     The name matches the retired `data-v*.json.txt` pattern, so all existing
     clients already hide it.
   - Drive: `migratedTo: 'raindrop'` in `workspace.json`.
5. The device stores the target snapshot, clears its outbox and switches its
   active backend.

Rules

- **Non-destructive**: nothing is deleted on either side.
- Entity `id`s are preserved, so extension tab associations survive.
- Another device that sees the marker on fetch or sync switches its own active
  backend to the target automatically (and shows the target's login screen if
  it isn't signed in there). Unsynced local edits on that device are discarded,
  as with any initial hydration.
- Migrating back re-activates a backend: the Raindrop marker leaves with the
  renamed root, and a `replaceBaseline` write replaces a Drive file that has
  `migratedTo`.

## 8. Authentication

### 8.1 Extension

- Start (`GOOGLE_START_OAUTH`): open a tab at
  `https://oh-auth.vercel.app/auth/google?scope=https://www.googleapis.com/auth/drive.file&state={"extensionId":"…","provider":"google"}`
  (resulting scope: `openid email profile drive.file`).
- oh-auth delivers `{ type: 'oauth_success', provider: 'google', tokens }` via
  `chrome.runtime.sendMessage` (handled by `onMessageExternal`) and
  `postMessage` (relayed by the `oauth-bridge` content script). Both handlers
  branch on `provider === 'google'`.
- Refresh (`getValidGoogleAccessToken`): 2 minutes before expiry,
  `POST https://oh-auth.vercel.app/auth/google/refresh`, single-flight. Google's
  refresh response omits `refresh_token`, so the stored one is kept. A
  revoked/expired grant signs the user out.
- Manifest: host permissions `https://www.googleapis.com/*` and
  `https://openidconnect.googleapis.com/*` (Chrome and Firefox).
- Messages: `GOOGLE_GET_AUTH_STATE`, `GOOGLE_START_OAUTH`, `GOOGLE_LOGOUT`,
  `SYNC_GET_PROVIDER`, `SYNC_SET_PROVIDER`, `SYNC_MIGRATE`. The existing
  `RAINDROP_FETCH_WORKSPACE` / `RAINDROP_SYNC_WORKSPACE` messages keep their
  names but now serve the active backend.

### 8.2 Web app

- `GET /api/auth/google/login` → Google authorize URL (`access_type=offline`,
  `prompt=consent`, random state in an httpOnly cookie).
- `GET /api/auth/callback/google` → strict state check, code exchange with
  `GOOGLE_CLIENT_SECRET`, httpOnly token cookies, redirect `?auth=success`.
- `POST /api/auth/google/logout`, `GET /api/sync/session` (active backend and
  Google user), `POST /api/sync/provider`, `POST /api/sync/migrate`.
- `GET/POST /api/drive/sync` mirror `/api/raindrop/sync` and run
  `driveSyncProvider` server-side, refreshing the access token from the
  refresh cookie when the access cookie has expired.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Use
  the same Google Cloud project as oh-auth.

### 8.3 Google Cloud setup (manual)

- Enable the Google Drive API on the oh-auth Google Cloud project.
- Add `.../auth/drive.file` to the OAuth consent screen scopes.
- Add the web app redirect URIs (prod + `http://localhost:3000/api/auth/callback/google`).
- Publish the consent screen to **Production** — refresh tokens for apps in
  "Testing" expire after 7 days.
- Note: every app using this Google client can see files created under it with
  `drive.file`, and the consent screen shows the project's app name.

## 9. UI changes

- `SyncBackendCard` (shared): Raindrop / Google Drive rows with Active /
  Connected badges, Connect / Disconnect Google, "Move workspace to …" and
  "Use …" actions. Shown in Extension Settings → Sync and in a web app modal.
- Sidepanel and web login screens offer both backends; sync button labels,
  toasts and archive confirmations name the active backend.
- "Open Raindrop Archive" becomes "Open Arcable Folder in Drive" / "Open in
  Google Drive" when Drive is active.
- Capability gating when Drive is active: Raindrop search (local filtering
  only), collection cover search, and "Save to Raindrop" are not passed to the
  workspace UI.

## 10. Implementation status

All phases are implemented:

1. Provider seam — `SyncProvider`, `raindropSyncProvider`, `getSyncProvider`;
   `WorkspaceManager`, the extension background and web routes go through it.
2. Drive client + provider — `driveClient.ts`, `driveSync.ts`, backups, archive.
3. Extension — Google auth via oh-auth, provider switching, settings UI,
   capability gating.
4. Web app — Google login/callback, `api/drive/sync`, `api/sync/*`, UI.
5. Migration — both directions, markers, backups, confirmation UI.
6. Docs — README and PRIVACY.md.

## 11. Testing

- `packages/shared/tests/driveSync.test.ts` (in-memory Drive mock,
  `tests/helpers/mockDrive.ts`): first sync, fetch, read-only unchanged sync,
  fast path, rebase on concurrent write, verify-version retry, pull, initial
  sync adoption, archive, schema guard, duplicate files, rate-limit retry,
  backup retention, migrated marker.
- `packages/shared/tests/syncMigration.test.ts` (Drive + Raindrop mocks):
  Raindrop → Drive → Raindrop → Drive round trip preserves spaces, folders and
  tabs; checks backups, markers and root renaming.
- Regression: all existing tests pass unchanged.
- Manual (to do): two devices (Chrome + Firefox) editing concurrently; token
  expiry after 1 hour; sign-out and re-sign-in; migration with a second device
  open.

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Lost update on truly simultaneous writes | Rebase + replay, verify-version check, pre-migration backups |
| Old client overwrites newer schema | `schemaVersion` read-only guard |
| Consent screen left in Testing mode | Setup checklist §8.3 |
| Users edit/delete `workspace.json` in Drive | Validation on read stops sync with an error; deleting it re-seeds from the device cache; backups in `Arcable/backups/` |
| Devices still on the old backend after migration | `migratedTo` marker on the source |
