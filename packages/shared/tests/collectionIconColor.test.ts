import assert from 'node:assert/strict';
import {
  getOrCreateArcableCollection,
  getOrCreateArchiveCollection,
  syncWorkspaceWithRaindrop,
  syncIncrementalOperations,
  ARCABLE_COLLECTION_NAME,
  ARCABLE_ARCHIVE_COLLECTION_NAME,
  ARCABLE_CUSTOM_CSS_COLLECTION_NAME,
  ARCABLE_RUN_CODE_COLLECTION_NAME,
  ARCABLE_SPACE_THEME_COLLECTION_NAME,
  ARCABLE_COLLECTION_ICON_URL,
  ARCABLE_ARCHIVE_COLLECTION_ICON_URL,
  ARCABLE_CUSTOM_CSS_COLLECTION_COLOR,
  ARCABLE_RUN_CODE_COLLECTION_COLOR,
  ARCABLE_SPACE_THEME_COLLECTION_COLOR,
  ARCABLE_TMP_TABS_COLLECTION_COLOR,
} from '../src/utils/raindropSync';
import {
  publishRaindropTmpTabs,
  RAINDROP_TMP_TABS_COLLECTION_NAME,
  RAINDROP_TMP_TABS_COLLECTION_COLOR,
} from '../src/utils/tmpTabSync';
import type { ArcableWorkspaceData } from '../types/workspace';

async function runTests(): Promise<void> {
  console.log('--- Running Collection Icon & Color Tests ---');

  // Verify exported constants
  assert.equal(ARCABLE_COLLECTION_ICON_URL, 'https://arcable.vercel.app/favicon.ico');
  assert.equal(ARCABLE_ARCHIVE_COLLECTION_ICON_URL, 'https://arcable.vercel.app/favicon.ico');
  assert.equal(ARCABLE_CUSTOM_CSS_COLLECTION_COLOR, 'green');
  assert.equal(ARCABLE_RUN_CODE_COLLECTION_COLOR, 'blue');
  assert.equal(ARCABLE_SPACE_THEME_COLLECTION_COLOR, 'orange');
  assert.equal(ARCABLE_TMP_TABS_COLLECTION_COLOR, 'red');
  assert.equal(RAINDROP_TMP_TABS_COLLECTION_COLOR, 'red');
  console.log('✓ Collection icon and color constants verified');

  const calls: Array<{ url: string; method: string; body?: any }> = [];
  let collections: any[] = [];
  let nextId = 100;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (method === 'GET') {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/collections') || pathname.endsWith('/collections/childrens')) {
        return new Response(JSON.stringify({ items: collections }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST') {
      if (url.endsWith('/collection')) {
        const id = nextId++;
        const created = { _id: id, count: 0, ...body };
        collections.push(created);
        return new Response(JSON.stringify({ item: created }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/raindrops')) {
        return new Response(JSON.stringify({ items: (body?.items || []).map((it: any) => ({ _id: nextId++, ...it })) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/raindrop/file')) {
        return new Response(JSON.stringify({ item: { _id: nextId++ } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;

  // 1. Test getOrCreateArcableCollection uses Arcable favicon
  calls.length = 0;
  collections = [];
  const rootColl = await getOrCreateArcableCollection('mock-token');
  assert.equal(rootColl.title, ARCABLE_COLLECTION_NAME);
  const rootCreateCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_COLLECTION_NAME);
  assert(rootCreateCall, 'createRaindropCollection call for Arcable v2 must exist');
  assert.deepEqual(rootCreateCall.body?.cover, ['https://arcable.vercel.app/favicon.ico'], 'Arcable v2 must have cover set to favicon.ico');
  console.log('✓ Arcable v2 created with favicon cover');

  // 2. Test getOrCreateArchiveCollection uses Arcable favicon
  calls.length = 0;
  const archiveColl = await getOrCreateArchiveCollection('mock-token');
  assert.equal(archiveColl.title, ARCABLE_ARCHIVE_COLLECTION_NAME);
  const archiveCreateCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_ARCHIVE_COLLECTION_NAME);
  assert(archiveCreateCall, 'createRaindropCollection call for Arcable v2 / Archive must exist');
  assert.deepEqual(archiveCreateCall.body?.cover, ['https://arcable.vercel.app/favicon.ico'], 'Arcable v2 / Archive must have cover set to favicon.ico');
  console.log('✓ Arcable v2 / Archive created with favicon cover');

  // 3. Test syncWorkspaceWithRaindrop creates _custom_css (green), _run_code (blue), _space_themes (orange)
  calls.length = 0;
  const testWorkspace: ArcableWorkspaceData = {
    activeSpaceId: 'space_1',
    version: 1,
    spaces: [
      { id: 'space_1', name: 'Personal', colors: '#10b981', themeNoise: 0.2, order: 0 },
    ],
    folders: [],
    tabs: [],
    customCodeRules: [
      { id: 'css_1', pattern: 'https://example.com/*', css: 'body { color: red; }', js: '', disabled: false },
    ],
    runCodeInPageRules: [
      { id: 'run_1', title: 'Script', patterns: ['https://example.com/*'], code: 'console.log(1)', disabled: false },
    ],
  };

  await syncWorkspaceWithRaindrop('mock-token', { localState: testWorkspace, replaceBaseline: true });

  const customCssCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_CUSTOM_CSS_COLLECTION_NAME);
  assert(customCssCall, 'createRaindropCollection call for _custom_css must exist');
  assert.equal(customCssCall.body?.color, 'green', '_custom_css collection must have color green');
  console.log('✓ _custom_css created with color green');

  const runCodeCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_RUN_CODE_COLLECTION_NAME);
  assert(runCodeCall, 'createRaindropCollection call for _run_code must exist');
  assert.equal(runCodeCall.body?.color, 'blue', '_run_code collection must have color blue');
  console.log('✓ _run_code created with color blue');

  const spaceThemeCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_SPACE_THEME_COLLECTION_NAME);
  assert(spaceThemeCall, 'createRaindropCollection call for _space_themes must exist');
  assert.equal(spaceThemeCall.body?.color, 'orange', '_space_themes collection must have color orange');
  console.log('✓ _space_themes created with color orange');

  // 4. Test publishRaindropTmpTabs creates _tmp_tabs (red)
  calls.length = 0;
  await publishRaindropTmpTabs('mock-token', {
    deviceId: 'device_test_123',
    deviceName: 'MacBook Pro',
    deviceType: 'Web App',
    tabs: [
      { id: 'tab_tmp_1', url: 'https://example.com/test', title: 'Test Tmp' } as any,
    ],
  });

  const tmpTabsCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === RAINDROP_TMP_TABS_COLLECTION_NAME);
  assert(tmpTabsCall, 'createRaindropCollection call for _tmp_tabs must exist');
  assert.equal(tmpTabsCall.body?.color, 'red', '_tmp_tabs collection must have color red');
  console.log('✓ _tmp_tabs created with color red');

  // 5. Test incremental sync collection creation color options
  calls.length = 0;
  // Reset collections to just root
  collections = [{ _id: 1, title: ARCABLE_COLLECTION_NAME }];
  await syncIncrementalOperations(
    'mock-token',
    {
      raindropRootCollectionId: 1,
      activeSpaceId: 'space_1',
      version: 1,
      spaces: [{ id: 'space_1', name: 'Space 1', colors: '#6366f1', order: 0 }],
      folders: [],
      tabs: [],
      customCodeRules: [{ id: 'css_inc', pattern: '*', css: 'a{}', js: '', disabled: false }],
      runCodeInPageRules: [{ id: 'run_inc', title: 'r', patterns: ['*'], code: '1', disabled: false }],
    },
    [
      { id: 'op1', type: 'CUSTOM_CODE_CREATE', entityId: 'css_inc', payload: {} as any, timestamp: Date.now() },
      { id: 'op2', type: 'RUN_CODE_CREATE', entityId: 'run_inc', payload: {} as any, timestamp: Date.now() },
      { id: 'op3', type: 'SPACE_UPDATE', entityId: 'space_1', payload: { colors: '#6366f1' }, timestamp: Date.now() },
    ]
  );

  const incCssCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_CUSTOM_CSS_COLLECTION_NAME);
  assert(incCssCall, 'Incremental sync: create _custom_css must exist');
  assert.equal(incCssCall.body?.color, 'green', 'Incremental sync: _custom_css color must be green');

  const incRunCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_RUN_CODE_COLLECTION_NAME);
  assert(incRunCall, 'Incremental sync: create _run_code must exist');
  assert.equal(incRunCall.body?.color, 'blue', 'Incremental sync: _run_code color must be blue');

  const incSpaceThemeCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/collection') && c.body?.title === ARCABLE_SPACE_THEME_COLLECTION_NAME);
  assert(incSpaceThemeCall, 'Incremental sync: create _space_themes must exist');
  assert.equal(incSpaceThemeCall.body?.color, 'orange', 'Incremental sync: _space_themes color must be orange');
  console.log('✓ Incremental sync creates _custom_css (green), _run_code (blue), and _space_themes (orange)');

  console.log('🎉 All Collection Icon & Color Tests Passed Successfully!');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
