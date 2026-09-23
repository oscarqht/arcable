import { Tab } from '@arcable/shared/types';
import {
  resolveSpaceIdForTabItem,
  rememberActiveTabForSpace,
  getRememberedActiveTabForSpace,
  getRememberedActiveTabRecordForSpace,
  forgetBrowserTab,
  activateRememberedTabForSpace,
  resetMemorySpaceActiveTabsForTest,
  SPACE_LAST_ACTIVE_TAB_KEY,
} from '../src/sidepanel/spaceTabTracker';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running spaceTabTracker tests...');

  // Reset state
  resetMemorySpaceActiveTabsForTest();

  // Test 1: resolveSpaceIdForTabItem
  const sampleTabs: Tab[] = [
    {
      id: 'tab-1',
      title: 'Google',
      url: 'https://google.com',
      parentSpaceId: 'space-work',
      favourite: false,
    },
    {
      id: 'tab-folder-item',
      title: 'Docs',
      url: 'https://docs.google.com',
      parentSpaceId: 'space-work',
      folderId: 'folder-1',
      favourite: false,
    },
    {
      id: 'tab-fav',
      title: 'Gmail',
      url: 'https://mail.google.com',
      parentSpaceId: 'space-work',
      favourite: true, // Favorite tab
    },
    {
      id: 'tab-variants',
      title: 'GitHub',
      url: 'https://github.com',
      parentSpaceId: 'space-dev',
      favourite: false,
      urlVariants: [
        { id: 'variant-1', name: 'PRs', url: 'https://github.com/pulls' },
        { id: 'variant-2', name: 'Issues', url: 'https://github.com/issues' },
      ],
    },
  ];

  assert(
    resolveSpaceIdForTabItem('tab-1', sampleTabs) === 'space-work',
    'Normal tab must resolve to its parentSpaceId'
  );
  assert(
    resolveSpaceIdForTabItem('tab-folder-item', sampleTabs) === 'space-work',
    'Tab inside folder must resolve to its parentSpaceId'
  );
  assert(
    resolveSpaceIdForTabItem('tab-fav', sampleTabs) === null,
    'Favorite tab must NOT resolve to a space (excluded per requirements)'
  );
  assert(
    resolveSpaceIdForTabItem('tmp_12345', sampleTabs) === null,
    'Temporary tab must NOT resolve to a space'
  );
  assert(
    resolveSpaceIdForTabItem('variant-1', sampleTabs) === 'space-dev',
    'Tab variant must resolve to tab parentSpaceId'
  );
  assert(
    resolveSpaceIdForTabItem('non-existent', sampleTabs) === null,
    'Non-existent tab must return null'
  );

  // Test 2: rememberActiveTabForSpace & getRememberedActiveTabForSpace
  resetMemorySpaceActiveTabsForTest();
  await rememberActiveTabForSpace(101, 'space-work', 201);
  await rememberActiveTabForSpace(101, 'space-personal', 202);
  await rememberActiveTabForSpace(102, 'space-work', 301); // different window

  assert(
    (await getRememberedActiveTabForSpace(101, 'space-work')) === 201,
    'Window 101 must remember tab 201 for space-work'
  );
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-personal')) === 202,
    'Window 101 must remember tab 202 for space-personal'
  );
  assert(
    (await getRememberedActiveTabForSpace(102, 'space-work')) === 301,
    'Window 102 must remember tab 301 for space-work independently'
  );
  assert(
    (await getRememberedActiveTabForSpace(102, 'space-personal')) === null,
    'Window 102 must have null for space-personal when not set'
  );

  // Overwriting tab
  await rememberActiveTabForSpace(101, 'space-work', 203);
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-work')) === 203,
    'Overwriting remembered tab must update the value'
  );

  // Test 3: forgetBrowserTab
  await forgetBrowserTab(203);
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-work')) === null,
    'Forgetting tab 203 must clear it from window 101 space-work'
  );
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-personal')) === 202,
    'Forgetting tab 203 must not affect other tabs in window 101'
  );
  assert(
    (await getRememberedActiveTabForSpace(102, 'space-work')) === 301,
    'Forgetting tab 203 must not affect tabs in window 102'
  );

  // Test 4: activateRememberedTabForSpace
  resetMemorySpaceActiveTabsForTest();
  await rememberActiveTabForSpace(101, 'space-work', 401);

  let updatedTabId: number | null = null;
  let updatedOptions: any = null;

  const mockTabsApi = {
    tabs: new Map<number, any>([
      [401, { id: 401, windowId: 101, active: false }],
      [402, { id: 402, windowId: 101, active: true }],
      [403, { id: 403, windowId: 999, active: false }], // Different window
    ]),
    async get(id: number) {
      const tab = this.tabs.get(id);
      if (!tab) throw new Error('Tab not found');
      return tab;
    },
    async update(id: number, options: any) {
      updatedTabId = id;
      updatedOptions = options;
      const tab = this.tabs.get(id);
      if (tab) Object.assign(tab, options);
      return tab;
    },
  };

  // Case 4a: Target space has inactive remembered tab -> should activate it
  const activated = await activateRememberedTabForSpace(101, 'space-work', mockTabsApi);
  assert(activated === true, 'activateRememberedTabForSpace should return true');
  assert(updatedTabId === 401, 'Should call update on tab 401');
  assert(updatedOptions?.active === true, 'Should set active: true');

  // Case 4b: Target space has already active tab -> return true without update call
  await rememberActiveTabForSpace(101, 'space-personal', 402);
  updatedTabId = null;
  const activatedActive = await activateRememberedTabForSpace(101, 'space-personal', mockTabsApi);
  assert(activatedActive === true, 'Already active tab should return true');
  assert(updatedTabId === null, 'Already active tab does not need update call');

  // Case 4c: Target space has no remembered tab -> returns false (keep current tab)
  const activatedNone = await activateRememberedTabForSpace(101, 'space-unknown', mockTabsApi);
  assert(activatedNone === false, 'Non-existent remembered tab should return false');

  // Case 4d: Remembered tab belongs to different window -> returns false and forgets tab
  await rememberActiveTabForSpace(101, 'space-other-win', 403);
  const activatedDiffWin = await activateRememberedTabForSpace(101, 'space-other-win', mockTabsApi);
  assert(activatedDiffWin === false, 'Tab in different window should not be activated');
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-other-win')) === null,
    'Tab in different window should be cleaned up'
  );

  // Case 4e: Remembered tab was closed (get throws error) -> cleans up and returns false
  await rememberActiveTabForSpace(101, 'space-closed', 9999);
  const activatedClosed = await activateRememberedTabForSpace(101, 'space-closed', mockTabsApi);
  assert(activatedClosed === false, 'Closed tab should not activate');
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-closed')) === null,
    'Closed tab should be cleaned up from storage'
  );

  // Test 5: rememberActiveTabForSpace with tabItemId
  resetMemorySpaceActiveTabsForTest();
  await rememberActiveTabForSpace(101, 'space-work', 501, 'tab-work-1');
  const record5 = await getRememberedActiveTabRecordForSpace(101, 'space-work');
  assert(record5 !== null, 'Record must exist');
  assert(record5?.browserTabId === 501, 'Record browserTabId must be 501');
  assert(record5?.tabItemId === 'tab-work-1', 'Record tabItemId must be tab-work-1');
  assert(typeof record5?.updatedAt === 'number' && record5.updatedAt > 0, 'Record updatedAt must be timestamp');

  // Test 6: Browser restart tab re-identification
  // Old browserTabId 501 is dead (throws). But 'tab-work-1' is now open as tab 601 in window 101.
  mockTabsApi.tabs.set(601, { id: 601, windowId: 101, active: false });
  updatedTabId = null;
  updatedOptions = null;

  const mockLookup = (tabItemId: string) => {
    if (tabItemId === 'tab-work-1') {
      return { browserTabId: 601, windowId: 101 };
    }
    return undefined;
  };

  const activatedRestart = await activateRememberedTabForSpace(
    101,
    'space-work',
    mockTabsApi,
    mockLookup
  );
  assert(activatedRestart === true, 'Should successfully activate re-identified tab after restart');
  assert(updatedTabId === 601, 'Should have activated new tab ID 601');
  assert(
    (await getRememberedActiveTabForSpace(101, 'space-work')) === 601,
    'Should have updated remembered active tab to 601'
  );

  // Test 7: Cross-window fallback when a window (e.g. 201) has no record
  mockTabsApi.tabs.set(701, { id: 701, windowId: 201, active: false });
  const mockLookupWin201 = (tabItemId: string) => {
    if (tabItemId === 'tab-work-1') {
      return { browserTabId: 701, windowId: 201 };
    }
    return undefined;
  };

  const activatedFallback = await activateRememberedTabForSpace(
    201,
    'space-work',
    mockTabsApi,
    mockLookupWin201
  );
  assert(activatedFallback === true, 'Should fall back to space-work history and activate in window 201');
  assert(
    (await getRememberedActiveTabForSpace(201, 'space-work')) === 701,
    'Window 201 must now have its own record for space-work pointing to 701'
  );

  // Test 8: Local storage persistence simulation across reload
  const mockLocalStorage: Record<string, any> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: mockLocalStorage[key] }),
        set: async (items: Record<string, any>) => {
          Object.assign(mockLocalStorage, items);
        },
      },
    },
  };

  resetMemorySpaceActiveTabsForTest();
  await rememberActiveTabForSpace(301, 'space-saved', 801, 'tab-saved-1');
  assert(
    mockLocalStorage[SPACE_LAST_ACTIVE_TAB_KEY] !== undefined,
    'Should have persisted map to chrome.storage.local'
  );

  // Simulate extension reload: clear in-memory cache, read from local storage
  resetMemorySpaceActiveTabsForTest();
  const reloadedRecord = await getRememberedActiveTabRecordForSpace(301, 'space-saved');
  assert(
    reloadedRecord?.browserTabId === 801,
    'Reloaded record must survive extension reload via storage.local'
  );
  assert(
    reloadedRecord?.tabItemId === 'tab-saved-1',
    'Reloaded record must preserve tabItemId'
  );

  console.log('All spaceTabTracker tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
