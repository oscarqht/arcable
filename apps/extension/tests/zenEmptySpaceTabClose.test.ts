// Tests empty space retention specifically in Zen Browser / Firefox:
// 1. chrome://newtab is illegal in Gecko/Zen, so tabs.create must succeed without illegal URLs.
// 2. tabs.onActivated may fire BEFORE tabs.onRemoved in Gecko/Zen, space must still be preserved with a new tab page.

const mockStorage: Record<string, any> = {};
const createdTabs: any[] = [];
let nextTabId = 700;

type RemovedListener = (tabId: number, removeInfo?: any) => Promise<void>;
type ActivatedListener = (activeInfo: any) => Promise<void>;

const removedListeners: RemovedListener[] = [];
const activatedListeners: ActivatedListener[] = [];

// Simulate Zen Browser User-Agent and browser runtime
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0 Zen/1.0.0-a.39',
  },
  configurable: true,
  writable: true,
});

const mockApi = {
  runtime: {
    id: 'mock-zen-arcable-id',
    getBrowserInfo: async () => ({ name: 'Zen', vendor: 'Zen', version: '1.0.0' }),
  },
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
      if (id === 600) return { id: 600, windowId: 1, url: 'https://example.com/other' };
      throw new Error('Invalid tab ID: ' + id);
    },
    create: async (createProperties: any) => {
      // In Zen Browser / Firefox, chrome://newtab throws an Illegal URL error!
      if (createProperties.url === 'chrome://newtab') {
        throw new Error('Illegal URL: chrome://newtab');
      }
      const newId = ++nextTabId;
      const newTab = {
        id: newId,
        url: createProperties.url || 'about:newtab',
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
  console.log('Running zenEmptySpaceTabClose tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Test 1: Direct ensureOrReuseBlankTabForSpace in Zen Browser
  // Must NOT throw "Illegal URL: chrome://newtab" and must create a new tab with about:newtab
  const createdTabId = await tabTracker.ensureOrReuseBlankTabForSpace('space-zen-test', 1);
  assert(createdTabId !== undefined, 'ensureOrReuseBlankTabForSpace should return a valid tab id in Zen Browser');
  const blankTab = createdTabs.find((t) => t.id === createdTabId);
  assert(blankTab !== undefined, 'Blank tab should be in createdTabs');
  assert(blankTab.url === 'about:newtab', `Expected about:newtab, got ${blankTab.url}`);

  // Test 2: Zen Browser tab close event order (onActivated fires BEFORE onRemoved)
  // Setup: Tab 500 is the only tab in 'space-zen-work'
  createdTabs.length = 0;
  tabTracker.setActiveSpaceForWindow(1, 'space-zen-work');
  (tabTracker as any).setLastActiveBrowserTabId(1, 500);
  (tabTracker as any).setLastActiveTabSpace(1, 'space-zen-work');
  tabTracker.registerInitialTmpTab(500, 'https://example.com/zen-work', 'Zen Work', 'space-zen-work', 1);

  // Tab 600 is open in 'space-other'
  createdTabs.push({ id: 600, windowId: 1, active: false, url: 'https://example.com/other' });
  tabTracker.registerInitialTmpTab(600, 'https://example.com/other', 'Other Tab', 'space-other', 1);

  // User closes Tab 500 in Zen Browser.
  // In Zen/Firefox, onActivated for adjacent Tab 600 fires FIRST!
  for (const listener of activatedListeners) {
    await listener({ tabId: 600, windowId: 1 });
  }

  // Then onRemoved fires SECOND!
  for (const listener of removedListeners) {
    await listener(500, { windowId: 1, isWindowClosing: false });
  }

  // Verify that exactly 1 new tab was created for space-zen-work
  const newZenTabs = createdTabs.filter((t) => t.id !== 600);
  assert(newZenTabs.length === 1, `Expected exactly 1 replacement tab in space-zen-work, found ${newZenTabs.length}`);
  const replacementTab = newZenTabs[0];
  assert(replacementTab.url === 'about:newtab', `Expected url about:newtab, got ${replacementTab.url}`);

  // Verify that active space is still space-zen-work (no unexpected space switch)
  const activeSpace = (tabTracker as any).resolveActiveSpaceIdForWindow(1);
  assert(activeSpace === 'space-zen-work', `Expected active space to remain space-zen-work, got ${activeSpace}`);

  console.log('✅ All zenEmptySpaceTabClose tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
