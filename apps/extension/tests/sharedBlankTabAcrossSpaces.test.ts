// Test: Shared blank tab across spaces
// Verifies that when the last tab of a space is closed, all empty spaces share the same browser tab
// instead of each space creating its own separate tmp/blank tab.

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
      // If new tab is active, deactivate other tabs in this window
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
  },
};

(globalThis as any).chrome = mockApi;
(globalThis as any).browser = mockApi;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running sharedBlankTabAcrossSpaces tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Setup: Space 1 has Tab 100, Space 2 has Tab 200 in window 1
  createdTabs.push({ id: 100, url: 'https://example.com/space1', windowId: 1, active: true });
  tabTracker.registerInitialTmpTab(100, 'https://example.com/space1', 'Space 1 Tab', 'space-1', 1);
  tabTracker.setActiveSpaceForWindow(1, 'space-1');

  createdTabs.push({ id: 200, url: 'https://example.com/space2', windowId: 1, active: false });
  tabTracker.registerInitialTmpTab(200, 'https://example.com/space2', 'Space 2 Tab', 'space-2', 1);

  assert(createdTabs.length === 2, `Initial tabs should be 2, got ${createdTabs.length}`);

  // Test 1: Close Tab 100 in Space 1 (last tab in Space 1)
  // Browser automatically fires onRemoved(100) and switches to Tab 200
  await mockApi.tabs.remove(100);
  for (const listener of activatedListeners) {
    await listener({ tabId: 200, windowId: 1 });
  }

  // Space 1 became empty, so 1 blank tab should be created
  assert(createdTabs.length === 2, `Expected 2 tabs (Tab 200 + 1 blank tab), got ${createdTabs.length}`);
  const blankTab1 = createdTabs.find((t) => t.id > 200);
  assert(blankTab1 !== undefined, 'A blank placeholder tab should have been created');
  assert(blankTab1.id === 701, `Expected blank tab ID to be 701, got ${blankTab1.id}`);

  // Test 2: Switch to Space 2 and close Tab 200 (last tab in Space 2)
  tabTracker.setActiveSpaceForWindow(1, 'space-2');
  await mockApi.tabs.remove(200);

  // Now BOTH Space 1 and Space 2 are empty!
  // Instead of opening a second blank tab 702, Space 2 MUST REUSE the existing blank tab (Tab 701)!
  assert(
    createdTabs.length === 1,
    `Expected exactly 1 tab (shared Tab 701), but got ${createdTabs.length} tabs: ${JSON.stringify(createdTabs)}`
  );
  assert(createdTabs[0].id === 701, `Expected remaining tab to be 701, got ${createdTabs[0].id}`);

  // Test 3: ensureOrReuseBlankTabForSpace for Space 1 and Space 2 both return Tab 701
  const tabForSpace1 = await tabTracker.ensureOrReuseBlankTabForSpace('space-1', 1);
  assert(tabForSpace1 === 701, `Space 1 should reuse tab 701, got ${tabForSpace1}`);
  assert(createdTabs.length === 1, 'No new tabs should be created');

  const tabForSpace2 = await tabTracker.ensureOrReuseBlankTabForSpace('space-2', 1);
  assert(tabForSpace2 === 701, `Space 2 should reuse tab 701, got ${tabForSpace2}`);
  assert(createdTabs.length === 1, 'No new tabs should be created');

  const tabForSpace3 = await tabTracker.ensureOrReuseBlankTabForSpace('space-3', 1);
  assert(tabForSpace3 === 701, `Space 3 should also share tab 701, got ${tabForSpace3}`);
  assert(createdTabs.length === 1, 'No new tabs should be created');

  // Test 4: Navigating shared blank tab 701 in Space 2 converts it into a real tab in Space 2
  blankTab1.url = 'https://example.com/site2';
  tabTracker.registerInitialTmpTab(701, 'https://example.com/site2', 'Site 2', 'space-2', 1);
  const tmpTabs = await tabTracker.getTmpTabs();
  const convertedTab = tmpTabs.find((t) => t.browserTabId === 701);
  assert(convertedTab !== undefined, 'Tab 701 should now be registered as a real tmp tab');
  assert(convertedTab.spaceId === 'space-2', `Tab 701 should belong to space-2, got ${convertedTab?.spaceId}`);

  // Test 5: Switch back to Space 1 (which is empty)
  // Since Tab 701 is now a real tab in Space 2, Space 1 must create a new blank tab (Tab 702)
  const tabForSpace1After = await tabTracker.ensureOrReuseBlankTabForSpace('space-1', 1);
  assert(tabForSpace1After === 702, `Space 1 should now have new blank tab 702, got ${tabForSpace1After}`);
  assert(createdTabs.length === 2, `Expected 2 tabs (Tab 701 in space 2 + Tab 702 in space 1), got ${createdTabs.length}`);

  // Test 6: Switch to another empty space (Space 4)
  // Space 4 should now share Tab 702 with Space 1 without creating any new tabs
  const tabForSpace4 = await tabTracker.ensureOrReuseBlankTabForSpace('space-4', 1);
  assert(tabForSpace4 === 702, `Space 4 should share tab 702, got ${tabForSpace4}`);
  assert(createdTabs.length === 2, `Tab count should still be 2, got ${createdTabs.length}`);

  // Test 7: Redundant blank tab cleanup (Cmd+T opened tab 703 while 702 exists)
  createdTabs.push({ id: 703, url: 'chrome://newtab', windowId: 1, active: true });
  for (const t of createdTabs) {
    if (t.id !== 703) t.active = false;
  }
  assert(createdTabs.length === 3, 'Temporarily 3 tabs with manual Cmd+T');
  await tabTracker.cleanupSurplusBlankTabs(1);

  // cleanupSurplusBlankTabs should keep the active blank tab (703) and prune the redundant inactive one (702)
  assert(
    createdTabs.length === 2,
    `Expected 2 tabs after cleanup (Tab 701 and active Tab 703), got ${createdTabs.length}`
  );
  assert(createdTabs.some((t) => t.id === 703), 'Active blank tab 703 should be kept');
  assert(!createdTabs.some((t) => t.id === 702), 'Redundant inactive blank tab 702 should be removed');

  console.log('✅ All sharedBlankTabAcrossSpaces tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
