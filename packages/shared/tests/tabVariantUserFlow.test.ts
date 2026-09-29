import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncWorkspaceWithRaindrop,
  reconstructWorkspace,
  ARCABLE_VARIANT_DELIMITER,
  encodeRaindropTitle,
  decodeRaindropTitle,
} from '../src/utils/raindropSync';
import {
  createWorkspaceOperation,
  savePendingOperation,
  getStoredPendingOperations,
  removeStoredPendingOperations,
  clearStoredPendingOperations,
  mergeIncrementalSyncSnapshot,
  replayOperations,
} from '../src/utils/syncEngine';
import type { ArcableWorkspaceData, Tab, TabUrlVariant, RaindropBookmarkItem, WorkspaceOperation } from '../src/types';

// Let's mock localStorage
const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
  },
  dispatchEvent: () => true,
};

let remoteItemsStore: RaindropBookmarkItem[] = [];
let nextId = 3000;

(globalThis as any).fetch = (async (url: string, init?: RequestInit) => {
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(init.body as string) : undefined;

  if (method === 'GET') {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/collections')) {
      return new Response(JSON.stringify({
        items: [
          { _id: 1, title: 'Arcable v2', count: remoteItemsStore.length, sort: 0 },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith('/collections/childrens')) {
      return new Response(JSON.stringify({
        items: [
          { _id: 2, title: 'Personal', parent: { $id: 1 }, count: remoteItemsStore.length, sort: 0 },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/raindrops/')) {
      const sorted = [...remoteItemsStore].sort((a, b) => (a.sort ?? a.order ?? 0) - (b.sort ?? b.order ?? 0) || a._id - b._id);
      return new Response(JSON.stringify({
        items: sorted,
        count: sorted.length,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (url.includes('cover') || url.includes('icon')) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/collection') && method === 'POST') {
    return new Response(JSON.stringify({ item: { _id: 2, title: body?.title || 'Collection', parent: { $id: 1 } } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.endsWith('/raindrops') && method === 'POST') {
    const created = body.items.map((item: any) => {
      const newItem: RaindropBookmarkItem = {
        _id: nextId++,
        title: item.title,
        link: item.link,
        cover: item.cover,
        note: item.note,
        collectionId: item.collection?.$id || 2,
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
      if (body.note !== undefined) existing.note = body.note;
      if (body.order !== undefined) existing.order = body.order;
      if (body.sort !== undefined) existing.sort = body.sort;
      if (body.collection?.$id !== undefined) existing.collectionId = body.collection.$id;
    }
    return new Response(JSON.stringify({ item: existing || { _id: id, ...body } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE') {
    if (url.includes('/raindrops/')) {
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

test('simulate entire user flow including TabModal onSave, reorderSiblingItem, and WorkspaceManager applySuccessfulSnapshot', async () => {
  store.clear();
  const spaceId = 'space_personal';

  // Suppose user has 2 tabs in Raindrop:
  // Tab 1: App (https://app.com)
  // Tab 2: Other (https://other.com)
  remoteItemsStore = [
    {
      _id: 2001,
      title: 'App',
      link: 'https://app.com',
      cover: 'https://app.com/icon.png',
      collectionId: 2,
      order: 1000,
      sort: 1000,
    },
    {
      _id: 2002,
      title: 'Other',
      link: 'https://other.com',
      cover: 'https://other.com/icon.png',
      collectionId: 2,
      order: 2000,
      sort: 2000,
    },
  ];

  let localState: ArcableWorkspaceData = {
    raindropRootCollectionId: 1,
    activeSpaceId: spaceId,
    version: 1,
    spaces: [{ id: spaceId, name: 'Personal', raindropId: 2, createdAt: 1, updatedAt: 1 }],
    folders: [],
    tabs: [
      {
        id: '2001',
        raindropId: 2001,
        url: 'https://app.com',
        customTitle: 'App',
        favIconUrl: 'https://app.com/icon.png',
        parentSpaceId: spaceId,
        order: 1000,
        pinned: false,
      },
      {
        id: '2002',
        raindropId: 2002,
        url: 'https://other.com',
        customTitle: 'Other',
        favIconUrl: 'https://other.com/icon.png',
        parentSpaceId: spaceId,
        order: 2000,
        pinned: false,
      },
    ],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };

  // STEP 1: TabModal simulates user adding a variant:
  // User adds variant 2: Staging (https://staging.app.com)
  // User sets icon for variant 2: 'https://staging.app.com/icon.png'
  // User drags variant 2 to top -> Staging is default!
  // TabModal handleSubmit runs:
  const varStagingId = 'var_' + Date.now() + '_staging';
  const varAppId = 'var_' + Date.now() + '_app';
  const stagingIcon = 'https://staging.app.com/icon.png';
  const appIcon = 'https://app.com/icon.png';

  const tabModalVariants: TabUrlVariant[] = [
    {
      id: varStagingId,
      name: 'Staging',
      url: 'https://staging.app.com',
      favIconUrl: stagingIcon,
    },
    {
      id: varAppId,
      name: 'App',
      url: 'https://app.com',
      favIconUrl: appIcon,
    },
  ];

  // In TabModal handleSubmit:
  // const defVariant = validVariants[0]; // Staging
  // const firstVarName = 'Staging';
  // const effectiveDefCover = stagingIcon;
  const tabModalSaveData = {
    url: 'https://staging.app.com',
    urlVariants: tabModalVariants,
    defaultVariantId: varStagingId,
    isGroup: false,
    parentSpaceId: spaceId,
    parentFolderId: undefined,
    customTitle: 'Staging',
    favIconUrl: stagingIcon,
    pinned: false,
    favourite: false,
  };

  // Now, what does updateTab do?
  // Let's run the exact logic of updateTab on tab 2001:
  const currentTab = localState.tabs.find((t) => t.id === '2001')!;
  const normalizedUpdates = { ...tabModalSaveData };
  const updatedTabObj: Tab = {
    ...currentTab,
    ...normalizedUpdates,
    updatedAt: Date.now(),
  };

  // opPayload saved to pending operations in updateTab:
  const updateTabOp = createWorkspaceOperation('TAB_UPDATE', '2001', {
    ...tabModalSaveData,
    urlVariants: tabModalVariants,
    defaultVariantId: varStagingId,
    favIconUrl: stagingIcon,
    customTitle: 'Staging',
  });
  savePendingOperation(updateTabOp);

  localState = {
    ...localState,
    tabs: localState.tabs.map((t) => (t.id === '2001' ? updatedTabObj : t)),
  };

  console.log('After updateTab, tab in localState:');
  console.log(JSON.stringify(localState.tabs.find((t) => t.id === '2001'), null, 2));

  // STEP 2: The user moves the tab item's order!
  // In the sidebar, user drags tab 2001 to after tab 2002.
  // reorderSiblingItem runs:
  // tab 2002 gets order 1000.
  // tab 2001 gets order 2000.
  const reorderOp2001 = createWorkspaceOperation('TAB_UPDATE', '2001', {
    parentSpaceId: spaceId,
    parentFolderId: null,
    pinned: false,
    favourite: false,
    order: 2000,
  });
  savePendingOperation(reorderOp2001);

  const reorderOp2002 = createWorkspaceOperation('TAB_UPDATE', '2002', {
    parentSpaceId: spaceId,
    parentFolderId: null,
    pinned: false,
    favourite: false,
    order: 1000,
  });
  savePendingOperation(reorderOp2002);

  localState = {
    ...localState,
    tabs: localState.tabs.map((t) => {
      if (t.id === '2001') return { ...t, order: 2000, updatedAt: Date.now() };
      if (t.id === '2002') return { ...t, order: 1000, updatedAt: Date.now() };
      return t;
    }),
  };

  console.log('Pending ops before sync:', getStoredPendingOperations().map((o) => ({ type: o.type, id: o.entityId, payload: o.payload })));

  // STEP 3: Sync runs!
  // In WorkspaceManager: executeSyncCycle runs.
  const pendingOps = getStoredPendingOperations();
  const syncedOpIds = pendingOps.map((op) => op.id);
  const isIncrementalCrud = pendingOps.length > 0;
  const isInitialSync = false;

  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState,
    pendingOps,
  });

  console.log('Sync result success:', syncResult.success);
  console.log('Sync result snapshot tabs:', JSON.stringify(syncResult.latestSnapshot?.tabs, null, 2));

  const applySuccessfulSnapshot = (snapshot: ArcableWorkspaceData, syncedIds: string[]) => {
    removeStoredPendingOperations(syncedIds);
    const remainingOps: WorkspaceOperation[] = getStoredPendingOperations();
    let nextSnapshot = !isInitialSync && isIncrementalCrud
      ? mergeIncrementalSyncSnapshot(localState, snapshot)
      : snapshot;
    if (remainingOps.length > 0) {
      nextSnapshot = replayOperations(nextSnapshot, remainingOps);
    }
    return nextSnapshot;
  };

  const finalState = applySuccessfulSnapshot(syncResult.latestSnapshot!, syncedOpIds);
  localState = finalState;
  console.log('Final local state after applySuccessfulSnapshot:');
  console.log(JSON.stringify(finalState.tabs, null, 2));

  // Assertions:
  const finalTab2001 = finalState.tabs.find((t) => t.id === '2001');
  assert.ok(finalTab2001, 'Tab 2001 must exist');
  assert.equal(finalTab2001.url, 'https://staging.app.com', 'Tab URL should be staging URL');
  assert.equal(finalTab2001.favIconUrl, stagingIcon, 'Tab favIconUrl should be stagingIcon');
  assert.equal(finalTab2001.urlVariants?.length, 2, 'Tab should have 2 variants');
  assert.equal(finalTab2001.urlVariants?.[0].favIconUrl, stagingIcon, 'First variant should have stagingIcon');
  assert.equal(finalTab2001.urlVariants?.[1].name, 'App', 'Second variant should be App');
  assert.equal(finalTab2001.order, 2000, 'Tab 2001 order should be 2000');

  // STEP 4: Now simulate what happens if user moves the tab AFTER the first sync completes!
  // (In real life: user saves TabModal -> 150ms debounce -> sync starts -> sync finishes.
  // Then user drags the tab item to reorder -> reorderSiblingItem runs -> second incremental sync starts!)
  
  // User reorders tab 2001 back to order 1000 and tab 2002 to order 2000
  const reorderOp2 = createWorkspaceOperation('TAB_UPDATE', '2001', {
    parentSpaceId: spaceId,
    parentFolderId: null,
    pinned: false,
    favourite: false,
    order: 1000,
  });
  savePendingOperation(reorderOp2);

  const stateAfterUserReorder: ArcableWorkspaceData = {
    ...finalState,
    tabs: finalState.tabs.map((t) => {
      if (t.id === '2001') return { ...t, order: 1000, updatedAt: Date.now() };
      if (t.id === '2002') return { ...t, order: 2000, updatedAt: Date.now() };
      return t;
    }),
  };

  const reorderSyncPendingOps = getStoredPendingOperations();
  console.log('Pending ops for second sync (after user reorder):', reorderSyncPendingOps);

  const thirdSyncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: stateAfterUserReorder,
    pendingOps: reorderSyncPendingOps,
  });

  console.log('--- REMOTE ITEMS STORE AFTER SECOND INCREMENTAL SYNC ---');
  console.log(JSON.stringify(remoteItemsStore, null, 2));

  const finalStateAfterReorderSync = applySuccessfulSnapshot(
    thirdSyncResult.latestSnapshot!,
    reorderSyncPendingOps.map((op) => op.id)
  );
  console.log('Final state after second incremental sync:');
  console.log(JSON.stringify(finalStateAfterReorderSync.tabs, null, 2));

  // Now simulate full sync / reload:
  const reloadSyncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: finalStateAfterReorderSync,
    pendingOps: [],
  });

  console.log('--- REMOTE ITEMS STORE AFTER RELOAD SYNC ---');
  console.log(JSON.stringify(remoteItemsStore, null, 2));
  console.log('Reloaded tabs:');
  console.log(JSON.stringify(reloadSyncResult.latestSnapshot?.tabs, null, 2));

  const finalReloadedTab2001 = reloadSyncResult.latestSnapshot?.tabs.find((t) => t.raindropId === 2001 || t.id === '2001');
  assert.ok(finalReloadedTab2001, 'Reloaded tab 2001 must exist');
  assert.equal(finalReloadedTab2001.url, 'https://staging.app.com', 'Reloaded tab URL should be staging URL');
  assert.equal(finalReloadedTab2001.favIconUrl, stagingIcon, 'Reloaded tab favIconUrl should be stagingIcon');
  assert.equal(finalReloadedTab2001.urlVariants?.length, 2, 'Reloaded tab should have 2 variants');
  assert.equal(finalReloadedTab2001.urlVariants?.[0].favIconUrl, stagingIcon, 'Reloaded first variant should have stagingIcon');
  assert.equal(finalReloadedTab2001.urlVariants?.[1].name, 'App', 'Reloaded second variant should be App');
  assert.equal(finalReloadedTab2001.order, 1000, 'Reloaded tab 2001 order should be 1000');
});
