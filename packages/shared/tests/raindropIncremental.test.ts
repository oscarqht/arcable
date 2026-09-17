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
assert(calls.length === 1 && calls[0].method === 'POST' && calls[0].body.items.length === 3, 'multiple bookmarks should be created in one batch API call');
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
assert(callFolderA && callFolderA.body.order === 1 && callFolderA.body.sort === 1, 'folder-a should receive 0-based index 1 for order and sort');

console.log('Raindrop incremental sync tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
