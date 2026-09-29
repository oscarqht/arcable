import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syncWorkspaceWithRaindrop,
  syncIncrementalOperations,
  ARCABLE_VARIANT_DELIMITER,
} from '../src/utils/raindropSync';
import type {
  Tab,
  TabUrlVariant,
  ArcableWorkspaceData,
  WorkspaceOperation,
} from '../src/types/workspace';
import type {
  RaindropBookmarkItem,
} from '../src/types/raindrop';

let remoteItemsStore: RaindropBookmarkItem[] = [];
let nextId = 1000;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string'
    ? JSON.parse(init.body)
    : undefined;

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
      return new Response(JSON.stringify({
        items: remoteItemsStore,
        count: remoteItemsStore.length,
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

test('tab with url variants: full sync updates Raindrop bookmark cover when only cover changes', async () => {
  remoteItemsStore = [];
  const spaceId = 'space_personal';
  const initialCover = 'https://example.com/old-cover.png';
  const newCover = 'https://example.com/new-cover.png';

  const multiTab: Tab = {
    id: 'tab-variants-1',
    url: 'https://example.com',
    customTitle: 'Example',
    favIconUrl: initialCover,
    parentSpaceId: spaceId,
    order: 0,
    pinned: false,
    defaultVariantId: 'var_1',
    urlVariants: [
      { id: 'var_1', name: 'Main', url: 'https://example.com', favIconUrl: initialCover },
      { id: 'var_2', name: 'Docs', url: 'https://example.com/docs', favIconUrl: 'https://example.com/docs.png' },
    ],
  };

  const initialWorkspace: ArcableWorkspaceData = {
    spaces: [{ id: spaceId, name: 'Personal', raindropId: 2, order: 0 }],
    folders: [],
    tabs: [multiTab],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
    activeSpaceId: spaceId,
    raindropRootCollectionId: 1,
  };

  // 1. Initial sync to establish Raindrop bookmarks
  const initialResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: initialWorkspace,
    pendingOps: [],
    replaceBaseline: true,
    forceFullTreeFetch: true,
  });
  assert.equal(initialResult.success, true);
  assert.equal(remoteItemsStore.length, 2);

  const mainBookmark = remoteItemsStore.find((it) => it.link === 'https://example.com');
  assert.ok(mainBookmark);
  assert.equal(mainBookmark.cover, initialCover);

  // 2. Now user changes cover of the multi-variant tab (only cover changed)
  const updatedTab: Tab = {
    ...multiTab,
    id: String(mainBookmark._id),
    raindropId: mainBookmark._id,
    favIconUrl: newCover,
    urlVariants: [
      { id: String(mainBookmark._id), name: 'Main', url: 'https://example.com', favIconUrl: newCover },
      { id: String(remoteItemsStore[1]._id), name: 'Docs', url: 'https://example.com/docs', favIconUrl: 'https://example.com/docs.png' },
    ],
    defaultVariantId: String(mainBookmark._id),
    updatedAt: Date.now(),
  };

  const updatedWorkspace: ArcableWorkspaceData = {
    ...initialWorkspace,
    tabs: [updatedTab],
  };

  // Run full sync with pending TAB_UPDATE operation from editing tab
  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: updatedWorkspace,
    pendingOps: [
      {
        id: 'op_update_cover_full',
        type: 'TAB_UPDATE',
        entityId: String(mainBookmark._id),
        timestamp: Date.now(),
        payload: {
          favIconUrl: newCover,
          urlVariants: updatedTab.urlVariants,
        },
      },
    ],
    forceFullTreeFetch: true,
  });
  assert.equal(syncResult.success, true);

  const updatedBookmark = remoteItemsStore.find((it) => it._id === mainBookmark._id);
  assert.ok(updatedBookmark);
  assert.equal(updatedBookmark.cover, newCover, 'Raindrop bookmark cover must be updated to newCover');
});

test('tab with url variants: incremental sync updates Raindrop bookmark cover on TAB_UPDATE', async () => {
  remoteItemsStore = [];
  const spaceId = 'space_personal';
  const initialCover = 'https://example.com/old-cover.png';
  const updatedCover = 'https://example.com/new-cover-incremental.png';

  const multiTab: Tab = {
    id: 'tab-variants-inc',
    url: 'https://example.com',
    customTitle: 'Example',
    favIconUrl: initialCover,
    parentSpaceId: spaceId,
    order: 0,
    pinned: false,
    defaultVariantId: 'var_1',
    urlVariants: [
      { id: 'var_1', name: 'Main', url: 'https://example.com', favIconUrl: initialCover },
      { id: 'var_2', name: 'Docs', url: 'https://example.com/docs', favIconUrl: 'https://example.com/docs.png' },
    ],
  };

  const initialWorkspace: ArcableWorkspaceData = {
    spaces: [{ id: spaceId, name: 'Personal', order: 0 }],
    folders: [],
    tabs: [multiTab],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
    activeSpaceId: spaceId,
  };

  // Initial sync
  await syncWorkspaceWithRaindrop('test-token', {
    localState: initialWorkspace,
    pendingOps: [],
    replaceBaseline: true,
    forceFullTreeFetch: true,
  });

  const mainBookmark = remoteItemsStore.find((it) => it.link === 'https://example.com');
  assert.ok(mainBookmark);
  assert.equal(mainBookmark.cover, initialCover);

  const tabId = String(mainBookmark._id);
  const updatedVariants: TabUrlVariant[] = [
    { id: tabId, name: 'Main', url: 'https://example.com', favIconUrl: updatedCover },
    { id: String(remoteItemsStore[1]._id), name: 'Docs', url: 'https://example.com/docs', favIconUrl: 'https://example.com/docs.png' },
  ];

  const stateForInc: ArcableWorkspaceData = {
    ...initialWorkspace,
    spaces: [{ id: spaceId, name: 'Personal', raindropId: 2, order: 0 }],
    tabs: [
      {
        ...multiTab,
        id: tabId,
        raindropId: mainBookmark._id,
        favIconUrl: updatedCover,
        urlVariants: updatedVariants,
        defaultVariantId: tabId,
      },
    ],
    raindropRootCollectionId: 1,
  };

  const pendingOps: WorkspaceOperation[] = [
    {
      id: 'op_update_cover',
      type: 'TAB_UPDATE',
      entityId: tabId,
      timestamp: Date.now(),
      payload: {
        favIconUrl: updatedCover,
        urlVariants: updatedVariants,
      },
    },
  ];

  const incResult = await syncIncrementalOperations('test-token', stateForInc, pendingOps, false);
  assert.ok(incResult);
  assert.equal(incResult.success, true);

  const updatedBookmark = remoteItemsStore.find((it) => it._id === mainBookmark._id);
  assert.ok(updatedBookmark);
  assert.equal(updatedBookmark.cover, updatedCover, 'Incremental sync must update cover on Raindrop bookmark');
});

test('variant favIconUrl is synchronized with tab.favIconUrl when editing tab', () => {
  // Simulate updateTab logic in useWorkspace
  const currentTab: Tab = {
    id: 'tab_1',
    url: 'https://example.com/main',
    favIconUrl: 'https://example.com/old-cover.png',
    defaultVariantId: 'var_1',
    urlVariants: [
      { id: 'var_1', name: 'Main', url: 'https://example.com/main', favIconUrl: 'https://example.com/old-cover.png' },
      { id: 'var_2', name: 'Docs', url: 'https://example.com/docs', favIconUrl: 'https://example.com/docs.png' },
    ],
  };

  const newCoverUrl = 'https://example.com/new-selected-icon.png';

  // Case 1: TabModal submits with urlVariants and favIconUrl = newCoverUrl
  const updatesFromModal: Partial<Tab> = {
    favIconUrl: newCoverUrl,
    urlVariants: [
      { id: 'var_1', name: 'Main', url: 'https://example.com/main', favIconUrl: newCoverUrl },
      { id: 'var_2', name: 'Docs', url: 'https://example.com/docs', favIconUrl: 'https://example.com/docs.png' },
    ],
  };

  const normalizedUpdates: Partial<Tab> = { ...updatesFromModal };
  if (normalizedUpdates.urlVariants && normalizedUpdates.urlVariants.length > 0) {
    const cleanedVariants = normalizedUpdates.urlVariants.map((v) => ({ ...v }));
    const defaultVar = cleanedVariants[0];
    if (normalizedUpdates.favIconUrl !== undefined && defaultVar) {
      defaultVar.favIconUrl = normalizedUpdates.favIconUrl;
    }
    normalizedUpdates.urlVariants = cleanedVariants;
  }

  assert.equal(normalizedUpdates.favIconUrl, newCoverUrl);
  assert.equal(normalizedUpdates.urlVariants?.[0].favIconUrl, newCoverUrl);

  // Case 2: updateTab called with only favIconUrl (omitting urlVariants)
  const partialUpdates: Partial<Tab> = {
    favIconUrl: 'https://example.com/another-icon.png',
  };
  const normalizedPartial: Partial<Tab> = { ...partialUpdates };
  if (normalizedPartial.favIconUrl !== undefined && currentTab.urlVariants && currentTab.urlVariants.length > 0) {
    const defId = currentTab.defaultVariantId || currentTab.urlVariants[0]?.id;
    normalizedPartial.urlVariants = currentTab.urlVariants.map((v) =>
      v.id === defId ? { ...v, favIconUrl: normalizedPartial.favIconUrl } : v
    );
  }

  assert.equal(normalizedPartial.urlVariants?.[0].favIconUrl, 'https://example.com/another-icon.png');
  assert.equal(normalizedPartial.urlVariants?.[1].favIconUrl, 'https://example.com/docs.png');
});

