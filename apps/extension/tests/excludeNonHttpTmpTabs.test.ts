// Test non-HTTP tab exclusion from tmp tabs list
import { isValidHttpUrl } from '@arcable/shared/utils';
import { reconcileTmpTabs, reconcileTmpTabsWithBrowserTabs } from '../src/utils/tmpTabDiff';
import { replayOperations, compactSyncFile } from '@arcable/shared/utils';
import type { ArcableWorkspaceData, TmpTab } from '@arcable/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ----------------------------------------------------
// Mock chrome & browser APIs before importing tabTracker
// ----------------------------------------------------
const mockStorage: Record<string, any> = {};
const mockTabs: any[] = [];
let nextTabId = 1000;

type RemovedListener = (tabId: number, removeInfo?: any) => Promise<void>;
type UpdatedListener = (tabId: number, changeInfo: any, tab: any) => Promise<void>;
type ActivatedListener = (activeInfo: any) => Promise<void>;

const removedListeners: RemovedListener[] = [];
const updatedListeners: UpdatedListener[] = [];
const activatedListeners: ActivatedListener[] = [];

const mockApi = {
  runtime: { id: 'mock-arcable-id' },
  storage: {
    local: {
      get: (keys: any, callback?: (result: any) => void) => {
        const fetch = () => {
          if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
          const res: Record<string, any> = {};
          if (Array.isArray(keys)) {
            for (const k of keys) res[k] = mockStorage[k];
          }
          return res;
        };
        const result = fetch();
        if (typeof callback === 'function') {
          callback(result);
        }
        return Promise.resolve(result);
      },
      set: (items: any, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      },
    },
  },
  tabs: {
    get: async (id: number) => {
      const found = mockTabs.find((t) => t.id === id);
      if (found) return found;
      throw new Error('Tab not found: ' + id);
    },
    create: async (createProperties: any) => {
      const newId = ++nextTabId;
      const newTab = {
        id: newId,
        url: createProperties.url || 'chrome://newtab',
        windowId: createProperties.windowId || 1,
        active: Boolean(createProperties.active),
      };
      mockTabs.push(newTab);
      return newTab;
    },
    update: async (tabId: number, updateProperties: any) => {
      const tab = mockTabs.find((t) => t.id === tabId);
      if (tab) Object.assign(tab, updateProperties);
      return tab;
    },
    onRemoved: {
      addListener: (fn: RemovedListener) => {
        removedListeners.push(fn);
      },
    },
    onUpdated: {
      addListener: (fn: UpdatedListener) => {
        updatedListeners.push(fn);
      },
    },
    onActivated: {
      addListener: (fn: ActivatedListener) => {
        activatedListeners.push(fn);
      },
    },
    query: async () => mockTabs,
  },
  windows: {
    getCurrent: (callback?: (win: any) => void) => {
      const win = { id: 1 };
      if (typeof callback === 'function') {
        callback(win);
      }
      return Promise.resolve(win);
    },
  },
};

(globalThis as any).chrome = mockApi;
(globalThis as any).browser = mockApi;

async function runTests() {
  console.log('Running excludeNonHttpTmpTabs tests...');

  // ========================================================
  // Test 1: isValidHttpUrl helper validation
  // ========================================================
  console.log('Test 1: Testing isValidHttpUrl helper');
  const validUrls = [
    'http://localhost:3000',
    'https://localhost:8080/app',
    'https://google.com',
    'http://127.0.0.1:5173',
    'https://example.com/test?q=1#hash',
    '  https://spaces.arcable.com  ',
  ];
  for (const url of validUrls) {
    assert(isValidHttpUrl(url), `Expected "${url}" to be recognized as valid HTTP URL`);
  }

  const invalidUrls = [
    '',
    '   ',
    'chrome://newtab',
    'chrome://settings',
    'chrome-extension://abcdef123456/options.html',
    'moz-extension://abcdef123456/popup.html',
    'about:blank',
    'about:newtab',
    'about:config',
    'edge://newtab',
    'edge://settings',
    'file:///Users/tangqh/index.html',
    'devtools://devtools/bundled/inspector.html',
    'data:text/html,<h1>Hello</h1>',
    'javascript:void(0)',
    'ftp://example.com/file',
    null,
    undefined,
  ];
  for (const url of invalidUrls) {
    assert(!isValidHttpUrl(url), `Expected "${url}" to be rejected as non-HTTP URL`);
  }

  // ========================================================
  // Test 2: tmpTabDiff reconciliation filters non-HTTP
  // ========================================================
  console.log('Test 2: Testing tmpTabDiff reconciliation');
  const mixedCandidates: TmpTab[] = [
    {
      id: 'tmp_1',
      url: 'https://github.com',
      title: 'GitHub',
      createdAt: 1000,
      updatedAt: 1000,
      browserTabId: 1,
    },
    {
      id: 'tmp_2',
      url: 'chrome://newtab',
      title: 'New Tab',
      createdAt: 1001,
      updatedAt: 1001,
      browserTabId: 2,
    },
    {
      id: 'tmp_3',
      url: 'about:blank',
      title: 'Blank',
      createdAt: 1002,
      updatedAt: 1002,
      browserTabId: 3,
    },
    {
      id: 'tmp_4',
      url: 'http://localhost:8080',
      title: 'Localhost',
      createdAt: 1003,
      updatedAt: 1003,
      browserTabId: 4,
    },
  ];

  const reconciled = reconcileTmpTabs([], mixedCandidates);
  assert(reconciled.tabs.length === 2, `Expected 2 valid tabs after reconcileTmpTabs, got ${reconciled.tabs.length}`);
  assert(reconciled.tabs.every((t) => isValidHttpUrl(t.url)), 'All reconciled tabs must have valid HTTP URLs');

  // Test reconcileTmpTabsWithBrowserTabs
  const browserSnapshots = [
    { id: 1, url: 'chrome://settings', title: 'Settings', status: 'complete' }, // navigated to non-http
    { id: 4, url: 'http://localhost:8080/dashboard', title: 'Dashboard', status: 'complete' }, // valid
  ];
  const refreshed = reconcileTmpTabsWithBrowserTabs(reconciled.tabs, browserSnapshots);
  assert(refreshed.tabs.length === 1, `Expected tab 1 to be evicted when navigating to chrome://settings`);
  assert(refreshed.tabs[0].browserTabId === 4, 'Only tab 4 should remain');
  assert(refreshed.tabs[0].url === 'http://localhost:8080/dashboard', 'Tab 4 URL should be updated');

  // ========================================================
  // Test 3: TabTracker live tracking and space retention
  // ========================================================
  console.log('Test 3: Testing TabTracker with non-HTTP tabs and space retention');
  const { tabTracker } = await import('../src/utils/tabTracker');

  tabTracker.setActiveSpaceForWindow(1, 'space-work');

  // 3a. Registering a non-HTTP tab directly should not appear in tmp tabs
  tabTracker.registerInitialTmpTab(201, 'chrome://newtab', 'New Tab', 'space-work', 1);
  const tmpTabs1 = await tabTracker.getTmpTabs();
  assert(!tmpTabs1.some((t) => t.browserTabId === 201), 'chrome://newtab must NOT be in tmp tabs');

  // 3b. When tab 201 navigates to an HTTP URL, it is added and inherits space-work
  mockTabs.push({ id: 201, url: 'https://news.ycombinator.com', title: 'Hacker News', windowId: 1 });
  // Fire onUpdated
  for (const listener of updatedListeners) {
    await listener(201, { url: 'https://news.ycombinator.com', title: 'Hacker News' }, {
      id: 201,
      url: 'https://news.ycombinator.com',
      title: 'Hacker News',
      windowId: 1,
    });
  }
  // Trigger syncWithWorkspace
  await (tabTracker as any).syncWithWorkspace([]);
  const tmpTabs2 = await tabTracker.getTmpTabs();
  const tab201 = tmpTabs2.find((t) => t.browserTabId === 201);
  assert(tab201 !== undefined, 'Tab 201 should be tracked after navigating to HTTP URL');
  assert(tab201.spaceId === 'space-work', `Tab 201 should retain space-work, got ${tab201.spaceId}`);
  assert(tab201.url === 'https://news.ycombinator.com', 'Tab 201 url should match');

  // 3c. When tab 201 navigates to chrome://settings, it is immediately removed from tmp tabs
  for (const listener of updatedListeners) {
    await listener(201, { url: 'chrome://settings', title: 'Settings' }, {
      id: 201,
      url: 'chrome://settings',
      title: 'Settings',
      windowId: 1,
    });
  }
  const tmpTabs3 = await tabTracker.getTmpTabs();
  assert(!tmpTabs3.some((t) => t.browserTabId === 201), 'Tab 201 must be removed after navigating to chrome://settings');

  // 3d. Pre-existing non-HTTP tab in storage gets purged on getTmpTabs
  mockStorage['arcable_tmp_tabs'] = [
    { id: 'stale_1', url: 'about:blank', title: 'Stale Blank', browserTabId: 991 },
    { id: 'stale_2', url: 'https://arcable.app', title: 'Arcable', browserTabId: 992 },
  ];
  const purgedTabs = await tabTracker.getTmpTabs();
  assert(purgedTabs.length === 1, `Expected 1 tab after purge, got ${purgedTabs.length}`);
  assert(purgedTabs[0].url === 'https://arcable.app', 'Only valid HTTP tab should remain');

  // ========================================================
  // Test 4: Sync Engine sanitization and operation replay
  // ========================================================
  console.log('Test 4: Testing syncEngine sanitization and operation replay');
  const baseWorkspace: ArcableWorkspaceData = {
    version: 1,
    activeSpaceId: 's1',
    spaces: [{ id: 's1', name: 'Space 1' }],
    folders: [],
    tabs: [],
    tmpTabs: [
      { id: 't1', url: 'https://site1.com', spaceId: 's1' },
      { id: 't2', url: 'chrome://bookmarks', spaceId: 's1' },
      { id: 't3', url: 'file:///path', spaceId: 's1' },
    ],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };

  const sanitized = replayOperations(baseWorkspace, []);
  assert(sanitized.tmpTabs.length === 1, `Expected 1 tmpTab after replayOperations sanitization, got ${sanitized.tmpTabs.length}`);
  assert(sanitized.tmpTabs[0].id === 't1', 'Only t1 (https) should remain');

  // Test replayOperations with TMP_TAB_CREATE for non-HTTP
  const nonHttpCreateOp = {
    id: 'op1',
    type: 'TMP_TAB_CREATE' as const,
    entityId: 't_non_http',
    timestamp: 2000,
    payload: {
      url: 'chrome://downloads',
      title: 'Downloads',
    },
  };
  const afterCreate = replayOperations(sanitized, [nonHttpCreateOp]);
  assert(
    !afterCreate.tmpTabs.some((t) => t.id === 't_non_http'),
    'TMP_TAB_CREATE with chrome:// URL must be ignored'
  );

  // Test replayOperations with TMP_TAB_UPDATE navigating to non-HTTP
  const nonHttpUpdateOp = {
    id: 'op2',
    type: 'TMP_TAB_UPDATE' as const,
    entityId: 't1',
    timestamp: 3000,
    payload: {
      url: 'about:blank',
    },
  };
  const afterUpdate = replayOperations(sanitized, [nonHttpUpdateOp]);
  assert(
    !afterUpdate.tmpTabs.some((t) => t.id === 't1'),
    'TMP_TAB_UPDATE with about:blank URL must delete the tmp tab'
  );

  // Test compactSyncFile
  const { latestSnapshot } = compactSyncFile(
    {
      format: 'arcable_sync',
      version: 1,
      baselineSnapshot: baseWorkspace,
      operations: [],
      devices: {},
    },
    'dev1',
    [],
    'MacBook',
    Date.now(),
    [
      { id: 'local_1', url: 'https://valid.com' },
      { id: 'local_2', url: 'edge://history' },
    ]
  );
  assert(
    latestSnapshot.tmpTabs.every((t) => isValidHttpUrl(t.url)),
    'All tabs in latestSnapshot must be valid HTTP/HTTPS URLs'
  );

  console.log('All excludeNonHttpTmpTabs tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
