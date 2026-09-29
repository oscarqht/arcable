// Test: Activate opened favorite tab when last tab of a space closes to prevent space switch
// Verifies:
// 1. When the last tab of a space closes and an opened favorite tab exists, the favorite tab is activated
//    and no blank tab is created.
// 2. The active space remains the current space (no space switch).
// 3. When multiple favorite tabs are open, the most recently active favorite tab is prioritized.
// 4. Favorite groups with variants are supported as opened favorite tabs.
// 5. When an opened favorite tab closes and the current space has no open tabs, another open favorite tab is activated.
// 6. When neither space tabs nor favorite tabs are open, fallback to ensureOrReuseBlankTabForSpace occurs.

const mockStorage: Record<string, any> = {};
const createdTabs: any[] = [];
let nextTabId = 900;

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running favoriteTabOnLastSpaceTabClose tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');
  const { findBestOpenFavoriteTab, getOpenFavoriteTabs } = await import('../src/sidepanel/spaceTabTracker');

  // Test 1: Helper findBestOpenFavoriteTab correctly identifies open favorites and variants
  {
    const workspaceTabs: any[] = [
      { id: 'fav-1', title: 'Gmail', url: 'https://mail.google.com', favourite: true, order: 100 },
      { id: 'fav-2', title: 'GitHub', url: 'https://github.com', favourite: true, order: 200 },
      {
        id: 'fav-group',
        title: 'Work Docs',
        favourite: true,
        isGroup: true,
        order: 300,
        urlVariants: [
          { id: 'var-1', title: 'Doc 1', url: 'https://docs.google.com/1' },
          { id: 'var-2', title: 'Doc 2', url: 'https://docs.google.com/2' },
        ],
      },
    ];

    const associations: Record<string, any> = {
      'fav-2': { browserTabId: 502, windowId: 1 },
      'var-1': { browserTabId: 503, windowId: 1 },
    };

    const openFavs = getOpenFavoriteTabs(workspaceTabs, associations, 1);
    assert(openFavs.length === 2, `Expected 2 open favorites, got ${openFavs.length}`);
    assert(openFavs[0].tabItemId === 'fav-2' && openFavs[0].browserTabId === 502, 'First open favorite should be fav-2');
    assert(openFavs[1].tabItemId === 'var-1' && openFavs[1].browserTabId === 503, 'Second open favorite should be var-1');

    // Default shelf order selection
    const bestDefault = findBestOpenFavoriteTab(workspaceTabs, associations, { windowId: 1 });
    assert(bestDefault?.browserTabId === 502, 'Default best favorite should be fav-2 (first in shelf order)');

    // Preferred / MRU selection
    const bestMRU = findBestOpenFavoriteTab(workspaceTabs, associations, { windowId: 1, preferredBrowserTabId: 503 });
    assert(bestMRU?.browserTabId === 503, 'Preferred best favorite should be var-1 (503)');
  }

  // Test 2: Closing the last tab in a space activates the open favorite tab instead of creating a blank tab
  {
    createdTabs.length = 0;
    const spaceId = 'space-test-1';

    // 1 favorite tab open (Tab 901)
    const favTab = await mockApi.tabs.create({ url: 'https://mail.google.com', active: false, windowId: 1 });
    // 1 space tab open (Tab 902)
    const spaceTab = await mockApi.tabs.create({ url: 'https://work.com', active: true, windowId: 1 });

    const workspaceTabs: any[] = [
      { id: 'fav-item', title: 'Gmail', url: 'https://mail.google.com', favourite: true, order: 100 },
      { id: 'space-item', title: 'Work', url: 'https://work.com', parentSpaceId: spaceId, order: 200 },
    ];

    await tabTracker.syncWithWorkspace(workspaceTabs, []);
    await tabTracker.saveAssociations({
      'fav-item': {
        tabItemId: 'fav-item',
        browserTabId: favTab.id,
        windowId: 1,
        currentUrl: 'https://mail.google.com',
        originalUrl: 'https://mail.google.com',
        isDiverted: false,
      },
      'space-item': {
        tabItemId: 'space-item',
        browserTabId: spaceTab.id,
        windowId: 1,
        currentUrl: 'https://work.com',
        originalUrl: 'https://work.com',
        isDiverted: false,
      },
    });

    (tabTracker as any).setLastActiveBrowserTabId(1, spaceTab.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceId);
    tabTracker.setActiveSpaceForWindow(1, spaceId);

    assert(createdTabs.length === 2, 'Initial tabs count should be 2');

    // Close the only tab in the space
    await mockApi.tabs.remove(spaceTab.id);

    // Browser would fire onActivated for favTab (or TabTracker activates it)
    const activeTab = createdTabs.find((t) => t.active);
    assert(activeTab !== undefined, 'An active tab must exist');
    assert(activeTab.id === favTab.id, `Expected active tab to be favorite tab ${favTab.id}, got ${activeTab.id}`);

    // No blank tab should have been created!
    assert(createdTabs.length === 1, `Expected tab count to remain 1 (no blank tab created), got ${createdTabs.length}`);

    // Active space must remain space-test-1 (space did NOT switch)
    assert(
      tabTracker.getLastActiveTabSpace(1) === spaceId,
      `Expected active space to remain ${spaceId}, got ${tabTracker.getLastActiveTabSpace(1)}`
    );
  }

  // Test 3: Multiple open favorites activates the most recently active favorite tab
  {
    createdTabs.length = 0;
    const spaceId = 'space-test-2';

    const favTab1 = await mockApi.tabs.create({ url: 'https://mail.google.com', active: false, windowId: 1 });
    const favTab2 = await mockApi.tabs.create({ url: 'https://github.com', active: false, windowId: 1 });
    const spaceTab = await mockApi.tabs.create({ url: 'https://jira.com', active: true, windowId: 1 });

    const workspaceTabs: any[] = [
      { id: 'fav-1', title: 'Gmail', url: 'https://mail.google.com', favourite: true, order: 100 },
      { id: 'fav-2', title: 'GitHub', url: 'https://github.com', favourite: true, order: 200 },
      { id: 'space-tab', title: 'Jira', url: 'https://jira.com', parentSpaceId: spaceId, order: 300 },
    ];

    await tabTracker.syncWithWorkspace(workspaceTabs, []);
    await tabTracker.saveAssociations({
      'fav-1': { tabItemId: 'fav-1', browserTabId: favTab1.id, windowId: 1 },
      'fav-2': { tabItemId: 'fav-2', browserTabId: favTab2.id, windowId: 1 },
      'space-tab': { tabItemId: 'space-tab', browserTabId: spaceTab.id, windowId: 1 },
    });

    // Mark favTab2 as the most recently active favorite
    tabTracker.setLastActiveFavorite(1, favTab2.id, 'fav-2');

    (tabTracker as any).setLastActiveBrowserTabId(1, spaceTab.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceId);
    tabTracker.setActiveSpaceForWindow(1, spaceId);

    // Close the space tab
    await mockApi.tabs.remove(spaceTab.id);

    // favTab2 should be activated because it was MRU
    const activeTab = createdTabs.find((t) => t.active);
    assert(activeTab?.id === favTab2.id, `Expected MRU favorite tab ${favTab2.id} to be active, got ${activeTab?.id}`);
    assert(tabTracker.getLastActiveTabSpace(1) === spaceId, `Space must remain ${spaceId}`);
  }

  // Test 4: Closing an open favorite tab activates another open favorite tab when current space is empty
  {
    createdTabs.length = 0;
    const spaceId = 'space-empty';

    const favTab1 = await mockApi.tabs.create({ url: 'https://mail.google.com', active: false, windowId: 1 });
    const favTab2 = await mockApi.tabs.create({ url: 'https://github.com', active: true, windowId: 1 });

    const workspaceTabs: any[] = [
      { id: 'fav-1', title: 'Gmail', url: 'https://mail.google.com', favourite: true, order: 100 },
      { id: 'fav-2', title: 'GitHub', url: 'https://github.com', favourite: true, order: 200 },
    ];

    await tabTracker.syncWithWorkspace(workspaceTabs, []);
    await tabTracker.saveAssociations({
      'fav-1': { tabItemId: 'fav-1', browserTabId: favTab1.id, windowId: 1 },
      'fav-2': { tabItemId: 'fav-2', browserTabId: favTab2.id, windowId: 1 },
    });

    (tabTracker as any).setLastActiveBrowserTabId(1, favTab2.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceId);
    tabTracker.setActiveSpaceForWindow(1, spaceId);
    tabTracker.setLastActiveFavorite(1, favTab2.id, 'fav-2');

    // Close favTab2
    await mockApi.tabs.remove(favTab2.id);

    // favTab1 should be activated
    const activeTab = createdTabs.find((t) => t.active);
    assert(activeTab?.id === favTab1.id, `Expected remaining favorite tab ${favTab1.id} to be active, got ${activeTab?.id}`);
    assert(createdTabs.length === 1, `Expected 1 tab remaining, got ${createdTabs.length}`);
    assert(tabTracker.getLastActiveTabSpace(1) === spaceId, `Space must remain ${spaceId}`);
  }

  // Test 5: Fallback to blank tab when NEITHER space tabs NOR favorite tabs are open
  {
    createdTabs.length = 0;
    const spaceId = 'space-lone';

    const spaceTab = await mockApi.tabs.create({ url: 'https://lone.com', active: true, windowId: 1 });

    const workspaceTabs: any[] = [
      { id: 'fav-closed', title: 'Gmail', url: 'https://mail.google.com', favourite: true, order: 100 },
      { id: 'lone-tab', title: 'Lone', url: 'https://lone.com', parentSpaceId: spaceId, order: 200 },
    ];

    await tabTracker.syncWithWorkspace(workspaceTabs, []);
    await tabTracker.saveAssociations({
      'lone-tab': { tabItemId: 'lone-tab', browserTabId: spaceTab.id, windowId: 1 },
    });

    (tabTracker as any).setLastActiveBrowserTabId(1, spaceTab.id);
    (tabTracker as any).setLastActiveTabSpace(1, spaceId);
    tabTracker.setActiveSpaceForWindow(1, spaceId);

    // Close the lone space tab
    await mockApi.tabs.remove(spaceTab.id);

    // Since no favorite tabs are open, a blank tab must be created
    assert(createdTabs.length === 1, `Expected 1 blank tab created, got ${createdTabs.length}`);
    const remainingTab = createdTabs[0];
    assert(
      remainingTab.url === 'chrome://newtab' || remainingTab.url === 'about:newtab',
      `Expected blank tab url, got ${remainingTab.url}`
    );
    assert(tabTracker.getLastActiveTabSpace(1) === spaceId, `Space must remain ${spaceId}`);
  }

  console.log('✅ All favoriteTabOnLastSpaceTabClose tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ favoriteTabOnLastSpaceTabClose tests failed:', err);
  process.exit(1);
});
