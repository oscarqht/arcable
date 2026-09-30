// Test: Manual New Tab Lifecycle
// Verifies that:
// 1. In empty space, pressing Cmd+T seamlessly replaces the auto-placeholder tab.
// 2. In space with real tabs, pressing Cmd+T creates a manual blank tab associated with that space,
//    and multiple manual blank tabs can coexist while actively working in that space.
// 3. When switching spaces, untouched blank tabs in the previous space (if it has real tabs) are pruned.
// 4. Empty spaces still share a single placeholder tab without duplicate accumulation.

const mockStorage: Record<string, any> = {};
const createdTabs: any[] = [];
let nextTabId = 800;

type CreatedListener = (tab: any) => Promise<void> | void;
type UpdatedListener = (tabId: number, changeInfo: any, tab: any) => Promise<void> | void;
type RemovedListener = (tabId: number, removeInfo?: any) => Promise<void> | void;
type ActivatedListener = (activeInfo: any) => Promise<void> | void;

const createdListeners: CreatedListener[] = [];
const updatedListeners: UpdatedListener[] = [];
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
      for (const listener of createdListeners) {
        await listener(newTab);
      }
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
        for (const listener of updatedListeners) {
          await listener(tabId, updateProperties, tab);
        }
      }
      return tab;
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
    onCreated: {
      addListener: (fn: CreatedListener) => {
        createdListeners.push(fn);
      },
    },
    onUpdated: {
      addListener: (fn: UpdatedListener) => {
        updatedListeners.push(fn);
      },
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
      if (typeof callback === 'function') callback(win);
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
  console.log('Running manualNewTabLifecycle tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Scenario 1: Empty Space Seamless Takeover on Cmd+T
  // Space 1 is empty, auto-placeholder tab is created for it.
  tabTracker.setActiveSpaceForWindow(1, 'space-empty');
  const placeholderTabId = await tabTracker.ensureOrReuseBlankTabForSpace('space-empty', 1);
  assert(placeholderTabId !== undefined, 'Placeholder tab should be created for empty space');
  assert(createdTabs.length === 1, `Expected 1 tab, got ${createdTabs.length}`);
  assert(createdTabs[0].id === placeholderTabId, 'Initial tab should be the auto placeholder');

  // User presses Cmd+T in empty space:
  // Browser creates a new blank tab and activates it
  const manualTab1 = await mockApi.tabs.create({ url: 'chrome://newtab', active: true, windowId: 1 });
  assert(createdTabs.some((t) => t.id === manualTab1.id), 'Manual tab 1 should exist');
  // Seamless takeover: the old auto-placeholder tab should be pruned, and manualTab1 remains
  assert(
    !createdTabs.some((t) => t.id === placeholderTabId),
    'Previous auto-placeholder tab should be replaced and closed'
  );
  assert(createdTabs.length === 1, `Expected 1 tab after seamless takeover, got ${createdTabs.length}`);

  // Scenario 2: Cmd+T in Space with Real Tabs
  // Switch to space-with-tabs and register a real HTTP tab
  tabTracker.setActiveSpaceForWindow(1, 'space-with-tabs');
  const realTab = await mockApi.tabs.create({ url: 'https://github.com', active: true, windowId: 1 });
  tabTracker.registerInitialTmpTab(realTab.id, 'https://github.com', 'GitHub', 'space-with-tabs', 1);

  // User presses Cmd+T once
  const spaceTab1 = await mockApi.tabs.create({ url: 'chrome://newtab', active: true, windowId: 1 });
  // User presses Cmd+T a second time (multiple manual tabs while active)
  const spaceTab2 = await mockApi.tabs.create({ url: 'chrome://newtab', active: true, windowId: 1 });

  // Run cleanupSurplusBlankTabs (as syncWithWorkspace does)
  await tabTracker.cleanupSurplusBlankTabs(1);

  // Both manual blank tabs should remain alive while user is in space-with-tabs
  assert(
    createdTabs.some((t) => t.id === spaceTab1.id),
    'Manual tab 1 in active space should not be pruned by cleanupSurplusBlankTabs'
  );
  assert(
    createdTabs.some((t) => t.id === spaceTab2.id),
    'Manual tab 2 in active space should not be pruned by cleanupSurplusBlankTabs'
  );

  // Scenario 3: Switching away from a space with real tabs prunes its untouched blank tabs
  // Switch from space-with-tabs to another space
  tabTracker.setActiveSpaceForWindow(1, 'other-space');
  await tabTracker.cleanupBlankTabsForSpace('space-with-tabs', 1);

  assert(
    !createdTabs.some((t) => t.id === spaceTab1.id),
    'Untouched manual blank tab 1 should be pruned on space switch'
  );
  assert(
    !createdTabs.some((t) => t.id === spaceTab2.id),
    'Untouched manual blank tab 2 should be pruned on space switch'
  );
  assert(
    createdTabs.some((t) => t.id === realTab.id),
    'Real tab should remain open after space switch'
  );

  // Scenario 4: Empty spaces still share a single blank placeholder
  // Switch to empty-space-a
  tabTracker.setActiveSpaceForWindow(1, 'empty-space-a');
  const emptyTabA = await tabTracker.ensureOrReuseBlankTabForSpace('empty-space-a', 1);
  assert(emptyTabA !== undefined, 'Empty space A should have a placeholder tab');

  // Switch to empty-space-b
  tabTracker.setActiveSpaceForWindow(1, 'empty-space-b');
  const emptyTabB = await tabTracker.ensureOrReuseBlankTabForSpace('empty-space-b', 1);
  assert(emptyTabB !== undefined, 'Empty space B should have a placeholder tab');
  assert(emptyTabA === emptyTabB, 'Empty space A and B must share the exact same placeholder tab');

  // Scenario 5: Navigating a manual blank tab to an HTTP URL
  tabTracker.setActiveSpaceForWindow(1, 'space-with-tabs');
  const manualTabForNav = await mockApi.tabs.create({ url: 'chrome://newtab', active: true, windowId: 1 });
  assert(createdTabs.some((t) => t.id === manualTabForNav.id), 'Manual tab created');
  // Navigate to HTTP
  await mockApi.tabs.update(manualTabForNav.id, { url: 'https://news.ycombinator.com', title: 'Hacker News' });
  tabTracker.registerInitialTmpTab(manualTabForNav.id, 'https://news.ycombinator.com', 'Hacker News', 'space-with-tabs', 1);
  const tmpTabs = await tabTracker.getTmpTabs();
  assert(
    tmpTabs.some((t) => t.browserTabId === manualTabForNav.id && t.url === 'https://news.ycombinator.com'),
    'Navigated manual tab should be registered in tmpTabs'
  );

  console.log('✅ All manualNewTabLifecycle tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ manualNewTabLifecycle tests failed:', err);
  process.exit(1);
});
