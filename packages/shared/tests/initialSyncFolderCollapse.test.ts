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
  console.log('Testing initial sync folder collapse behavior...');

  // 1. fetchRaindropWorkspace on initial login sync must return all folders with isExpanded: false
  const fetchResult = await fetchRaindropWorkspace('mock_token');
  assert.equal(fetchResult.success, true, 'fetchRaindropWorkspace should succeed');
  assert(fetchResult.data, 'fetchRaindropWorkspace should return workspace data');
  assert.equal(fetchResult.data.folders.length, 2, 'Should have 2 folders');
  for (const folder of fetchResult.data.folders) {
    assert.equal(
      folder.isExpanded,
      false,
      `Folder ${folder.name} (${folder.id}) must be collapsed by default on initial sync`
    );
  }

  // 2. syncWorkspaceWithRaindrop on initial device sync (lacksRootCollectionId or isInitialSync: true)
  storage.clear();
  const initialSyncResult = await syncWorkspaceWithRaindrop('mock_token', {
    localState: {
      activeSpaceId: 'space_work',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    },
    isInitialSync: true,
  });

  assert.equal(initialSyncResult.success, true, 'Initial sync must succeed');
  assert(initialSyncResult.latestSnapshot, 'Initial sync must return latestSnapshot');
  assert.equal(initialSyncResult.latestSnapshot.folders.length, 2, 'Should have 2 folders');
  for (const folder of initialSyncResult.latestSnapshot.folders) {
    assert.equal(
      folder.isExpanded,
      false,
      `Folder ${folder.id} must be collapsed in snapshot on initial sync`
    );
    assert.equal(
      storage.get(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folder.id}`),
      'true',
      `Folder ${folder.id} must be marked as collapsed in localStorage on initial sync`
    );
    assert.equal(
      getLocalFolderExpanded(folder.id, true),
      false,
      `getLocalFolderExpanded for ${folder.id} must return false`
    );
  }

  // 3. User expands folder 1
  setLocalFolderExpanded(String(mockFolder1CollectionId), true);
  assert.equal(
    getLocalFolderExpanded(String(mockFolder1CollectionId), true),
    true,
    'Folder 1 should now be expanded after user action'
  );

  // 4. Subsequent normal sync (not initial sync) must NOT collapse folder 1
  const normalSyncResult = await syncWorkspaceWithRaindrop('mock_token', {
    localState: {
      ...initialSyncResult.latestSnapshot,
      raindropRootCollectionId: mockRootCollectionId,
    },
    isInitialSync: false,
    pendingOps: [],
  });

  assert.equal(normalSyncResult.success, true, 'Normal sync should succeed');
  // In normal sync, folder 1 should remain expanded in localStorage
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
