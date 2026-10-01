import { ungroupFavourite } from '../src/utils/ungroupFavourite';
import { replayOperations } from '../src/utils/syncEngine';
import {
  ARCABLE_VARIANT_DELIMITER,
  attachGroupMetaToNote,
  reconstructWorkspace,
  syncWorkspaceWithRaindrop,
  widgetToRaindropItemInput,
} from '../src/utils/raindropSync';
import type { ArcableWorkspaceData, Tab, WorkspaceWidget } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';
import type { RaindropBookmarkItem } from '../src/types/raindrop';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function shelfTitles(data: ArcableWorkspaceData): string[] {
  return [
    ...data.tabs.filter((tab) => tab.favourite).map((tab) => ({ ...tab, label: tab.customTitle })),
    ...(data.widgets || []).filter((widget) => !widget.parentGroupId).map((widget) => ({ ...widget, label: widget.id })),
  ].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) ||
    (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))
    .map((item) => item.label || '');
}

function fixture(count: number, withWidgets = false): ArcableWorkspaceData {
  const group: Tab = {
    id: 'group-local', raindropId: 101, pinned: false, favourite: true,
    url: 'https://member0.test', customTitle: 'Work', isGroup: true, order: 1000,
    urlVariants: Array.from({ length: count }, (_, index) => ({
      id: String(101 + index), name: `Member ${index}`, url: `https://member${index}.test`,
    })),
  };
  const widgets: WorkspaceWidget[] = withWidgets ? [
    { id: 'child-a', raindropId: 201, style: 'digital', size: 'small', parentGroupId: group.id },
    { id: 'child-b', raindropId: 202, style: 'digital', size: 'small', parentGroupId: group.id },
  ] : [];
  group.groupItemOrder = [
    ...widgets.slice(1).map((widget) => ({ type: 'widget' as const, id: widget.id })),
    ...(group.urlVariants || []).slice().reverse().map((variant) => ({ type: 'tab' as const, id: variant.id })),
    ...widgets.slice(0, 1).map((widget) => ({ type: 'widget' as const, id: widget.id })),
  ];
  group.note = attachGroupMetaToNote('Keep this note', group);
  return {
    version: 2, raindropRootCollectionId: 1, activeSpaceId: 'space-1',
    spaces: [{ id: 'space-1', name: 'Space' }], folders: [],
    tabs: [
      { id: 'before', raindropId: 90, url: 'https://before.test', customTitle: 'Before', favourite: true, pinned: false, order: 1000, createdAt: 1 },
      { ...group, createdAt: 2 },
      { id: 'after', raindropId: 91, url: 'https://after.test', customTitle: 'After', favourite: true, pinned: false, order: 1001 },
      { id: 'regular', url: 'https://regular.test', pinned: false, parentSpaceId: 'space-1', order: 42 },
    ], widgets,
  };
}

async function main(): Promise<void> {
  // All cardinalities use the same expansion, including mixed member order and tied shelf orders.
  for (const count of [0, 1, 3]) {
    for (const withWidgets of [false, true]) {
      const base = fixture(count, withWidgets);
      const operations: WorkspaceOperation[] = [];
      const result = ungroupFavourite(base, base.tabs[1], (operation) => operations.push(operation));
      const expected = ['Before',
        ...(withWidgets ? ['child-b'] : []),
        ...Array.from({ length: count }, (_, index) => `Member ${count - index - 1}`),
        ...(withWidgets ? ['child-a'] : []), 'After'];
      assert(JSON.stringify(shelfTitles(result)) === JSON.stringify(expected), 'Every member must replace the exact group slot in visible order');
      const replayed = replayOperations(base, operations);
      assert(JSON.stringify(shelfTitles(replayed)) === JSON.stringify(expected), 'Sync replay must preserve titles and all shelf positions');
      assert(!replayed.tabs.some((tab) => tab.isGroup || tab.urlVariants), 'Replay must clear all group metadata');
      assert(result.tabs.find((tab) => tab.id === 'regular') === base.tabs[3], 'Unrelated tabs must remain unchanged');
      assert(!result.widgets?.some((widget) => widget.parentGroupId), 'Every child widget must be unpacked');
    }
  }

  // A partially stale item-order list must not drop members missing from it.
  const incomplete = fixture(3, true);
  incomplete.tabs[1].groupItemOrder = [{ type: 'tab', id: '103' }, { type: 'tab', id: 'missing' }];
  const fallback = ungroupFavourite(incomplete, incomplete.tabs[1], () => {});
  assert(JSON.stringify(shelfTitles(fallback)) === JSON.stringify(['Before', 'Member 2', 'Member 0', 'Member 1', 'child-a', 'child-b', 'After']), 'Unlisted members must be appended in their original order');
  incomplete.tabs[1].urlVariants![0].name = `Work${ARCABLE_VARIANT_DELIMITER}Member 0`;
  const cleanTitles = ungroupFavourite(incomplete, incomplete.tabs[1], () => {});
  assert(cleanTitles.tabs.every((tab) => !tab.customTitle?.includes(ARCABLE_VARIANT_DELIMITER)), 'Ungrouped titles must not include the group delimiter');

  // Exercise actual upload and read-only hydration against an in-memory Raindrop API.
  for (const { forceFullSync, remoteId, withWidgets } of [
    { forceFullSync: false, remoteId: 101, withWidgets: false },
    { forceFullSync: false, remoteId: 103, withWidgets: true },
    { forceFullSync: true, remoteId: 101, withWidgets: false },
    { forceFullSync: true, remoteId: 103, withWidgets: true },
  ]) {
    const base = fixture(3, withWidgets);
    base.tabs = base.tabs.filter((tab) => tab.favourite);
    base.spaces[0].raindropId = 10;
    const group = base.tabs[1];
    group.raindropId = remoteId;
    let remoteItems: RaindropBookmarkItem[] = [
      { _id: 90, title: 'Before', link: 'https://before.test', collectionId: 1, order: 0, sort: 0 },
      ...group.urlVariants!.map((variant, index) => ({
        _id: Number(variant.id), title: `Work${ARCABLE_VARIANT_DELIMITER}${variant.name}`,
        link: variant.url, collectionId: 1, order: index + 1, sort: index + 1,
        note: Number(variant.id) === remoteId ? group.note : '',
      })),
      ...(base.widgets || []).map((widget, index) => {
        const input = widgetToRaindropItemInput(widget, 1, index + 4);
        return { ...input, title: input.title!, _id: widget.raindropId!, collectionId: 1 };
      }),
      { _id: 91, title: 'After', link: 'https://after.test', collectionId: 1, order: 4, sort: 4 },
    ];
    let nextId = 500;
    const root = { _id: 1, title: 'Arcable v2', count: remoteItems.length, sort: 0 };
    const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method || 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (method === 'GET' && path.endsWith('/collections')) return response({ items: [root] });
      if (method === 'GET' && path.endsWith('/collections/childrens')) return response({ items: [{ _id: 10, title: 'Space', parent: { $id: 1 }, sort: 0, order: 0 }] });
      if (method === 'GET' && path.includes('/raindrops/')) return response({ items: [...remoteItems].sort((a, b) => (a.order || 0) - (b.order || 0)).map((item) => ({ ...item, collection: { $id: item.collectionId } })), count: remoteItems.length });
      if (method === 'PUT' && path.includes('/collection/')) return response({ item: { ...body, _id: 10 } });
      if (method === 'POST' && path.endsWith('/raindrops')) {
        const items = body.items.map((item: any) => ({ ...item, _id: nextId++, collectionId: item.collection.$id }));
        remoteItems.push(...items);
        return response({ items });
      }
      if (method === 'PUT' && path.includes('/raindrop/')) {
        const item = remoteItems.find((candidate) => candidate._id === Number(path.split('/').pop()));
        assert(item, 'Updates must target existing bookmarks');
        Object.assign(item, body);
        return response({ item });
      }
      if (method === 'DELETE' && path.includes('/raindrops/')) {
        remoteItems = remoteItems.filter((item) => !body.ids.includes(item._id));
        return response({ result: true });
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    }) as typeof fetch;

    const operations: WorkspaceOperation[] = [];
    const local = ungroupFavourite(base, group, (operation) => operations.push(operation));
    const result = await syncWorkspaceWithRaindrop('test-token', {
      localState: replayOperations(base, operations), pendingOps: operations,
      replaceBaseline: forceFullSync,
    });
    assert(result.success, `Upload must succeed: ${result.error}`);
    assert(remoteItems.length === (withWidgets ? 7 : 5), 'Remote group must be replaced by ALL three members without orphans');
    assert(remoteItems.every((item) => !item.title.includes(ARCABLE_VARIANT_DELIMITER)), 'Remote titles must be plain member titles');
    const reconstructed = reconstructWorkspace({ root, collections: [root], items: [...remoteItems].sort((a, b) => (a.order || 0) - (b.order || 0)) }, 'space-1');
    assert(JSON.stringify(shelfTitles(reconstructed)) === JSON.stringify(shelfTitles(local)), `A fresh reconstruction must preserve the complete favorite order (${forceFullSync}): ${JSON.stringify(shelfTitles(reconstructed))} vs ${JSON.stringify(shelfTitles(local))}`);
    assert(!reconstructed.tabs.some((tab) => tab.isGroup), 'The group must not reappear after reconstruction');
    const refreshed = await syncWorkspaceWithRaindrop('test-token', { localState: result.latestSnapshot, pendingOps: [] });
    assert(refreshed.success && JSON.stringify(shelfTitles(refreshed.latestSnapshot!)) === JSON.stringify(shelfTitles(local)), `A later sync must retain all members and their order (${forceFullSync}): ${refreshed.error} ${JSON.stringify(refreshed.latestSnapshot && shelfTitles(refreshed.latestSnapshot))}`);
  }
  console.log('Favourite ungroup regression tests passed');
}

void main().catch((error) => { console.error(error); process.exit(1); });
