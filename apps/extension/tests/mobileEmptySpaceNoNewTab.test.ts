// Mock navigator and chrome before importing modules
const mockStorage: Record<string, any> = {};
const createdTabs: any[] = [];
let nextTabId = 700;

type RemovedListener = (tabId: number, removeInfo?: any) => Promise<void>;
type ActivatedListener = (activeInfo: any) => Promise<void>;

const removedListeners: RemovedListener[] = [];
const activatedListeners: ActivatedListener[] = [];

// Simulate mobile device user agent
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
  },
  writable: true,
  configurable: true,
});

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
      if (id === 800) return { id: 800, windowId: 1 };
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
  console.log('Running mobileEmptySpaceNoNewTab tests...');
  const { isMobileDevice } = await import('@arcable/shared/utils');
  assert(isMobileDevice() === true, 'Environment should be detected as mobile device (Android)');

  // Test iPhone UA
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
  };
  assert(isMobileDevice() === true, 'iPhone environment should be detected as mobile device');

  // Test iPadOS UA (MacIntel with touch points)
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  };
  assert(isMobileDevice() === true, 'iPadOS environment should be detected as mobile device');

  // Test Desktop Mac (touch points 0, desktop UA)
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  };
  assert(isMobileDevice() === false, 'Desktop macOS should NOT be detected as mobile device');

  // Test Desktop Windows (touchscreen laptop)
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    platform: 'Win32',
    maxTouchPoints: 10,
  };
  assert(isMobileDevice() === false, 'Touchscreen Windows laptop should NOT be detected as mobile device');

  // Restore Android mobile environment for tracker tests
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
  };
  assert(isMobileDevice() === true, 'Android environment should be active for tab tracker tests');

  const { tabTracker } = await import('../src/utils/tabTracker');

  // Setup initial state: Tab 500 is the only tab open in 'space-solo' in window 1
  tabTracker.setActiveSpaceForWindow(1, 'space-solo');
  (tabTracker as any).lastActiveBrowserTabIdByWindow.set(1, 500);
  (tabTracker as any).lastActiveTabSpaceByWindow.set(1, 'space-solo');

  // Register Tab 500 as open in space-solo
  createdTabs.push({ id: 500, windowId: 1, active: true });
  tabTracker.registerInitialTmpTab(500, 'https://example.com/solo', 'Solo Tab', 'space-solo', 1);

  // Tab 600 is open in 'space-other'
  createdTabs.push({ id: 600, windowId: 1, active: false });
  tabTracker.registerInitialTmpTab(600, 'https://example.com/other', 'Other Tab', 'space-other', 1);

  assert(createdTabs.length === 2, 'Initial tabs count should be 2');

  // 1. User closes Tab 500 (the last and only tab of space-solo)
  const tab500Idx = createdTabs.findIndex((t) => t.id === 500);
  createdTabs.splice(tab500Idx, 1);
  for (const listener of removedListeners) {
    await listener(500, { windowId: 1, isWindowClosing: false });
  }

  // 2. Mobile browser activates adjacent Tab 600 (firing onActivated)
  for (const listener of activatedListeners) {
    await listener({ tabId: 600, windowId: 1 });
  }

  // Verify that on mobile: NO replacement tab is created!
  assert(
    createdTabs.length === 1,
    `On mobile, expected 1 tab remaining (tab 600), but found ${createdTabs.length}`
  );
  assert(createdTabs[0].id === 600, 'Remaining tab should be tab 600');

  // Verify that the active space switched to space-other (the space of tab 600)
  const activeSpace = (tabTracker as any).lastActiveTabSpaceByWindow.get(1);
  assert(
    activeSpace === 'space-other',
    `Expected active space to update to 'space-other', got '${activeSpace}'`
  );

  // 3. User closes Tab 600 (last tab of space-other)
  const tab600Idx = createdTabs.findIndex((t) => t.id === 600);
  createdTabs.splice(tab600Idx, 1);
  for (const listener of removedListeners) {
    await listener(600, { windowId: 1, isWindowClosing: false });
  }

  // Mobile browser switches to an untracked Tab 800 (e.g. browser home / tab overview)
  createdTabs.push({ id: 800, windowId: 1, active: true });
  for (const listener of activatedListeners) {
    await listener({ tabId: 800, windowId: 1 });
  }

  // Verify NO replacement tab was created when closing last tab in space-other
  assert(
    createdTabs.length === 1 && createdTabs[0].id === 800,
    `Expected only tab 800, got count ${createdTabs.length}`
  );

  // Untracked tab should NOT falsely assume 'space-other'
  const postCloseSpace = (tabTracker as any).lastActiveTabSpaceByWindow.get(1);
  assert(
    postCloseSpace !== 'space-other',
    `Untracked tab on mobile should not be attributed to 'space-other', got '${postCloseSpace}'`
  );

  console.log('mobileEmptySpaceNoNewTab tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
