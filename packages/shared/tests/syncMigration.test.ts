import assert from 'node:assert/strict';
import { createMockDrive } from './helpers/mockDrive';
import { createMockRaindrop } from './helpers/mockRaindrop';
import { setDriveRetryBaseDelay } from '../src/utils/driveClient';
import { fetchDriveWorkspace, parseDriveWorkspace } from '../src/utils/driveSync';
import {
  ARCABLE_COLLECTION_NAME,
  RAINDROP_MIGRATION_MARKER_FILE_NAME,
  fetchRaindropWorkspace,
  syncWorkspaceWithRaindrop,
} from '../src/utils/raindropSync';
import { migrateWorkspace, stripRemoteIdentities } from '../src/utils/syncProviders';
import type { ArcableWorkspaceData } from '../src/types/workspace';

const drive = createMockDrive();
const raindrop = createMockRaindrop();
const storage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  dispatchEvent: () => true,
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const handled = drive.handle(input, init) || raindrop.handle(input, init);
  if (handled) return handled;
  throw new Error(`Unexpected request: ${String(input)}`);
}) as typeof fetch;
setDriveRetryBaseDelay(0);

const RAINDROP_TOKEN = 'raindrop-token';
const GOOGLE_TOKEN = 'google-token';

function summarize(data: ArcableWorkspaceData) {
  const spaceName = new Map(data.spaces.map((space) => [space.id, space.name]));
  const folderName = new Map(data.folders.map((folder) => [folder.id, folder.name]));
  return {
    spaces: data.spaces.map((space) => space.name).sort(),
    folders: data.folders.map((folder) => `${spaceName.get(folder.parentSpaceId)}/${folder.name}`).sort(),
    tabs: data.tabs
      .map((tab) => `${tab.parentFolderId ? folderName.get(tab.parentFolderId) : spaceName.get(tab.parentSpaceId || '')}:${tab.url}`)
      .sort(),
  };
}

async function run(): Promise<void> {
  // Seed Raindrop with a workspace whose IDs were issued by Raindrop.
  const seeded = await syncWorkspaceWithRaindrop(RAINDROP_TOKEN, {
    localState: {
      activeSpaceId: 'space-work',
      version: 1,
      spaces: [{ id: 'space-work', name: 'Work', order: 0 }],
      folders: [{ id: 'folder-docs', name: 'Docs', parentSpaceId: 'space-work', order: 0 }],
      tabs: [
        { id: 'tab-gh', url: 'https://github.com/', pinned: false, parentSpaceId: 'space-work', parentFolderId: 'folder-docs', order: 0 },
        { id: 'tab-mdn', url: 'https://developer.mozilla.org/', pinned: false, parentSpaceId: 'space-work', order: 1 },
      ],
      widgets: [],
      customCodeRules: [],
      runCodeInPageRules: [],
    },
    pendingOps: [],
    replaceBaseline: true,
  });
  assert.equal(seeded.success, true, seeded.error);
  const raindropWorkspace = (await fetchRaindropWorkspace(RAINDROP_TOKEN)).data!;
  const expected = summarize(raindropWorkspace);
  assert.equal(expected.tabs.length, 2);

  // Raindrop -> Drive
  let result = await migrateWorkspace({
    from: 'raindrop',
    to: 'drive',
    fromToken: RAINDROP_TOKEN,
    toToken: GOOGLE_TOKEN,
    localState: raindropWorkspace,
    deviceId: 'device-mac',
    deviceName: 'Mac',
  });
  assert.equal(result.success, true, result.error);
  const driveFile = parseDriveWorkspace(drive.byRole('workspace')[0].content!);
  assert.deepEqual(summarize(driveFile.data), expected, 'Drive holds the same tree');
  assert.ok(result.latestSnapshot?.driveWorkspaceFileId, 'result is a Drive-hydrated snapshot');
  assert.ok(driveFile.data.tabs.every((tab) => tab.raindropId === undefined), 'Raindrop identities are dropped');

  const root = raindrop.collections.find((c) => c.title === ARCABLE_COLLECTION_NAME);
  const rootFiles = raindrop.bookmarks.filter((b) => b.collection?.$id === root._id && b.file);
  assert.ok(rootFiles.some((b) => /^backup-Mac-/.test(b.file.name)), 'source is backed up before migrating');
  assert.ok(rootFiles.some((b) => b.file.name === RAINDROP_MIGRATION_MARKER_FILE_NAME), 'source is marked as migrated');
  const afterMarker = await fetchRaindropWorkspace(RAINDROP_TOKEN);
  assert.equal(afterMarker.success, false);
  assert.equal(afterMarker.migratedTo, 'drive', 'other devices see that Raindrop is retired');
  assert.equal(raindrop.collections.filter((c) => !c.parent?.$id).length >= 1, true, 'Raindrop data is not deleted');
  console.log('✓ Raindrop -> Drive copies the workspace and marks Raindrop as migrated');

  // Drive -> Raindrop
  result = await migrateWorkspace({
    from: 'drive',
    to: 'raindrop',
    fromToken: GOOGLE_TOKEN,
    toToken: RAINDROP_TOKEN,
    localState: result.latestSnapshot,
    deviceId: 'device-mac',
    deviceName: 'Mac',
  });
  assert.equal(result.success, true, result.error);
  const retired = raindrop.collections.filter((c) => String(c.title).startsWith(`${ARCABLE_COLLECTION_NAME} (replaced`));
  assert.equal(retired.length, 1, 'the previous Raindrop root is renamed aside, not deleted');
  const back = await fetchRaindropWorkspace(RAINDROP_TOKEN);
  assert.equal(back.success, true, back.error);
  assert.deepEqual(summarize(back.data!), expected, 'Raindrop holds the same tree again');
  assert.equal((await fetchDriveWorkspace(GOOGLE_TOKEN)).migratedTo, 'raindrop', 'Drive is marked as migrated');
  assert.ok(drive.byRole('backup').length >= 1, 'Drive is backed up before migrating away');
  console.log('✓ Drive -> Raindrop recreates the workspace in a fresh root');

  // Migrating again to Drive clears the Drive marker by overwriting it.
  result = await migrateWorkspace({
    from: 'raindrop',
    to: 'drive',
    fromToken: RAINDROP_TOKEN,
    toToken: GOOGLE_TOKEN,
    deviceName: 'Mac',
  });
  assert.equal(result.success, true, result.error);
  const again = await fetchDriveWorkspace(GOOGLE_TOKEN);
  assert.equal(again.success, true, again.error);
  assert.deepEqual(summarize(again.data!), expected);
  console.log('✓ migrating back to Drive re-activates it');

  const stripped = stripRemoteIdentities({ ...raindropWorkspace, driveWorkspaceFileId: 'x' });
  assert.equal(stripped.raindropRootCollectionId, undefined);
  assert.equal(stripped.driveWorkspaceFileId, undefined);
  console.log('Sync migration tests passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
