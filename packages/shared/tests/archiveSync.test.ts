import { syncIncrementalOperations, ARCABLE_ARCHIVE_COLLECTION_NAME } from '../src/utils/raindropSync';
import { applyOperation, createWorkspaceOperation } from '../src/utils/syncEngine';
import type { ArcableWorkspaceData, Space, Folder, Tab } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1. Test local state transitions via applyOperation
console.log('Testing applyOperation for archive operations...');

const initialSpace1: Space = { id: 's1', name: 'Work Space', raindropId: 101 };
const initialSpace2: Space = { id: 's2', name: 'Personal Space', raindropId: 102 };
const initialFolder1: Folder = { id: 'f1', name: 'Project A', parentSpaceId: 's1', raindropId: 201 };
const initialTab1: Tab = { id: 't1', url: 'https://example.com/1', parentFolderId: 'f1', raindropId: 301 };
const initialTab2: Tab = { id: 't2', url: 'https://example.com/2', parentSpaceId: 's1', raindropId: 302 };
const initialTab3: Tab = { id: 't3', url: 'https://example.com/3', favourite: true, raindropId: 303 };

const baseWorkspace: ArcableWorkspaceData = {
  spaces: [initialSpace1, initialSpace2],
  folders: [initialFolder1],
  tabs: [initialTab1, initialTab2, initialTab3],
  activeSpaceId: 's1',
  raindropRootCollectionId: 1,
};

// Test TAB_ARCHIVE
const tabArchiveOp = createWorkspaceOperation('TAB_ARCHIVE', 't1', { raindropId: 301 });
const wsAfterTabArchive = applyOperation(baseWorkspace, tabArchiveOp);
assert(wsAfterTabArchive.tabs.length === 2, 'Tab t1 should be removed');
assert(!wsAfterTabArchive.tabs.some((t) => t.id === 't1'), 'Tab t1 should not exist in tabs');

// Test FOLDER_ARCHIVE
const folderArchiveOp = createWorkspaceOperation('FOLDER_ARCHIVE', 'f1', { raindropId: 201 });
const wsAfterFolderArchive = applyOperation(baseWorkspace, folderArchiveOp);
assert(wsAfterFolderArchive.folders.length === 0, 'Folder f1 should be removed');
assert(!wsAfterFolderArchive.tabs.some((t) => t.id === 't1'), 'Tabs inside folder f1 should also be removed');
assert(wsAfterFolderArchive.tabs.some((t) => t.id === 't2'), 'Tab t2 in space s1 should remain');

// Test SPACE_ARCHIVE
const spaceArchiveOp = createWorkspaceOperation('SPACE_ARCHIVE', 's1', { raindropId: 101 });
const wsAfterSpaceArchive = applyOperation(baseWorkspace, spaceArchiveOp);
assert(wsAfterSpaceArchive.spaces.length === 1, 'Space s1 should be removed');
assert(wsAfterSpaceArchive.spaces[0].id === 's2', 'Only s2 should remain');
assert(wsAfterSpaceArchive.activeSpaceId === 's2', 'Active space should switch away from archived space');
assert(wsAfterSpaceArchive.folders.length === 0, 'Folders in space s1 should be removed');
assert(wsAfterSpaceArchive.tabs.length === 1 && wsAfterSpaceArchive.tabs[0].id === 't3', 'Tabs in space s1 should be removed');

console.log('applyOperation unit tests passed!');

// 2. Test syncIncrementalOperations with Raindrop API mocks
console.log('Testing syncIncrementalOperations for archive operations...');

const calls: Array<{ url: string; method: string; body?: any }> = [];
let nextCollectionId = 900;
let archiveCollectionId: number | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  calls.push({ url, method, body });

  if (method === 'GET') {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/collections')) {
      const items: any[] = [{ _id: 1, title: 'Arcable v2', count: 0, sort: 0 }];
      if (archiveCollectionId) {
        items.push({ _id: archiveCollectionId, title: ARCABLE_ARCHIVE_COLLECTION_NAME, count: 0, sort: 1 });
      }
      return new Response(JSON.stringify({ items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith('/collections/childrens')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ items: [], count: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'POST') {
    if (url.endsWith('/collection')) {
      const id = nextCollectionId++;
      if (body?.title === ARCABLE_ARCHIVE_COLLECTION_NAME) {
        archiveCollectionId = id;
      }
      return new Response(JSON.stringify({ item: { _id: id, ...body } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (method === 'PUT') {
    if (url.includes('/raindrop/')) {
      return new Response(JSON.stringify({ item: { _id: Number(url.split('/').pop()), ...body } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/collection/')) {
      return new Response(JSON.stringify({ item: { _id: Number(url.split('/').pop()), ...body } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ result: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as any;

async function runIncrementalTest() {
  const pendingOps: WorkspaceOperation[] = [
    createWorkspaceOperation('TAB_ARCHIVE', 't1', { raindropId: 301 }),
    createWorkspaceOperation('FOLDER_ARCHIVE', 'f1', { raindropId: 201 }),
    createWorkspaceOperation('SPACE_ARCHIVE', 's1', { raindropId: 101 }),
  ];

  const result = await syncIncrementalOperations(
    'test-token',
    baseWorkspace,
    pendingOps,
    false
  );

  assert(result !== null, 'syncIncrementalOperations should not return null');
  assert(result.success, 'syncIncrementalOperations should succeed');
  assert(archiveCollectionId !== null, 'Archive collection should have been created');

  // Verify API calls
  const tabArchivePut = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/raindrop/301'));
  assert(Boolean(tabArchivePut), 'Should have called PUT /raindrop/301 to move tab');
  assert(tabArchivePut?.body?.collection?.$id === archiveCollectionId, 'Tab should be moved to archiveCollectionId');

  const folderArchivePut = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/collection/201'));
  assert(Boolean(folderArchivePut), 'Should have called PUT /collection/201 to reparent folder');
  assert(folderArchivePut?.body?.parent?.$id === archiveCollectionId, 'Folder parent should be set to archiveCollectionId');

  const spaceArchivePut = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/collection/101'));
  assert(Boolean(spaceArchivePut), 'Should have called PUT /collection/101 to reparent space');
  assert(spaceArchivePut?.body?.parent?.$id === archiveCollectionId, 'Space parent should be set to archiveCollectionId');

  // Verify snapshot
  assert(result.latestSnapshot.raindropArchiveCollectionId === archiveCollectionId, 'Snapshot should record raindropArchiveCollectionId');
  assert(!result.latestSnapshot.spaces.some((s) => s.id === 's1'), 'Snapshot should not contain s1');
  assert(!result.latestSnapshot.folders.some((f) => f.id === 'f1'), 'Snapshot should not contain f1');
  assert(!result.latestSnapshot.tabs.some((t) => t.id === 't1'), 'Snapshot should not contain t1');

  console.log('syncIncrementalOperations unit tests passed successfully!');
}

runIncrementalTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
