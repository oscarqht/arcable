import type { ArcableWorkspaceData } from '../types/workspace';
import type { SyncResult, WorkspaceOperation } from '../types/sync';
import type {
  MigrationResult,
  SyncProvider,
  SyncProviderCapabilities,
  SyncProviderId,
} from '../types/syncProvider';
import {
  createRaindropBackup,
  fetchRaindropWorkspace,
  retireRaindropArcableRoot,
  setRaindropMigrationMarker,
  syncWorkspaceWithRaindrop,
} from './raindropSync';
import {
  createDriveBackup,
  fetchDriveWorkspace,
  markDriveWorkspaceMigrated,
  syncWorkspaceWithDrive,
} from './driveSync';
import { createWorkspaceOperation } from './syncEngine';

/** Persisted per device (extension storage / web cookie / localStorage). */
export const ACTIVE_SYNC_PROVIDER_STORAGE_KEY = 'arcable_sync_provider';
export const DEFAULT_SYNC_PROVIDER: SyncProviderId = 'raindrop';

export const SYNC_PROVIDER_CAPABILITIES: Record<SyncProviderId, SyncProviderCapabilities> = {
  raindrop: {
    bookmarkSearch: true,
    collectionCoverSearch: true,
    remoteLinkParsing: true,
    saveBookmark: true,
  },
  drive: {
    bookmarkSearch: false,
    collectionCoverSearch: false,
    remoteLinkParsing: false,
    saveBookmark: false,
  },
};

export const SYNC_PROVIDER_LABELS: Record<SyncProviderId, string> = {
  raindrop: 'Raindrop.io',
  drive: 'Google Drive',
};

export function normalizeSyncProviderId(value: unknown): SyncProviderId {
  return value === 'drive' ? 'drive' : DEFAULT_SYNC_PROVIDER;
}

export const raindropSyncProvider: SyncProvider = {
  id: 'raindrop',
  label: SYNC_PROVIDER_LABELS.raindrop,
  capabilities: SYNC_PROVIDER_CAPABILITIES.raindrop,
  fetchWorkspace: (token, activeSpaceId) => fetchRaindropWorkspace(token, activeSpaceId),
  sync: (token, request) => syncWorkspaceWithRaindrop(token, request),
  async createBackup(token, data, deviceName) {
    const result = await createRaindropBackup(token, { workspaceData: data, deviceName });
    return { success: result.success, fileName: result.fileName, error: result.error };
  },
  isInitialSync: (data) => !data?.raindropRootCollectionId,
};

export const driveSyncProvider: SyncProvider = {
  id: 'drive',
  label: SYNC_PROVIDER_LABELS.drive,
  capabilities: SYNC_PROVIDER_CAPABILITIES.drive,
  fetchWorkspace: (token, activeSpaceId) => fetchDriveWorkspace(token, activeSpaceId),
  sync: (token, request) => syncWorkspaceWithDrive(token, request),
  createBackup: (token, data, deviceName) => createDriveBackup(token, data, deviceName),
  isInitialSync: (data) => !data?.driveWorkspaceFileId,
};

export function getSyncProvider(id: SyncProviderId | string | undefined | null): SyncProvider {
  return normalizeSyncProviderId(id) === 'drive' ? driveSyncProvider : raindropSyncProvider;
}

/** Removes every remote identity so the workspace materializes as new entities in another backend. */
export function stripRemoteIdentities(data: ArcableWorkspaceData): ArcableWorkspaceData {
  const {
    raindropRootCollectionId: _root,
    raindropArchiveCollectionId: _archive,
    raindropSpaceThemeCollectionId: _themes,
    raindropMetadataItemId: _metadata,
    driveWorkspaceFileId: _file,
    driveWorkspaceVersion: _version,
    ...rest
  } = data;
  const withoutId = <T extends { raindropId?: number }>(entity: T): T => {
    const { raindropId: _id, ...other } = entity;
    return other as T;
  };
  return {
    ...rest,
    spaces: (data.spaces || []).map((space) => {
      const { themeRaindropId: _theme, ...other } = withoutId(space);
      return other;
    }),
    folders: (data.folders || []).map(withoutId),
    tabs: (data.tabs || []).map(withoutId),
    widgets: (data.widgets || []).map(withoutId),
    customCodeRules: (data.customCodeRules || []).map(withoutId),
    runCodeInPageRules: (data.runCodeInPageRules || []).map(withoutId),
    tmpTabs: [],
  };
}

/**
 * Raindrop skips entities whose ID looks like a Raindrop ID but is missing
 * remotely, unless an operation marks them as changed. Mark every tree entity
 * changed so a migrated workspace is created in full.
 */
function markAllTreeEntitiesChanged(data: ArcableWorkspaceData, deviceId: string): WorkspaceOperation[] {
  const now = Date.now();
  return [
    ...data.spaces.map((space) => createWorkspaceOperation('SPACE_UPDATE', space.id, undefined, deviceId, now, 0)),
    ...data.folders.map((folder) => createWorkspaceOperation('FOLDER_UPDATE', folder.id, undefined, deviceId, now, 0)),
    ...data.tabs.map((tab) => createWorkspaceOperation('TAB_UPDATE', tab.id, undefined, deviceId, now, 0)),
  ];
}

export interface MigrateWorkspaceOptions {
  from: SyncProviderId;
  to: SyncProviderId;
  fromToken: string;
  toToken: string;
  /** Local cache and outbox; the outbox is flushed to the source before reading it. */
  localState?: ArcableWorkspaceData;
  pendingOps?: WorkspaceOperation[];
  deviceId?: string;
  deviceName?: string;
}

/**
 * Copies the workspace from one backend to another without deleting anything:
 * the source gets a backup and a "migrated" marker, and an existing target
 * workspace is backed up (Drive) or renamed aside (Raindrop) before it is replaced.
 */
export async function migrateWorkspace(options: MigrateWorkspaceOptions): Promise<MigrationResult> {
  const { from, to, fromToken, toToken } = options;
  const fail = (error: string): MigrationResult => ({ success: false, from, to, error });
  if (from === to) return fail('Source and target backends are the same.');
  if (!fromToken || !toToken) return fail(`Sign in to both ${SYNC_PROVIDER_LABELS[from]} and ${SYNC_PROVIDER_LABELS[to]} first.`);

  const source = getSyncProvider(from);
  const target = getSyncProvider(to);
  const deviceId = options.deviceId || 'device_migration';
  const deviceName = options.deviceName || 'Arcable migration';

  try {
    if (options.localState && options.pendingOps?.length) {
      const flushed = await source.sync(fromToken, {
        localState: options.localState,
        pendingOps: options.pendingOps,
        deviceId,
        deviceName,
      });
      if (!flushed.success) return fail(flushed.error || `Failed to sync pending changes to ${source.label}.`);
    }

    const fetched = await source.fetchWorkspace(fromToken, options.localState?.activeSpaceId);
    if (fetched.migratedTo === to) {
      const current = await target.fetchWorkspace(toToken, options.localState?.activeSpaceId);
      if (!current.success || !current.data) return fail(current.error || `Failed to read ${target.label}.`);
      return { success: true, from, to, latestSnapshot: current.data };
    }
    if (!fetched.success || !fetched.data) return fail(fetched.error || `Failed to read workspace from ${source.label}.`);
    const workspace = stripRemoteIdentities(fetched.data);

    const sourceBackup = await source.createBackup(fromToken, fetched.data, deviceName);
    if (!sourceBackup.success) return fail(sourceBackup.error || `Failed to back up ${source.label} before migrating.`);

    let written: SyncResult;
    if (to === 'drive') {
      const existing = await target.fetchWorkspace(toToken);
      if (existing.data) {
        const targetBackup = await target.createBackup(toToken, existing.data, `${deviceName} (before migration)`);
        if (!targetBackup.success) return fail(targetBackup.error || 'Failed to back up the existing Google Drive workspace.');
      }
      written = await target.sync(toToken, { localState: workspace, replaceBaseline: true, deviceId, deviceName });
    } else {
      await retireRaindropArcableRoot(toToken);
      written = await target.sync(toToken, {
        localState: workspace,
        pendingOps: markAllTreeEntitiesChanged(workspace, deviceId),
        replaceBaseline: true,
        deviceId,
        deviceName,
      });
    }
    if (!written.success) return fail(written.error || `Failed to write workspace to ${target.label}.`);

    try {
      if (from === 'raindrop') await setRaindropMigrationMarker(fromToken);
      else await markDriveWorkspaceMigrated(fromToken, 'raindrop');
    } catch (err) {
      console.warn('[SyncMigration] Workspace copied, but the source could not be marked as migrated:', err);
    }

    return { success: true, from, to, latestSnapshot: written.latestSnapshot };
  } catch (err: any) {
    return fail(err?.message || 'Migration failed.');
  }
}
