import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBookmarkToFolder, convertFolderToBookmark } from '../src/utils/bookmarkFolderConversion';
import { replayOperations } from '../src/utils/syncEngine';
import { syncIncrementalOperations } from '../src/utils/raindropSync';
import type { ArcableWorkspaceData } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

const base: ArcableWorkspaceData = {
  activeSpaceId: 'space', raindropRootCollectionId: 1,
  spaces: [{ id: 'space', raindropId: 10, name: 'Space' }],
  folders: [{ id: 'parent', raindropId: 11, parentSpaceId: 'space', name: 'Parent' }],
  tabs: [{ id: 'bookmark', raindropId: 20, pinned: false, customTitle: 'API', favIconUrl: 'https://example.com/bookmark-cover.png', note: 'Keep this note',
    parentSpaceId: 'space', parentFolderId: 'parent', order: 2000,
    url: 'https://prod.example/{{path}}', defaultVariantId: '21', urlVariants: [
      { id: '20', name: 'Local', url: 'http://localhost:8080/{{path}}', customEmojiIcon: '🏠' },
      { id: '21', name: 'Production', url: 'https://prod.example/{{path}}', favIconUrl: 'https://prod.example/icon.png' },
    ] }],
};

function ops(conversion: NonNullable<ReturnType<typeof convertBookmarkToFolder>>, start = 0): WorkspaceOperation[] {
  return conversion.operations.map((operation, index) => ({ ...operation, id: `op-${start + index}`, deviceId: 'test', timestamp: start + index + 1, lamportSeq: start + index + 1 }));
}

test('bookmark becomes a sibling folder with one named item per variant; operations replay', () => {
  const conversion = convertBookmarkToFolder(base, 'bookmark')!;
  const folder = conversion.data.folders.at(-1)!;
  assert.equal(folder.name, 'API');
  assert.equal(folder.coverUrl, base.tabs[0].favIconUrl);
  assert.equal(folder.parentFolderId, 'parent');
  assert.equal(folder.order, 2000);
  assert.deepEqual(conversion.data.tabs.map((tab) => [tab.customTitle, tab.url]), base.tabs[0].urlVariants!.map((v) => [v.name, v.url]));
  assert(conversion.data.tabs.every((tab) => tab.parentFolderId === folder.id && !tab.raindropId));
  assert.equal(conversion.data.tabs[0].customEmojiIcon, '🏠');
  assert.equal(conversion.data.tabs[1].favIconUrl, 'https://prod.example/icon.png');
  const replay = replayOperations(base, ops(conversion));
  assert.equal(replay.folders.at(-1)!.coverUrl, base.tabs[0].favIconUrl);
  assert.deepEqual(replay.tabs.map((t) => [t.id, t.note, t.parentFolderId]), conversion.data.tabs.map((t) => [t.id, t.note, t.parentFolderId]));
  assert.deepEqual(conversion.operations.at(-1)!.payload.variantRaindropIds, [20, 21]);
});

test('folder cover falls back to the default variant cover', () => {
  const data = { ...base, tabs: [{ ...base.tabs[0], favIconUrl: undefined }] };
  assert.equal(convertBookmarkToFolder(data, 'bookmark')!.data.folders.at(-1)!.coverUrl, 'https://prod.example/icon.png');
});

test('folder uses displayed first bookmark title and preserves nested variants and default', () => {
  const split = convertBookmarkToFolder(base, 'bookmark')!;
  const folder = split.data.folders.at(-1)!;
  const data = { ...split.data, tabs: [
    { ...base.tabs[0], id: 'first', parentFolderId: folder.id, order: 1000 },
    { ...split.data.tabs[0], id: 'last', customTitle: 'Other', order: 3000 },
  ].reverse() };
  const merged = convertFolderToBookmark(data, folder.id)!;
  const tab = merged.data.tabs[0];
  assert.equal(tab.customTitle, 'API');
  assert.equal(tab.parentFolderId, 'parent');
  assert.equal(tab.order, 2000);
  assert.equal(tab.note, 'Keep this note');
  assert.equal(tab.urlVariants!.length, 3);
  assert.equal(tab.url, 'https://prod.example/{{path}}');
  assert.equal(tab.defaultVariantId, tab.urlVariants![1].id);
  assert(tab.urlVariants!.every((variant) => !/^\d+$/.test(variant.id)));
  assert.equal(replayOperations(data, ops(merged)).tabs.length, 1);
});

test('empty folders, subfolders, and widget groups cannot be converted', () => {
  assert.equal(convertFolderToBookmark(base, 'parent')?.data.tabs[0].customTitle, 'API');
  assert.equal(convertFolderToBookmark({ ...base, tabs: [] }, 'parent'), undefined);
  assert.equal(convertFolderToBookmark({ ...base, folders: [...base.folders, { id: 'child', name: 'Child', parentSpaceId: 'space', parentFolderId: 'parent' }] }, 'parent'), undefined);
  const withWidget = { ...base, widgets: [{ id: 'widget', style: 'note' as const, size: 'small' as const, parentGroupId: 'bookmark' }] };
  assert.equal(convertBookmarkToFolder(withWidget, 'bookmark'), undefined);
  assert.equal(convertFolderToBookmark(withWidget, 'parent'), undefined);
});

test('favourite conversion places the folder in the active space', () => {
  const data = { ...base, tabs: [{ ...base.tabs[0], favourite: true, parentSpaceId: undefined, parentFolderId: undefined }] };
  const conversion = convertBookmarkToFolder(data, 'bookmark')!;
  assert.equal(conversion.data.folders.at(-1)!.parentSpaceId, 'space');
  assert.equal(conversion.operations.at(-1)!.payload.collectionId, 1);
});

test('both conversions and a round trip before sync create destinations before remote deletion', async () => {
  const calls: Array<{ url: string; method: string; body: any }> = [];
  const originalFetch = globalThis.fetch;
  let nextId = 100;
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = String(input), method = init.method || 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (method === 'POST' && url.endsWith('/collection')) return Response.json({ item: { ...body, _id: nextId++ } });
    if (method === 'POST' && url.endsWith('/raindrops')) return Response.json({ items: body.items.map((item: any) => ({ ...item, _id: nextId++ })) });
    if (method === 'PUT') return Response.json({ item: { ...body, _id: Number(url.split('/').at(-1)) } });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;
  try {
    const split = convertBookmarkToFolder(base, 'bookmark')!;
    const splitResult = await syncIncrementalOperations('test', split.data, ops(split), false);
    assert(splitResult?.success);
    const folder = splitResult.latestSnapshot!.folders.at(-1)!;
    assert.equal(folder.coverUrl, base.tabs[0].favIconUrl);
    assert.deepEqual(calls.find((call) => call.method === 'POST' && call.url.endsWith('/collection'))!.body.cover, [base.tabs[0].favIconUrl]);
    const merged = convertFolderToBookmark(splitResult.latestSnapshot!, folder.id)!;
    calls.length = 0;
    const mergeResult = await syncIncrementalOperations('test', merged.data, ops(merged), false);
    assert(mergeResult?.success);
    assert.equal(mergeResult.latestSnapshot!.tabs[0].urlVariants!.length, 2);
    assert(calls.findIndex((call) => call.method === 'POST') < calls.findIndex((call) => call.method === 'DELETE'));
    assert(calls.some((call) => call.method === 'DELETE' && call.url.endsWith(`/collection/${folder.raindropId}`)));
    const unsyncedMerge = convertFolderToBookmark(split.data, split.data.folders.at(-1)!.id)!;
    const roundTrip = await syncIncrementalOperations('test', unsyncedMerge.data, [...ops(split), ...ops(unsyncedMerge, 100)], false);
    assert(roundTrip?.success);
    assert.equal(roundTrip.latestSnapshot!.tabs.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
