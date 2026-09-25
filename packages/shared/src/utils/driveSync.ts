import type { ArcableWorkspaceData, Folder, Space, Tab } from '../types/workspace';
import type { SyncResult, WorkspaceOperation } from '../types/sync';
import type { DriveFileMetadata, DriveWorkspaceFile } from '../types/google';
import type { CreateBackupResult, FetchWorkspaceResult, SyncRequest } from '../types/syncProvider';
import { ARCABLE_VERSION } from '../version';
import {
  DRIVE_FOLDER_MIME_TYPE,
  createDriveFile,
  createDriveFolder,
  deleteDriveFile,
  downloadDriveFileText,
  findDriveFilesByAppProperty,
  getDriveFileMetadata,
  updateDriveFileContent,
  updateDriveFileMetadata,
} from './driveClient';
import { replayOperations } from './syncEngine';
import { getDescendantFolderIds } from './treeUtils';
import { formatBackupFileName } from './raindropSync';

export const DRIVE_ROOT_FOLDER_NAME = 'Arcable';
export const DRIVE_WORKSPACE_FILE_NAME = 'workspace.json';
export const DRIVE_ARCHIVE_FILE_NAME = 'archive.json';
export const DRIVE_BACKUPS_FOLDER_NAME = 'backups';
export const DRIVE_APP_PROPERTY_KEY = 'arcable';
export const DRIVE_WORKSPACE_SCHEMA_VERSION = 1;
export const DRIVE_BACKUP_RETENTION = 30;
const MAX_WRITE_ATTEMPTS = 3;

const ROLE = {
  root: 'root',
  workspace: 'workspace',
  archive: 'archive',
  backups: 'backups',
  backup: 'backup',
  conflict: 'conflict',
} as const;

/** Workspace fields that describe this device or another backend, never stored in Drive. */
const LOCAL_ONLY_KEYS = [
  'tmpTabs',
  'devices',
  'raindropRootCollectionId',
  'raindropArchiveCollectionId',
  'raindropSpaceThemeCollectionId',
  'raindropMetadataItemId',
  'driveWorkspaceFileId',
  'driveWorkspaceVersion',
] as const;

const ARCHIVE_OPERATION_TYPES = new Set(['SPACE_ARCHIVE', 'FOLDER_ARCHIVE', 'TAB_ARCHIVE']);

export class DriveSchemaTooNewError extends Error {
  constructor(public readonly schemaVersion: number) {
    super('Your Google Drive workspace was saved by a newer version of Arcable. Please update Arcable to keep syncing.');
    this.name = 'DriveSchemaTooNewError';
  }
}

export interface DriveLayout {
  rootFolder?: DriveFileMetadata;
  workspaceFile?: DriveFileMetadata;
}

interface DriveArchiveEntry {
  archivedAt: number;
  type: WorkspaceOperation['type'];
  entityId: string;
  spaces: Space[];
  folders: Folder[];
  tabs: Tab[];
}

function emptyWorkspace(): ArcableWorkspaceData {
  return {
    activeSpaceId: '',
    version: 1,
    spaces: [],
    folders: [],
    tabs: [],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };
}

/** Strips device-local and other-backend fields before the workspace is written to Drive. */
export function toDriveWorkspacePayload(data: ArcableWorkspaceData): ArcableWorkspaceData {
  const payload: Record<string, unknown> = { ...data };
  for (const key of LOCAL_ONLY_KEYS) delete payload[key];
  return {
    ...(payload as unknown as ArcableWorkspaceData),
    spaces: data.spaces || [],
    folders: data.folders || [],
    tabs: data.tabs || [],
    widgets: data.widgets || [],
    customCodeRules: data.customCodeRules || [],
    runCodeInPageRules: data.runCodeInPageRules || [],
  };
}

export function serializeDriveWorkspace(
  data: ArcableWorkspaceData,
  options?: { deviceId?: string; deviceName?: string; pendingOps?: WorkspaceOperation[]; now?: number }
): string {
  const file: DriveWorkspaceFile = {
    format: 'arcable-workspace',
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    arcableVersion: ARCABLE_VERSION,
    updatedAt: options?.now ?? Date.now(),
    ...(options?.deviceId || options?.deviceName
      ? { updatedBy: { deviceId: options.deviceId, deviceName: options.deviceName } }
      : {}),
    lamportSeq: Math.max(0, ...(options?.pendingOps || []).map((op) => op.lamportSeq || 0)),
    data: toDriveWorkspacePayload(data),
  };
  return JSON.stringify(file);
}

/** Parses `workspace.json`; also accepts a bare workspace snapshot (e.g. a backup copied in by hand). */
export function parseDriveWorkspace(text: string): DriveWorkspaceFile {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The Arcable workspace file in Google Drive is not valid JSON.');
  }
  if (parsed?.format === 'arcable-workspace') {
    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > DRIVE_WORKSPACE_SCHEMA_VERSION) {
      throw new DriveSchemaTooNewError(parsed.schemaVersion);
    }
    if (!parsed.data || !Array.isArray(parsed.data.spaces)) {
      throw new Error('The Arcable workspace file in Google Drive is missing workspace data.');
    }
    return parsed as DriveWorkspaceFile;
  }
  if (parsed && Array.isArray(parsed.spaces)) {
    return { format: 'arcable-workspace', schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION, updatedAt: 0, data: parsed };
  }
  throw new Error('Unrecognized Arcable workspace file format in Google Drive.');
}

function hydrateDriveWorkspace(
  data: ArcableWorkspaceData,
  file: Pick<DriveFileMetadata, 'id' | 'version'>,
  preferredActiveSpaceId?: string
): ArcableWorkspaceData {
  const payload = toDriveWorkspacePayload(data);
  const spaces = payload.spaces;
  const activeSpaceId =
    preferredActiveSpaceId && spaces.some((space) => space.id === preferredActiveSpaceId)
      ? preferredActiveSpaceId
      : spaces.some((space) => space.id === payload.activeSpaceId)
        ? payload.activeSpaceId
        : spaces[0]?.id || '';
  return {
    ...payload,
    activeSpaceId,
    tmpTabs: [],
    driveWorkspaceFileId: file.id,
    driveWorkspaceVersion: file.version,
  };
}

async function findSingleByRole(token: string, role: string, options?: { parentId?: string; mimeType?: string }) {
  const files = await findDriveFilesByAppProperty(token, DRIVE_APP_PROPERTY_KEY, role, options);
  return files[0];
}

async function ensureRootFolder(token: string, layout: DriveLayout): Promise<DriveFileMetadata> {
  if (layout.rootFolder) return layout.rootFolder;
  const root = await createDriveFolder(token, DRIVE_ROOT_FOLDER_NAME, {
    appProperties: { [DRIVE_APP_PROPERTY_KEY]: ROLE.root },
  });
  layout.rootFolder = root;
  return root;
}

/**
 * Locates the Arcable folder and workspace file by appProperties (not by name,
 * so renames/moves in Drive keep working). When two first-time devices race to
 * create the workspace, the most recently modified file wins and the others are
 * kept but renamed as conflict copies.
 */
export async function resolveDriveLayout(token: string): Promise<DriveLayout> {
  const [rootFolder, workspaceFiles] = await Promise.all([
    findSingleByRole(token, ROLE.root, { mimeType: DRIVE_FOLDER_MIME_TYPE }),
    findDriveFilesByAppProperty(token, DRIVE_APP_PROPERTY_KEY, ROLE.workspace),
  ]);
  const [workspaceFile, ...duplicates] = workspaceFiles;
  for (const duplicate of duplicates) {
    const stamp = (duplicate.modifiedTime || new Date().toISOString()).replace(/[:.]/g, '-');
    await updateDriveFileMetadata(token, duplicate.id, {
      name: `workspace-conflict-${stamp}.json`,
      appProperties: { [DRIVE_APP_PROPERTY_KEY]: ROLE.conflict },
    });
  }
  return { rootFolder, workspaceFile };
}

async function readWorkspaceFile(token: string, fileId: string): Promise<DriveWorkspaceFile> {
  return parseDriveWorkspace(await downloadDriveFileText(token, fileId));
}

function migratedError(): string {
  return 'This workspace was moved from Google Drive to Raindrop. Switch the sync backend to Raindrop in Settings.';
}

export async function fetchDriveWorkspace(token: string, activeSpaceId?: string): Promise<FetchWorkspaceResult> {
  try {
    const { workspaceFile } = await resolveDriveLayout(token);
    if (!workspaceFile) return { success: true, exists: false };
    const file = await readWorkspaceFile(token, workspaceFile.id);
    if (file.migratedTo) {
      return { success: false, exists: true, migratedTo: file.migratedTo, error: migratedError() };
    }
    return { success: true, exists: true, data: hydrateDriveWorkspace(file.data, workspaceFile, activeSpaceId) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch workspace from Google Drive.' };
  }
}

/** Snapshot the subtrees an archive operation removes, taken from the state before the operation. */
function collectArchivedEntities(base: ArcableWorkspaceData, ops: WorkspaceOperation[]): DriveArchiveEntry[] {
  const entries: DriveArchiveEntry[] = [];
  for (const op of ops) {
    if (!ARCHIVE_OPERATION_TYPES.has(op.type)) continue;
    let spaces: Space[] = [];
    let folderIds = new Set<string>();
    let tabs: Tab[] = [];
    if (op.type === 'SPACE_ARCHIVE') {
      spaces = base.spaces.filter((space) => space.id === op.entityId);
      folderIds = new Set(base.folders.filter((folder) => folder.parentSpaceId === op.entityId).map((folder) => folder.id));
      tabs = base.tabs.filter((tab) => tab.parentSpaceId === op.entityId && !tab.favourite);
    } else if (op.type === 'FOLDER_ARCHIVE') {
      folderIds = new Set([op.entityId, ...getDescendantFolderIds(op.entityId, base.folders)]);
      tabs = base.tabs.filter((tab) => tab.parentFolderId && folderIds.has(tab.parentFolderId));
    } else {
      tabs = base.tabs.filter((tab) => tab.id === op.entityId);
    }
    const folders = base.folders.filter((folder) => folderIds.has(folder.id));
    if (!spaces.length && !folders.length && !tabs.length) continue;
    entries.push({ archivedAt: op.timestamp, type: op.type, entityId: op.entityId, spaces, folders, tabs });
  }
  return entries;
}

async function appendDriveArchive(token: string, layout: DriveLayout, entries: DriveArchiveEntry[]): Promise<void> {
  if (!entries.length) return;
  const existing = await findSingleByRole(token, ROLE.archive);
  if (!existing) {
    const root = await ensureRootFolder(token, layout);
    await createDriveFile(token, {
      name: DRIVE_ARCHIVE_FILE_NAME,
      parentId: root.id,
      content: JSON.stringify({ format: 'arcable-archive', entries }),
      appProperties: { [DRIVE_APP_PROPERTY_KEY]: ROLE.archive },
    });
    return;
  }
  let current: { format: string; entries: DriveArchiveEntry[] } = { format: 'arcable-archive', entries: [] };
  try {
    const parsed = JSON.parse(await downloadDriveFileText(token, existing.id));
    if (Array.isArray(parsed?.entries)) current = parsed;
  } catch {}
  current.entries.push(...entries);
  await updateDriveFileContent(token, existing.id, JSON.stringify(current));
}

/**
 * Rebases this device's queued operations on top of the latest Drive snapshot.
 * Local-only fields (tmp tabs, other-backend IDs) are carried over from `local`.
 */
function rebaseOnRemote(
  remote: ArcableWorkspaceData,
  pendingOps: WorkspaceOperation[],
  local: ArcableWorkspaceData
): ArcableWorkspaceData {
  const replayed = replayOperations(remote, pendingOps);
  return { ...replayed, activeSpaceId: local.activeSpaceId || replayed.activeSpaceId };
}

/**
 * Read-merge-write sync against a single `workspace.json`:
 * - First sync on a device adopts the remote file (or creates it from local state).
 * - If nobody else wrote since this device's last read, the local optimistic
 *   state is written as-is. Otherwise the pending operations are replayed on
 *   the freshly downloaded remote snapshot.
 * - The file version is re-checked right before upload to narrow the window in
 *   which a concurrent writer could be overwritten.
 */
export async function syncWorkspaceWithDrive(token: string, request: SyncRequest = {}): Promise<SyncResult> {
  const pendingOps = request.pendingOps || [];
  const local = request.localState;
  const writeOptions = { deviceId: request.deviceId, deviceName: request.deviceName, pendingOps };

  try {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const layout = await resolveDriveLayout(token);
      const meta = layout.workspaceFile;

      if (!meta) {
        const initial = local || emptyWorkspace();
        const root = await ensureRootFolder(token, layout);
        const created = await createDriveFile(token, {
          name: DRIVE_WORKSPACE_FILE_NAME,
          parentId: root.id,
          content: serializeDriveWorkspace(initial, writeOptions),
          appProperties: { [DRIVE_APP_PROPERTY_KEY]: ROLE.workspace },
        });
        return { success: true, latestSnapshot: hydrateDriveWorkspace(initial, created, local?.activeSpaceId), syncedAt: Date.now() };
      }

      if (request.replaceBaseline && local) {
        const written = await updateDriveFileContent(token, meta.id, serializeDriveWorkspace(local, writeOptions));
        return { success: true, latestSnapshot: hydrateDriveWorkspace(local, written, local.activeSpaceId), syncedAt: Date.now() };
      }

      const isInitialSync =
        Boolean(request.isInitialSync) || !local?.driveWorkspaceFileId || local.driveWorkspaceFileId !== meta.id;
      const remoteChanged = isInitialSync || meta.version !== local?.driveWorkspaceVersion;
      const hasArchiveOps = pendingOps.some((op) => ARCHIVE_OPERATION_TYPES.has(op.type));
      const remote = remoteChanged || hasArchiveOps ? await readWorkspaceFile(token, meta.id) : undefined;

      if (remote?.migratedTo) {
        return { success: false, migratedTo: remote.migratedTo, error: migratedError() };
      }

      if (isInitialSync || !local) {
        // A device's first read adopts Drive as the source of truth; the caller
        // discards any outbox recorded before the device was connected.
        return {
          success: true,
          latestSnapshot: hydrateDriveWorkspace(remote!.data, meta, local?.activeSpaceId),
          syncedAt: Date.now(),
        };
      }

      if (!pendingOps.length) {
        if (!remoteChanged) return { success: true, syncedAt: Date.now() };
        return { success: true, latestSnapshot: hydrateDriveWorkspace(remote!.data, meta, local.activeSpaceId), syncedAt: Date.now() };
      }

      const next = remoteChanged ? rebaseOnRemote(remote!.data, pendingOps, local) : local;

      const current = await getDriveFileMetadata(token, meta.id);
      if (current.version !== meta.version) continue;

      const written = await updateDriveFileContent(token, meta.id, serializeDriveWorkspace(next, writeOptions));
      if (hasArchiveOps && remote) {
        try {
          await appendDriveArchive(token, layout, collectArchivedEntities(remote.data, pendingOps));
        } catch (err) {
          console.warn('[DriveSync] Failed to append archived items to archive.json:', err);
        }
      }
      return { success: true, latestSnapshot: hydrateDriveWorkspace(next, written, local.activeSpaceId), syncedAt: Date.now() };
    }
    throw new Error('Google Drive workspace kept changing during sync. Please try again.');
  } catch (err: any) {
    console.error('[DriveSync] Sync error:', err);
    return { success: false, error: err?.message || 'Failed to sync workspace with Google Drive.' };
  }
}

async function ensureBackupsFolder(token: string): Promise<DriveFileMetadata> {
  const existing = await findSingleByRole(token, ROLE.backups, { mimeType: DRIVE_FOLDER_MIME_TYPE });
  if (existing) return existing;
  const layout = await resolveDriveLayout(token);
  const root = await ensureRootFolder(token, layout);
  return createDriveFolder(token, DRIVE_BACKUPS_FOLDER_NAME, {
    parentId: root.id,
    appProperties: { [DRIVE_APP_PROPERTY_KEY]: ROLE.backups },
  });
}

/** Writes `Arcable/backups/backup-<device>-<timestamp>.json`, keeping the newest {@link DRIVE_BACKUP_RETENTION}. */
export async function createDriveBackup(
  token: string,
  data: ArcableWorkspaceData,
  deviceName?: string
): Promise<CreateBackupResult> {
  try {
    const folder = await ensureBackupsFolder(token);
    const fileName = formatBackupFileName(deviceName || 'Unknown Device').replace(/\.json\.txt$/, '.json');
    await createDriveFile(token, {
      name: fileName,
      parentId: folder.id,
      content: serializeDriveWorkspace(data, { deviceName }),
      appProperties: { [DRIVE_APP_PROPERTY_KEY]: ROLE.backup },
    });
    const backups = await findDriveFilesByAppProperty(token, DRIVE_APP_PROPERTY_KEY, ROLE.backup, { parentId: folder.id });
    for (const stale of backups.slice(DRIVE_BACKUP_RETENTION)) {
      await deleteDriveFile(token, stale.id);
    }
    return { success: true, fileName };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create backup in Google Drive.' };
  }
}

/** Marks the Drive workspace read-only after it was migrated to another backend. */
export async function markDriveWorkspaceMigrated(token: string, to: 'raindrop'): Promise<void> {
  const { workspaceFile } = await resolveDriveLayout(token);
  if (!workspaceFile) return;
  const file = await readWorkspaceFile(token, workspaceFile.id);
  await updateDriveFileContent(token, workspaceFile.id, JSON.stringify({ ...file, migratedTo: to, updatedAt: Date.now() }));
}

/** Browser URL of the `Arcable` folder, for "open in Drive" links. */
export async function getDriveRootFolderUrl(token: string): Promise<string | undefined> {
  const root = await findSingleByRole(token, ROLE.root, { mimeType: DRIVE_FOLDER_MIME_TYPE });
  return root ? root.webViewLink || `https://drive.google.com/drive/folders/${root.id}` : undefined;
}
