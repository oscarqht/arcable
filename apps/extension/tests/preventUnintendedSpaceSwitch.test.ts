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

  // Test 4: Closing active tab picks favorite tab if favorite tab has higher MRU
  {
    const spaceA = 'space-A';
    const tabSpace1 = await mockApi.tabs.create({ url: 'https://space-tab1.com', active: false, windowId: 1 });
    const tabSpace2 = await mockApi.tabs.create({ url: 'https://space-tab2.com', active: true, windowId: 1 });
    const tabFav = await mockApi.tabs.create({ url: 'https://favorite.com', active: false, windowId: 1 });

    await tabTracker.syncWithWorkspace(
      [
        { id: 'fav-item-4', url: 'https://favorite.com', title: 'Fav', favourite: true },
        { id: 'space-item-1', url: 'https://space-tab1.com', title: 'Space 1', parentSpaceId: spaceA },
        { id: 'space-item-2', url: 'https://space-tab2.com', title: 'Space 2', parentSpaceId: spaceA },
      ],
      []
    );

    await tabTracker.saveAssociations({
      'fav-item-4': { browserTabId: tabFav.id, windowId: 1 },
      'space-item-1': { browserTabId: tabSpace1.id, windowId: 1 },
      'space-item-2': { browserTabId: tabSpace2.id, windowId: 1 },
    });

    (tabTracker as any).setLastActiveBrowserTabId(1, tabSpace2.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceA);
    tabTracker.setActiveSpaceForWindow(1, spaceA);

    (tabTracker as any).lastActivatedTimestamps.set('space-item-1', 100);
    (tabTracker as any).lastActivatedBrowserTabTimestamps.set(tabSpace1.id, 100);

    (tabTracker as any).lastActivatedTimestamps.set('fav-item-4', 500);
    (tabTracker as any).lastActivatedBrowserTabTimestamps.set(tabFav.id, 500);

    (tabTracker as any).lastActivatedTimestamps.set('space-item-2', 1000);
    (tabTracker as any).lastActivatedBrowserTabTimestamps.set(tabSpace2.id, 1000);

    // Close active tab tabSpace2
    await mockApi.tabs.remove(tabSpace2.id);

    // Verify favorite tab was activated because it had higher MRU than space-item-1
    if (tabTracker.getLastActiveBrowserTabId(1) !== tabFav.id) {
      throw new Error(`Test 4 failed: expected fav tab ${tabFav.id} to be activated, got ${tabTracker.getLastActiveBrowserTabId(1)}`);
    }
    // Verify space still remained spaceA
    if (tabTracker.getLastActiveTabSpace(1) !== spaceA) {
      throw new Error(`Test 4 failed: active space was ${tabTracker.getLastActiveTabSpace(1)}, expected ${spaceA}`);
    }
  }

  // Test 5: Closing active tab in Space A when another space tab has higher MRU than favorite
  {
    const spaceA = 'space-A';
    const tabSpace1 = await mockApi.tabs.create({ url: 'https://space-tab1.com', active: false, windowId: 1 });
    const tabSpace2 = await mockApi.tabs.create({ url: 'https://space-tab2.com', active: true, windowId: 1 });
    const tabFav = await mockApi.tabs.create({ url: 'https://favorite.com', active: false, windowId: 1 });

    await tabTracker.syncWithWorkspace(
      [
        { id: 'fav-item-5', url: 'https://favorite.com', title: 'Fav', favourite: true },
        { id: 'space-item-5-1', url: 'https://space-tab1.com', title: 'Space 1', parentSpaceId: spaceA },
        { id: 'space-item-5-2', url: 'https://space-tab2.com', title: 'Space 2', parentSpaceId: spaceA },
      ],
      []
    );

    await tabTracker.saveAssociations({
      'fav-item-5': { browserTabId: tabFav.id, windowId: 1 },
      'space-item-5-1': { browserTabId: tabSpace1.id, windowId: 1 },
      'space-item-5-2': { browserTabId: tabSpace2.id, windowId: 1 },
    });

    (tabTracker as any).setLastActiveBrowserTabId(1, tabSpace2.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceA);
    tabTracker.setActiveSpaceForWindow(1, spaceA);

    (tabTracker as any).lastActivatedTimestamps.set('fav-item-5', 200);
    (tabTracker as any).lastActivatedBrowserTabTimestamps.set(tabFav.id, 200);

    (tabTracker as any).lastActivatedTimestamps.set('space-item-5-1', 800);
    (tabTracker as any).lastActivatedBrowserTabTimestamps.set(tabSpace1.id, 800);

    (tabTracker as any).lastActivatedTimestamps.set('space-item-5-2', 1000);
    (tabTracker as any).lastActivatedBrowserTabTimestamps.set(tabSpace2.id, 1000);

    // Close active tab tabSpace2
    await mockApi.tabs.remove(tabSpace2.id);

    // Verify space-tab1 was activated because it had higher MRU
    if (tabTracker.getLastActiveBrowserTabId(1) !== tabSpace1.id) {
      throw new Error(`Test 5 failed: expected space tab ${tabSpace1.id} to be activated, got ${tabTracker.getLastActiveBrowserTabId(1)}`);
    }
    // Verify space still remained spaceA
    if (tabTracker.getLastActiveTabSpace(1) !== spaceA) {
      throw new Error(`Test 5 failed: active space was ${tabTracker.getLastActiveTabSpace(1)}, expected ${spaceA}`);
    }
  }

  // Test 6: Closing the last open tab in a space when no favorite tabs are open
  // activates/creates the shared blank tab in that space, and the window stays in that space
  {
    const spaceSolo = 'space-solo';
    const loneTab = await mockApi.tabs.create({ url: 'https://lone.com', active: true, windowId: 1 });

    await tabTracker.syncWithWorkspace(
      [
        { id: 'lone-item', url: 'https://lone.com', title: 'Lone', parentSpaceId: spaceSolo },
      ],
      []
    );

    await tabTracker.saveAssociations({
      'lone-item': { browserTabId: loneTab.id, windowId: 1 },
    });

    (tabTracker as any).setLastActiveBrowserTabId(1, loneTab.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceSolo);
    tabTracker.setActiveSpaceForWindow(1, spaceSolo);

    // Close the lone tab
    await mockApi.tabs.remove(loneTab.id);

    // A blank tab should have been created/reused
    const activeTabId = tabTracker.getLastActiveBrowserTabId(1);
    if (!activeTabId) throw new Error('Test 6 failed: no active tab found after closing lone tab');
    const activeTab = await mockApi.tabs.get(activeTabId);
    if (!activeTab || activeTab.url !== 'chrome://newtab') {
      throw new Error(`Test 6 failed: expected blank tab, got url ${activeTab?.url}`);
    }
    // And window active space MUST remain space-solo
    if (tabTracker.getLastActiveTabSpace(1) !== spaceSolo) {
      throw new Error(`Test 6 failed: active space changed from ${spaceSolo} to ${tabTracker.getLastActiveTabSpace(1)}`);
    }
  }

  // Test 7: Direct browser tab activation of another space's tab does NOT change the active space in the window
  {
    const spaceA = 'space-A';
    const spaceB = 'space-B';

    const tabA = await mockApi.tabs.create({ url: 'https://siteA.com', active: true, windowId: 1 });
    const tabB = await mockApi.tabs.create({ url: 'https://siteB.com', active: false, windowId: 1 });

    await tabTracker.syncWithWorkspace(
      [
        { id: 'item-A', url: 'https://siteA.com', title: 'Site A', parentSpaceId: spaceA },
        { id: 'item-B', url: 'https://siteB.com', title: 'Site B', parentSpaceId: spaceB },
      ],
      []
    );

    await tabTracker.saveAssociations({
      'item-A': { browserTabId: tabA.id, windowId: 1 },
      'item-B': { browserTabId: tabB.id, windowId: 1 },
    });

    // Window 1 is in Space A
    tabTracker.setActiveSpaceForWindow(1, spaceA);
    (tabTracker as any).setLastActiveBrowserTabId(1, tabA.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceA);

    // Now, browser tab for Space B is activated directly in browser
    for (const listener of activatedListeners) {
      await listener({ tabId: tabB.id, windowId: 1 });
    }

    // Active space for Window 1 MUST still be Space A!
    if (tabTracker.resolveActiveSpaceIdForWindow(1) !== spaceA) {
      throw new Error(`Test 7 failed: active space should remain ${spaceA}, but was changed to ${tabTracker.resolveActiveSpaceIdForWindow(1)}`);
    }
  }

  console.log('✅ All preventUnintendedSpaceSwitch tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ preventUnintendedSpaceSwitch tests failed:', err);
  process.exit(1);
});
