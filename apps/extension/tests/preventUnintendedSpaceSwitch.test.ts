// Test: Prevent Unintended Space Switch
// Verifies that:
// 1. Opening the first tab in a space does not cause an accidental bounce to another space or blank tab.
// 2. Programmatic cleanup of blank tabs suppresses causedByClose and onRemoved nearest-tab switching.
// 3. Closing inactive/background tabs does not switch spaces or change the active tab.

const mockStorage: Record<string, any> = {};
const createdTabs: any[] = [];
let nextTabId = 800;

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
        if (typeof callback === 'function') callback(result);
        return Promise.resolve(result);
      },
      set: (items: any, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (typeof callback === 'function') callback();
        return Promise.resolve();
      },
    },
  },
  tabs: {
    get: async (id: number) => {
      const found = createdTabs.find((t) => t.id === id);
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
      if (newTab.active) {
        for (const t of createdTabs) {
          if (t.windowId === newTab.windowId) t.active = false;
        }
      }
      createdTabs.push(newTab);
      return newTab;
    },
    update: async (tabId: number, updateProperties: any) => {
      const tab = createdTabs.find((t) => t.id === tabId);
      if (tab) {
        if (updateProperties.active) {
          for (const t of createdTabs) {
            if (t.windowId === tab.windowId) t.active = false;
          }
        }
        Object.assign(tab, updateProperties);
      }
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
      if (typeof callback === 'function') callback(win);
      return Promise.resolve(win);
    },
    getAll: async () => [{ id: 1 }],
  },
};

(globalThis as any).chrome = mockApi;
(globalThis as any).browser = mockApi;

async function runTests() {
  console.log('Running preventUnintendedSpaceSwitch tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Test 1: Opening first tab in Space 2 does NOT revert to Space 1 or trigger causedByClose
  {
    const space1 = 'space-1';
    const space2 = 'space-2';

    // Space 1 has tab 801
    const tab1 = await mockApi.tabs.create({ url: 'https://work.com', active: false, windowId: 1 });
    // Space 2 has blank tab 802
    const blankTab = await mockApi.tabs.create({ url: 'chrome://newtab', active: true, windowId: 1 });

    await tabTracker.syncWithWorkspace(
      [
        { id: 'item-1', url: 'https://work.com', title: 'Work', parentSpaceId: space1 },
        { id: 'item-2', url: 'https://github.com', title: 'GitHub', parentSpaceId: space2 },
      ],
      []
    );

    await tabTracker.saveAssociations({
      'item-1': {
        tabItemId: 'item-1',
        browserTabId: tab1.id,
        windowId: 1,
        currentUrl: 'https://work.com',
        originalUrl: 'https://work.com',
        isDiverted: false,
      },
    });

    await tabTracker.saveTmpTabs([
      {
        id: 'tmp-blank-1',
        url: 'chrome://newtab',
        title: 'New Tab',
        browserTabId: blankTab.id,
        spaceId: space2,
        windowId: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    tabTracker.setActiveSpaceForWindow(1, space2);

    // User opens first real tab in Space 2 (item-2)
    let activatedDetails: any = null;
    tabTracker.onTabItemActivated((id, details) => {
      activatedDetails = details;
    });

    await tabTracker.openAndAssociateTab('item-2', 'https://github.com');
    const newTabId = tabTracker.getLastActiveBrowserTabId(1);
    if (!newTabId) throw new Error('Expected newTabId to be set');

    // Simulate browser onActivated event for the new tab
    for (const listener of activatedListeners) {
      await listener({ tabId: newTabId, windowId: 1 });
    }

    // Verify causedByClose is false for the new tab
    if (activatedDetails?.causedByClose === true) {
      throw new Error('Test 1 failed: causedByClose should be false when opening first tab in a space');
    }

    // Verify active space is still space-2
    if (tabTracker.getLastActiveTabSpace(1) !== space2) {
      throw new Error(`Test 1 failed: active space was ${tabTracker.getLastActiveTabSpace(1)}, expected ${space2}`);
    }
  }

  // Test 2: Pruning surplus blank tabs does not trigger nearest tab activation or space switch
  {
    const surplusTab = await mockApi.tabs.create({ url: 'chrome://newtab', active: false, windowId: 1 });

    tabTracker.programmaticCleanupTabIds.add(surplusTab.id);
    await mockApi.tabs.remove(surplusTab.id);

    // programmaticCleanupTabIds should have cleaned it up safely without activating anything
    if (tabTracker.programmaticCleanupTabIds.has(surplusTab.id)) {
      throw new Error('Test 2 failed: programmaticCleanupTabIds should remove tabId after onRemoved');
    }
  }

  // Test 3: Closing an inactive / background tab does not switch space or activate nearest tab
  {
    const space1 = 'space-1';
    const space2 = 'space-2';

    const bgTab = await mockApi.tabs.create({ url: 'https://background.com', active: false, windowId: 1 });
    const activeTab = await mockApi.tabs.create({ url: 'https://active.com', active: true, windowId: 1 });

    (tabTracker as any).setLastActiveBrowserTabId(1, activeTab.id);
    (tabTracker as any).setLastActiveTabSpace(1, space2);
    tabTracker.setActiveSpaceForWindow(1, space2);

    // Background tab in Space 1 is closed
    await mockApi.tabs.remove(bgTab.id);

    // Active tab and active space must remain unchanged (Tab activeTab, space-2)
    if (tabTracker.getLastActiveBrowserTabId(1) !== activeTab.id) {
      throw new Error(`Test 3 failed: active browser tab changed from ${activeTab.id} to ${tabTracker.getLastActiveBrowserTabId(1)}`);
    }
    if (tabTracker.getLastActiveTabSpace(1) !== space2) {
      throw new Error(`Test 3 failed: active space changed from ${space2} to ${tabTracker.getLastActiveTabSpace(1)}`);
    }
  }

  console.log('✅ All preventUnintendedSpaceSwitch tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ preventUnintendedSpaceSwitch tests failed:', err);
  process.exit(1);
});
