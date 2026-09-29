import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncWorkspaceWithRaindrop,
  reconstructWorkspace,
} from '../src/utils/raindropSync';
import {
  createWorkspaceOperation,
  savePendingOperation,
  getStoredPendingOperations,
  removeStoredPendingOperations,
  mergeIncrementalSyncSnapshot,
  replayOperations,
} from '../src/utils/syncEngine';
import type { ArcableWorkspaceData, Tab, RaindropBookmarkItem, Folder } from '../src/types';

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
let remoteCollectionsStore: Array<{ _id: number; title: string; parent?: { $id: number } }> = [];
let nextId = 5000;

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
        items: remoteCollectionsStore.length > 0 ? remoteCollectionsStore : [
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
    const newColl = { _id: nextId++, title: body?.title || 'Collection', parent: { $id: 1 } };
    remoteCollectionsStore.push(newColl);
    return new Response(JSON.stringify({ item: newColl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/collection/') && method === 'DELETE') {
    const id = Number(url.split('/').pop());
    remoteCollectionsStore = remoteCollectionsStore.filter((c) => c._id !== id);
    return new Response(JSON.stringify({ result: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

  if (url.includes('/raindrop/') && method === 'PUT') {
    const id = Number(url.split('/').pop());
    const item = remoteItemsStore.find((it) => it._id === id);
    if (item) {
      if (body.title !== undefined) item.title = body.title;
      if (body.link !== undefined) item.link = body.link;
      if (body.cover !== undefined) item.cover = Array.isArray(body.cover) ? body.cover[0] : body.cover;
      if (body.note !== undefined) item.note = body.note;
      if (body.order !== undefined) item.order = body.order;
      if (body.sort !== undefined) item.sort = body.sort;
      if (body.collection?.$id !== undefined) item.collectionId = body.collection.$id;
    }
    return new Response(JSON.stringify({ item }), {
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

test('Scenario 1: Simple tab deletion with raindropId in payload', async () => {
  store.clear();
  remoteItemsStore = [
    { _id: 101, title: 'Tab 1', link: 'https://tab1.com', collectionId: 2, order: 1000, sort: 1000 },
    { _id: 102, title: 'Tab 2', link: 'https://tab2.com', collectionId: 2, order: 2000, sort: 2000 },
  ];

  let localState: ArcableWorkspaceData = {
    version: 1,
    activeSpaceId: 'space_personal',
    raindropRootCollectionId: 1,
    spaces: [{ id: 'space_personal', name: 'Personal', raindropId: 2, order: 1000, createdAt: 0, updatedAt: 0 }],
    folders: [],
    tabs: [
      { id: '101', raindropId: 101, url: 'https://tab1.com', parentSpaceId: 'space_personal', order: 1000, pinned: false, createdAt: 0, updatedAt: 0 },
      { id: '102', raindropId: 102, url: 'https://tab2.com', parentSpaceId: 'space_personal', order: 2000, pinned: false, createdAt: 0, updatedAt: 0 },
    ],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };

  // User deletes Tab 1
  const delOp = createWorkspaceOperation('TAB_DELETE', '101', {
    raindropId: 101,
    collectionId: 2,
  });
  savePendingOperation(delOp);
  localState = {
    ...localState,
    tabs: localState.tabs.filter((t) => t.id !== '101'),
  };

  const pendingOps = getStoredPendingOperations();
  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState,
    pendingOps,
  });

  removeStoredPendingOperations(pendingOps.map((o) => o.id));
  const merged = mergeIncrementalSyncSnapshot(localState, syncResult.latestSnapshot!);

  assert.equal(merged.tabs.length, 1);
  assert.equal(merged.tabs[0].id, '102');
  assert.equal(remoteItemsStore.some((it) => it._id === 101), false, 'Tab 101 must be deleted from Raindrop');
  assert.equal(remoteItemsStore.length, 1);
});

test('Scenario 2: Folder deletion removes folder and its tabs from remote and local state', async () => {
  store.clear();
  remoteCollectionsStore = [
    { _id: 2, title: 'Personal', parent: { $id: 1 } },
    { _id: 20, title: 'Work Folder', parent: { $id: 2 } },
  ];
  remoteItemsStore = [
    { _id: 201, title: 'Tab in Folder', link: 'https://infolder.com', collectionId: 20, order: 1000, sort: 1000 },
    { _id: 202, title: 'Tab outside Folder', link: 'https://outside.com', collectionId: 2, order: 2000, sort: 2000 },
  ];

  let localState: ArcableWorkspaceData = {
    version: 1,
    activeSpaceId: 'space_personal',
    raindropRootCollectionId: 1,
    spaces: [{ id: 'space_personal', name: 'Personal', raindropId: 2, order: 1000, createdAt: 0, updatedAt: 0 }],
    folders: [
      { id: '20', raindropId: 20, name: 'Work Folder', parentSpaceId: 'space_personal', order: 1000, createdAt: 0, updatedAt: 0 },
    ],
    tabs: [
      { id: '201', raindropId: 201, url: 'https://infolder.com', parentSpaceId: 'space_personal', parentFolderId: '20', order: 1000, pinned: false, createdAt: 0, updatedAt: 0 },
      { id: '202', raindropId: 202, url: 'https://outside.com', parentSpaceId: 'space_personal', order: 2000, pinned: false, createdAt: 0, updatedAt: 0 },
    ],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };

  // User deletes folder 20
  const delOp = createWorkspaceOperation('FOLDER_DELETE', '20', {
    raindropId: 20,
  });
  savePendingOperation(delOp);
  localState = {
    ...localState,
    folders: localState.folders.filter((f) => f.id !== '20'),
    tabs: localState.tabs.filter((t) => t.parentFolderId !== '20'),
  };

  const pendingOps = getStoredPendingOperations();
  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState,
    pendingOps,
  });

  removeStoredPendingOperations(pendingOps.map((o) => o.id));
  const merged = mergeIncrementalSyncSnapshot(localState, syncResult.latestSnapshot!);

  assert.equal(merged.folders.length, 0);
  assert.equal(merged.tabs.length, 1);
  assert.equal(merged.tabs[0].id, '202');
  assert.equal(remoteCollectionsStore.some((c) => c._id === 20), false, 'Collection 20 must be deleted');
});

test('Scenario 3: Rapid delete then background sync with stale storage snapshot', async () => {
  store.clear();
  remoteItemsStore = [
    { _id: 301, title: 'Item 1', link: 'https://item1.com', collectionId: 2, order: 1000, sort: 1000 },
  ];

  // Stale snapshot in storage still has item 301
  const staleSnapshot: ArcableWorkspaceData = {
    version: 1,
    activeSpaceId: 'space_personal',
    raindropRootCollectionId: 1,
    spaces: [{ id: 'space_personal', name: 'Personal', raindropId: 2, order: 1000, createdAt: 0, updatedAt: 0 }],
    folders: [],
    tabs: [
      { id: '301', raindropId: 301, url: 'https://item1.com', parentSpaceId: 'space_personal', order: 1000, pinned: false, createdAt: 0, updatedAt: 0 },
    ],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };

  const delOp = createWorkspaceOperation('TAB_DELETE', '301', {
    raindropId: 301,
    collectionId: 2,
  });

  // Replay operations on stale snapshot
  const replayed = replayOperations(staleSnapshot, [delOp]);
  assert.equal(replayed.tabs.length, 0, 'Replayed state must remove tab 301');

  // Incremental sync runs with stale snapshot as localState
  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: staleSnapshot, // even if someone passed the stale snapshot!
    pendingOps: [delOp],
  });

  assert.equal(syncResult.latestSnapshot?.tabs.length, 0, 'latestSnapshot tabs must not contain 301');
  assert.equal(remoteItemsStore.some((it) => it._id === 301), false, 'Item 301 must be deleted from remote');
});
