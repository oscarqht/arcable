import { syncIncrementalOperations, syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';
import { fetchAllRaindropItems } from '../src/utils/raindropClient';
import { mergeIncrementalSyncSnapshot } from '../src/utils/syncEngine';
import type { ArcableWorkspaceData } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ url: string; method: string; body?: any; cache?: RequestCache; headers?: Headers }> = [];
let nextId = 100;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
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
        items: [{ _id: 1, title: 'Arcable', count: 0, sort: 0 }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith('/collections/childrens')) {
      return new Response(JSON.stringify({ items: [] }), {
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
  raindropMetadataItemId: 77,
  widgets: [{ id: 'widget-local', style: 'clock', size: 'small', order: 2000 }],
};
const widgetUpdate = await syncIncrementalOperations(
  'token',
  widgetState,
  [operation('WIDGET_UPDATE', 'widget-local', { order: 2000 })],
  false
);
assert(widgetUpdate?.success, 'favourite widget changes should use incremental metadata sync');
assert(calls.length === 2, 'favourite widget changes should replace metadata without a full-tree fetch');
assert(calls[0].method === 'DELETE' && calls[0].url.endsWith('/raindrops/1'), 'widget sync should remove only the previous metadata item');
assert(calls[1].method === 'PUT' && calls[1].url.endsWith('/raindrop/file'), 'widget sync should upload only the updated metadata file');
assert(calls.every((call) => call.method !== 'GET'), 'favourite widget changes should not fetch the full workspace');
assert(widgetUpdate.latestSnapshot?.raindropMetadataItemId === 105, 'widget sync should retain the replacement metadata item ID');

calls.length = 0;
const mixedFavouriteState: ArcableWorkspaceData = {
  ...widgetState,
  raindropMetadataItemId: 105,
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
assert(calls.length === 3, 'mixed favourite reordering should update one bookmark and replace metadata only');
assert(calls.every((call) => call.method !== 'GET'), 'mixed favourite reordering should not fetch the full workspace');

calls.length = 0;
const preHydrationWidgetState: ArcableWorkspaceData = {
  ...widgetState,
  raindropMetadataItemId: undefined,
};
const hydratedWidgetIdentity: ArcableWorkspaceData = {
  ...widgetState,
  raindropMetadataItemId: 106,
};
const racedWidgetUpdate = await syncWorkspaceWithRaindrop('token', {
  localState: preHydrationWidgetState,
  identitySnapshot: hydratedWidgetIdentity,
  pendingOps: [operation('WIDGET_UPDATE', 'widget-local', { order: 2000 })],
});
assert(racedWidgetUpdate.success, 'a pending widget edit should reuse identity from the completed hydration');
assert(calls.length === 2, 'the hydration race should still replace metadata with only two requests');
assert(calls.every((call) => call.method !== 'GET'), 'the hydration race must not fall back to a full-tree read');

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

console.log('Raindrop incremental sync tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
