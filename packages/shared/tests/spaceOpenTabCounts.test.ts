import { getSpaceOpenTabCounts } from '../src/utils/treeUtils';
import { Space, Folder, Tab } from '../src/types/workspace';
import { TabAssociationMap } from '../src/types/tabTracker';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const spaces: Space[] = [
  { id: 'space-work', name: 'Work', order: 1000 },
  { id: 'space-personal', name: 'Personal', order: 2000 },
];

const folders: Folder[] = [
  { id: 'folder-w1', name: 'Project A', parentSpaceId: 'space-work' },
  { id: 'folder-w-sub', name: 'Docs', parentSpaceId: 'space-work', parentFolderId: 'folder-w1' },
  { id: 'folder-p1', name: 'Shopping', parentSpaceId: 'space-personal' },
];

const tabs: Tab[] = [
  // Space: Work - Root tab (opened)
  { id: 'tab-w-root-open', url: 'https://work.com', pinned: false, parentSpaceId: 'space-work' },
  // Space: Work - Root tab (closed)
  { id: 'tab-w-root-closed', url: 'https://work-closed.com', pinned: false, parentSpaceId: 'space-work' },
  // Space: Work - Pinned tab (opened)
  { id: 'tab-w-pinned-open', url: 'https://work-pinned.com', pinned: true, parentSpaceId: 'space-work' },
  // Space: Work - In Folder (opened)
  { id: 'tab-w-folder-open', url: 'https://work-folder.com', pinned: false, parentSpaceId: 'space-work', parentFolderId: 'folder-w1' },
  // Space: Work - In Nested Folder (opened)
  { id: 'tab-w-nested-open', url: 'https://work-nested.com', pinned: false, parentSpaceId: 'space-work', parentFolderId: 'folder-w-sub' },

  // Space: Personal - Root tab (opened)
  { id: 'tab-p-open', url: 'https://personal.com', pinned: false, parentSpaceId: 'space-personal' },
  // Space: Personal - In Folder (closed)
  { id: 'tab-p-folder-closed', url: 'https://personal-shop.com', pinned: false, parentSpaceId: 'space-personal', parentFolderId: 'folder-p1' },

  // Global Favourite tab (opened) - should NOT count towards any space
  { id: 'tab-fav-open', url: 'https://fav.com', pinned: false, favourite: true },
];

const tabAssociations: TabAssociationMap = {
  'tab-w-root-open': {
    tabItemId: 'tab-w-root-open',
    browserTabId: 101,
    windowId: 1,
    currentUrl: 'https://work.com',
    originalUrl: 'https://work.com',
    isDiverted: false,
  },
  'tab-w-pinned-open': {
    tabItemId: 'tab-w-pinned-open',
    browserTabId: 102,
    windowId: 1,
    currentUrl: 'https://work-pinned.com',
    originalUrl: 'https://work-pinned.com',
    isDiverted: false,
  },
  'tab-w-folder-open': {
    tabItemId: 'tab-w-folder-open',
    browserTabId: 103,
    windowId: 1,
    currentUrl: 'https://work-folder.com',
    originalUrl: 'https://work-folder.com',
    isDiverted: false,
  },
  'tab-w-nested-open': {
    tabItemId: 'tab-w-nested-open',
    browserTabId: 104,
    windowId: 1,
    currentUrl: 'https://work-nested.com',
    originalUrl: 'https://work-nested.com',
    isDiverted: false,
  },
  'tab-p-open': {
    tabItemId: 'tab-p-open',
    browserTabId: 105,
    windowId: 1,
    currentUrl: 'https://personal.com',
    originalUrl: 'https://personal.com',
    isDiverted: false,
  },
  'tab-fav-open': {
    tabItemId: 'tab-fav-open',
    browserTabId: 106,
    windowId: 1,
    currentUrl: 'https://fav.com',
    originalUrl: 'https://fav.com',
    isDiverted: false,
  },
};

// Test 1: returns empty record if tabAssociations is undefined
{
  const counts = getSpaceOpenTabCounts(spaces, folders, tabs, undefined);
  assert(Object.keys(counts).length === 0, 'Should return empty record when tabAssociations is undefined');
}

// Test 2: returns 0 for all spaces when tabAssociations is empty
{
  const counts = getSpaceOpenTabCounts(spaces, folders, tabs, {});
  assert(counts['space-work'] === 0, 'Work space should have 0 open tabs');
  assert(counts['space-personal'] === 0, 'Personal space should have 0 open tabs');
}

// Test 3: correctly counts open tabs per space, excluding favourite items and closed tabs
{
  const counts = getSpaceOpenTabCounts(spaces, folders, tabs, tabAssociations);
  // Work has 4 open tabs: tab-w-root-open, tab-w-pinned-open, tab-w-folder-open, tab-w-nested-open
  assert(counts['space-work'] === 4, `Expected 4 open tabs in Work, got ${counts['space-work']}`);
  // Personal has 1 open tab: tab-p-open (tab-p-folder-closed is closed)
  assert(counts['space-personal'] === 1, `Expected 1 open tab in Personal, got ${counts['space-personal']}`);
}

// Test 4: handles highlightedTabId if provided
{
  // Assume tab-p-folder-closed is highlighted (active) in browser
  const counts = getSpaceOpenTabCounts(spaces, folders, tabs, tabAssociations, 'tab-p-folder-closed');
  assert(counts['space-personal'] === 2, `Expected 2 open tabs in Personal with highlighted, got ${counts['space-personal']}`);
}

// Test 5: includes tmpTabs belonging to each space
{
  const tmpTabs = [
    { id: 'tmp-1', url: 'https://example.com/1', spaceId: 'space-work' },
    { id: 'tmp-2', url: 'https://example.com/2', spaceId: 'space-personal' },
    { id: 'tmp-3', url: 'https://example.com/3', spaceId: 'space-personal' },
    // Falls back to first space (space-work) if spaceId is missing
    { id: 'tmp-4', url: 'https://example.com/4' },
  ];
  const counts = getSpaceOpenTabCounts(spaces, folders, tabs, tabAssociations, null, tmpTabs as any);
  // Work: 4 workspace tabs + 1 tmp tab + 1 fallback tmp tab = 6
  assert(counts['space-work'] === 6, `Expected 6 open tabs in Work with tmpTabs, got ${counts['space-work']}`);
  // Personal: 1 workspace tab + 2 tmp tabs = 3
  assert(counts['space-personal'] === 3, `Expected 3 open tabs in Personal with tmpTabs, got ${counts['space-personal']}`);
}

console.log('getSpaceOpenTabCounts tests passed successfully!');
