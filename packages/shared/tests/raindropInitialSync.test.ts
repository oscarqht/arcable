import assert from 'node:assert/strict';
import { syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';
import {
  getStoredPendingOperations,
  savePendingOperation,
  clearStoredPendingOperations,
} from '../src/utils/syncEngine';
import { ArcableWorkspaceData, WorkspaceOperation } from '../src/types';

const calls: Array<{ url: string; method: string; body?: any }> = [];

let mockRemoteTree = {
  hasRoot: true,
  rootId: 500,
  spaces: [
    { _id: 501, title: 'Remote Work', parent: { $id: 500 }, sort: 0 },
  ],
  bookmarks: [
    {
      _id: 601,
      title: 'Remote Doc',
      link: 'https://docs.example.com',
      collection: { $id: 501 },
      created: '2026-01-01T00:00:00Z',
    },
  ],
  metadataItemId: 701,
  metadata: {
    widgets: [{ id: 'w-remote-1', style: 'combo' }],
  },
};

// Mock localStorage for pending ops
const mockStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => { mockStorage.set(key, value); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
};
(globalThis as any).localStorage = storageMock;
(globalThis as any).window = {
  localStorage: storageMock,
  dispatchEvent: () => true,
};

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  let body: any;
  if (init?.body) {
    try {
      body = JSON.parse(String(init.body));
    } catch {
      body = String(init.body);
    }
  }
  calls.push({ url, method, body });
  const pathname = new URL(url).pathname;

  if (pathname.endsWith('/collections')) {
    return new Response(JSON.stringify({
      items: mockRemoteTree.hasRoot ? [{ _id: mockRemoteTree.rootId, title: 'Arcable v2', sort: 0 }] : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.endsWith('/collections/childrens')) {
    return new Response(JSON.stringify({
      items: mockRemoteTree.hasRoot ? mockRemoteTree.spaces : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.includes('/raindrops/')) {
    const collId = parseInt(pathname.split('/raindrops/')[1], 10);
    if (collId === mockRemoteTree.rootId) {
      const items = mockRemoteTree.metadataItemId
        ? [{
            _id: mockRemoteTree.metadataItemId,
            title: 'data.json.txt',
            collection: { $id: mockRemoteTree.rootId },
            file: { name: 'data.json.txt' },
          }]
        : [];
      return new Response(JSON.stringify({ items, count: items.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = mockRemoteTree.bookmarks.filter(b => b.collection.$id === collId);
    return new Response(JSON.stringify({ items, count: items.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathname.endsWith(`/raindrop/${mockRemoteTree.metadataItemId}/file`)) {
    return new Response(JSON.stringify(mockRemoteTree.metadata), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathname.endsWith(`/raindrop/${mockRemoteTree.metadataItemId}`)) {
    return new Response(JSON.stringify({
      item: { _id: mockRemoteTree.metadataItemId, title: 'data.json.txt' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Write endpoints for fallback/new account tests
  if (method === 'POST' && pathname.endsWith('/collection')) {
    return new Response(JSON.stringify({ item: { _id: 888, title: 'Arcable v2' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

async function runTests(): Promise<void> {
  // Test 1: New device with local un-synced cache and pending operations
  // The remote tree already exists. The new device MUST NOT upload any local data.
  // It MUST ONLY fetch the remote tree and clear pending ops.
  calls.length = 0;
  mockStorage.clear();

  const newDeviceLocalData: ArcableWorkspaceData = {
    spaces: [
      { id: 'local-space-1', name: 'Default Local Space', color: '#ff0000', icon: 'star', tabs: [] },
    ],
    tabs: [
      { id: 'local-tab-1', title: 'Local Tab', url: 'https://local.example.com', spaceId: 'local-space-1' },
    ],
    activeSpaceId: 'local-space-1',
    // raindropRootCollectionId is undefined on a new device
  };

  const pendingOps: WorkspaceOperation[] = [
    {
      id: 'op-1',
      type: 'create_space',
      entityId: 'local-space-1',
      payload: { name: 'Default Local Space' },
      timestamp: Date.now(),
    },
    {
      id: 'op-2',
      type: 'create_tab',
      entityId: 'local-tab-1',
      payload: { title: 'Local Tab', url: 'https://local.example.com' },
      timestamp: Date.now(),
    },
  ];

  pendingOps.forEach(op => savePendingOperation(op));
  assert.equal(getStoredPendingOperations().length, 2, 'Pending ops should be stored before sync');

  const result = await syncWorkspaceWithRaindrop('test-token', {
    localState: newDeviceLocalData,
    pendingOps,
  });

  assert.equal(result.success, true, 'Sync should succeed');
  assert.equal(result.collectionId, 500, 'Root collection ID should match remote Arcable root');
  assert.equal(result.dataItemId, 701, 'Metadata item ID should match remote metadata file');

  // Verify write operations were NOT issued
  const writeCalls = calls.filter(c => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method));
  assert.equal(writeCalls.length, 0, `Initial sync must NOT issue any write requests! Found: ${JSON.stringify(writeCalls)}`);

  // Verify result snapshot contains remote spaces, NOT local ones
  assert(result.latestSnapshot, 'latestSnapshot must be returned');
  const remoteSpaceNames = result.latestSnapshot.spaces.map(s => s.name);
  assert(remoteSpaceNames.includes('Remote Work'), 'latestSnapshot must contain remote space');
  assert(!remoteSpaceNames.includes('Default Local Space'), 'latestSnapshot must NOT contain local-only space');

  // Verify stored pending operations were cleared
  assert.equal(getStoredPendingOperations().length, 0, 'Initial sync must clear stored pending operations');

  // Test 2: Explicit isInitialSync: true flag
  calls.length = 0;
  const explicitSyncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: {
      ...newDeviceLocalData,
      raindropRootCollectionId: 500, // even if it has an ID
    },
    isInitialSync: true,
    pendingOps,
  });

  assert.equal(explicitSyncResult.success, true);
  const explicitWrites = calls.filter(c => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method));
  assert.equal(explicitWrites.length, 0, 'Explicit isInitialSync must not issue any write requests');
  assert(explicitSyncResult.latestSnapshot?.spaces.some(s => s.name === 'Remote Work'));

  console.log('Raindrop initial sync tests passed successfully!');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
