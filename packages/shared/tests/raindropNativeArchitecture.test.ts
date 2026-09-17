import assert from 'node:assert/strict';
import {
  syncWorkspaceWithRaindrop,
  fetchRaindropWorkspace,
  ARCABLE_COLLECTION_NAME,
  ARCABLE_CUSTOM_CSS_COLLECTION_NAME,
  ARCABLE_RUN_CODE_COLLECTION_NAME,
  ARCABLE_WIDGET_TAG,
  ARCABLE_WIDGET_LINK_PREFIX,
  ARCABLE_CUSTOM_CSS_LINK_PREFIX,
  ARCABLE_RUN_CODE_LINK_PREFIX,
  ARCABLE_VARIANT_DELIMITER,
  isSystemCollection,
  isWidgetItem,
} from '../src/utils/raindropSync';
import { getSortedSiblings } from '../src/hooks/useWorkspace';
import type { ArcableWorkspaceData } from '../src/types/workspace';

const calls: Array<{ url: string; method: string; body?: any }> = [];
let nextId = 1000;

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
      // Find all descendant collections of collId
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
    const created = {
      _id: nextId++,
      title: body.title,
      parent: body.parent,
      sort: body.sort ?? 0,
      color: body.color,
      cover: body.cover,
    };
    mockState.collections.push(created);
    return new Response(JSON.stringify({ item: created }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT' && pathname.startsWith('/rest/v1/collection/')) {
    const id = parseInt(pathname.split('/').pop()!, 10);
    const existing = mockState.collections.find(c => c._id === id);
    if (existing) {
      Object.assign(existing, body);
    }
    return new Response(JSON.stringify({ item: existing || { _id: id, ...body } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'POST' && pathname.endsWith('/raindrops')) {
    const createdItems = (body.items || []).map((itemInput: any) => {
      const created = {
        _id: nextId++,
        title: itemInput.title,
        link: itemInput.link,
        excerpt: itemInput.excerpt,
        note: itemInput.note,
        tags: itemInput.tags || [],
        cover: itemInput.cover,
        order: itemInput.order,
        sort: itemInput.order,
        collection: itemInput.collection,
        created: '2026-01-01T00:00:00Z',
        lastUpdate: '2026-01-01T00:00:00Z',
      };
      mockState.bookmarks.push(created);
      return created;
    });
    return new Response(JSON.stringify({ items: createdItems }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT' && pathname.startsWith('/rest/v1/raindrop/')) {
    const id = parseInt(pathname.split('/').pop()!, 10);
    const existing = mockState.bookmarks.find(b => b._id === id);
    if (existing) {
      Object.assign(existing, body);
    }
    return new Response(JSON.stringify({ item: existing || { _id: id, ...body } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE' && pathname.startsWith('/rest/v1/raindrops/')) {
    const idsToDelete: number[] = body?.ids || [];
    mockState.bookmarks = mockState.bookmarks.filter(b => !idsToDelete.includes(b._id));
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE' && pathname.startsWith('/rest/v1/raindrop/')) {
    const id = parseInt(pathname.split('/').pop()!, 10);
    mockState.bookmarks = mockState.bookmarks.filter(b => b._id !== id);
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE' && pathname.startsWith('/rest/v1/collection/')) {
    const id = parseInt(pathname.split('/').pop()!, 10);
    mockState.collections = mockState.collections.filter(c => c._id !== id);
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT' && pathname.startsWith('/rest/v1/raindrops/')) {
    const ids: number[] = body?.ids || [];
    const targetColl = body?.collection?.$id;
    for (const b of mockState.bookmarks) {
      if (ids.includes(b._id)) {
        b.collection = { $id: targetColl };
      }
    }
    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

async function runTests(): Promise<void> {
  // 1. Sibling order test: Folders must precede tabs
  const testFolders = [
    { id: 'f1', name: 'Folder 1', parentSpaceId: 's1', order: 10 },
    { id: 'f2', name: 'Folder 2', parentSpaceId: 's1', order: 5 },
  ];
  const testTabs = [
    { id: 't1', url: 'https://a.com', pinned: false, parentSpaceId: 's1', order: 1 },
    { id: 't2', url: 'https://b.com', pinned: false, parentSpaceId: 's1', order: 20 },
  ];
  const sortedSiblings = getSortedSiblings(testFolders as any, testTabs as any, 's1');
  assert.equal(sortedSiblings[0].id, 'f2', 'First sibling should be folder with lower order');
  assert.equal(sortedSiblings[1].id, 'f1', 'Second sibling should be folder with higher order');
  assert.equal(sortedSiblings[2].id, 't1', 'Third sibling should be tab with lower order');
  assert.equal(sortedSiblings[3].id, 't2', 'Fourth sibling should be tab with higher order');
  console.log('✓ Sibling sorting: folders precede tabs');

  // 2. Full baseline sync with widgets, code rules, variants, and legacy cleanup
  calls.length = 0;
  mockState = {
    collections: [
      { _id: 1, title: 'Arcable v2', sort: 0 },
    ],
    bookmarks: [
      // Legacy data.json.txt
      {
        _id: 99,
        title: 'data.json.txt',
        collection: { $id: 1 },
        file: { name: 'data.json.txt' },
      },
      // Bookmark with legacy note
      {
        _id: 101,
        title: 'Legacy Bookmark',
        link: 'https://legacy.com',
        collection: { $id: 1 },
        note: JSON.stringify({ schema: 'arcable-bookmark-v1', arcableId: 'leg-1', pinned: true }),
      },
    ],
  };

  const localState: ArcableWorkspaceData = {
    raindropRootCollectionId: 1,
    activeSpaceId: 'space-work',
    version: 1,
    spaces: [
      { id: 'space-work', name: 'Work Space', order: 0 },
    ],
    folders: [
      { id: 'folder-proj', name: 'Projects', parentSpaceId: 'space-work', order: 0 },
    ],
    tabs: [
      {
        id: 'tab-gh',
        url: 'https://github.com',
        customTitle: 'GitHub',
        parentFolderId: 'folder-proj',
        parentSpaceId: 'space-work',
        order: 0,
        urlVariants: [
          { id: 'v-main', name: 'Main', url: 'https://github.com' },
          { id: 'v-issues', name: 'Issues', url: 'https://github.com/issues' },
          { id: 'v-prs', name: 'Pull Requests', url: 'https://github.com/pulls' },
        ],
        defaultVariantId: 'v-main',
      },
      {
        id: 'tab-fav',
        url: 'https://news.ycombinator.com',
        customTitle: 'Hacker News',
        favourite: true,
        order: 10,
      },
    ],
    widgets: [
      {
        id: 'widget-clock',
        style: 'digital',
        size: 'small',
        order: 5,
        config: { timeFormat: '24h' },
      },
    ],
    customCodeRules: [
      {
        id: 'rule-css-1',
        pattern: '*://*.example.com/*',
        css: 'body { background: black; }',
        js: '',
        disabled: false,
      },
    ],
    runCodeInPageRules: [
      {
        id: 'rule-run-1',
        title: 'Dark Mode Script',
        patterns: ['*://*/*'],
        code: 'document.body.classList.add("dark");',
        disabled: false,
      },
    ],
  };

  const syncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState,
    replaceBaseline: true,
  });

  assert.equal(syncResult.success, true, 'Sync should succeed');

  // Verify data.json.txt was deleted and NOT uploaded
  assert(calls.every(c => !c.url.endsWith('/raindrop/file')), 'data.json.txt must NOT be uploaded');
  const deletedLegacyDataCall = calls.find(c =>
    c.method === 'DELETE' && (c.url.includes('/raindrop/99') || c.body?.ids?.includes(99))
  );
  assert(deletedLegacyDataCall, 'data.json.txt must be deleted from Raindrop');
  console.log('✓ data.json.txt deleted and not uploaded');

  // Verify legacy bookmark note was wiped clean
  const cleanNoteCall = calls.find(c => c.method === 'PUT' && c.url.endsWith('/raindrop/101'));
  assert(cleanNoteCall, 'Legacy bookmark should be updated');
  assert.equal(cleanNoteCall.body.note, '', 'Legacy note metadata must be wiped clean');
  console.log('✓ Legacy bookmark note wiped clean');

  // Verify created collections: _custom_css and _run_code exist
  const customCssColl = mockState.collections.find(c => c.title === ARCABLE_CUSTOM_CSS_COLLECTION_NAME);
  const runCodeColl = mockState.collections.find(c => c.title === ARCABLE_RUN_CODE_COLLECTION_NAME);
  assert(customCssColl, '_custom_css collection must be created');
  assert(runCodeColl, '_run_code collection must be created');
  console.log('✓ Special collections _custom_css and _run_code created');

  // Verify widgets created in root collection
  const widgetItem = mockState.bookmarks.find(b => isWidgetItem(b));
  assert(widgetItem, 'Widget item must be created in Raindrop');
  assert.equal(widgetItem.collection.$id, 1, 'Widget must be placed in root collection');
  assert(widgetItem.tags.includes(ARCABLE_WIDGET_TAG), 'Widget must have arcable-widget tag');
  assert(widgetItem.link.startsWith(ARCABLE_WIDGET_LINK_PREFIX), 'Widget must have placeholder URL prefix');
  const widgetExcerpt = JSON.parse(widgetItem.excerpt);
  assert.equal(widgetExcerpt.style, 'digital', 'Widget style must be stored in excerpt JSON');
  console.log('✓ Widget placeholder item created in root collection');

  // Verify Custom CSS placeholder item
  const customCssItem = mockState.bookmarks.find(b => b.collection.$id === customCssColl._id);
  assert(customCssItem, 'Custom CSS item must be in _custom_css collection');
  assert(customCssItem.link.startsWith(ARCABLE_CUSTOM_CSS_LINK_PREFIX), 'Custom CSS link prefix');
  const cssExcerpt = JSON.parse(customCssItem.excerpt);
  assert.equal(cssExcerpt.css, 'body { background: black; }');
  console.log('✓ Custom CSS placeholder item created with JSON excerpt');

  // Verify Run Code placeholder item
  const runCodeItem = mockState.bookmarks.find(b => b.collection.$id === runCodeColl._id);
  assert(runCodeItem, 'Run Code item must be in _run_code collection');
  assert(runCodeItem.link.startsWith(ARCABLE_RUN_CODE_LINK_PREFIX), 'Run Code link prefix');
  const runExcerpt = JSON.parse(runCodeItem.excerpt);
  assert.equal(runExcerpt.code, 'document.body.classList.add("dark");');
  console.log('✓ Run Code placeholder item created with JSON excerpt');

  // Verify URL Variants: Primary item titled "GitHub", secondary items titled "GitHub ||| <variant>"
  const primaryTab = mockState.bookmarks.find(b => b.title === 'GitHub');
  const issuesVariant = mockState.bookmarks.find(b => b.title === `GitHub${ARCABLE_VARIANT_DELIMITER}Issues`);
  const prsVariant = mockState.bookmarks.find(b => b.title === `GitHub${ARCABLE_VARIANT_DELIMITER}Pull Requests`);
  assert(primaryTab, 'Primary tab item "GitHub" must exist');
  assert(issuesVariant, 'Variant "GitHub ||| Issues" must exist');
  assert(prsVariant, 'Variant "GitHub ||| Pull Requests" must exist');
  assert.equal(issuesVariant.link, 'https://github.com/issues');
  assert.equal(prsVariant.link, 'https://github.com/pulls');
  console.log('✓ URL variants created with title delimiter');

  // 3. Reconstruct workspace from Raindrop (fetchRaindropWorkspace)
  calls.length = 0;
  const fetched = await fetchRaindropWorkspace('test-token');
  assert.equal(fetched.success, true);
  const data = fetched.data!;

  // System collections must NOT appear as spaces or folders
  assert(data.spaces.every(s => !isSystemCollection({ title: s.name } as any)), 'System collections must not be spaces');
  assert(data.folders.every(f => !isSystemCollection({ title: f.name } as any)), 'System collections must not be folders');
  assert.equal(data.spaces.length, 1, 'Only user spaces should be reconstructed');
  assert.equal(data.spaces[0].name, 'Work Space');

  // Widgets reconstructed
  assert.equal(data.widgets?.length, 1, 'Widget must be reconstructed');
  assert.equal(data.widgets![0].style, 'digital');
  assert.equal(data.widgets![0].config?.timeFormat, '24h');

  // Custom code & run code rules reconstructed
  assert.equal(data.customCodeRules?.length, 1, 'Custom code rule must be reconstructed');
  assert.equal(data.customCodeRules![0].css, 'body { background: black; }');
  assert.equal(data.runCodeInPageRules?.length, 1, 'Run code rule must be reconstructed');
  assert.equal(data.runCodeInPageRules![0].code, 'document.body.classList.add("dark");');

  // Tabs reconstructed with variants grouped
  const reconstructedGithub = data.tabs.find(t => t.customTitle === 'GitHub');
  assert(reconstructedGithub, 'GitHub tab must be reconstructed');
  assert(reconstructedGithub.urlVariants, 'URL variants must be attached to base tab');
  assert.equal(reconstructedGithub.urlVariants.length, 3, 'All 3 variants should be in urlVariants');
  assert.equal(reconstructedGithub.urlVariants[1].name, 'Issues');
  assert.equal(reconstructedGithub.urlVariants[1].url, 'https://github.com/issues');
  assert.equal(reconstructedGithub.urlVariants[2].name, 'Pull Requests');
  assert.equal(reconstructedGithub.urlVariants[2].url, 'https://github.com/pulls');

  console.log('✓ Workspace reconstructed from native Raindrop items successfully');

  // 4. Migration from legacy root collection "Arcable" to "Arcable v2"
  calls.length = 0;
  mockState = {
    collections: [
      { _id: 10, title: 'Arcable', sort: 0 },
      { _id: 20, title: 'Work Space', parent: { $id: 10 }, sort: 0 },
      { _id: 30, title: 'Projects Folder', parent: { $id: 20 }, sort: 0 },
    ],
    bookmarks: [
      {
        _id: 100,
        title: 'Favourite Tab',
        link: 'https://favourite.com',
        collection: { $id: 10 },
      },
      {
        _id: 101,
        title: '[Widget] clock',
        link: 'https://arcable.app/widget/w-1',
        collection: { $id: 10 },
        tags: [ARCABLE_WIDGET_TAG],
        excerpt: JSON.stringify({ id: 'w-1', type: 'clock', style: 'digital' }),
      },
      {
        _id: 102,
        title: 'Work Tab',
        link: 'https://work.com',
        collection: { $id: 20 },
      },
    ],
  };

  const migrationWorkspace = await fetchRaindropWorkspace('mock-token');
  assert.equal(migrationWorkspace.success, true, 'Migration workspace fetch should succeed');

  // Verify "Arcable v2" root was created
  const v2Root = mockState.collections.find(c => c.title === ARCABLE_COLLECTION_NAME);
  assert(v2Root, 'Arcable v2 root collection must be created');

  // Verify old root was deleted
  const oldRoot = mockState.collections.find(c => c._id === 10);
  assert(!oldRoot, 'Legacy "Arcable" root collection must be deleted from Raindrop');

  // Verify child space was reparented to new v2Root
  const workSpace = mockState.collections.find(c => c._id === 20);
  assert.equal(workSpace?.parent?.$id, v2Root._id, 'Child space must be reparented to Arcable v2 root');

  // Verify nested folder preserved its parent
  const projFolder = mockState.collections.find(c => c._id === 30);
  assert.equal(projFolder?.parent?.$id, 20, 'Nested folder must remain child of its space');

  // Verify favourite tab and widget moved to v2Root
  const favTab = mockState.bookmarks.find(b => b._id === 100);
  const widgetBookmark = mockState.bookmarks.find(b => b._id === 101);
  assert.equal(favTab?.collection?.$id, v2Root._id, 'Favourite tab must be moved to Arcable v2 root');
  assert.equal(widgetBookmark?.collection?.$id, v2Root._id, 'Widget item must be moved to Arcable v2 root');

  // Verify workspace data was reconstructed properly under v2
  const migratedData = migrationWorkspace.data!;
  assert.equal(migratedData.spaces.length, 1, 'Reconstructed workspace should have 1 space');
  assert.equal(migratedData.folders.length, 1, 'Reconstructed workspace should have 1 folder');
  assert.equal(migratedData.widgets?.length, 1, 'Reconstructed workspace should have 1 widget');
  assert.equal(migratedData.tabs.filter(t => !t.parentSpaceId).length, 1, 'Reconstructed workspace should have 1 favourite tab');

  console.log('✓ Automatic migration from legacy "Arcable" root to "Arcable v2" and deletion of old root verified');

  // 5. Verify tabs sorting order strictly matches Raindrop's top-to-bottom manual sequence
  calls.length = 0;
  mockState = {
    collections: [
      { _id: 1, title: ARCABLE_COLLECTION_NAME, sort: 0 },
      { _id: 50, title: 'Family', parent: { $id: 1 }, sort: 0 },
    ],
    bookmarks: [
      { _id: 501, title: 'Assistant', link: 'https://assistant.com', collection: { $id: 50 } },
      { _id: 502, title: 'CDC Vouchers', link: 'https://voucher.com', collection: { $id: 50 } },
      { _id: 503, title: 'ActiveSG', link: 'https://activesg.com', collection: { $id: 50 } },
      { _id: 504, title: 'Swimming Complex', link: 'https://swim.com', collection: { $id: 50 } },
      { _id: 505, title: 'English Listening & Speaking', link: 'https://english.com', collection: { $id: 50 } },
    ],
  };

  const familyWorkspace = await fetchRaindropWorkspace('mock-token');
  assert.equal(familyWorkspace.success, true);
  assert(calls.some(c => c.url.includes('sort=-sort')), 'Fetch must request manual order via sort=-sort');

  const familySiblings = getSortedSiblings(familyWorkspace.data!.folders, familyWorkspace.data!.tabs, '50');
  assert.equal(familySiblings.length, 5);
  assert.equal((familySiblings[0].data as any).customTitle, 'Assistant');
  assert.equal((familySiblings[1].data as any).customTitle, 'CDC Vouchers');
  assert.equal((familySiblings[2].data as any).customTitle, 'ActiveSG');
  assert.equal((familySiblings[3].data as any).customTitle, 'Swimming Complex');
  assert.equal((familySiblings[4].data as any).customTitle, 'English Listening & Speaking');
  console.log('✓ Tab items sorting order strictly matches Raindrop top-to-bottom order');

  // 6. Verify reordering tabs and folders preserves 0-based order/sort indices through full sync
  calls.length = 0;
  const reorderedData: ArcableWorkspaceData = {
    ...familyWorkspace.data!,
    tabs: familyWorkspace.data!.tabs.map((t) => {
      // Move English Listening & Speaking (505) to first (order: 1000)
      if (t.id === '505') return { ...t, order: 1000, updatedAt: Date.now() };
      if (t.id === '501') return { ...t, order: 2000, updatedAt: Date.now() };
      if (t.id === '502') return { ...t, order: 3000, updatedAt: Date.now() };
      if (t.id === '503') return { ...t, order: 4000, updatedAt: Date.now() };
      if (t.id === '504') return { ...t, order: 5000, updatedAt: Date.now() };
      return t;
    }),
  };
  const reorderSyncResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: reorderedData,
    replaceBaseline: true,
  });
  assert.equal(reorderSyncResult.success, true);
  const putCalls = calls.filter((c) => c.method === 'PUT' && c.url.includes('/raindrop/'));
  const englishCall = putCalls.find((c) => c.url.endsWith('/505'));
  assert(englishCall, 'Should update 505');
  assert.equal(englishCall.body.order, 0);
  assert.equal(englishCall.body.sort, 0);
  console.log('✓ Reordered tabs sync with 0-based order/sort indices');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
