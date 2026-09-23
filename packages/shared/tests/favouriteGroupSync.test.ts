import { syncWorkspaceWithRaindrop, reconstructWorkspace, ARCABLE_VARIANT_DELIMITER } from '../src/utils/raindropSync';
import { replayOperations } from '../src/utils/syncEngine';
import type { ArcableWorkspaceData, Tab, TabUrlVariant } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';
import type { RaindropBookmarkItem, RaindropCollectionTree } from '../src/types/raindrop';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ url: string; method: string; body?: any; cache?: RequestCache; headers?: Headers }> = [];
let nextId = 500;
let remoteItemsStore: RaindropBookmarkItem[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string'
    ? JSON.parse(init.body)
    : undefined;

  calls.push({
    url,
    method,
    body,
    cache: init?.cache,
    headers: new Headers(init?.headers),
  });

  if (method === 'GET') {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/collections')) {
      return new Response(JSON.stringify({
        items: [{ _id: 1, title: 'Arcable v2', count: remoteItemsStore.length, sort: 0 }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith('/collections/childrens')) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/raindrops/')) {
      return new Response(JSON.stringify({
        items: remoteItemsStore,
        count: remoteItemsStore.length,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (url.endsWith('/raindrops') && method === 'POST') {
    const created = body.items.map((item: any) => {
      const newItem: RaindropBookmarkItem = {
        _id: nextId++,
        title: item.title,
        link: item.link,
        cover: item.cover,
        collectionId: item.collection?.$id || 1,
        order: item.order ?? 0,
        sort: item.sort ?? 0,
      };
      remoteItemsStore.push(newItem);
      return newItem;
    });
    return new Response(JSON.stringify({ items: created }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT') {
    const id = Number(url.split('/').pop());
    const existing = remoteItemsStore.find((item) => item._id === id);
    if (existing) {
      if (body.title !== undefined) existing.title = body.title;
      if (body.link !== undefined) existing.link = body.link;
      if (body.cover !== undefined) existing.cover = body.cover;
      if (body.order !== undefined) existing.order = body.order;
      if (body.sort !== undefined) existing.sort = body.sort;
    }
    return new Response(JSON.stringify({ item: existing || { _id: id, ...body } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE') {
    if (url.includes('/raindrops/')) {
      // Batch delete
      const idsToDelete: number[] = body?.ids || [];
      remoteItemsStore = remoteItemsStore.filter((item) => !idsToDelete.includes(item._id));
      return new Response(JSON.stringify({ result: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const id = Number(url.split('/').pop());
    remoteItemsStore = remoteItemsStore.filter((item) => item._id !== id);
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}) as typeof fetch;

async function testFavouriteGroupSync(): Promise<void> {
  console.log('Running favourite group sync tests...');

  // Setup: Raindrop has two favourite bookmarks: Coding (101), Google AI Studio (102), Jules (103)
  remoteItemsStore = [
    { _id: 101, title: 'Coding', link: 'https://vscode.dev', collectionId: 1, order: 0, sort: 0 },
    { _id: 102, title: 'Google AI Studio', link: 'https://aistudio.google.com', collectionId: 1, order: 1, sort: 1 },
    { _id: 103, title: 'Jules', link: 'https://jules.google.com', collectionId: 1, order: 2, sort: 2 },
  ];

  const localState: ArcableWorkspaceData = {
    raindropRootCollectionId: 1,
    activeSpaceId: 'space-1',
    version: 2,
    spaces: [{ id: 'space-1', name: 'Space 1' }],
    folders: [],
    tabs: [
      {
        id: '101',
        raindropId: 101,
        url: 'https://vscode.dev',
        customTitle: 'Coding',
        favourite: true,
        order: 0,
      },
      {
        id: '102',
        raindropId: 102,
        url: 'https://aistudio.google.com',
        customTitle: 'Google AI Studio',
        favourite: true,
        order: 1,
      },
      {
        id: '103',
        raindropId: 103,
        url: 'https://jules.google.com',
        customTitle: 'Jules',
        favourite: true,
        order: 2,
      },
    ],
  };

  // Simulate dragging tab 102 and 103 into tab 101 to form a group "Coding"
  const mergedVariants: TabUrlVariant[] = [
    { id: '101', name: 'Coding', url: 'https://vscode.dev' },
    { id: '102', name: 'Google AI Studio', url: 'https://aistudio.google.com' },
    { id: '103', name: 'Jules', url: 'https://jules.google.com' },
  ];

  const ops: WorkspaceOperation[] = [
    {
      id: 'op-update-101',
      type: 'TAB_UPDATE',
      entityId: '101',
      payload: {
        customTitle: 'Coding',
        isGroup: true,
        url: 'https://vscode.dev',
        urlVariants: mergedVariants,
        defaultVariantId: '101',
      },
      deviceId: 'test',
      timestamp: Date.now(),
      lamportSeq: 1,
    },
    {
      id: 'op-delete-102',
      type: 'TAB_DELETE',
      entityId: '102',
      payload: {
        raindropId: undefined, // absorbed into mergedVariants
        collectionId: 1,
      },
      deviceId: 'test',
      timestamp: Date.now(),
      lamportSeq: 2,
    },
    {
      id: 'op-delete-103',
      type: 'TAB_DELETE',
      entityId: '103',
      payload: {
        raindropId: undefined, // absorbed into mergedVariants
        collectionId: 1,
      },
      deviceId: 'test',
      timestamp: Date.now(),
      lamportSeq: 3,
    },
  ];

  // Test 1: replayOperations preserves customTitle and isGroup
  const replayed = replayOperations(localState, ops);
  const replayedTarget = replayed.tabs.find((t) => t.id === '101');
  assert(replayedTarget !== undefined, 'Target tab 101 should exist after replay');
  assert(replayedTarget.customTitle === 'Coding', 'Replayed tab should preserve customTitle');
  assert(replayedTarget.isGroup === true, 'Replayed tab should preserve isGroup flag');
  assert(replayedTarget.urlVariants?.length === 3, 'Replayed tab should have 3 variants');
  assert(!replayed.tabs.some((t) => t.id === '102'), 'Source tab 102 should be removed');
  assert(!replayed.tabs.some((t) => t.id === '103'), 'Source tab 103 should be removed');
  console.log('✓ replayOperations correctly preserves customTitle, isGroup, and variants');

  // Test 2: Full sync with Raindrop
  calls.length = 0;
  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: replayed,
    pendingOps: ops,
    forceFullTreeFetch: true,
  });

  assert(syncResult.success, 'Sync should succeed');

  // Check remote items after sync
  assert(remoteItemsStore.length === 3, `Expected exactly 3 remote items, got ${remoteItemsStore.length}`);
  const baseBookmark = remoteItemsStore.find((item) => item._id === 101);
  assert(baseBookmark?.title === `Coding${ARCABLE_VARIANT_DELIMITER}Coding`, 'Base bookmark title should be Coding ||| Coding');

  const var1 = remoteItemsStore.find((item) => item._id === 102);
  assert(var1?.title === `Coding${ARCABLE_VARIANT_DELIMITER}Google AI Studio`, 'Item 102 should be updated to variant title');

  const var2 = remoteItemsStore.find((item) => item._id === 103);
  assert(var2?.title === `Coding${ARCABLE_VARIANT_DELIMITER}Jules`, 'Item 103 should be updated to variant title');
  console.log('✓ Full sync properly reuses existing Raindrop bookmarks as variants without creating orphans or duplicates');

  // Test 3: Workspace reconstruction does not create duplicate groups
  const rootCol = { _id: 1, title: 'Arcable v2', count: 3, sort: 0 };
  const tree = {
    root: rootCol,
    collections: [rootCol],
    items: remoteItemsStore,
  };

  const reconstructed = reconstructWorkspace(tree, 'space-1');
  const favTabs = reconstructed.tabs.filter((t) => t.favourite);
  assert(favTabs.length === 1, `Expected exactly 1 favourite group tab, got ${favTabs.length}`);
  assert(favTabs[0].customTitle === 'Coding', 'Reconstructed group customTitle should be Coding');
  assert(favTabs[0].urlVariants?.length === 3, 'Reconstructed group should have 3 variants');
  assert(favTabs[0].isGroup === true, 'Reconstructed group should have isGroup true');
  console.log('✓ reconstructWorkspace reconstructs exactly 1 favourite group tab');

  // Test 4: Orphan variant reconciliation with existing tab
  remoteItemsStore.push({
    _id: 201,
    title: `Antigravity${ARCABLE_VARIANT_DELIMITER}Google AI Studio`,
    link: 'https://aistudio.google.com',
    collectionId: 1,
    order: 10,
    sort: 10,
  });

  const treeWithOrphan = {
    root: rootCol,
    collections: [rootCol],
    items: remoteItemsStore,
  };

  const reconstructedWithOrphan = reconstructWorkspace(treeWithOrphan, 'space-1');
  const favTabsWithOrphan = reconstructedWithOrphan.tabs.filter((t) => t.favourite);
  assert(favTabsWithOrphan.length === 1, `Expected exactly 1 favourite group tab despite orphan variant with duplicate URL, got ${favTabsWithOrphan.length}`);
  assert(favTabsWithOrphan[0].urlVariants?.length === 3, 'Variants should remain deduplicated');
  console.log('✓ reconstructWorkspace deduplicates orphan variants and reconciles without creating duplicate group');

  // Test 5: Full sync deletes orphan variants when pushing workspace
  calls.length = 0;
  const syncWithOrphanResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: reconstructedWithOrphan,
    pendingOps: [],
    replaceBaseline: true,
  });
  assert(syncWithOrphanResult.success, 'Sync with orphan should succeed');
  assert(!remoteItemsStore.some((item) => item._id === 201), 'Orphan variant 201 should be deleted from Raindrop');
  console.log('✓ Full sync deletes orphan variants from Raindrop');

  console.log('All favourite group sync tests passed successfully!');
}

void testFavouriteGroupSync().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
