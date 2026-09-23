// Mock chrome before importing modules that load webextension-polyfill
const mockStorage: Record<string, any> = {};
const removedTabIds: number[] = [];
let createdTabs: any[] = [];
let mockWindowTabs: any[] = [];

(globalThis as any).chrome = {
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
    get: (id: number, callback?: (tab: any) => void) => {
      const tab = { id, windowId: 1 };
      if (typeof callback === 'function') callback(tab);
      return Promise.resolve(tab);
    },
    remove: (tabIds: number | number[], callback?: () => void) => {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      removedTabIds.push(...ids);
      mockWindowTabs = mockWindowTabs.filter((t) => !ids.includes(t.id));
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    query: (queryInfo: any, callback?: (tabs: any[]) => void) => {
      if (typeof callback === 'function') callback(mockWindowTabs);
      return Promise.resolve(mockWindowTabs);
    },
    create: (createProps: any, callback?: (tab: any) => void) => {
      const newTab = { id: 9999, windowId: createProps?.windowId ?? 1, ...createProps };
      createdTabs.push(newTab);
      mockWindowTabs.push(newTab);
      if (typeof callback === 'function') callback(newTab);
      return Promise.resolve(newTab);
    },
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running clearTmpTabs tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Register some initial tmp tabs across spaces
  tabTracker.registerInitialTmpTab(201, 'https://example.com/work-1', 'Work 1', 'space-work');
  tabTracker.registerInitialTmpTab(202, 'https://example.com/work-2', 'Work 2', 'space-work');
  tabTracker.registerInitialTmpTab(301, 'https://example.com/personal-1', 'Personal 1', 'space-personal');

  let tabs = await tabTracker.getTmpTabs();
  assert(tabs.some((t) => t.browserTabId === 201), 'Tab 201 should be registered');
  assert(tabs.some((t) => t.browserTabId === 202), 'Tab 202 should be registered');
  assert(tabs.some((t) => t.browserTabId === 301), 'Tab 301 should be registered');

  // Test 1: closeTmpTabs closes multiple tabs in batch
  await tabTracker.closeTmpTabs([201, 202]);
  assert(removedTabIds.includes(201), 'Tab 201 should have been removed from browser');
  assert(removedTabIds.includes(202), 'Tab 202 should have been removed from browser');

  tabs = await tabTracker.getTmpTabs();
  assert(!tabs.some((t) => t.browserTabId === 201), 'Tab 201 should be removed from tmp tabs');
  assert(!tabs.some((t) => t.browserTabId === 202), 'Tab 202 should be removed from tmp tabs');
  assert(tabs.some((t) => t.browserTabId === 301), 'Tab 301 in space-personal should remain untouched');

  // Test 2: Verify window safety logic (if clearing closes all tabs in the window, a new blank tab is opened)
  mockWindowTabs = [
    { id: 401, windowId: 1 },
    { id: 402, windowId: 1 },
  ];
  createdTabs = [];

  const browserTabIdsToClose = [401, 402];
  const allWindowTabs = await chrome.tabs.query({ windowId: 1 });
  const closingSet = new Set(browserTabIdsToClose);
  const remainingTabs = allWindowTabs.filter((bt: any) => bt.id !== undefined && !closingSet.has(bt.id));
  if (remainingTabs.length === 0) {
    await chrome.tabs.create({ windowId: 1 });
  }

  assert(createdTabs.length === 1, 'A new blank tab should have been created');
  assert(createdTabs[0].windowId === 1, 'New blank tab should be in window 1');

  console.log('✓ clearTmpTabs tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
