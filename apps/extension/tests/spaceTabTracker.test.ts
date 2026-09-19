import { Tab } from '@arcable/shared/types';
import {
  resolveSpaceIdForTabItem,
  rememberActiveTabForSpace,
  getRememberedActiveTabForSpace,
  forgetBrowserTab,
  activateRememberedTabForSpace,
  resetMemorySpaceActiveTabsForTest,
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

  console.log('All spaceTabTracker tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
