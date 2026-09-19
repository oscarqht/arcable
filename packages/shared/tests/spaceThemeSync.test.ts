import assert from 'node:assert/strict';
import {
  syncWorkspaceWithRaindrop,
  fetchRaindropWorkspace,
  ARCABLE_COLLECTION_NAME,
  ARCABLE_SPACE_THEME_COLLECTION_NAME,
  ARCABLE_SPACE_THEME_TAG,
  ARCABLE_SPACE_THEME_LINK_PREFIX,
  isSystemCollection,
  isSpaceThemeItem,
  spaceThemeToRaindropItemInput,
  reconstructWorkspace,
} from '../src/utils/raindropSync';
import type { ArcableWorkspaceData, Space } from '../src/types/workspace';

const calls: Array<{ url: string; method: string; body?: any }> = [];
let nextId = 2000;

interface MockTreeState {
  collections: any[];
  bookmarks: any[];
}

let mockState: MockTreeState = {
  collections: [],
  bookmarks: [],
};

// Mock localStorage
const mockStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => { mockStorage.set(key, value); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
};
(globalThis as any).localStorage = storageMock;
(globalThis as any).window = {
  localStorage: storageMock,
  dispatchEvent: () => true,
};

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  let body: any;
  if (init?.body) {
    try {
      body = JSON.parse(String(init.body));
    } catch {
      body = String(init.body);
    }
  }
  calls.push({ url, method, body });
  const pathname = new URL(url).pathname;

  if (method === 'GET' && pathname.endsWith('/collections')) {
    return new Response(JSON.stringify({
      items: mockState.collections.filter(c => !c.parent?.$id),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'GET' && pathname.endsWith('/collections/childrens')) {
    return new Response(JSON.stringify({
      items: mockState.collections.filter(c => c.parent?.$id),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'GET' && pathname.includes('/raindrops/')) {
    const collId = parseInt(pathname.split('/raindrops/')[1], 10);
    const nested = new URL(url).searchParams.get('nested') === 'true';
    let items: any[] = [];
    if (nested) {
      const descendantIds = new Set<number>([collId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of mockState.collections) {
          if (c.parent?.$id && descendantIds.has(c.parent.$id) && !descendantIds.has(c._id)) {
            descendantIds.add(c._id);
            changed = true;
          }
        }
      }
      items = mockState.bookmarks.filter(b => descendantIds.has(b.collection?.$id));
    } else {
      items = mockState.bookmarks.filter(b => b.collection?.$id === collId);
    }
    return new Response(JSON.stringify({ items, count: items.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'POST' && pathname.endsWith('/collection')) {
    const newColl = {
      _id: nextId++,
      title: body.title,
      color: body.color,
      cover: body.cover,
      sort: body.sort ?? 0,
      parent: body.parent?.$id ? { $id: body.parent.$id } : undefined,
      created: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
    };
    mockState.collections.push(newColl);
    return new Response(JSON.stringify({ item: newColl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT' && pathname.includes('/collection/')) {
    const collId = parseInt(pathname.split('/collection/')[1], 10);
    const existing = mockState.collections.find(c => c._id === collId);
    if (existing) {
      if (body.title !== undefined) existing.title = body.title;
      if (body.color !== undefined) existing.color = body.color;
      if (body.cover !== undefined) existing.cover = body.cover;
      if (body.sort !== undefined) existing.sort = body.sort;
      if (body.parent?.$id !== undefined) existing.parent = { $id: body.parent.$id };
      existing.lastUpdate = new Date().toISOString();
    }
    return new Response(JSON.stringify({ item: existing }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE' && pathname.includes('/collection/')) {
    const collId = parseInt(pathname.split('/collection/')[1], 10);
    mockState.collections = mockState.collections.filter(c => c._id !== collId);
    mockState.bookmarks = mockState.bookmarks.filter(b => b.collection?.$id !== collId);
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'POST' && pathname.endsWith('/raindrops')) {
    const items = (body.items || []).map((entry: any) => {
      const item = {
        _id: nextId++,
        title: entry.title,
        link: entry.link,
        excerpt: entry.excerpt,
        note: entry.note,
        tags: entry.tags,
        sort: entry.sort ?? entry.order ?? 0,
        collection: entry.collection || (entry.collectionId ? { $id: entry.collectionId } : undefined),
        created: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
      };
      mockState.bookmarks.push(item);
      return item;
    });
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT' && pathname.includes('/raindrop/')) {
    const itemId = parseInt(pathname.split('/raindrop/')[1], 10);
    const existing = mockState.bookmarks.find(b => b._id === itemId);
    if (existing) {
      if (body.title !== undefined) existing.title = body.title;
      if (body.excerpt !== undefined) existing.excerpt = body.excerpt;
      if (body.note !== undefined) existing.note = body.note;
      if (body.tags !== undefined) existing.tags = body.tags;
      if (body.sort !== undefined) existing.sort = body.sort;
      if (body.order !== undefined) existing.sort = body.order;
      existing.lastUpdate = new Date().toISOString();
    }
    return new Response(JSON.stringify({ item: existing }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE' && pathname.includes('/raindrop/')) {
    const itemId = parseInt(pathname.split('/raindrop/')[1], 10);
    mockState.bookmarks = mockState.bookmarks.filter(b => b._id !== itemId);
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE' && pathname.includes('/raindrops/')) {
    const collId = parseInt(pathname.split('/raindrops/')[1], 10);
    const ids = body?.ids || [];
    mockState.bookmarks = mockState.bookmarks.filter(b => !ids.includes(b._id));
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
}) as any;

async function runTests() {
  console.log('--- Running Space Theme Sync Tests ---');

  // 1. Serialization and helper checks
  const mockSpace: Space = {
    id: 'space-123',
    raindropId: 456,
    name: 'Work Space',
    colors: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
    themeNoise: 0.45,
    order: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const input = spaceThemeToRaindropItemInput(mockSpace, 999);
  assert.equal(input.collectionId, 999);
  assert.equal(input.title, '[Theme] Work Space');
  assert.equal(input.link, `${ARCABLE_SPACE_THEME_LINK_PREFIX}space-123`);
  assert.deepEqual(input.tags, [ARCABLE_SPACE_THEME_TAG]);
  assert(input.excerpt);

  const parsedExcerpt = JSON.parse(input.excerpt);
  assert.equal(parsedExcerpt.spaceId, 'space-123');
  assert.equal(parsedExcerpt.spaceRaindropId, 456);
  assert.equal(parsedExcerpt.colors, 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)');
  assert.equal(parsedExcerpt.themeNoise, 0.45);

  // isSpaceThemeItem helper checks
  assert.equal(isSpaceThemeItem({ _id: 1, collectionId: 999 } as any, 999), true);
  assert.equal(isSpaceThemeItem({ _id: 2, link: 'https://arcable.app/space-theme/space-123' } as any), true);
  assert.equal(isSpaceThemeItem({ _id: 3, tags: ['arcable-space-theme'] } as any), true);
  assert.equal(isSpaceThemeItem({ _id: 4, link: 'https://example.com' } as any), false);

  // isSystemCollection helper checks
  assert.equal(isSystemCollection({ _id: 1, title: '_space_themes' } as any), true);
  assert.equal(isSystemCollection({ _id: 2, title: 'Personal Space' } as any), false);
  console.log('✓ Space theme serializers and type guards verified');

  // 2. Reconstruction from remote tree
  const remoteTree = {
    root: { _id: 10, title: ARCABLE_COLLECTION_NAME },
    collections: [
      { _id: 10, title: ARCABLE_COLLECTION_NAME, sort: 0 },
      { _id: 20, title: 'Development', parent: { $id: 10 }, sort: 1 },
      { _id: 30, title: '_space_themes', parent: { $id: 10 }, sort: 2 },
    ],
    items: [
      {
        _id: 101,
        collectionId: 30,
        title: '[Theme] Development',
        link: 'https://arcable.app/space-theme/20',
        excerpt: JSON.stringify({
          spaceId: '20',
          spaceRaindropId: 20,
          colors: '#10b981',
          themeNoise: 0.2,
        }),
        tags: [ARCABLE_SPACE_THEME_TAG],
      },
      {
        _id: 102,
        collectionId: 20,
        title: 'GitHub',
        link: 'https://github.com',
      },
    ],
  };

  const reconstructed = reconstructWorkspace(remoteTree as any);
  assert.equal(reconstructed.spaces.length, 1);
  const devSpace = reconstructed.spaces[0];
  assert.equal(devSpace.name, 'Development');
  assert.equal(devSpace.colors, '#10b981');
  assert.equal(devSpace.themeNoise, 0.2);

  // Theme bookmark should NEVER be treated as a tab!
  assert.equal(reconstructed.tabs.length, 1);
  assert.equal(reconstructed.tabs[0].url, 'https://github.com');
  console.log('✓ reconstructWorkspace attaches space theme and excludes theme bookmarks from tabs');

  // 3. Full Sync: create space with theme colors and noise
  mockState = {
    collections: [
      { _id: 10, title: ARCABLE_COLLECTION_NAME, sort: 0 },
    ],
    bookmarks: [],
  };
  calls.length = 0;

  const initialWorkspace: ArcableWorkspaceData = {
    spaces: [
      {
        id: 'space-gradient',
        name: 'Creative Space',
        colors: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
        themeNoise: 0.5,
        order: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    folders: [
      {
        id: 'folder-1',
        name: 'Work Folder',
        parentSpaceId: 'space-gradient',
        order: 1000,
      },
    ],
    tabs: [
      {
        id: 'tab-1',
        url: 'https://linear.app',
        customTitle: 'Linear',
        parentSpaceId: 'space-gradient',
        order: 1000,
      },
      {
        id: 'tab-2',
        url: 'https://docs.google.com',
        customTitle: 'Docs',
        parentFolderId: 'folder-1',
        parentSpaceId: 'space-gradient',
        order: 1000,
      },
    ],
  };

  const syncRes1 = await syncWorkspaceWithRaindrop('mock-token', {
    localState: initialWorkspace,
    replaceBaseline: true,
  });
  assert.equal(syncRes1.success, true);

  // Verify _space_themes collection was created
  const themeColl = mockState.collections.find(c => c.title === ARCABLE_SPACE_THEME_COLLECTION_NAME);
  assert(themeColl, '_space_themes collection must be created under root');
  assert.equal(themeColl.parent?.$id, 10);

  // Verify theme bookmark was created in _space_themes
  const themeBookmark = mockState.bookmarks.find(b => b.collection?.$id === themeColl._id);
  assert(themeBookmark, 'Theme bookmark must be created in _space_themes');
  assert.equal(themeBookmark.title, '[Theme] Creative Space');
  assert.equal(themeBookmark.link, `${ARCABLE_SPACE_THEME_LINK_PREFIX}space-gradient`);
  assert.deepEqual(themeBookmark.tags, [ARCABLE_SPACE_THEME_TAG]);

  const themePayload = JSON.parse(themeBookmark.excerpt);
  assert.equal(themePayload.colors, 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)');
  assert.equal(themePayload.themeNoise, 0.5);

  // Verify the Space collection itself has NO native color set (remains undefined)
  const spaceColl = mockState.collections.find(c => c.title === 'Creative Space');
  assert(spaceColl, 'Space collection must exist');
  assert.equal(spaceColl.color, undefined, 'Space collection native color must be untouched');
  console.log('✓ Space theme synced to _space_themes without modifying Raindrop native collection color');

  // 4. Update space theme
  const updatedWorkspace: ArcableWorkspaceData = {
    ...syncRes1.latestSnapshot!,
    spaces: syncRes1.latestSnapshot!.spaces.map(s => {
      if (s.name === 'Creative Space') {
        return {
          ...s,
          colors: '#f59e0b',
          themeNoise: 0.1,
          updatedAt: Date.now() + 1000,
        };
      }
      return s;
    }),
  };

  calls.length = 0;
  const syncRes2 = await syncWorkspaceWithRaindrop('mock-token', {
    localState: updatedWorkspace,
    pendingOps: [
      {
        id: 'op-update-theme',
        type: 'SPACE_UPDATE',
        entityId: updatedWorkspace.spaces[0].id,
        payload: { colors: '#f59e0b', themeNoise: 0.1 },
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(syncRes2.success, true);

  // Verify theme bookmark in _space_themes was updated, not duplicated
  const themeBookmarks = mockState.bookmarks.filter(b => b.collection?.$id === themeColl._id);
  assert.equal(themeBookmarks.length, 1, 'Should not create duplicate theme bookmarks on update');
  const updatedThemePayload = JSON.parse(themeBookmarks[0].excerpt);
  assert.equal(updatedThemePayload.colors, '#f59e0b');
  assert.equal(updatedThemePayload.themeNoise, 0.1);

  // CRITICAL: Verify changing space color issues ONLY 1 Raindrop API call: PUT /raindrop/:themeBookmarkId
  // (No full re-sync, no calls to tabs or collections!)
  assert.equal(calls.length, 1, `Expected exactly 1 Raindrop API call, got ${calls.length}: ${JSON.stringify(calls)}`);
  assert.equal(calls[0].method, 'PUT');
  assert(calls[0].url.includes(`/raindrop/${themeBookmarks[0]._id}`), 'Must update that particular raindrop item under _space_themes');
  console.log('✓ Updating space theme sends ONLY 1 PUT request to the specific _space_themes bookmark');

  // 5. Clear space theme (remove color and noise)
  const clearedWorkspace: ArcableWorkspaceData = {
    ...syncRes2.latestSnapshot!,
    spaces: syncRes2.latestSnapshot!.spaces.map(s => ({
      ...s,
      colors: undefined,
      themeNoise: undefined,
      updatedAt: Date.now() + 2000,
    })),
  };

  calls.length = 0;
  const syncRes3 = await syncWorkspaceWithRaindrop('mock-token', {
    localState: clearedWorkspace,
    pendingOps: [
      {
        id: 'op-clear-theme',
        type: 'SPACE_UPDATE',
        entityId: clearedWorkspace.spaces[0].id,
        payload: { colors: undefined, themeNoise: undefined },
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(syncRes3.success, true);

  // CRITICAL: Verify clearing space theme issues ONLY 1 Raindrop API call: DELETE /raindrop/:themeBookmarkId
  assert.equal(calls.length, 1, `Expected exactly 1 Raindrop API call for clearing theme, got ${calls.length}: ${JSON.stringify(calls)}`);
  assert.equal(calls[0].method, 'DELETE');
  assert(calls[0].url.includes(`/raindrop/${themeBookmarks[0]._id}`));

  const remainingThemeBookmarks = mockState.bookmarks.filter(b => b.collection?.$id === themeColl._id);
  assert.equal(remainingThemeBookmarks.length, 0, 'Theme bookmark should be deleted when space color/noise is cleared');
  console.log('✓ Clearing space theme removes remote theme bookmark with a single DELETE request');

  // 6. Delete space removes orphan theme bookmark
  // First recreate theme
  await syncWorkspaceWithRaindrop('mock-token', {
    localState: updatedWorkspace,
    replaceBaseline: true,
  });
  assert.equal(mockState.bookmarks.filter(b => b.collection?.$id === themeColl._id).length, 1);

  // Now delete space
  const deletedWorkspace: ArcableWorkspaceData = {
    ...updatedWorkspace,
    spaces: [],
    folders: [],
    tabs: [],
  };
  const syncRes4 = await syncWorkspaceWithRaindrop('mock-token', {
    localState: deletedWorkspace,
    replaceBaseline: true,
  });
  assert.equal(syncRes4.success, true);
  const orphanBookmarks = mockState.bookmarks.filter(b => b.collection?.$id === themeColl._id);
  assert.equal(orphanBookmarks.length, 0, 'Orphan theme bookmark must be removed when space is deleted');
  console.log('✓ Deleting space cleans up orphan theme bookmark');

  console.log('🎉 All Space Theme Sync Tests Passed Successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
