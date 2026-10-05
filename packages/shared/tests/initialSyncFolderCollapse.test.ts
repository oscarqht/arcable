import assert from 'node:assert/strict';
import { fetchRaindropWorkspace, syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';
import {
  FOLDER_COLLAPSE_STORAGE_PREFIX,
  getLocalFolderExpanded,
  setLocalFolderExpanded,
} from '../src/hooks/useWorkspace';
import { ArcableWorkspaceData, Folder } from '../src/types/workspace';

// In-memory mock localStorage
const storage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => { storage.set(key, val); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
};
(globalThis as any).window = {
  localStorage: storageMock,
  dispatchEvent: () => true,
};
(globalThis as any).localStorage = storageMock;

// Mock remote Raindrop data
const mockRootCollectionId = 900;
const mockSpaceCollectionId = 901;
const mockFolder1CollectionId = 902;
const mockFolder2CollectionId = 903;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const pathname = new URL(url).pathname;

  if (pathname.endsWith('/collections')) {
    return new Response(JSON.stringify({
      items: [{ _id: mockRootCollectionId, title: 'Arcable v2', count: 0, sort: 0 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.endsWith('/collections/childrens')) {
    return new Response(JSON.stringify({
      items: [
        { _id: mockSpaceCollectionId, title: 'Work Space', parent: { $id: mockRootCollectionId }, sort: 0 },
        { _id: mockFolder1CollectionId, title: 'Project Alpha', parent: { $id: mockSpaceCollectionId }, sort: 0 },
        { _id: mockFolder2CollectionId, title: 'Project Beta', parent: { $id: mockSpaceCollectionId }, sort: 1 },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.includes('/raindrops/')) {
    return new Response(JSON.stringify({ items: [], count: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  throw new Error(`Unexpected request in mock: ${url}`);
}) as typeof fetch;

async function runTests(): Promise<void> {
  console.log('Testing folder collapse behavior on initial login vs page reload / auto login...');

  // 1. fetchRaindropWorkspace on initial login sync (collapseFolders: true) must return all folders collapsed
  storage.clear();
  const initialLoginFetchResult = await fetchRaindropWorkspace('mock_token', undefined, { collapseFolders: true });
  assert.equal(initialLoginFetchResult.success, true, 'fetchRaindropWorkspace should succeed');
  assert(initialLoginFetchResult.data, 'fetchRaindropWorkspace should return workspace data');
  assert.equal(initialLoginFetchResult.data.folders.length, 2, 'Should have 2 folders');
  for (const folder of initialLoginFetchResult.data.folders) {
    assert.equal(
      folder.isExpanded,
      false,
      `Folder ${folder.name} (${folder.id}) must be collapsed when collapseFolders is true`
    );
    assert.equal(
      storage.get(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folder.id}`),
      'true',
      `Folder ${folder.id} must be marked collapsed in localStorage`
    );
  }

  // 2. Normal fetchRaindropWorkspace (e.g. page reload / auto login) must NOT collapse folders unconditionally
  storage.clear();
  const normalFetchResult = await fetchRaindropWorkspace('mock_token');
  assert.equal(normalFetchResult.success, true, 'fetchRaindropWorkspace should succeed');
  assert(normalFetchResult.data, 'fetchRaindropWorkspace should return workspace data');
  for (const folder of normalFetchResult.data.folders) {
    assert.equal(
      folder.isExpanded,
      undefined,
      `Folder ${folder.name} (${folder.id}) must not have forced isExpanded: false on normal fetch`
    );
  }

  // 3. syncWorkspaceWithRaindrop on initial login (isInitialSync: true, isInitialLogin: true)
  storage.clear();
  const initialLoginSyncResult = await syncWorkspaceWithRaindrop('mock_token', {
    localState: {
      activeSpaceId: 'space_work',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    },
    isInitialSync: true,
    isInitialLogin: true,
  });

  assert.equal(initialLoginSyncResult.success, true, 'Initial login sync must succeed');
  assert(initialLoginSyncResult.latestSnapshot, 'Initial login sync must return latestSnapshot');
  assert.equal(initialLoginSyncResult.latestSnapshot.folders.length, 2, 'Should have 2 folders');
  for (const folder of initialLoginSyncResult.latestSnapshot.folders) {
    assert.equal(
      folder.isExpanded,
      false,
      `Folder ${folder.id} must be collapsed in snapshot on initial login sync`
    );
    assert.equal(
      storage.get(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folder.id}`),
      'true',
      `Folder ${folder.id} must be marked as collapsed in localStorage on initial login sync`
    );
    assert.equal(
      getLocalFolderExpanded(folder.id, true),
      false,
      `getLocalFolderExpanded for ${folder.id} must return false`
    );
  }

  // 4. User expands folder 1
  setLocalFolderExpanded(String(mockFolder1CollectionId), true);
  assert.equal(
    getLocalFolderExpanded(String(mockFolder1CollectionId), true),
    true,
    'Folder 1 should now be expanded after user action'
  );

  // 5. Page reload & auto login success sync (isInitialLogin is false / not provided)
  // Even if isInitialSync: true, it must NOT collapse folders because it is not an initial login
  const reloadSyncResult = await syncWorkspaceWithRaindrop('mock_token', {
    localState: {
      activeSpaceId: 'space_work',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    },
    isInitialSync: true,
    isInitialLogin: false,
  });

  assert.equal(reloadSyncResult.success, true, 'Reload sync should succeed');
  assert.equal(
    getLocalFolderExpanded(String(mockFolder1CollectionId), true),
    true,
    'Folder 1 must remain expanded across page reload / auto login sync'
  );

  // 6. Subsequent normal sync (not initial sync) must NOT collapse folder 1
  const normalSyncResult = await syncWorkspaceWithRaindrop('mock_token', {
    localState: {
      ...reloadSyncResult.latestSnapshot,
      raindropRootCollectionId: mockRootCollectionId,
    },
    isInitialSync: false,
    pendingOps: [],
  });

  assert.equal(normalSyncResult.success, true, 'Normal sync should succeed');
  assert.equal(
    getLocalFolderExpanded(String(mockFolder1CollectionId), true),
    true,
    'Folder 1 should remain expanded across normal sync'
  );

  console.log('All initial sync folder collapse tests passed successfully!');
}

void runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
