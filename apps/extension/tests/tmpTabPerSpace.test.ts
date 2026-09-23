// Mock chrome before importing modules that load webextension-polyfill
const mockStorage: Record<string, any> = {};
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
    get: async (id: number) => ({ id, windowId: 1 }),
  },
};

import { TmpTab } from '@arcable/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running tmpTabPerSpace tests...');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // 1. Window active space tracking
  tabTracker.setActiveSpaceForWindow(10, 'space-design');
  assert(
    tabTracker.resolveActiveSpaceIdForWindow(10) === 'space-design',
    'Window 10 should resolve to space-design'
  );
  assert(
    tabTracker.resolveActiveSpaceIdForWindow(20) === 'space-design',
    'Window 20 without explicit space should fall back to lastActiveSpaceId (space-design)'
  );

  // 2. registerInitialTmpTab with explicit spaceId
  tabTracker.registerInitialTmpTab(101, 'https://example.com/one', 'Tab One', 'space-work');
  let trackedTabs = await tabTracker.getTmpTabs();
  const tab101 = trackedTabs.find((t) => t.browserTabId === 101);
  assert(tab101 !== undefined, 'Tab 101 should be registered');
  assert(tab101.spaceId === 'space-work', 'Tab 101 should have spaceId space-work');

  // 3. registerInitialTmpTab with fallback window spaceId
  tabTracker.setActiveSpaceForWindow(1, 'space-fallback-win1');
  tabTracker.registerInitialTmpTab(102, 'https://example.com/two', 'Tab Two');
  trackedTabs = await tabTracker.getTmpTabs();
  const tab102 = trackedTabs.find((t) => t.browserTabId === 102);
  assert(tab102 !== undefined, 'Tab 102 should be registered');
  assert(tab102.spaceId === 'space-fallback-win1', 'Tab 102 should inherit active window spaceId');

  // 4. moveTmpTabToSpace in tabTracker
  let listenerCalled = false;
  const unsubscribe = tabTracker.subscribeTmpTabs((tabs) => {
    const moved = tabs.find((t) => t.id === tab101.id);
    if (moved?.spaceId === 'space-personal') {
      listenerCalled = true;
    }
  });

  await tabTracker.moveTmpTabToSpace(tab101.id, 'space-personal');
  trackedTabs = await tabTracker.getTmpTabs();
  const movedTab101 = trackedTabs.find((t) => t.id === tab101.id);
  assert(movedTab101?.spaceId === 'space-personal', 'Tab 101 should be moved to space-personal');
  assert(listenerCalled === true, 'onTmpTabsChange should be notified on space move');

  unsubscribe();

  console.log('tmpTabPerSpace tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
