// Mock chrome before importing modules that load webextension-polyfill
const mockStorage: Record<string, any> = {};
const createdTabs: any[] = [];
let nextTabId = 700;

type RemovedListener = (tabId: number, removeInfo?: any) => Promise<void>;
type ActivatedListener = (activeInfo: any) => Promise<void>;

const removedListeners: RemovedListener[] = [];
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
      const found = createdTabs.find((t) => t.id === id);
      if (found) return found;
      if (id === 600) return { id: 600, windowId: 1 };
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
      createdTabs.push(newTab);
      return newTab;
    },
    update: async (tabId: number, updateProperties: any) => {
      const tab = createdTabs.find((t) => t.id === tabId);
      if (tab) Object.assign(tab, updateProperties);
      return tab;
    },
    onRemoved: {
      addListener: (fn: RemovedListener) => {
        removedListeners.push(fn);
      },
    },
    onActivated: {
      addListener: (fn: ActivatedListener) => {
        activatedListeners.push(fn);
      },
    },
    remove: async (tabId: number) => {
      const idx = createdTabs.findIndex((t) => t.id === tabId);
      if (idx >= 0) {
        createdTabs.splice(idx, 1);
      }
      for (const listener of removedListeners) {
        await listener(tabId, { windowId: 1, isWindowClosing: false });
      }
    },
    query: async () => [...createdTabs],
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running emptySpaceSingleNewTab tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Setup initial state: Tab 500 is the only tab open in 'space-solo' in window 1
  tabTracker.setActiveSpaceForWindow(1, 'space-solo');
  (tabTracker as any).lastActiveBrowserTabIdByWindow.set(1, 500);
  (tabTracker as any).lastActiveTabSpaceByWindow.set(1, 'space-solo');

  // Register Tab 500 as open in space-solo
  tabTracker.registerInitialTmpTab(500, 'https://example.com/solo', 'Solo Tab', 'space-solo', 1);

  // Tab 600 is open in 'space-other'
  createdTabs.push({ id: 600, windowId: 1, active: false });
  tabTracker.registerInitialTmpTab(600, 'https://example.com/other', 'Other Tab', 'space-other', 1);

  // User closes Tab 500
  // 1. Trigger onRemoved for Tab 500
  for (const listener of removedListeners) {
    await listener(500, { windowId: 1, isWindowClosing: false });
  }

  // 2. Browser switches to adjacent tab 600 (firing onActivated)
  for (const listener of activatedListeners) {
    await listener({ tabId: 600, windowId: 1 });
  }

  // Verify that tabTracker detected space-solo was empty and created exactly 1 new tab
  assert(createdTabs.length === 2, `Expected 2 tabs (tab 600 + 1 newly created tab), but got ${createdTabs.length}`);
  const createdNewTab = createdTabs.find((t) => t.id > 600);
  assert(createdNewTab !== undefined, 'A replacement tab should have been created');
  assert(createdNewTab.id === 701, `Expected created tab id to be 701, got ${createdNewTab.id}`);

  // 3. Now the browser activates the newly created tab 701 (firing onActivated for 701)
  for (const listener of activatedListeners) {
    await listener({ tabId: 701, windowId: 1 });
  }

  // CRITICAL CHECK: Total created tabs must STILL be 2 (NO loop / duplicate creation!)
  assert(
    createdTabs.length === 2,
    `Activating the newly created tab must NOT create additional tabs! Current count: ${createdTabs.length}`
  );

  // 4. Fire another onActivated event (e.g. re-focus window or tab)
  for (const listener of activatedListeners) {
    await listener({ tabId: 701, windowId: 1 });
  }
  assert(
    createdTabs.length === 2,
    `Subsequent onActivated events must NOT create additional tabs! Current count: ${createdTabs.length}`
  );

  // Verify tmp tabs list excludes chrome://newtab
  const allTmpBeforeNav = await tabTracker.getTmpTabs();
  const tmpBeforeNav = allTmpBeforeNav.find((t) => t.browserTabId === 701);
  assert(tmpBeforeNav === undefined, 'Tab 701 with chrome://newtab should NOT be registered in tmpTabs');

  // 5. Test BLANK TAB REUSE: If ensureOrReuseBlankTabForSpace is called again for space-solo,
  // it must reuse tab 701 rather than creating another new tab
  const reusedTabId = await tabTracker.ensureOrReuseBlankTabForSpace('space-solo', 1);
  assert(reusedTabId === 701, `Expected reused tab id to be 701, got ${reusedTabId}`);
  assert(createdTabs.length === 2, `Blank tab reuse must NOT create new tabs! Tab count: ${createdTabs.length}`);

  // 6. Test BLANK TAB CLEANUP: When a real HTTP tab is opened in space-solo,
  // the placeholder blank tab (701) must be automatically cleaned up (closed)
  const realHttpTab = { id: 800, url: 'https://example.com/real-page', windowId: 1, active: true };
  createdTabs.push(realHttpTab);
  tabTracker.registerInitialTmpTab(800, 'https://example.com/real-page', 'Real Page', 'space-solo', 1);
  for (const listener of activatedListeners) {
    await listener({ tabId: 800, windowId: 1 });
  }
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Tab 701 should now be closed and removed from createdTabs
  const blankTabAfterReal = createdTabs.find((t) => t.id === 701);
  assert(
    blankTabAfterReal === undefined,
    'Placeholder blank tab 701 should have been cleaned up after opening a real HTTP tab'
  );
  assert(
    createdTabs.some((t) => t.id === 800),
    'Real HTTP tab 800 should remain in createdTabs'
  );

  // 7. Test CLOSING LAST TAB AGAIN: When tab 800 is closed, a new blank tab is created for space-solo
  await mockApi.tabs.remove(800);
  for (const listener of activatedListeners) {
    await listener({ tabId: 600, windowId: 1 });
  }

  // A new replacement blank tab (702) should now exist
  const secondBlankTab = createdTabs.find((t) => t.id > 701);
  assert(secondBlankTab !== undefined, 'A replacement blank tab should be created when tab 800 is closed');
  assert(secondBlankTab.id === 702, `Expected replacement blank tab id to be 702, got ${secondBlankTab?.id}`);

  // 8. Test NAVIGATING BLANK TAB TO HTTP:
  // When Tab 702 navigates to an HTTP URL, it should be registered in tmpTabs under space-solo
  secondBlankTab.url = 'https://example.com/welcome';
  tabTracker.registerInitialTmpTab(702, 'https://example.com/welcome', 'Welcome', undefined, 1);
  const allTmpAfterNav = await tabTracker.getTmpTabs();
  const newTmpTab = allTmpAfterNav.find((t) => t.browserTabId === 702);
  assert(newTmpTab !== undefined, 'Tab 702 should now be registered in tmpTabs after navigating to HTTP URL');
  assert(newTmpTab.spaceId === 'space-solo', `Tab 702 spaceId should be space-solo, got ${newTmpTab?.spaceId}`);
  assert(newTmpTab.windowId === 1, `Tab 702 windowId should be 1, got ${newTmpTab?.windowId}`);

  console.log('emptySpaceSingleNewTab tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
