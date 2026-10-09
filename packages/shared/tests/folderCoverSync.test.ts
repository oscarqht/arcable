import assert from 'node:assert/strict';
import {
  isCustomRaindropCollectionCover,
  uploadRaindropCollectionCover,
  createRaindropCollection,
  updateRaindropCollection,
} from '../src/utils/raindropClient';
import {
  syncIncrementalOperations,
  syncWorkspaceWithRaindrop,
  fetchRaindropWorkspace,
  reconstructWorkspace,
} from '../src/utils/raindropSync';
import { applyOperation } from '../src/utils/syncEngine';
import type { ArcableWorkspaceData, Folder } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

async function main() {
  console.log('--- Running Folder Cover Sync Tests ---');

  // Test 1: isCustomRaindropCollectionCover
  assert.equal(isCustomRaindropCollectionCover(undefined), false);
  assert.equal(isCustomRaindropCollectionCover(''), false);
  assert.equal(isCustomRaindropCollectionCover('   '), false);
  assert.equal(isCustomRaindropCollectionCover('📁'), false);
  assert.equal(isCustomRaindropCollectionCover('rocket'), false);
  assert.equal(isCustomRaindropCollectionCover('https://rdl.ink/icon/123.png'), false);
  assert.equal(isCustomRaindropCollectionCover('https://icons8.com/icon/123.png'), false);
  assert.equal(isCustomRaindropCollectionCover('https://twemoji.maxcdn.com/v/13.0.1/72x72/1f4c1.png'), false);
  assert.equal(isCustomRaindropCollectionCover('https://raindrop.io/icon/default.png'), false);
  assert.equal(isCustomRaindropCollectionCover('https://up.raindrop.io/collection/thumbs/123/cover.png'), false);
  assert.equal(isCustomRaindropCollectionCover('data:image/png;base64,iVBORw=='), true);
  assert.equal(isCustomRaindropCollectionCover('https://up.raindrop.io/raindrop/files/456/cover.png'), true);
  assert.equal(isCustomRaindropCollectionCover('https://images.unsplash.com/photo-1234'), true);
  console.log('✓ isCustomRaindropCollectionCover correctly classifies URLs');

  // Test 2: syncEngine FOLDER_CREATE and FOLDER_UPDATE coverUrl handling
  const baseWorkspace: ArcableWorkspaceData = {
    activeSpaceId: 'space-1',
    spaces: [{ id: 'space-1', name: 'Work' }],
    folders: [],
    tabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };

  const createOp: WorkspaceOperation = {
    id: 'op-1',
    type: 'FOLDER_CREATE',
    entityId: 'folder-1',
    deviceId: 'dev-1',
    timestamp: 1000,
    payload: {
      name: 'Docs',
      parentSpaceId: 'space-1',
      coverUrl: 'https://up.raindrop.io/collection/thumbs/99/cover.png',
    },
  };
  const wsAfterCreate = applyOperation(baseWorkspace, createOp);
  assert.equal(wsAfterCreate.folders.length, 1);
  assert.equal(wsAfterCreate.folders[0].coverUrl, 'https://up.raindrop.io/collection/thumbs/99/cover.png');

  const updateOp: WorkspaceOperation = {
    id: 'op-2',
    type: 'FOLDER_UPDATE',
    entityId: 'folder-1',
    deviceId: 'dev-1',
    timestamp: 2000,
    payload: {
      coverUrl: 'https://up.raindrop.io/collection/thumbs/99/new-cover.png',
    },
  };
  const wsAfterUpdate = applyOperation(wsAfterCreate, updateOp);
  assert.equal(wsAfterUpdate.folders[0].coverUrl, 'https://up.raindrop.io/collection/thumbs/99/new-cover.png');

  const clearOp: WorkspaceOperation = {
    id: 'op-3',
    type: 'FOLDER_UPDATE',
    entityId: 'folder-1',
    deviceId: 'dev-1',
    timestamp: 3000,
    payload: {
      coverUrl: null,
    },
  };
  const wsAfterClear = applyOperation(wsAfterUpdate, clearOp);
  assert.equal(wsAfterClear.folders[0].coverUrl, undefined);
  console.log('✓ syncEngine FOLDER_CREATE and FOLDER_UPDATE handle coverUrl properly');

  // Test 3: API client methods and sync with mock fetch
  const calls: Array<{ url: string; method: string; headers: any; body: any }> = [];
  const remoteCollections: any[] = [
    { _id: 1, title: 'Arcable v2', count: 0, sort: 0 },
    { _id: 10, title: 'Work', parent: { $id: 1 }, sort: 1000 },
    { _id: 20, title: 'Projects', parent: { $id: 10 }, sort: 1000, cover: [] },
  ];
  let nextRemoteId = 100;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string'
      ? (init.body ? JSON.parse(init.body) : undefined)
      : init?.body;
    calls.push({ url, method, headers: init?.headers, body });

    // Mock fetching custom cover image (e.g. from data or http URL)
    if (url.startsWith('https://up.raindrop.io/raindrop/files/')) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }

    if (method === 'GET') {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/collections') || pathname.endsWith('/collections/childrens')) {
        return new Response(JSON.stringify({ items: remoteCollections }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (pathname.includes('/raindrops/')) {
        return new Response(JSON.stringify({ items: [], count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (method === 'POST' && url.endsWith('/collection')) {
      const id = nextRemoteId++;
      const item = { _id: id, count: 0, ...body };
      remoteCollections.push(item);
      return new Response(JSON.stringify({ item }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Collection cover upload endpoint (multipart PUT /collection/{id}/cover)
    if (method === 'PUT' && url.includes('/collection/') && url.endsWith('/cover')) {
      const parts = url.split('/');
      const collId = Number(parts[parts.length - 2]);
      assert(body instanceof FormData, 'Collection cover upload must use FormData');
      const coverFile = body.get('cover');
      assert(coverFile, 'FormData must contain cover');
      const thumbUrl = `https://up.raindrop.io/collection/thumbs/${collId}/cover.png`;
      const target = remoteCollections.find((c) => c._id === collId);
      if (target) {
        target.cover = [thumbUrl];
      }
      return new Response(
        JSON.stringify({
          result: true,
          item: { _id: collId, cover: [thumbUrl] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'PUT' && url.includes('/collection/')) {
      const parts = url.split('/');
      const collId = Number(parts[parts.length - 1]);
      const target = remoteCollections.find((c) => c._id === collId);
      if (target) {
        Object.assign(target, body);
      }
      return new Response(
        JSON.stringify({ item: target || { _id: collId, ...body } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    // Test 3a: uploadRaindropCollectionCover directly
    const thumb = await uploadRaindropCollectionCover('test-token', 20, 'data:image/png;base64,iVBORw==');
    assert.equal(thumb, 'https://up.raindrop.io/collection/thumbs/20/cover.png');
    const targetColl = remoteCollections.find((c) => c._id === 20);
    assert.deepEqual(targetColl.cover, ['https://up.raindrop.io/collection/thumbs/20/cover.png']);
    console.log('✓ uploadRaindropCollectionCover generates collection thumb');

    // Test 3b: createRaindropCollection with custom cover
    const createdColl = await createRaindropCollection('test-token', 'Design', 10, {
      cover: ['https://up.raindrop.io/raindrop/files/456/cover.png'],
    });
    assert.equal(createdColl.title, 'Design');
    assert.deepEqual(createdColl.cover, [`https://up.raindrop.io/collection/thumbs/${createdColl._id}/cover.png`]);
    console.log('✓ createRaindropCollection uploads custom cover and sets collection thumb');

    // Test 3c: updateRaindropCollection with custom cover
    const updatedColl = await updateRaindropCollection('test-token', 20, {
      cover: ['https://up.raindrop.io/raindrop/files/789/new.png'],
    });
    assert.deepEqual(updatedColl?.cover, ['https://up.raindrop.io/collection/thumbs/20/cover.png']);

    // Test 3d: updateRaindropCollection clearing cover
    const clearedColl = await updateRaindropCollection('test-token', 20, {
      cover: [],
    });
    assert.deepEqual(clearedColl?.cover, []);
    console.log('✓ updateRaindropCollection uploads custom cover and handles clearing cover');

    // Test 4: Incremental sync with folder cover update
    const initialWorkspace: ArcableWorkspaceData = {
      raindropRootCollectionId: 1,
      activeSpaceId: '10',
      spaces: [{ id: '10', raindropId: 10, name: 'Work', order: 1000 }],
      folders: [
        {
          id: '20',
          raindropId: 20,
          name: 'Projects',
          parentSpaceId: '10',
          coverUrl: 'https://up.raindrop.io/raindrop/files/789/custom.png',
          order: 1000,
        },
      ],
      tabs: [],
      widgets: [],
      customCodeRules: [],
      runCodeInPageRules: [],
    };

    const incResult = await syncIncrementalOperations(
      'test-token',
      initialWorkspace,
      [
        {
          id: 'op-inc-1',
          type: 'FOLDER_UPDATE',
          entityId: '20',
          deviceId: 'dev-1',
          timestamp: 5000,
          payload: {
            coverUrl: 'https://up.raindrop.io/raindrop/files/789/custom.png',
          },
        },
      ],
      false
    );

    assert(incResult && incResult.success);
    const updatedFolder = incResult.latestSnapshot?.folders.find((f) => f.id === '20');
    assert(updatedFolder);
    assert.equal(updatedFolder.coverUrl, 'https://up.raindrop.io/collection/thumbs/20/cover.png');
    console.log('✓ Incremental sync updates folder cover and updates snapshot with collection thumb');

    // Test 5: Incremental sync clearing folder cover
    const clearedWorkspace: ArcableWorkspaceData = {
      ...initialWorkspace,
      folders: [
        {
          ...initialWorkspace.folders[0],
          coverUrl: undefined,
        },
      ],
    };

    const incClearResult = await syncIncrementalOperations(
      'test-token',
      clearedWorkspace,
      [
        {
          id: 'op-inc-2',
          type: 'FOLDER_UPDATE',
          entityId: '20',
          deviceId: 'dev-1',
          timestamp: 6000,
          payload: {
            coverUrl: null,
          },
        },
      ],
      false
    );

    assert(incClearResult && incClearResult.success);
    const clearedFolder = incClearResult.latestSnapshot?.folders.find((f) => f.id === '20');
    assert(clearedFolder);
    assert.equal(clearedFolder.coverUrl, undefined);
    const remote20 = remoteCollections.find((c) => c._id === 20);
    assert.deepEqual(remote20.cover, []);
    console.log('✓ Incremental sync clears folder cover in Raindrop and in snapshot');

    // Test 6: Baseline sync and workspace hydration preserves folder custom cover
    // Set folder cover in remote collection to simulate synced state in Raindrop
    remote20.cover = ['https://up.raindrop.io/collection/thumbs/20/cover.png'];
    const fetched = await fetchRaindropWorkspace('test-token');
    assert(fetched.success && fetched.data);
    const hydratedFolder = fetched.data.folders.find((f) => f.id === '20');
    assert(hydratedFolder);
    assert.equal(hydratedFolder.coverUrl, 'https://up.raindrop.io/collection/thumbs/20/cover.png');
    console.log('✓ Hydration reconstructs custom folder cover from collection thumbs');

    // Baseline sync with local cover change
    const localWithCover: ArcableWorkspaceData = {
      ...fetched.data,
      folders: fetched.data.folders.map((f) =>
        f.id === '20'
          ? { ...f, coverUrl: 'https://up.raindrop.io/raindrop/files/999/brand.png', updatedAt: Date.now() + 1000 }
          : f
      ),
    };

    const baseSyncResult = await syncWorkspaceWithRaindrop('test-token', {
      localState: localWithCover,
      replaceBaseline: false,
      pendingOps: [
        {
          id: 'op-base-1',
          type: 'FOLDER_UPDATE',
          entityId: '20',
          deviceId: 'dev-1',
          timestamp: Date.now() + 1000,
          payload: {
            coverUrl: 'https://up.raindrop.io/raindrop/files/999/brand.png',
          },
        },
      ],
    });

    assert(baseSyncResult.success);
    const baseSyncedFolder = baseSyncResult.latestSnapshot?.folders.find((f) => f.id === '20');
    assert(baseSyncedFolder);
    assert.equal(baseSyncedFolder.coverUrl, 'https://up.raindrop.io/collection/thumbs/20/cover.png');
    console.log('✓ Baseline sync successfully updates Raindrop collection cover and retains it in snapshot');

    console.log('\nAll Folder Cover Sync Tests Passed Successfully! 🎉');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main().catch((err) => {
  console.error('Test failed:', err);
  process.exitCode = 1;
});
