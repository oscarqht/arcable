import { syncIncrementalOperations, syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';
import { fetchAllRaindropItems } from '../src/utils/raindropClient';
import { mergeIncrementalSyncSnapshot, replayOperations } from '../src/utils/syncEngine';
import type { ArcableWorkspaceData } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ url: string; method: string; body?: any; cache?: RequestCache; headers?: Headers }> = [];
let nextId = 100;
let remoteChildren: any[] = [];
let remoteItems: any[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string'
    ? JSON.parse(init.body)
    : init?.body instanceof FormData
      ? { file: await (init.body.get('file') as Blob).text() }
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
        items: [{ _id: 1, title: 'Arcable v2', count: 0, sort: 0 }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith('/collections/childrens')) {
      return new Response(JSON.stringify({ items: remoteChildren }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (pathname.includes('/raindrops/')) {
      return new Response(JSON.stringify({ items: remoteItems, count: remoteItems.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ items: [], count: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.endsWith('/raindrops') && method === 'POST') {
    return new Response(JSON.stringify({
      items: body.items.map((item: any) => ({ ...item, _id: nextId++, collection: item.collection })),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.endsWith('/collection') && method === 'POST') {
    return new Response(JSON.stringify({ item: { _id: nextId++, title: body.title } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.endsWith('/raindrop/file') && method === 'PUT') {
    return new Response(JSON.stringify({
      item: { _id: nextId++, title: 'data.json.txt', file: { name: 'data.json.txt' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (method === 'PUT') {
    const id = Number(url.split('/').pop());
    return new Response(JSON.stringify({ item: { ...body, _id: id, collection: body.collection } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 204 });
}) as typeof fetch;

async function main(): Promise<void> {
const base: ArcableWorkspaceData = {
  raindropRootCollectionId: 1,
  activeSpaceId: 'space-local',
  version: 1,
  spaces: [{ id: 'space-local', raindropId: 10, name: 'Space' }],
  folders: [],
  tabs: [],
};

function operation(type: WorkspaceOperation['type'], entityId: string, payload?: any): WorkspaceOperation {
  return { id: `op-${type}`, type, entityId, payload, deviceId: 'test', timestamp: 1, lamportSeq: 1 };
}

const folderState: ArcableWorkspaceData = {
  ...base,
  folders: [{ id: 'folder-local', name: 'Folder', parentSpaceId: 'space-local', order: 1 }],
};
const folderCreate = await syncIncrementalOperations(
  'token',
  folderState,
  [operation('FOLDER_CREATE', 'folder-local', folderState.folders[0])],
  false
);
assert(folderCreate?.success, 'folder create should use incremental sync');
assert(calls.length === 1 && calls[0].method === 'POST' && calls[0].url.endsWith('/collection'), 'folder create should make one POST and no GET');
assert(folderCreate.latestSnapshot?.folders[0].raindropId === 100, 'folder create should persist returned Raindrop ID');

calls.length = 0;
const updatedFolderState: ArcableWorkspaceData = {
  ...folderCreate.latestSnapshot!,
  folders: folderCreate.latestSnapshot!.folders.map((folder) => ({ ...folder, name: 'Updated Folder' })),
};
const folderUpdate = await syncIncrementalOperations(
  'token',
  updatedFolderState,
  [operation('FOLDER_UPDATE', 'folder-local', { name: 'Updated Folder' })],
  false
);
assert(folderUpdate?.success, 'folder update should use incremental sync');
assert(calls.length === 1 && calls[0].method === 'PUT' && calls[0].url.endsWith('/collection/100'), 'folder update should make one PUT and no GET');

calls.length = 0;
const folderDelete = await syncIncrementalOperations(
  'token',
  { ...updatedFolderState, folders: [] },
  [operation('FOLDER_DELETE', 'folder-local', { raindropId: 100, recursive: true })],
  false
);
assert(folderDelete?.success, 'folder delete should use incremental sync');
assert(calls.length === 1 && calls[0].method === 'DELETE' && calls[0].url.endsWith('/collection/100'), 'folder delete should make one DELETE and no GET');

calls.length = 0;
const bookmarkState: ArcableWorkspaceData = {
  ...folderCreate.latestSnapshot!,
  tabs: [{ id: 'tab-local', url: 'https://example.com', pinned: false, parentFolderId: 'folder-local', parentSpaceId: 'space-local' }],
};
const bookmarkCreate = await syncIncrementalOperations(
  'token',
  bookmarkState,
  [operation('TAB_CREATE', 'tab-local', bookmarkState.tabs[0])],
  false
);
assert(bookmarkCreate?.success, 'bookmark create should use incremental sync');
assert(calls.length === 1 && calls[0].method === 'POST' && calls[0].url.endsWith('/raindrops'), 'bookmark create should make one batch POST and no GET');
assert(bookmarkCreate.latestSnapshot?.tabs[0].raindropId === 101, 'bookmark create should persist returned Raindrop ID');

calls.length = 0;
const severalBookmarkState: ArcableWorkspaceData = {
  ...folderCreate.latestSnapshot!,
  tabs: [
    { id: 'tab-batch-1', url: 'https://one.example.com', parentFolderId: 'folder-local', parentSpaceId: 'space-local' },
    { id: 'tab-batch-2', url: 'https://two.example.com', parentFolderId: 'folder-local', parentSpaceId: 'space-local' },
    { id: 'tab-batch-3', url: 'https://three.example.com', parentFolderId: 'folder-local', parentSpaceId: 'space-local' },
  ],
};
const severalBookmarkCreate = await syncIncrementalOperations(
  'token',
  severalBookmarkState,
  severalBookmarkState.tabs.map((tab) => operation('TAB_CREATE', tab.id, tab)),
  false
);
assert(severalBookmarkCreate?.success, 'multiple bookmark creates should use incremental sync');
const postCalls = calls.filter((call) => call.method === 'POST');
assert(postCalls.length === 1 && postCalls[0].url.endsWith('/raindrops') && postCalls[0].body.items.length === 3, 'multiple bookmarks should be created in one batch API call');
assert(calls.every((call) => call.method !== 'GET'), 'multiple bookmark creates should not fetch the full workspace');
assert(severalBookmarkCreate.latestSnapshot?.tabs.length === 3, 'the incremental response should keep every newly created bookmark');
assert(severalBookmarkCreate.latestSnapshot?.tabs.every((tab) => Boolean(tab.raindropId)), 'every batch-created bookmark should receive its Raindrop ID');

calls.length = 0;
const updatedBookmarkState: ArcableWorkspaceData = {
  ...bookmarkCreate.latestSnapshot!,
  tabs: bookmarkCreate.latestSnapshot!.tabs.map((tab) => ({ ...tab, customTitle: 'Updated' })),
};
const bookmarkUpdate = await syncIncrementalOperations(
  'token',
  updatedBookmarkState,
  [operation('TAB_UPDATE', 'tab-local', { customTitle: 'Updated' })],
  false
);
assert(bookmarkUpdate?.success, 'bookmark update should use incremental sync');
assert(calls.length === 1 && calls[0].method === 'PUT' && calls[0].url.endsWith('/raindrop/101'), 'bookmark update should make one PUT and no GET');

calls.length = 0;
const bookmarkDelete = await syncIncrementalOperations(
  'token',
  { ...updatedBookmarkState, tabs: [] },
  [operation('TAB_DELETE', 'tab-local', { raindropId: 101, collectionId: 100 })],
  false
);
assert(bookmarkDelete?.success, 'bookmark delete should use incremental sync');
assert(calls.length === 1 && calls[0].method === 'DELETE' && calls[0].url.endsWith('/raindrops/100'), 'bookmark delete should make one DELETE and no GET');

calls.length = 0;
const widgetState: ArcableWorkspaceData = {
  ...base,
  widgets: [{ id: 'widget-local', raindropId: 104, style: 'clock', size: 'small', order: 2000 }],
};
const widgetUpdate = await syncIncrementalOperations(
  'token',
  widgetState,
  [operation('WIDGET_UPDATE', 'widget-local', { order: 2000 })],
  false
);
assert(widgetUpdate?.success, 'favourite widget changes should use incremental sync');
assert(calls.every((call) => call.method !== 'GET'), 'favourite widget changes should not fetch the full workspace');
const widgetPut = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/raindrop/104'));
assert(widgetPut, 'widget sync should update the widget placeholder item');
assert(widgetPut.body.title === '[Widget] clock', 'widget title should be updated');

calls.length = 0;
const codeRulesState: ArcableWorkspaceData = {
  ...base,
  customCodeRules: [{
    id: 'custom-rule',
    pattern: '*://example.com/*',
    css: 'body { color: red; }',
    js: 'window.customRuleRan = true;',
  }],
  runCodeInPageRules: [{
    id: 'run-rule',
    title: 'Run example code',
    patterns: ['*://example.com/*'],
    code: 'window.runRuleRan = true;',
  }],
};
const codeRulesUpdate = await syncIncrementalOperations(
  'token',
  codeRulesState,
  [
    operation('CUSTOM_CODE_CREATE', 'custom-rule', codeRulesState.customCodeRules[0]),
    operation('RUN_CODE_CREATE', 'run-rule', codeRulesState.runCodeInPageRules[0]),
  ],
  false
);
assert(codeRulesUpdate?.success, 'custom JS/CSS and Run Code edits should use incremental sync');
assert(calls.every((call) => !call.url.endsWith('/raindrop/file')), 'code rule sync should not upload data.json.txt');
const createdBookmarksCalls = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/raindrops'));
assert(createdBookmarksCalls.length > 0, 'code rule sync should create placeholder bookmark items');
const allCreatedItems = createdBookmarksCalls.flatMap((c) => c.body.items);
const customCssItem = allCreatedItems.find((i: any) => i.link?.includes('custom-css'));
const runCodeItem = allCreatedItems.find((i: any) => i.link?.includes('run-code'));
assert(customCssItem, 'custom CSS placeholder item should be created');
assert(runCodeItem, 'run code placeholder item should be created');
const parsedCustomExcerpt = JSON.parse(customCssItem.excerpt);
assert(parsedCustomExcerpt.js === 'window.customRuleRan = true;', 'custom JavaScript content should be in excerpt');
assert(parsedCustomExcerpt.css === 'body { color: red; }', 'custom CSS content should be in excerpt');
const parsedRunCodeExcerpt = JSON.parse(runCodeItem.excerpt);
assert(parsedRunCodeExcerpt.code === 'window.runRuleRan = true;', 'Run Code content should be in excerpt');

calls.length = 0;
// Test deleting custom code and run code with raindropId in payload
const deleteWithIdUpdate = await syncWorkspaceWithRaindrop('token', {
  localState: codeRulesUpdate.latestSnapshot,
  pendingOps: [
    operation('CUSTOM_CODE_DELETE', 'custom-rule', { raindropId: codeRulesUpdate.latestSnapshot.customCodeRules[0].raindropId }),
    operation('RUN_CODE_DELETE', 'run-rule', { raindropId: codeRulesUpdate.latestSnapshot.runCodeInPageRules[0].raindropId }),
  ],
});
assert(deleteWithIdUpdate?.success, 'custom code and run code deletions should succeed');
const deleteCalls = calls.filter((c) => c.method === 'DELETE' && c.url.includes('/raindrop/'));
assert(deleteCalls.length === 2, 'should delete both bookmarks from Raindrop');
assert(deleteWithIdUpdate.latestSnapshot.customCodeRules.length === 0, 'customCodeRules in snapshot should not contain deleted rule');
assert(deleteWithIdUpdate.latestSnapshot.runCodeInPageRules.length === 0, 'runCodeInPageRules in snapshot should not contain deleted rule');

// Test deleting custom code and run code without raindropId in payload (fallback by link/excerpt lookup)
remoteItems = [
  {
    _id: 991,
    collection: { $id: 1 },
    link: 'https://arcable.app/custom-css/unresolved-custom',
    excerpt: JSON.stringify({ id: 'unresolved-custom' }),
  },
  {
    _id: 992,
    collection: { $id: 1 },
    link: 'https://arcable.app/run-code/unresolved-run',
    excerpt: JSON.stringify({ id: 'unresolved-run' }),
  },
];
calls.length = 0;
const deleteWithoutIdUpdate = await syncWorkspaceWithRaindrop('token', {
  localState: {
    ...codeRulesUpdate.latestSnapshot,
    customCodeRules: [{ id: 'unresolved-custom', pattern: '*', css: '', js: '' }],
    runCodeInPageRules: [{ id: 'unresolved-run', title: 'test', patterns: [], code: '' }],
  },
  pendingOps: [
    operation('CUSTOM_CODE_DELETE', 'unresolved-custom', {}),
    operation('RUN_CODE_DELETE', 'unresolved-run', {}),
  ],
});
assert(deleteWithoutIdUpdate?.success, 'unresolved deletions should succeed');
const unresolvedDeleteCalls = calls.filter((c) => c.method === 'DELETE' && c.url.includes('/raindrop/'));
assert(unresolvedDeleteCalls.length === 2, 'should delete both resolved bookmarks from Raindrop');
assert(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/991')), 'should delete custom css bookmark 991');
assert(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/992')), 'should delete run code bookmark 992');
assert(deleteWithoutIdUpdate.latestSnapshot.customCodeRules.length === 0, 'snapshot customCodeRules should be filtered');
assert(deleteWithoutIdUpdate.latestSnapshot.runCodeInPageRules.length === 0, 'snapshot runCodeInPageRules should be filtered');
remoteItems = [];

calls.length = 0;
const mixedFavouriteState: ArcableWorkspaceData = {
  ...widgetState,
  tabs: [{
    id: 'favourite-tab',
    raindropId: 501,
    url: 'https://favourite.example.com',
    favourite: true,
    order: 1000,
  }],
};
const mixedFavouriteUpdate = await syncWorkspaceWithRaindrop('token', {
  localState: mixedFavouriteState,
  pendingOps: [
    operation('TAB_UPDATE', 'favourite-tab', { order: 1000 }),
    operation('WIDGET_UPDATE', 'widget-local', { order: 2000 }),
  ],
});
assert(mixedFavouriteUpdate.success, 'mixed favourite item reordering should stay incremental');
assert(calls.every((call) => call.method !== 'GET'), 'mixed favourite reordering should not fetch the full workspace');
const tabUpdateCall = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/raindrop/501'));
const widgetUpdateCall = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/raindrop/104'));
assert(tabUpdateCall, 'tab reorder should update tab item');
assert(widgetUpdateCall, 'widget reorder should update widget item');

calls.length = 0;
const preHydrationWidgetState: ArcableWorkspaceData = {
  ...widgetState,
  widgets: [{ id: 'widget-local', style: 'clock', size: 'small', order: 2000 }],
};
const hydratedWidgetIdentity: ArcableWorkspaceData = {
  ...widgetState,
  widgets: [{ id: 'widget-local', raindropId: 106, style: 'clock', size: 'small', order: 2000 }],
};
const racedWidgetUpdate = await syncWorkspaceWithRaindrop('token', {
  localState: preHydrationWidgetState,
  identitySnapshot: hydratedWidgetIdentity,
  pendingOps: [operation('WIDGET_UPDATE', 'widget-local', { order: 2000 })],
});
assert(racedWidgetUpdate.success, 'a pending widget edit should reuse identity from the completed hydration');
assert(calls.every((call) => call.method !== 'GET'), 'the hydration race must not fall back to a full-tree read');
const racedWidgetPut = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/raindrop/106'));
assert(racedWidgetPut, 'widget update should use recovered raindropId');

calls.length = 0;
await fetchAllRaindropItems('token', 1, { nested: true });
assert(calls.length === 1 && calls[0].method === 'GET', 'nested fetch should make one GET for one-page results');
assert(calls[0].url.includes('/raindrops/1?'), 'nested fetch should target only the Arcable root');
assert(calls[0].url.includes('nested=true'), 'nested fetch should include nested=true');

calls.length = 0;
await fetchAllRaindropItems('token', 1, { nested: true, cacheBust: 'reload-1' });
assert(calls[0].url.includes('cacheBust=reload-1'), 'reload fetch should use a unique server cache key');
assert(calls[0].cache === 'no-store', 'reload fetch should bypass the browser HTTP cache');
assert(calls[0].headers?.get('Cache-Control') === 'no-cache', 'reload fetch should explicitly request revalidation');

calls.length = 0;
const noChangeSync = await syncWorkspaceWithRaindrop('token', {
  localState: base,
  pendingOps: [],
});
assert(noChangeSync.success, 'an empty operation queue should still refresh successfully');
assert(noChangeSync.latestSnapshot?.raindropRootCollectionId === 1, 'an empty operation queue should return the remote snapshot');
assert(calls.length === 3 && calls.every((call) => call.method === 'GET'), 'an empty operation queue should be read-only');
const reloadCacheKeys = calls.map((call) => new URL(call.url).searchParams.get('cacheBust'));
assert(reloadCacheKeys.every(Boolean), 'every authoritative reload request should bypass Raindrop server cache');
assert(new Set(reloadCacheKeys).size === 1, 'one reload should use a consistent cache key for its complete tree snapshot');
assert(calls.every((call) => call.cache === 'no-store'), 'authoritative reload requests should bypass browser cache');

calls.length = 0;
remoteChildren = [{ _id: 10, title: 'Remote space', parent: { $id: 1 }, sort: 0 }];
const staleParentSync = await syncWorkspaceWithRaindrop('token', {
  localState: {
    ...base,
    spaces: [{ id: 'space_personal', name: 'Stale local space' }],
    tabs: [{ id: 'tab-stale-parent', url: 'https://stale-parent.example.com', pinned: false, parentSpaceId: 'space_personal' }],
  },
  identitySnapshot: base,
  pendingOps: [operation('TAB_CREATE', 'tab-stale-parent', { parentSpaceId: 'space_personal' })],
});
assert(staleParentSync.success, 'a stale local parent should rebase onto the authoritative Raindrop tree');
const staleParentCreate = calls.find((call) => call.method === 'POST' && call.url.endsWith('/raindrops'));
assert(staleParentCreate?.body.items[0].collection.$id === 10, 'the rebased bookmark should use the existing remote space rather than creating a duplicate');
assert(staleParentSync.latestSnapshot?.tabs[0].parentSpaceId === '10', 'the result should retain the authoritative parent identity');
remoteChildren = [];

const firstCreatedTab = { ...bookmarkState.tabs[0], raindropId: 501 };
const laterCreatedTab = {
  id: 'tab-created-while-syncing',
  url: 'https://later.example.com',
  parentFolderId: 'folder-local',
  parentSpaceId: 'space-local',
};
const staleSyncResponse: ArcableWorkspaceData = {
  ...bookmarkState,
  tabs: [firstCreatedTab],
};
const currentOptimisticState: ArcableWorkspaceData = {
  ...bookmarkState,
  tabs: [bookmarkState.tabs[0], laterCreatedTab],
};
const reconciledAfterSync = mergeIncrementalSyncSnapshot(currentOptimisticState, staleSyncResponse);
assert(reconciledAfterSync.tabs.length === 2, 'incremental sync completion must not remove bookmarks created while the request was in flight');
assert(reconciledAfterSync.tabs[0].raindropId === 501, 'incremental sync completion should retain the returned Raindrop ID');
assert(reconciledAfterSync.tabs.some((tab) => tab.id === laterCreatedTab.id), 'newer optimistic bookmarks should remain visible locally');
const replayedWithIdentity = replayOperations(base, [operation('TAB_CREATE', 'tab-replayed', { parentSpaceId: 'space-local' })]);
assert(replayedWithIdentity.raindropRootCollectionId === 1, 'replaying pending operations must preserve the Raindrop root identity');

// --- Tab Reordering Sync Verification ---
calls.length = 0;
const reorderTabsState: ArcableWorkspaceData = {
  ...base,
  tabs: [
    { id: 'tab-3', raindropId: 303, url: 'https://three.com', parentSpaceId: 'space-local', order: 1000 },
    { id: 'tab-1', raindropId: 301, url: 'https://one.com', parentSpaceId: 'space-local', order: 2000 },
    { id: 'tab-2', raindropId: 302, url: 'https://two.com', parentSpaceId: 'space-local', order: 3000 },
  ],
};
const tabReorderOps = [
  operation('TAB_UPDATE', 'tab-1', { order: 2000 }),
  operation('TAB_UPDATE', 'tab-2', { order: 3000 }),
  operation('TAB_UPDATE', 'tab-3', { order: 1000 }),
];
const tabReorderSync = await syncIncrementalOperations('token', reorderTabsState, tabReorderOps, false);
assert(tabReorderSync?.success, 'tab reorder incremental sync should succeed');
const tabPutCalls = calls.filter((c) => c.method === 'PUT' && c.url.includes('/raindrop/'));
assert(tabPutCalls.length === 3, 'should make 3 PUT calls for 3 reordered tabs');
// Verify calls were executed in ascending targetOrder (0, 1, 2)
assert(tabPutCalls[0].url.endsWith('/303'), 'first update call should be for tab-3 (index 0)');
assert(tabPutCalls[0].body.order === 0 && tabPutCalls[0].body.sort === 0, 'tab-3 should receive 0-based index 0 for order and sort');
assert(tabPutCalls[1].url.endsWith('/301'), 'second update call should be for tab-1 (index 1)');
assert(tabPutCalls[1].body.order === 1 && tabPutCalls[1].body.sort === 1, 'tab-1 should receive 0-based index 1 for order and sort');
assert(tabPutCalls[2].url.endsWith('/302'), 'third update call should be for tab-2 (index 2)');
assert(tabPutCalls[2].body.order === 2 && tabPutCalls[2].body.sort === 2, 'tab-2 should receive 0-based index 2 for order and sort');

// --- Tab with URL Variants Reordering Sync Verification ---
calls.length = 0;
const reorderTabsWithVariantsState: ArcableWorkspaceData = {
  ...base,
  tabs: [
    { id: 'tab-3', raindropId: 303, url: 'https://three.com', parentSpaceId: 'space-local', order: 1000 },
    {
      id: 'tab-1',
      raindropId: 301,
      url: 'https://one.com',
      parentSpaceId: 'space-local',
      order: 2000,
      defaultVariantId: '301',
      urlVariants: [
        { id: '301', name: 'Default', url: 'https://one.com' },
        { id: '401', name: 'Issues', url: 'https://one.com/issues' },
        { id: '402', name: 'PRs', url: 'https://one.com/pulls' },
      ],
    },
    { id: 'tab-2', raindropId: 302, url: 'https://two.com', parentSpaceId: 'space-local', order: 3000 },
  ],
};
const tabVariantReorderOps = [
  operation('TAB_UPDATE', 'tab-1', { order: 2000 }),
  operation('TAB_UPDATE', 'tab-2', { order: 3000 }),
  operation('TAB_UPDATE', 'tab-3', { order: 1000 }),
];
const tabVariantReorderSync = await syncIncrementalOperations('token', reorderTabsWithVariantsState, tabVariantReorderOps, false);
assert(tabVariantReorderSync?.success, 'tab variant reorder incremental sync should succeed');
const tabVariantPutCalls = calls.filter((c) => c.method === 'PUT' && c.url.includes('/raindrop/'));
assert(tabVariantPutCalls.length === 5, `should make 5 PUT calls for 3 tabs (1 tab has 2 secondary variants), got ${tabVariantPutCalls.length}`);
// Verify all 5 calls were executed in strict ascending targetOrder (0, 1, 2, 3, 4)
assert(tabVariantPutCalls[0].url.endsWith('/303'), 'call 0 should be tab-3');
assert(tabVariantPutCalls[0].body.order === 0 && tabVariantPutCalls[0].body.sort === 0, 'tab-3 should receive sort 0');
assert(tabVariantPutCalls[1].url.endsWith('/301'), 'call 1 should be tab-1 base');
assert(tabVariantPutCalls[1].body.order === 1 && tabVariantPutCalls[1].body.sort === 1, 'tab-1 base should receive sort 1');
assert(tabVariantPutCalls[2].url.endsWith('/401'), 'call 2 should be tab-1 variant 1');
assert(tabVariantPutCalls[2].body.order === 2 && tabVariantPutCalls[2].body.sort === 2, 'tab-1 variant 1 should receive sort 2');
assert(tabVariantPutCalls[3].url.endsWith('/402'), 'call 3 should be tab-1 variant 2');
assert(tabVariantPutCalls[3].body.order === 3 && tabVariantPutCalls[3].body.sort === 3, 'tab-1 variant 2 should receive sort 3');
assert(tabVariantPutCalls[4].url.endsWith('/302'), 'call 4 should be tab-2');
assert(tabVariantPutCalls[4].body.order === 4 && tabVariantPutCalls[4].body.sort === 4, 'tab-2 should receive sort 4 accounting for preceding variants');

// --- Favourites Shelf with Variants & Widgets Reordering Sync Verification ---
calls.length = 0;
const favsWithVariantsState: ArcableWorkspaceData = {
  ...base,
  widgets: [
    { id: 'widget-clock', style: 'clock', size: 'small', order: 2000, config: {} },
  ],
  tabs: [
    {
      id: 'tab-fav',
      raindropId: 601,
      url: 'https://fav.com',
      favourite: true,
      order: 1000,
      defaultVariantId: '601',
      urlVariants: [
        { id: '601', name: 'Default', url: 'https://fav.com' },
        { id: '701', name: 'Alt', url: 'https://fav.com/alt' },
      ],
    },
    { id: 'tab-fav-2', raindropId: 602, url: 'https://fav2.com', favourite: true, order: 3000 },
  ],
};
const favReorderOps = [
  operation('TAB_UPDATE', 'tab-fav', { order: 1000 }),
  operation('TAB_UPDATE', 'tab-fav-2', { order: 3000 }),
];
const favReorderSync = await syncIncrementalOperations('token', favsWithVariantsState, favReorderOps, false);
assert(favReorderSync?.success, 'fav variant reorder incremental sync should succeed');
const favPutCalls = calls.filter((c) => c.method === 'PUT' && c.url.includes('/raindrop/'));
assert(favPutCalls.length === 3, `should make 3 PUT calls for favourite tabs, got ${favPutCalls.length}`);
assert(favPutCalls[0].url.endsWith('/601') && favPutCalls[0].body.sort === 0, 'tab-fav base should be sort 0');
assert(favPutCalls[1].url.endsWith('/701') && favPutCalls[1].body.sort === 1, 'tab-fav variant should be sort 1');
// Since widget-clock is order 2000, it occupies slot 2 in Raindrop root. tab-fav-2 (order 3000) should be slot 3!
assert(favPutCalls[2].url.endsWith('/602') && favPutCalls[2].body.sort === 3, 'tab-fav-2 should receive sort 3 after widget and variants');

// --- Folder Reordering Sync Verification ---
calls.length = 0;
const reorderFoldersState: ArcableWorkspaceData = {
  ...base,
  folders: [
    { id: 'folder-b', raindropId: 202, name: 'Folder B', parentSpaceId: 'space-local', order: 1000 },
    { id: 'folder-a', raindropId: 201, name: 'Folder A', parentSpaceId: 'space-local', order: 2000 },
  ],
};
const folderReorderOps = [
  operation('FOLDER_UPDATE', 'folder-a', { order: 2000 }),
  operation('FOLDER_UPDATE', 'folder-b', { order: 1000 }),
];
const folderReorderSync = await syncIncrementalOperations('token', reorderFoldersState, folderReorderOps, false);
assert(folderReorderSync?.success, 'folder reorder incremental sync should succeed');
const folderPutCalls = calls.filter((c) => c.method === 'PUT' && c.url.includes('/collection/'));
assert(folderPutCalls.length === 2, 'should make 2 PUT calls for 2 reordered folders');
const callFolderB = folderPutCalls.find((c) => c.url.endsWith('/202'));
const callFolderA = folderPutCalls.find((c) => c.url.endsWith('/201'));
assert(callFolderB && callFolderB.body.order === 0 && callFolderB.body.sort === 0, 'folder-b should receive 0-based index 0 for order and sort');
// --- Incremental Sync for Tab URL Variants (Add, Update, Delete Variant, Delete Tab with Variants) ---

// 1. Add URL variant to existing tab incrementally without full tree fetch
calls.length = 0;
const tabWithNewVariantState: ArcableWorkspaceData = {
  ...base,
  tabs: [
    {
      id: 'tab-gh',
      raindropId: 501,
      customTitle: 'GitHub',
      url: 'https://github.com',
      parentSpaceId: 'space-local',
      order: 1000,
      defaultVariantId: '501',
      urlVariants: [
        { id: '501', name: 'GitHub', url: 'https://github.com' },
        { id: 'var-issues-new', name: 'Issues', url: 'https://github.com/issues' },
      ],
    },
  ],
};
const addVariantOps = [
  operation('TAB_UPDATE', 'tab-gh', {
    urlVariants: tabWithNewVariantState.tabs[0].urlVariants,
    defaultVariantId: tabWithNewVariantState.tabs[0].defaultVariantId,
  }),
];
const addVariantSync = await syncWorkspaceWithRaindrop('token', {
  localState: tabWithNewVariantState,
  pendingOps: addVariantOps,
});
assert(addVariantSync?.success, 'adding variant should sync incrementally with success');
const hasTreeFetchOnAdd = calls.some((c) => c.method === 'GET' && c.url.includes('/collections'));
assert(!hasTreeFetchOnAdd, 'adding variant incrementally must NOT trigger full tree fetch');
const addVariantPostCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/raindrops'));
assert(addVariantPostCall, 'should call POST /raindrops to create secondary variant bookmark');
assert(addVariantPostCall.body.items[0].title === 'GitHub ||| Issues', 'variant bookmark title should be formatted correctly');
assert(addVariantPostCall.body.items[0].link === 'https://github.com/issues', 'variant bookmark link should match');
const updatedVariants = addVariantSync.latestSnapshot?.tabs[0].urlVariants;
assert(updatedVariants && updatedVariants.length === 2, 'snapshot should have 2 variants');
assert(updatedVariants[1].id !== 'var-issues-new', 'new variant should receive assigned numeric Raindrop ID in snapshot');

// 2. Update existing URL variant incrementally
calls.length = 0;
const tabWithUpdatedVariantState: ArcableWorkspaceData = {
  ...base,
  tabs: [
    {
      id: 'tab-gh',
      raindropId: 501,
      customTitle: 'GitHub',
      url: 'https://github.com',
      parentSpaceId: 'space-local',
      order: 1000,
      defaultVariantId: '501',
      urlVariants: [
        { id: '501', name: 'GitHub', url: 'https://github.com' },
        { id: '502', name: 'Issue Tracker', url: 'https://github.com/issues/assigned' },
      ],
    },
  ],
};
const updateVariantOps = [
  operation('TAB_UPDATE', 'tab-gh', {
    urlVariants: tabWithUpdatedVariantState.tabs[0].urlVariants,
    defaultVariantId: tabWithUpdatedVariantState.tabs[0].defaultVariantId,
  }),
];
const updateVariantSync = await syncWorkspaceWithRaindrop('token', {
  localState: tabWithUpdatedVariantState,
  pendingOps: updateVariantOps,
});
assert(updateVariantSync?.success, 'updating variant should sync incrementally with success');
const hasTreeFetchOnUpdate = calls.some((c) => c.method === 'GET' && c.url.includes('/collections'));
assert(!hasTreeFetchOnUpdate, 'updating variant incrementally must NOT trigger full tree fetch');
const updateVariantPutCall = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/raindrop/502'));
assert(updateVariantPutCall, 'should call PUT /raindrop/502 to update secondary variant bookmark');
assert(updateVariantPutCall.body.title === 'GitHub ||| Issue Tracker', 'updated variant title should match');
assert(updateVariantPutCall.body.link === 'https://github.com/issues/assigned', 'updated variant link should match');

// 3. Delete URL variant incrementally
calls.length = 0;
const tabWithDeletedVariantState: ArcableWorkspaceData = {
  ...base,
  tabs: [
    {
      id: 'tab-gh',
      raindropId: 501,
      customTitle: 'GitHub',
      url: 'https://github.com',
      parentSpaceId: 'space-local',
      order: 1000,
      defaultVariantId: '501',
      urlVariants: [
        { id: '501', name: 'GitHub', url: 'https://github.com' },
      ],
    },
  ],
};
const deleteVariantOps = [
  operation('TAB_UPDATE', 'tab-gh', {
    urlVariants: tabWithDeletedVariantState.tabs[0].urlVariants,
    defaultVariantId: tabWithDeletedVariantState.tabs[0].defaultVariantId,
    deletedVariantIds: ['502'],
  }),
];
const deleteVariantSync = await syncWorkspaceWithRaindrop('token', {
  localState: tabWithDeletedVariantState,
  pendingOps: deleteVariantOps,
});
assert(deleteVariantSync?.success, 'deleting variant should sync incrementally with success');
const hasTreeFetchOnDelete = calls.some((c) => c.method === 'GET' && c.url.includes('/collections'));
assert(!hasTreeFetchOnDelete, 'deleting variant incrementally must NOT trigger full tree fetch');
const deleteVariantCall = calls.find((c) => c.method === 'DELETE' && c.url.includes('/raindrop'));
assert(deleteVariantCall, 'should issue a DELETE call to remove the deleted variant bookmark');

// 4. Delete tab with URL variants incrementally
calls.length = 0;
const tabToDeleteState: ArcableWorkspaceData = {
  ...base,
  tabs: [],
};
const deleteTabWithVariantsOps = [
  operation('TAB_DELETE', 'tab-gh', {
    raindropId: 501,
    variantRaindropIds: [502, 503],
    collectionId: 10,
  }),
];
const deleteTabSync = await syncWorkspaceWithRaindrop('token', {
  localState: tabToDeleteState,
  pendingOps: deleteTabWithVariantsOps,
});
assert(deleteTabSync?.success, 'deleting tab with variants should sync incrementally');
const hasTreeFetchOnTabDelete = calls.some((c) => c.method === 'GET' && c.url.includes('/collections'));
assert(!hasTreeFetchOnTabDelete, 'deleting tab with variants must NOT trigger full tree fetch');
const batchDeleteTabCall = calls.find((c) => c.method === 'DELETE' && c.url.includes('/raindrops/10'));
assert(batchDeleteTabCall, 'should issue DELETE /raindrops/10 for batch deletion of tab and all secondary variants');
assert(batchDeleteTabCall.body.ids.includes(501) && batchDeleteTabCall.body.ids.includes(502) && batchDeleteTabCall.body.ids.includes(503), 'should delete main bookmark and all secondary variants');

console.log('Raindrop incremental sync tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
