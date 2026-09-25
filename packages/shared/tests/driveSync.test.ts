import assert from 'node:assert/strict';
import { createMockDrive } from './helpers/mockDrive';
import { setDriveRetryBaseDelay } from '../src/utils/driveClient';
import {
  DRIVE_BACKUP_RETENTION,
  DRIVE_WORKSPACE_SCHEMA_VERSION,
  createDriveBackup,
  fetchDriveWorkspace,
  markDriveWorkspaceMigrated,
  parseDriveWorkspace,
  syncWorkspaceWithDrive,
} from '../src/utils/driveSync';
import { driveSyncProvider, getSyncProvider } from '../src/utils/syncProviders';
import type { ArcableWorkspaceData } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

const drive = createMockDrive();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const handled = drive.handle(input, init);
  if (handled) return handled;
  throw new Error(`Unexpected request: ${String(input)}`);
}) as typeof fetch;
setDriveRetryBaseDelay(0);

const TOKEN = 'google-token';

function workspace(overrides: Partial<ArcableWorkspaceData> = {}): ArcableWorkspaceData {
  return {
    activeSpaceId: 'space-a',
    version: 1,
    spaces: [{ id: 'space-a', name: 'Work', order: 0 }],
    folders: [{ id: 'folder-a', name: 'Docs', parentSpaceId: 'space-a', order: 0 }],
    tabs: [{ id: 'tab-a', url: 'https://a.example', pinned: false, parentSpaceId: 'space-a', parentFolderId: 'folder-a', order: 0 }],
    tmpTabs: [{ id: 'tmp-1', url: 'https://tmp.example', title: 'Tmp', spaceId: 'space-a' } as any],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
    raindropRootCollectionId: 42,
    ...overrides,
  };
}

let opSeq = 0;
function op(type: WorkspaceOperation['type'], entityId: string, payload?: any): WorkspaceOperation {
  opSeq += 1;
  return { id: `op_${opSeq}`, type, entityId, payload, deviceId: 'device-a', timestamp: 1_000 + opSeq, lamportSeq: opSeq };
}

function uploads() {
  return drive.calls.filter((call) => call.method === 'PATCH' && call.url.includes('/upload/'));
}

function remoteWorkspace() {
  const [file] = drive.byRole('workspace');
  return parseDriveWorkspace(file.content!);
}

async function run(): Promise<void> {
  // 1. First sync creates the Arcable folder and workspace.json, stripping local-only fields.
  let result = await syncWorkspaceWithDrive(TOKEN, { localState: workspace(), pendingOps: [], deviceName: 'Mac' });
  assert.equal(result.success, true, result.error);
  assert.equal(drive.byRole('root').length, 1, 'creates the Arcable folder');
  assert.equal(drive.byRole('workspace').length, 1, 'creates workspace.json');
  const remote = remoteWorkspace();
  assert.equal(remote.schemaVersion, DRIVE_WORKSPACE_SCHEMA_VERSION);
  assert.equal(remote.data.tmpTabs, undefined, 'tmp tabs stay local');
  assert.equal(remote.data.raindropRootCollectionId, undefined, 'Raindrop workspace IDs are not stored in Drive');
  assert.equal(remote.data.tabs[0].url, 'https://a.example');
  let local = result.latestSnapshot!;
  assert.ok(local.driveWorkspaceFileId, 'snapshot records the Drive file ID');
  assert.equal(local.driveWorkspaceVersion, '1');
  console.log('✓ first sync creates Arcable/workspace.json');

  // 2. Fetch returns the hydrated workspace; missing workspace reports exists=false.
  let fetched = await fetchDriveWorkspace(TOKEN);
  assert.equal(fetched.success, true);
  assert.equal(fetched.data?.driveWorkspaceFileId, local.driveWorkspaceFileId);
  assert.deepEqual(fetched.data?.tmpTabs, []);
  console.log('✓ fetch hydrates the workspace');

  // 3. No pending ops and no remote change: nothing is downloaded or written.
  drive.calls.length = 0;
  result = await syncWorkspaceWithDrive(TOKEN, { localState: local, pendingOps: [] });
  assert.equal(result.success, true);
  assert.equal(result.latestSnapshot, undefined, 'unchanged sync returns no snapshot');
  assert.equal(uploads().length, 0);
  assert.ok(drive.calls.every((call) => !call.url.includes('alt=media')), 'no download when version is unchanged');
  console.log('✓ unchanged sync is read-only');

  // 4. Fast path: nobody else wrote, so the exact local state (including edits without ops) is uploaded.
  local = { ...local, tabs: [{ ...local.tabs[0], order: 5 }] };
  const renameOp = op('TAB_UPDATE', 'tab-a', { customTitle: 'Renamed' });
  local.tabs[0].customTitle = 'Renamed';
  result = await syncWorkspaceWithDrive(TOKEN, { localState: local, pendingOps: [renameOp] });
  assert.equal(result.success, true, result.error);
  assert.equal(remoteWorkspace().data.tabs[0].order, 5, 'local-only field changes are preserved on the fast path');
  assert.equal(remoteWorkspace().data.tabs[0].customTitle, 'Renamed');
  local = result.latestSnapshot!;
  assert.equal(local.driveWorkspaceVersion, '2');
  console.log('✓ fast path writes local state as-is');

  // 5. Another device wrote in between: pending ops are replayed on the remote snapshot.
  const other = remoteWorkspace();
  other.data.tabs.push({ id: 'tab-remote', url: 'https://remote.example', pinned: false, parentSpaceId: 'space-a', order: 1 });
  drive.write(local.driveWorkspaceFileId!, JSON.stringify(other));
  const createOp = op('TAB_CREATE', 'tab-local', { url: 'https://local.example', parentSpaceId: 'space-a' });
  const localWithTab = { ...local, tabs: [...local.tabs, { id: 'tab-local', url: 'https://local.example', pinned: false, parentSpaceId: 'space-a' }] };
  result = await syncWorkspaceWithDrive(TOKEN, { localState: localWithTab, pendingOps: [createOp] });
  assert.equal(result.success, true, result.error);
  const mergedIds = remoteWorkspace().data.tabs.map((tab) => tab.id).sort();
  assert.deepEqual(mergedIds, ['tab-a', 'tab-local', 'tab-remote'], 'keeps both the remote and the local change');
  assert.deepEqual(result.latestSnapshot!.tabs.map((tab) => tab.id).sort(), mergedIds);
  local = result.latestSnapshot!;
  console.log('✓ concurrent write is rebased with pending ops');

  // 6. A write racing between download and upload triggers a retry on fresh data.
  let raced = false;
  drive.intercept = (method, url) => {
    if (!raced && method === 'GET' && url.pathname.includes(local.driveWorkspaceFileId!) && !url.searchParams.get('alt')) {
      raced = true;
      const racing = remoteWorkspace();
      racing.data.spaces.push({ id: 'space-race', name: 'Race', order: 1 });
      drive.write(local.driveWorkspaceFileId!, JSON.stringify(racing));
    }
    return undefined;
  };
  const deleteOp = op('TAB_DELETE', 'tab-remote');
  result = await syncWorkspaceWithDrive(TOKEN, {
    localState: { ...local, tabs: local.tabs.filter((tab) => tab.id !== 'tab-remote') },
    pendingOps: [deleteOp],
  });
  drive.intercept = undefined;
  assert.equal(result.success, true, result.error);
  const afterRace = remoteWorkspace().data;
  assert.ok(afterRace.spaces.some((space) => space.id === 'space-race'), 'racing write survives');
  assert.ok(!afterRace.tabs.some((tab) => tab.id === 'tab-remote'), 'local delete is applied');
  local = result.latestSnapshot!;
  console.log('✓ version check retries when the file changes mid-sync');

  // 7. Remote-only change with an empty outbox is pulled.
  const pulled = remoteWorkspace();
  pulled.data.spaces[0].name = 'Work (renamed elsewhere)';
  drive.write(local.driveWorkspaceFileId!, JSON.stringify(pulled));
  result = await syncWorkspaceWithDrive(TOKEN, { localState: local, pendingOps: [] });
  assert.equal(result.latestSnapshot?.spaces[0].name, 'Work (renamed elsewhere)');
  local = result.latestSnapshot!;
  console.log('✓ remote changes are pulled');

  // 8. A new device adopts the remote workspace instead of writing its own cache.
  const beforeUploads = uploads().length;
  result = await syncWorkspaceWithDrive(TOKEN, {
    localState: workspace({ spaces: [{ id: 'space-new-device', name: 'Stale' }] }),
    pendingOps: [op('SPACE_UPDATE', 'space-new-device', { name: 'x' })],
  });
  assert.equal(result.success, true);
  assert.equal(uploads().length, beforeUploads, 'initial sync does not write');
  assert.equal(result.latestSnapshot?.spaces[0].name, 'Work (renamed elsewhere)');
  assert.equal(driveSyncProvider.isInitialSync(workspace()), true);
  assert.equal(driveSyncProvider.isInitialSync(local), false);
  console.log('✓ initial sync on a new device adopts Drive');

  // 9. Archiving appends the removed subtree to archive.json.
  const archiveOp = op('FOLDER_ARCHIVE', 'folder-a');
  result = await syncWorkspaceWithDrive(TOKEN, {
    localState: { ...local, folders: [], tabs: local.tabs.filter((tab) => tab.parentFolderId !== 'folder-a') },
    pendingOps: [archiveOp],
  });
  assert.equal(result.success, true, result.error);
  const [archiveFile] = drive.byRole('archive');
  const archive = JSON.parse(archiveFile.content!);
  assert.equal(archive.entries.length, 1);
  assert.equal(archive.entries[0].folders[0].id, 'folder-a');
  assert.deepEqual(archive.entries[0].tabs.map((tab: any) => tab.id), ['tab-a']);
  assert.equal(remoteWorkspace().data.folders.length, 0);
  local = result.latestSnapshot!;
  console.log('✓ archive operations append to archive.json');

  // 10. A newer schema is refused and never overwritten.
  const newer = { ...remoteWorkspace(), schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION + 1 };
  drive.write(local.driveWorkspaceFileId!, JSON.stringify(newer));
  const uploadsBefore = uploads().length;
  result = await syncWorkspaceWithDrive(TOKEN, { localState: local, pendingOps: [op('SPACE_UPDATE', 'space-a', { name: 'y' })] });
  assert.equal(result.success, false);
  assert.match(result.error || '', /newer version of Arcable/);
  assert.equal(uploads().length, uploadsBefore);
  newer.schemaVersion = DRIVE_WORKSPACE_SCHEMA_VERSION;
  drive.write(local.driveWorkspaceFileId!, JSON.stringify(newer));
  console.log('✓ newer schema puts the client in read-only mode');

  // 11. Duplicate workspace files: newest wins, others are kept as conflict copies.
  drive.write(local.driveWorkspaceFileId!, drive.files.get(local.driveWorkspaceFileId!)!.content!);
  const olderDuplicate = [...drive.files.values()].find((file) => file.id === local.driveWorkspaceFileId)!;
  drive.files.set('dup', { ...olderDuplicate, id: 'dup', modifiedTime: '2000-01-01T00:00:00.000Z' });
  fetched = await fetchDriveWorkspace(TOKEN);
  assert.equal(fetched.data?.driveWorkspaceFileId, local.driveWorkspaceFileId);
  assert.equal(drive.files.get('dup')!.appProperties?.arcable, 'conflict');
  assert.match(drive.files.get('dup')!.name, /^workspace-conflict-/);
  console.log('✓ duplicate workspace files are resolved without deleting data');

  // 12. Rate limits are retried.
  let limited = 0;
  drive.intercept = (method) => {
    if (method === 'GET' && limited < 2) {
      limited += 1;
      return new Response(JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }), { status: 403 });
    }
    return undefined;
  };
  fetched = await fetchDriveWorkspace(TOKEN);
  drive.intercept = undefined;
  assert.equal(fetched.success, true, fetched.error);
  assert.equal(limited, 2);
  console.log('✓ rate-limited requests are retried');

  // 13. Backups are written to Arcable/backups and pruned to the retention limit.
  for (let index = 0; index < DRIVE_BACKUP_RETENTION + 2; index += 1) {
    const backup = await createDriveBackup(TOKEN, local, 'Mac');
    assert.equal(backup.success, true, backup.error);
  }
  assert.equal(drive.byRole('backups').length, 1);
  assert.equal(drive.byRole('backup').length, DRIVE_BACKUP_RETENTION);
  assert.match(drive.byRole('backup')[0].name, /^backup-Mac-\d{14}\.json$/);
  console.log('✓ backups are pruned to the retention limit');

  // 14. A migrated workspace stops syncing on other devices.
  await markDriveWorkspaceMigrated(TOKEN, 'raindrop');
  fetched = await fetchDriveWorkspace(TOKEN);
  assert.equal(fetched.success, false);
  assert.equal(fetched.migratedTo, 'raindrop');
  result = await syncWorkspaceWithDrive(TOKEN, { localState: local, pendingOps: [op('SPACE_UPDATE', 'space-a', { name: 'z' })] });
  assert.equal(result.success, false);
  assert.equal(result.migratedTo, 'raindrop');
  assert.equal(getSyncProvider('drive'), driveSyncProvider);
  console.log('✓ migrated workspace is read-only');

  console.log('Drive sync tests passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
