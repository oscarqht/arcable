import assert from 'node:assert/strict';
import {
  syncWorkspaceWithRaindrop,
  syncIncrementalOperations,
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
  encodeRaindropTitle,
  decodeRaindropTitle,
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
    const sortParam = new URL(url).searchParams.get('sort');
    if (sortParam === '-sort') {
      items = [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.order ?? 0) - (b.order ?? 0));
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
        // Real Raindrop batch creation ignores order/sort and defaults to 0
        order: 0,
        sort: 0,
        collection: itemInput.collection,
        created: '2026-01-01T00:00:00Z',
        lastUpdate: '2026-01-01T00:00:00Z',
      };
      mockState.bookmarks.unshift(created);
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
  // 1. Sibling order test: Tabs must precede folders
  const testFolders = [
    { id: 'f1', name: 'Folder 1', parentSpaceId: 's1', order: 10 },
    { id: 'f2', name: 'Folder 2', parentSpaceId: 's1', order: 5 },
  ];
  const testTabs = [
    { id: 't1', url: 'https://a.com', pinned: false, parentSpaceId: 's1', order: 1 },
    { id: 't2', url: 'https://b.com', pinned: false, parentSpaceId: 's1', order: 20 },
  ];
  const sortedSiblings = getSortedSiblings(testFolders as any, testTabs as any, 's1');
  assert.equal(sortedSiblings[0].id, 't1', 'First sibling should be tab with lower order');
  assert.equal(sortedSiblings[1].id, 't2', 'Second sibling should be tab with higher order');
  assert.equal(sortedSiblings[2].id, 'f2', 'Third sibling should be folder with lower order');
  assert.equal(sortedSiblings[3].id, 'f1', 'Fourth sibling should be folder with higher order');
  console.log('✓ Sibling sorting: tabs precede folders');

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

  // 3b. Modify an existing tab without variants to add URL variants
  const hnTab = data.tabs.find(t => t.customTitle === 'Hacker News')!;
  assert(hnTab, 'Hacker News tab must exist');
  assert(!hnTab.urlVariants, 'Hacker News initially has no variants');

  const updatedHnTab: Tab = {
    ...hnTab,
    urlVariants: [
      { id: hnTab.id, name: 'Hacker News', url: hnTab.url },
      { id: 'var-newest', name: 'Newest', url: 'https://news.ycombinator.com/newest' },
      { id: 'var-ask', name: 'Ask', url: 'https://news.ycombinator.com/ask' },
    ],
    defaultVariantId: hnTab.id,
    updatedAt: Date.now(),
  };

  const modifiedWorkspace: ArcableWorkspaceData = {
    ...data,
    tabs: data.tabs.map(t => t.id === hnTab.id ? updatedHnTab : t),
  };

  calls.length = 0;
  const modSyncResult = await syncWorkspaceWithRaindrop('test-token', {
    localState: modifiedWorkspace,
    pendingOps: [
      {
        id: 'op-update-hn',
        type: 'TAB_UPDATE',
        entityId: hnTab.id,
        payload: {
          urlVariants: updatedHnTab.urlVariants,
          defaultVariantId: updatedHnTab.defaultVariantId,
        },
        deviceId: 'test',
        timestamp: Date.now(),
        lamportSeq: 1,
      },
    ],
  });

  assert.equal(modSyncResult.success, true);
  const hnWithVariants = modSyncResult.latestSnapshot?.tabs.find(t => t.customTitle === 'Hacker News');
  assert(hnWithVariants, 'Hacker News tab must exist after sync');
  assert(hnWithVariants.urlVariants, 'Hacker News must have urlVariants after sync');
  assert.equal(hnWithVariants.urlVariants.length, 3, 'All 3 variants should be in urlVariants');
  assert.equal(hnWithVariants.urlVariants[1].name, 'Newest');
  assert.equal(hnWithVariants.urlVariants[1].url, 'https://news.ycombinator.com/newest');
  assert.equal(hnWithVariants.urlVariants[2].name, 'Ask');
  assert.equal(hnWithVariants.urlVariants[2].url, 'https://news.ycombinator.com/ask');

  console.log('✓ Modifying existing tab to add URL variants preserved across sync');

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

  // 7. Verify tabs with URL variants receive consecutive 0-based order/sort indices
  calls.length = 0;
  const workspaceWithVariants: ArcableWorkspaceData = {
    ...reorderedData,
    tabs: [
      {
        id: '505',
        raindropId: 505,
        url: 'https://english.com',
        parentSpaceId: '50',
        order: 1000,
        defaultVariantId: '505',
        urlVariants: [
          { id: '505', name: 'English Main', url: 'https://english.com' },
          { id: '551', name: 'English Listening', url: 'https://english.com/listening' },
          { id: '552', name: 'English Speaking', url: 'https://english.com/speaking' },
        ],
        updatedAt: Date.now(),
      },
      { id: '501', raindropId: 501, url: 'https://dentist.com', parentSpaceId: '50', order: 2000, updatedAt: Date.now() },
      { id: '502', raindropId: 502, url: 'https://childcare.com', parentSpaceId: '50', order: 3000, updatedAt: Date.now() },
    ],
  };
  // Ensure variants exist in mock state
  mockState.bookmarks.push(
    { _id: 551, title: `English Listening & Speaking ${ARCABLE_VARIANT_DELIMITER} English Listening`, link: 'https://english.com/listening', collection: { $id: 50 }, sort: 99 },
    { _id: 552, title: `English Listening & Speaking ${ARCABLE_VARIANT_DELIMITER} English Speaking`, link: 'https://english.com/speaking', collection: { $id: 50 }, sort: 99 }
  );

  const variantsSyncResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: workspaceWithVariants,
    replaceBaseline: true,
  });
  assert.equal(variantsSyncResult.success, true);
  const variantPutCalls = calls.filter((c) => c.method === 'PUT' && c.url.includes('/raindrop/'));
  const call505 = variantPutCalls.find((c) => c.url.endsWith('/505'));
  const call551 = variantPutCalls.find((c) => c.url.endsWith('/551'));
  const call552 = variantPutCalls.find((c) => c.url.endsWith('/552'));
  const call501 = variantPutCalls.find((c) => c.url.endsWith('/501'));
  const call502 = variantPutCalls.find((c) => c.url.endsWith('/502'));
  assert(call505 && call505.body.sort === 0 && call505.body.order === 0, 'Tab 505 should have sort 0');
  assert(call551 && call551.body.sort === 1 && call551.body.order === 1, 'Variant 551 should have sort 1');
  assert(call552 && call552.body.sort === 2 && call552.body.order === 2, 'Variant 552 should have sort 2');
  assert(call501 && call501.body.sort === 3 && call501.body.order === 3, 'Tab 501 should have sort 3 (accounting for preceding variants)');
  assert(call502 && call502.body.sort === 4 && call502.body.order === 4, 'Tab 502 should have sort 4');
  console.log('✓ Tab items with URL variants sync with consecutive 0-based order/sort indices');

  // 8. Verify custom code and run code preserve arrow functions =>, <, >, HTML etc. across sync
  const complexCode = `
    const taskId = '123';
    const item = list.find(t => t.id === taskId);
    if (count < 10 && total > 5) {
      document.body.innerHTML = '<div>Hello</div>';
    }
  `;
  const codeWorkspace: ArcableWorkspaceData = {
    ...variantsSyncResult.latestSnapshot!,
    runCodeInPageRules: [
      {
        id: 'run-complex',
        title: 'Arrow Function Snippet',
        patterns: ['https://example.com/*'],
        code: complexCode,
        disabled: false,
      },
    ],
    customCodeRules: [
      {
        id: 'cjc-complex',
        pattern: 'https://example.com/*',
        css: 'div > p { color: red; }',
        js: 'const f = (x) => x > 0 && x < 10;',
        disabled: false,
      },
    ],
  };

  const codeSyncResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: codeWorkspace,
    replaceBaseline: true,
  });
  assert.equal(codeSyncResult.success, true);

  // Simulate Raindrop backend stripping `<` and `>` from bookmark excerpts:
  for (const b of mockState.bookmarks) {
    if (b.excerpt) {
      b.excerpt = b.excerpt.replace(/[<>]/g, '');
    }
  }

  // Fetch workspace again (simulating next sync pull)
  const fetchedAfterSanitization = await fetchRaindropWorkspace('mock-token');
  assert.equal(fetchedAfterSanitization.success, true);
  const reconstructed = fetchedAfterSanitization.data!;
  const syncedRunRule = reconstructed.runCodeInPageRules?.find((r) => r.id === 'run-complex');
  assert(syncedRunRule, 'Run code rule must exist');
  assert.equal(syncedRunRule.code, complexCode, 'Run code must preserve =>, <, >, etc. even if excerpt had <> stripped by Raindrop');

  const syncedCustomRule = reconstructed.customCodeRules?.find((r) => r.id === 'cjc-complex');
  assert(syncedCustomRule, 'Custom code rule must exist');
  assert.equal(syncedCustomRule.css, 'div > p { color: red; }', 'Custom CSS must preserve child selector >');
  assert.equal(syncedCustomRule.js, 'const f = (x) => x > 0 && x < 10;', 'Custom JS must preserve =>, >, <');
  console.log('✓ Code content (=>, <, >) preserved across Raindrop sync despite remote sanitization');

  // 9. Newly added favourite items sorting order post-sync:
  // Expected behavior:
  // 1. after added, new item appears at the end of favorite items list, unless manually sorted to other places;
  // 2. after sync, it remains at the same position.
  calls.length = 0;
  mockState = {
    collections: [
      { _id: 1, title: ARCABLE_COLLECTION_NAME, sort: 0 },
    ],
    bookmarks: [
      { _id: 1001, title: 'Fav 1', link: 'https://fav1.com', collection: { $id: 1 }, sort: 0, order: 0 },
      { _id: 1002, title: 'Fav 2', link: 'https://fav2.com', collection: { $id: 1 }, sort: 1, order: 1 },
    ],
  };

  const initialFavFetch = await fetchRaindropWorkspace('mock-token');
  assert.equal(initialFavFetch.success, true);
  const initialData = initialFavFetch.data!;
  assert.equal(initialData.tabs.length, 2);

  // User adds a new favourite tab locally: order is maxOrder + 1000
  const maxFavOrder = Math.max(0, ...initialData.tabs.map((t) => t.order ?? t.createdAt ?? 0));
  const newFavTab: Tab = {
    id: 'fav-3',
    url: 'https://fav3.com',
    customTitle: 'Fav 3',
    favourite: true,
    order: maxFavOrder + 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 1. Verify that before sync, the new item appears at the end of favorite items list
  const localTabsWithNewFav = [...initialData.tabs, newFavTab].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  assert.equal(localTabsWithNewFav[localTabsWithNewFav.length - 1].id, 'fav-3', 'New favourite tab must be at the end locally');

  // Sync the new favourite tab with Raindrop
  calls.length = 0;
  const syncWithNewFavResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: {
      ...initialData,
      tabs: [...initialData.tabs, newFavTab],
    },
    pendingOps: [
      {
        id: 'op-fav-3',
        type: 'TAB_CREATE',
        entityId: 'fav-3',
        payload: newFavTab,
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(syncWithNewFavResult.success, true);

  // Verify that an explicit PUT call was made to position the newly created bookmark at targetOrder = 2
  const newFavPutCall = calls.find(
    (c) => c.method === 'PUT' && c.url.includes('/raindrop/') && (c.body?.order === 2 || c.body?.sort === 2)
  );
  assert(newFavPutCall, 'Newly created favourite tab must be repositioned to targetOrder at the end via PUT');

  // 2. Verify that after sync, it remains at the exact same position (at the end)
  const afterSyncFetch = await fetchRaindropWorkspace('mock-token');
  assert.equal(afterSyncFetch.success, true);
  const afterSyncTabs = afterSyncFetch.data!.tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.equal(afterSyncTabs.length, 3);
  assert.equal(afterSyncTabs[0].customTitle, 'Fav 1');
  assert.equal(afterSyncTabs[1].customTitle, 'Fav 2');
  assert.equal(afterSyncTabs[2].customTitle, 'Fav 3', 'Newly added favourite tab must remain at the end after sync');

  // 3. Verify manual reordering: if new item was manually moved to the front (order: 500) before sync,
  // it remains at the front after sync
  calls.length = 0;
  const newFavFront: Tab = {
    id: 'fav-front',
    url: 'https://fav-front.com',
    customTitle: 'Fav Front',
    favourite: true,
    order: 500, // Manually sorted before fav 1 (1000)
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const manualSortSyncResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: {
      ...afterSyncFetch.data!,
      tabs: [newFavFront, ...afterSyncFetch.data!.tabs],
    },
    pendingOps: [
      {
        id: 'op-fav-front',
        type: 'TAB_CREATE',
        entityId: 'fav-front',
        payload: newFavFront,
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(manualSortSyncResult.success, true);

  const afterManualSortFetch = await fetchRaindropWorkspace('mock-token');
  assert.equal(afterManualSortFetch.success, true);
  const afterManualSortTabs = afterManualSortFetch.data!.tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.equal(afterManualSortTabs[0].customTitle, 'Fav Front', 'Manually sorted item before sync must remain at the front');
  console.log('✓ Newly added favourite items stay at the end after sync, or maintain manually sorted position');

  // 10. Verify '<' and '>' in space, folder, tab customTitle, and variant names are preserved across sync
  // 10.1 Verify encoder/decoder helpers and idempotency
  assert.equal(encodeRaindropTitle('Test <Foo> & >Bar<'), 'Test ＜Foo＞ & ＞Bar＜');
  assert.equal(decodeRaindropTitle('Test ＜Foo＞ & ＞Bar＜'), 'Test <Foo> & >Bar<');
  assert.equal(encodeRaindropTitle('Test ＜Foo＞'), 'Test ＜Foo＞', 'Encoder should be idempotent');
  assert.equal(decodeRaindropTitle('Test <Foo>'), 'Test <Foo>', 'Decoder should be idempotent');
  assert.equal(encodeRaindropTitle(undefined), '');
  assert.equal(decodeRaindropTitle(undefined), '');

  // 10.2 Setup workspace with spaces, folders, tabs, and URL variants containing '<' and '>'
  calls.length = 0;
  mockState = {
    collections: [
      { _id: 1, title: ARCABLE_COLLECTION_NAME, sort: 0 },
    ],
    bookmarks: [],
  };

  const angleWorkspace: ArcableWorkspaceData = {
    spaces: [
      {
        id: 'space-angle',
        name: '<Project Alpha>',
        order: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    folders: [
      {
        id: 'folder-angle',
        name: 'Folder <v1.0>',
        parentSpaceId: 'space-angle',
        order: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    tabs: [
      {
        id: 'tab-angle',
        url: 'https://example.com/main',
        customTitle: 'Tab <Main & Test>',
        parentFolderId: 'folder-angle',
        order: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        urlVariants: [
          { id: 'var-1', name: 'Tab <Main & Test>', url: 'https://example.com/main' },
          { id: 'var-2', name: 'Variant <Dev>', url: 'https://example.com/dev' },
        ],
        defaultVariantId: 'var-1',
      },
    ],
  };

  const angleSyncResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: angleWorkspace,
    replaceBaseline: true,
  });
  assert.equal(angleSyncResult.success, true);

  // 10.3 Verify Raindrop API received encoded '＜' and '＞' without raw '<' or '>'
  const spaceCol = mockState.collections.find((c) => c.title === '＜Project Alpha＞');
  assert(spaceCol, 'Space collection must have title encoded as ＜Project Alpha＞ in Raindrop');
  const folderCol = mockState.collections.find((c) => c.title === 'Folder ＜v1.0＞');
  assert(folderCol, 'Folder collection must have title encoded as Folder ＜v1.0＞ in Raindrop');

  const mainBookmark = mockState.bookmarks.find((b) => b.title === 'Tab ＜Main & Test＞');
  assert(mainBookmark, 'Tab bookmark must have title encoded as Tab ＜Main & Test＞ in Raindrop');
  const variantBookmark = mockState.bookmarks.find(
    (b) => b.title === `Tab ＜Main & Test＞${ARCABLE_VARIANT_DELIMITER}Variant ＜Dev＞`
  );
  assert(variantBookmark, 'Variant bookmark must have title encoded with delimiter in Raindrop');

  // Verify Raindrop received ZERO raw ASCII '<' or '>' in titles (simulating backend sanitization)
  assert(!mockState.collections.some((c) => /[<>]/.test(c.title)), 'No raw < or > in collection titles');
  assert(!mockState.bookmarks.some((b) => /[<>]/.test(b.title)), 'No raw < or > in bookmark titles');

  // 10.4 Verify fetchRaindropWorkspace reconstructs the original '<' and '>' characters
  const fetchedAngleWorkspace = await fetchRaindropWorkspace('mock-token');
  assert.equal(fetchedAngleWorkspace.success, true);
  const reconstructedAngle = fetchedAngleWorkspace.data!;

  const recSpace = reconstructedAngle.spaces.find((s) => s.name === '<Project Alpha>');
  assert(recSpace, 'Reconstructed space must retain <Project Alpha>');

  const recFolder = reconstructedAngle.folders.find((f) => f.name === 'Folder <v1.0>');
  assert(recFolder, 'Reconstructed folder must retain Folder <v1.0>');

  const recTab = reconstructedAngle.tabs.find((t) => t.customTitle === 'Tab <Main & Test>');
  assert(recTab, 'Reconstructed tab must retain customTitle "Tab <Main & Test>"');
  assert(recTab.urlVariants, 'Reconstructed tab must have urlVariants');
  assert.equal(recTab.urlVariants.length, 2);
  assert.equal(recTab.urlVariants[0].name, 'Tab <Main & Test>');
  assert.equal(recTab.urlVariants[1].name, 'Variant <Dev>');

  // 10.5 Verify incremental sync preserves '<' and '>'
  calls.length = 0;
  const newIncrementalTab: Tab = {
    id: 'tab-inc-angle',
    url: 'https://example.com/inc',
    customTitle: 'Tab <Incremental>',
    parentSpaceId: recSpace.id,
    order: 2000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    urlVariants: [
      { id: 'inc-v1', name: 'Tab <Incremental>', url: 'https://example.com/inc' },
      { id: 'inc-v2', name: 'Variant <Staging>', url: 'https://example.com/staging' },
    ],
    defaultVariantId: 'inc-v1',
  };

  const incSyncResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: {
      ...reconstructedAngle,
      tabs: [...reconstructedAngle.tabs, newIncrementalTab],
    },
    pendingOps: [
      {
        id: 'op-inc-angle',
        type: 'TAB_CREATE',
        entityId: 'tab-inc-angle',
        payload: newIncrementalTab,
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(incSyncResult.success, true);

  const incFetch = await fetchRaindropWorkspace('mock-token');
  assert.equal(incFetch.success, true);
  const incRecTab = incFetch.data!.tabs.find((t) => t.customTitle === 'Tab <Incremental>');
  assert(incRecTab, 'Incrementally synced tab must retain customTitle "Tab <Incremental>"');
  assert(incRecTab.urlVariants, 'Incrementally synced tab must have urlVariants');
  assert.equal(incRecTab.urlVariants[1].name, 'Variant <Staging>');

  console.log('✓ Spaces, folders, tabs, and URL variants preserve "<" and ">" across full and incremental sync');

  // 11. Newly added normal tab items (in spaces/folders) sorting order post-sync:
  // Expected behavior:
  // 1. Initially after added it shows at the end of tab items (correct);
  // 2. After sync it maintains the same sorting order (stays at the end, not moved to the top);
  // 3. Unless user has manually changed the order, in which case it maintains the manually sorted position.
  calls.length = 0;
  mockState = {
    collections: [
      { _id: 1, title: ARCABLE_COLLECTION_NAME, sort: 0 },
      { _id: 10, title: 'Work Space', parent: { $id: 1 }, sort: 0 },
      { _id: 20, title: 'Project Folder', parent: { $id: 10 }, sort: 0 },
    ],
    bookmarks: [
      { _id: 2001, title: 'Tab 1', link: 'https://tab1.com', collection: { $id: 10 }, sort: 0, order: 0 },
      { _id: 2002, title: 'Tab 2', link: 'https://tab2.com', collection: { $id: 10 }, sort: 1, order: 1 },
      { _id: 2003, title: 'Folder Tab 1', link: 'https://ftab1.com', collection: { $id: 20 }, sort: 0, order: 0 },
      { _id: 2004, title: 'Folder Tab 2', link: 'https://ftab2.com', collection: { $id: 20 }, sort: 1, order: 1 },
    ],
  };

  const initialNormalFetch = await fetchRaindropWorkspace('mock-token');
  assert.equal(initialNormalFetch.success, true);
  const initialNormalData = initialNormalFetch.data!;
  assert.equal(initialNormalData.tabs.length, 4);

  // 11.1 Add a new tab to the space locally: maxOrder + 1000 places it at the end
  const spaceTabs = initialNormalData.tabs.filter((t) => t.parentSpaceId === '10' && !t.parentFolderId);
  assert.equal(spaceTabs.length, 2);
  const maxSpaceTabOrder = Math.max(0, ...spaceTabs.map((t) => t.order ?? 0));
  const newSpaceTab: Tab = {
    id: 'tab-space-3',
    url: 'https://tab3.com',
    customTitle: 'Tab 3',
    parentSpaceId: '10',
    order: maxSpaceTabOrder + 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Verify that before sync, new space tab is at the end of the space tabs
  const localSpaceTabs = [...spaceTabs, newSpaceTab].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.equal(localSpaceTabs[localSpaceTabs.length - 1].id, 'tab-space-3', 'New space tab must be at the end locally');

  // Full sync with Raindrop
  calls.length = 0;
  const syncNewSpaceTabResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: {
      ...initialNormalData,
      tabs: [...initialNormalData.tabs, newSpaceTab],
    },
    pendingOps: [
      {
        id: 'op-space-3',
        type: 'TAB_CREATE',
        entityId: 'tab-space-3',
        payload: newSpaceTab,
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(syncNewSpaceTabResult.success, true);

  // Verify that PUT call was made to reposition the created tab to targetOrder = 2
  const spaceTabPutCall = calls.find(
    (c) => c.method === 'PUT' && c.url.includes('/raindrop/') && (c.body?.order === 2 || c.body?.sort === 2)
  );
  assert(spaceTabPutCall, 'Newly created space tab must be repositioned to targetOrder at the end via PUT');

  // Verify that after sync, it remains at the end of the space tabs (not moved to top)
  const afterSpaceTabSync = await fetchRaindropWorkspace('mock-token');
  assert.equal(afterSpaceTabSync.success, true);
  const fetchedSpaceTabs = afterSpaceTabSync.data!.tabs
    .filter((t) => t.parentSpaceId === '10' && !t.parentFolderId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.equal(fetchedSpaceTabs.length, 3);
  assert.equal(fetchedSpaceTabs[0].customTitle, 'Tab 1');
  assert.equal(fetchedSpaceTabs[1].customTitle, 'Tab 2');
  assert.equal(fetchedSpaceTabs[2].customTitle, 'Tab 3', 'Newly added space tab must remain at the end after sync');

  // 11.2 Incremental sync test: Add a new tab to folder '20' via incremental sync
  const folderTabs = afterSpaceTabSync.data!.tabs.filter((t) => t.parentFolderId === '20');
  assert.equal(folderTabs.length, 2);
  const maxFolderTabOrder = Math.max(0, ...folderTabs.map((t) => t.order ?? 0));
  const newFolderTab: Tab = {
    id: 'tab-folder-3',
    url: 'https://ftab3.com',
    customTitle: 'Folder Tab 3',
    parentFolderId: '20',
    parentSpaceId: '10',
    order: maxFolderTabOrder + 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  calls.length = 0;
  const incFolderTabResult = await syncIncrementalOperations(
    'mock-token',
    {
      ...afterSpaceTabSync.data!,
      tabs: [...afterSpaceTabSync.data!.tabs, newFolderTab],
    },
    [
      {
        id: 'op-folder-3',
        type: 'TAB_CREATE',
        entityId: 'tab-folder-3',
        payload: newFolderTab,
        timestamp: Date.now(),
      },
    ]
  );
  assert.equal(incFolderTabResult.success, true);

  // Verify that incremental sync repositioned the folder tab to targetOrder = 2
  const folderTabPutCall = calls.find(
    (c) => c.method === 'PUT' && c.url.includes('/raindrop/') && (c.body?.order === 2 || c.body?.sort === 2)
  );
  assert(folderTabPutCall, 'Incrementally created folder tab must be repositioned to targetOrder at the end via PUT');

  const afterFolderTabSync = await fetchRaindropWorkspace('mock-token');
  assert.equal(afterFolderTabSync.success, true);
  const fetchedFolderTabs = afterFolderTabSync.data!.tabs
    .filter((t) => t.parentFolderId === '20')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.equal(fetchedFolderTabs.length, 3);
  assert.equal(fetchedFolderTabs[0].customTitle, 'Folder Tab 1');
  assert.equal(fetchedFolderTabs[1].customTitle, 'Folder Tab 2');
  assert.equal(fetchedFolderTabs[2].customTitle, 'Folder Tab 3', 'Newly added folder tab must remain at the end after incremental sync');

  // 11.3 Verify manual reordering in folder before sync: tab placed at index 0 (top)
  calls.length = 0;
  const manuallyMovedTab: Tab = {
    id: 'tab-folder-front',
    url: 'https://ftab-front.com',
    customTitle: 'Folder Tab Front',
    parentFolderId: '20',
    parentSpaceId: '10',
    order: 500, // Manually sorted before folder tab 1 (1000)
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const manualSortResult = await syncWorkspaceWithRaindrop('mock-token', {
    localState: {
      ...afterFolderTabSync.data!,
      tabs: [manuallyMovedTab, ...afterFolderTabSync.data!.tabs],
    },
    pendingOps: [
      {
        id: 'op-folder-front',
        type: 'TAB_CREATE',
        entityId: 'tab-folder-front',
        payload: manuallyMovedTab,
        timestamp: Date.now(),
      },
    ],
  });
  assert.equal(manualSortResult.success, true);

  const afterManualSortNormalFetch = await fetchRaindropWorkspace('mock-token');
  assert.equal(afterManualSortNormalFetch.success, true);
  const fetchedManualFolderTabs = afterManualSortNormalFetch.data!.tabs
    .filter((t) => t.parentFolderId === '20')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.equal(fetchedManualFolderTabs[0].customTitle, 'Folder Tab Front', 'Manually sorted tab before sync must remain at the front');
  console.log('✓ Newly added space and folder tab items stay at the end after sync, or maintain manually sorted position');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
