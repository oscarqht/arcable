import {
  Tab,
  WorkspaceWidget,
  TabUrlVariant,
} from '../src/types/workspace';
import {
  widgetToRaindropItemInput,
  reconstructWorkspace,
  serializeGroupMeta,
  RaindropItem,
} from '../src/utils/raindropSync';
import { createWorkspaceOperation } from '../src/utils/syncEngine';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running widget in favourite groups tests...');

// -------------------------------------------------------------
// Test 1: Widget serialization to Raindrop includes parentGroupId
// -------------------------------------------------------------
const testWidget: WorkspaceWidget = {
  id: 'w-note-1',
  style: 'note',
  size: 'small',
  parentGroupId: 'group-tab-1',
  order: 1000,
  config: { text: 'Grouped note', colorTheme: 'yellow' },
  createdAt: 1700000000000,
};

const raindropItem = widgetToRaindropItemInput(testWidget, 12345);
assert(
  raindropItem.excerpt.includes('"parentGroupId":"group-tab-1"'),
  'widgetToRaindropItemInput must serialize parentGroupId into excerpt JSON'
);

// -------------------------------------------------------------
// Test 2: reconstructWorkspace reconstructs parentGroupId on widgets
// -------------------------------------------------------------
const remoteRaindropItems: RaindropItem[] = [
  {
    _id: 101,
    title: 'Arcable Widget: note',
    link: 'arcable://widget/w-note-1',
    collectionId: 12345,
    excerpt: JSON.stringify({
      id: 'w-note-1',
      style: 'note',
      size: 'small',
      parentGroupId: '201',
      config: { text: 'Grouped note' },
    }),
    sort: 1,
    tags: ['arcable-widget'],
    created: '2026-09-20T00:00:00Z',
    lastUpdate: '2026-09-20T00:00:00Z',
  },
  {
    _id: 201,
    title: 'Project Group',
    link: 'https://example.com/item1',
    collectionId: 12345,
    excerpt: '',
    note: serializeGroupMeta({
      id: '201',
      url: 'https://example.com/item1',
      isGroup: true,
      urlVariants: [
        { id: 'v-tab-1', url: 'https://example.com/item1', name: 'Item 1' },
        { id: 'v-tab-2', url: 'https://example.com/item2', name: 'Item 2' },
      ],
      groupItemOrder: [
        { type: 'widget', id: 'w-note-1' },
        { type: 'tab', id: 'v-tab-2' },
      ],
    } as Tab),
    sort: 2,
    tags: [],
    created: '2026-09-20T00:00:00Z',
    lastUpdate: '2026-09-20T00:00:00Z',
  },
];

const rootCol = { _id: 12345, title: 'Arcable', parent: null } as any;
const tree = {
  root: rootCol,
  collections: [rootCol],
  items: remoteRaindropItems as any[],
};

const reconstructed = reconstructWorkspace(tree, 'space-1');
const reconstructedWidget = reconstructed.widgets.find((w) => w.id === 'w-note-1');
assert(Boolean(reconstructedWidget), 'Reconstructed workspace must contain the widget');
assert(
  reconstructedWidget?.parentGroupId === '201',
  `reconstructed widget parentGroupId must be "201", got "${reconstructedWidget?.parentGroupId}"`
);

const reconstructedGroupTab = reconstructed.tabs.find((t) => t.isGroup || (t.urlVariants && t.urlVariants.length > 0));
assert(Boolean(reconstructedGroupTab), 'Reconstructed workspace must contain the group tab');
assert(
  Boolean(reconstructedGroupTab?.groupItemOrder && reconstructedGroupTab.groupItemOrder.length === 2),
  'Reconstructed group tab must preserve groupItemOrder'
);
assert(
  reconstructedGroupTab?.groupItemOrder?.[0]?.type === 'widget' &&
    reconstructedGroupTab?.groupItemOrder?.[0]?.id === 'w-note-1',
  'First item in groupItemOrder must be widget w-note-1'
);

// -------------------------------------------------------------
// Test 3: Sync Engine operation payloads preserve widget group properties
// -------------------------------------------------------------
const tabCreateOp = createWorkspaceOperation('TAB_CREATE', 'tab-group-test', {
  isGroup: true,
  groupItemOrder: [
    { type: 'widget', id: 'w-1' },
    { type: 'tab', id: 't-1' },
  ],
});
assert(tabCreateOp.payload.isGroup === true, 'TAB_CREATE must preserve isGroup');
assert(
  Array.isArray(tabCreateOp.payload.groupItemOrder) && tabCreateOp.payload.groupItemOrder.length === 2,
  'TAB_CREATE must preserve groupItemOrder'
);

const widgetUpdateOp = createWorkspaceOperation('WIDGET_UPDATE', 'w-1', {
  parentGroupId: 'tab-group-test',
});
assert(
  widgetUpdateOp.payload.parentGroupId === 'tab-group-test',
  'WIDGET_UPDATE must preserve parentGroupId'
);

// -------------------------------------------------------------
// Test 4: Unified shelf 2x2 preview picks first 4 items respecting groupItemOrder
// -------------------------------------------------------------
const mockGroupTab: Tab = {
  id: 'g-1',
  url: 'https://example.com/1',
  title: 'Group 1',
  isGroup: true,
  urlVariants: [
    { id: 'var-1', url: 'https://example.com/1', name: 'Var 1' },
    { id: 'var-2', url: 'https://example.com/2', name: 'Var 2' },
  ],
  groupItemOrder: [
    { type: 'widget', id: 'w-clock' },
    { type: 'tab', id: 'var-2' },
    { type: 'widget', id: 'w-pomodoro' },
    { type: 'tab', id: 'var-1' },
    { type: 'widget', id: 'w-overflow' },
  ],
  parentSpaceId: 'space-1',
  favourite: true,
  order: 1000,
  createdAt: 100,
  updatedAt: 100,
};

const mockChildWidgets: WorkspaceWidget[] = [
  { id: 'w-clock', style: 'digital', size: 'small', parentGroupId: 'g-1' },
  { id: 'w-pomodoro', style: 'pomodoro', size: 'small', parentGroupId: 'g-1' },
  { id: 'w-overflow', style: 'note', size: 'small', parentGroupId: 'g-1' },
];

function compute2x2Preview(tab: Tab, childWidgets: WorkspaceWidget[]) {
  const validVariants = (tab.urlVariants || []).filter((v) => Boolean(v.url));
  const previewItems: Array<{ type: 'tab' | 'widget'; id: string }> = [];
  const known = new Set<string>();

  if (tab.groupItemOrder && tab.groupItemOrder.length > 0) {
    for (const entry of tab.groupItemOrder) {
      if (previewItems.length >= 4) break;
      if (entry.type === 'tab' && validVariants.some((v) => v.id === entry.id)) {
        previewItems.push(entry);
        known.add(entry.id);
      } else if (entry.type === 'widget' && childWidgets.some((w) => w.id === entry.id)) {
        previewItems.push(entry);
        known.add(entry.id);
      }
    }
  }

  for (const v of validVariants) {
    if (previewItems.length >= 4) break;
    if (!known.has(v.id)) {
      previewItems.push({ type: 'tab', id: v.id });
      known.add(v.id);
    }
  }

  for (const w of childWidgets) {
    if (previewItems.length >= 4) break;
    if (!known.has(w.id)) {
      previewItems.push({ type: 'widget', id: w.id });
      known.add(w.id);
    }
  }

  return previewItems;
}

const previewResult = compute2x2Preview(mockGroupTab, mockChildWidgets);
assert(previewResult.length === 4, '2x2 preview must return exactly 4 items');
assert(
  JSON.stringify(previewResult.map((p) => p.id)) ===
    JSON.stringify(['w-clock', 'var-2', 'w-pomodoro', 'var-1']),
  `2x2 preview items order mismatch: got ${JSON.stringify(previewResult)}`
);

// -------------------------------------------------------------
// Test 5: Mixed reordering in groupItemOrder
// -------------------------------------------------------------
function reorderMixedGroup(
  currentOrder: Array<{ type: 'tab' | 'widget'; id: string }>,
  sourceId: string,
  targetId: string,
  position: 'before' | 'after'
) {
  const list = [...currentOrder];
  const srcIdx = list.findIndex((e) => e.id === sourceId);
  const tgtIdx = list.findIndex((e) => e.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) return list;

  const [moved] = list.splice(srcIdx, 1);
  const newTgtIdx = list.findIndex((e) => e.id === targetId);
  const insertIdx = position === 'before' ? newTgtIdx : newTgtIdx + 1;
  list.splice(insertIdx, 0, moved);
  return list;
}

const initialOrder: Array<{ type: 'tab' | 'widget'; id: string }> = [
  { type: 'tab', id: 't-1' },
  { type: 'widget', id: 'w-1' },
  { type: 'tab', id: 't-2' },
];

// Move w-1 before t-1
const reorderedBefore = reorderMixedGroup(initialOrder, 'w-1', 't-1', 'before');
assert(
  JSON.stringify(reorderedBefore.map((e) => e.id)) === JSON.stringify(['w-1', 't-1', 't-2']),
  'Moving widget before tab must place widget at index 0'
);

// Move t-1 after t-2
const reorderedAfter = reorderMixedGroup(reorderedBefore, 't-1', 't-2', 'after');
assert(
  JSON.stringify(reorderedAfter.map((e) => e.id)) === JSON.stringify(['w-1', 't-2', 't-1']),
  'Moving tab after last item must place tab at end'
);

// -------------------------------------------------------------
// Test 6: Shelf widget extraction & parentGroupId reset
// -------------------------------------------------------------
const widgetsBeforeExtraction: WorkspaceWidget[] = [
  { id: 'w-shelf', style: 'digital', size: 'small', order: 1000 },
  { id: 'w-grouped', style: 'pomodoro', size: 'small', parentGroupId: 'g-1' },
];

// When extracted:
const widgetsAfterExtraction = widgetsBeforeExtraction.map((w) => {
  if (w.id === 'w-grouped') {
    const { parentGroupId, ...rest } = w;
    return { ...rest, order: 2000 };
  }
  return w;
});

const extractedWidget = widgetsAfterExtraction.find((w) => w.id === 'w-grouped');
assert(extractedWidget?.parentGroupId === undefined, 'Extracted widget must not have parentGroupId');
assert(extractedWidget?.order === 2000, 'Extracted widget must receive a valid shelf order');

// -------------------------------------------------------------
// Test 8: Reconstructing workspace preserves single bookmark when grouped with widgets
// -------------------------------------------------------------
const singleBookmarkWithWidgetItems: RaindropItem[] = [
  {
    _id: 301,
    title: 'Arcable Widget: clock',
    link: 'arcable://widget/w-clock-1',
    collectionId: 12345,
    excerpt: JSON.stringify({
      id: 'w-clock-1',
      style: 'digital',
      size: 'small',
      parentGroupId: '401',
      config: {},
    }),
    sort: 1,
    tags: ['arcable-widget'],
    created: '2026-09-20T00:00:00Z',
    lastUpdate: '2026-09-20T00:00:00Z',
  },
  {
    _id: 401,
    title: 'Bookmark and Widget Group',
    link: 'https://news.ycombinator.com',
    collectionId: 12345,
    excerpt: '',
    note: serializeGroupMeta({
      id: '401',
      url: 'https://news.ycombinator.com',
      isGroup: true,
      urlVariants: [
        { id: 'v-hn', url: 'https://news.ycombinator.com', name: 'Hacker News' },
      ],
      groupItemOrder: [
        { type: 'tab', id: 'v-hn' },
        { type: 'widget', id: 'w-clock-1' },
      ],
    } as Tab),
    sort: 2,
    tags: [],
    created: '2026-09-20T00:00:00Z',
    lastUpdate: '2026-09-20T00:00:00Z',
  },
];

const tree2 = {
  root: rootCol,
  collections: [rootCol],
  items: singleBookmarkWithWidgetItems as any[],
};

const reconstructed2 = reconstructWorkspace(tree2, 'space-1');
const groupWithSingleBookmark = reconstructed2.tabs.find((t) => t.id === '401');
assert(Boolean(groupWithSingleBookmark), 'Group tab 401 must exist');
assert(Boolean(groupWithSingleBookmark?.isGroup), 'Group tab 401 must have isGroup: true');
assert(
  Boolean(groupWithSingleBookmark?.urlVariants && groupWithSingleBookmark.urlVariants.length === 1),
  'Group tab with 1 bookmark and 1 widget must preserve its 1 bookmark in urlVariants'
);
assert(
  groupWithSingleBookmark?.urlVariants?.[0]?.url === 'https://news.ycombinator.com',
  'Preserved bookmark variant must have the correct url'
);
assert(
  groupWithSingleBookmark?.urlVariants?.[0]?.name === 'Hacker News',
  'Preserved bookmark variant must have the correct name'
);

// -------------------------------------------------------------
// Test 9: Ungrouping an empty group (0 variants and 0 widgets) deletes it
// -------------------------------------------------------------
function simulateUngroup(groupTab: Tab, childWidgets: WorkspaceWidget[]) {
  const variants = groupTab.urlVariants || [];
  if (variants.length === 0 && childWidgets.length === 0) {
    return { action: 'DELETE_GROUP' as const, remainingGroup: null };
  }
  if (variants.length <= 1) {
    const onlyVariant = variants[0];
    return {
      action: 'REVERT_TAB' as const,
      remainingGroup: {
        ...groupTab,
        customTitle: onlyVariant?.name || groupTab.customTitle,
        url: onlyVariant?.url || groupTab.url,
        isGroup: false,
        urlVariants: undefined,
        groupItemOrder: undefined,
      },
    };
  }
  return { action: 'UNPACK_VARIANTS' as const, remainingGroup: groupTab };
}

const emptyGroupTab: Tab = {
  id: 'empty-group-1',
  url: 'https://arcable.dev',
  favourite: true,
  isGroup: true,
  urlVariants: [],
  groupItemOrder: [],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const ungroupResult = simulateUngroup(emptyGroupTab, []);
assert(ungroupResult.action === 'DELETE_GROUP', 'Ungrouping empty group must delete it');

// -------------------------------------------------------------
// Test 10: Extracting widget cleans up empty group or reverts 1-bookmark group
// -------------------------------------------------------------
function simulateExtractWidget(groupTab: Tab, remainingWidgets: WorkspaceWidget[]) {
  const remainingVariants = (groupTab.urlVariants || []).filter((v) => Boolean(v.url));
  if (remainingWidgets.length === 0 && remainingVariants.length === 0) {
    return { action: 'DELETE_GROUP' as const, remainingTab: null };
  }
  if (remainingWidgets.length === 0 && remainingVariants.length === 1) {
    const onlyVariant = remainingVariants[0];
    return {
      action: 'REVERT_TAB' as const,
      remainingTab: {
        ...groupTab,
        customTitle: onlyVariant.name || groupTab.customTitle,
        url: onlyVariant.url || groupTab.url,
        isGroup: false,
        urlVariants: undefined,
        groupItemOrder: undefined,
      },
    };
  }
  return { action: 'KEEP_GROUP' as const, remainingTab: groupTab };
}

// Widget-only group when last widget is extracted:
const widgetOnlyGroup: Tab = {
  id: 'w-group-1',
  url: 'https://arcable.dev',
  favourite: true,
  isGroup: true,
  urlVariants: [],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};
const extractFromWidgetOnly = simulateExtractWidget(widgetOnlyGroup, []);
assert(extractFromWidgetOnly.action === 'DELETE_GROUP', 'Extracting last widget from widget-only group must delete the group');

// 1-bookmark + 1-widget group when widget is extracted:
const mixedGroup: Tab = {
  id: 'mixed-group-1',
  url: 'https://news.ycombinator.com',
  customTitle: 'Group',
  favourite: true,
  isGroup: true,
  urlVariants: [{ id: 'v-1', name: 'HN', url: 'https://news.ycombinator.com' }],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};
const extractFromMixed = simulateExtractWidget(mixedGroup, []);
assert(extractFromMixed.action === 'REVERT_TAB', 'Extracting widget from 1-bookmark group must revert to normal tab');
assert(extractFromMixed.remainingTab?.isGroup === false, 'Reverted tab must have isGroup: false');
assert(extractFromMixed.remainingTab?.urlVariants === undefined, 'Reverted tab must have urlVariants: undefined');
assert(extractFromMixed.remainingTab?.customTitle === 'HN', 'Reverted tab must restore original variant name');

// -------------------------------------------------------------
// Test 11: Reconstruct workspace when tab has groupItemOrder with widget but widget excerpt lacks parentGroupId (user's reported scenario)
// -------------------------------------------------------------
const mockRootCollection = {
  _id: 100,
  title: 'Arcable v2',
};

const mockTabItem: RaindropItem = {
  _id: 1863054593,
  title: 'agent usage',
  link: 'https://app.raindrop.io/my/75063797/full',
  collectionId: 100,
  cover: 'https://app.raindrop.io/favicon.ico',
  note: '<!--arcable-group:{"variants":[{"id":"1863054593","url":"https://app.raindrop.io/my/75063797/full","name":"agent usage"}],"defaultVariantId":"1863054593","firstName":"agent usage","groupItemOrder":[{"type":"tab","id":"1863054593"},{"type":"widget","id":"widget_mudblrzx_7ymxl"}]}-->',
  order: 1000,
  created: new Date().toISOString(),
  lastUpdate: new Date().toISOString(),
};

// Widget bookmark in Raindrop that has NOT yet had parentGroupId written to excerpt
const mockWidgetItemWithoutParentInExcerpt: RaindropItem = {
  _id: 2000000001,
  title: '[Widget] countdown',
  link: 'https://arcable.app/widget/widget_mudblrzx_7ymxl',
  tags: ['arcable_widget'],
  collectionId: 100,
  excerpt: JSON.stringify({
    id: 'widget_mudblrzx_7ymxl',
    style: 'countdown',
    size: 'small',
    config: { title: 'AGY Trial', targetDate: '2026-10-01' },
    // parentGroupId is intentionally missing/undefined here!
  }),
  order: 2000,
  created: new Date().toISOString(),
  lastUpdate: new Date().toISOString(),
};

const reconstructedResult11 = reconstructWorkspace({
  root: mockRootCollection as any,
  collections: [mockRootCollection as any],
  spaces: [],
  folders: [],
  items: [mockTabItem, mockWidgetItemWithoutParentInExcerpt],
  archiveRootId: null,
});

const restoredTab11 = reconstructedResult11.tabs.find((t) => t.id === '1863054593');
assert(restoredTab11 !== undefined, 'Restored tab must exist');
assert(restoredTab11.isGroup === true, 'Tab grouped with widget must have isGroup: true');
assert(restoredTab11.urlVariants && restoredTab11.urlVariants.length === 1, 'Tab must retain its single URL variant');
assert(restoredTab11.urlVariants[0].name === 'agent usage', 'Tab variant name must be preserved');
assert(
  restoredTab11.groupItemOrder && restoredTab11.groupItemOrder.length === 2,
  'Tab must retain groupItemOrder with both tab and widget'
);

const restoredWidget11 = reconstructedResult11.widgets.find((w) => w.id === 'widget_mudblrzx_7ymxl');
assert(restoredWidget11 !== undefined, 'Restored widget must exist in widgets');
assert(
  restoredWidget11.parentGroupId === '1863054593',
  `Restored widget must receive parentGroupId from group tab note (got ${restoredWidget11.parentGroupId})`
);

// -------------------------------------------------------------
// Test 12: Reverse reconciliation when widget excerpt has parentGroupId but tab note lacks groupItemOrder
// -------------------------------------------------------------
const mockTabItemWithoutGroupNote: RaindropItem = {
  _id: 1863054594,
  title: 'my bookmark',
  link: 'https://example.com',
  collectionId: 100,
  order: 3000,
  created: new Date().toISOString(),
  lastUpdate: new Date().toISOString(),
};

const mockWidgetItemWithParentInExcerpt: RaindropItem = {
  _id: 2000000002,
  title: '[Widget] clock',
  link: 'https://arcable.app/widget/widget_clock_999',
  tags: ['arcable_widget'],
  collectionId: 100,
  excerpt: JSON.stringify({
    id: 'widget_clock_999',
    style: 'clock',
    size: 'small',
    parentGroupId: '1863054594',
  }),
  order: 4000,
  created: new Date().toISOString(),
  lastUpdate: new Date().toISOString(),
};

const reconstructedResult12 = reconstructWorkspace({
  root: mockRootCollection as any,
  collections: [mockRootCollection as any],
  spaces: [],
  folders: [],
  items: [mockTabItemWithoutGroupNote, mockWidgetItemWithParentInExcerpt],
  archiveRootId: null,
});

const restoredTab12 = reconstructedResult12.tabs.find((t) => t.id === '1863054594');
assert(restoredTab12 !== undefined, 'Restored tab must exist');
assert(restoredTab12.isGroup === true, 'Tab must be upgraded to group because it has a child widget');
assert(restoredTab12.urlVariants && restoredTab12.urlVariants.length === 1, 'Tab must have urlVariants initialized');
assert(
  restoredTab12.groupItemOrder && restoredTab12.groupItemOrder.some((e) => e.type === 'widget' && e.id === 'widget_clock_999'),
  'Tab groupItemOrder must include the child widget'
);

console.log('All widget in favourite groups tests passed successfully!');

