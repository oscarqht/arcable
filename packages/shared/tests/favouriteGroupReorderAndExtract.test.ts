import { Tab, WorkspaceWidget, TabUrlVariant } from '../src/types/workspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running favourite group reorder and extract tests...');

// -------------------------------------------------------------
// Test 1: Internal re-ordering of group items (tabs & widgets)
// -------------------------------------------------------------
function reorderGroupVariantsLogic(
  tab: Tab,
  childWidgets: WorkspaceWidget[],
  sourceItemId: string,
  targetItemId: string,
  position: 'before' | 'after'
): Tab {
  const variants = tab.urlVariants || [];
  let existingOrder = tab.groupItemOrder ? [...tab.groupItemOrder] : [];
  const knownIds = new Set(existingOrder.map((e) => e.id));

  for (const v of variants) {
    if (!knownIds.has(v.id)) {
      existingOrder.push({ type: 'tab', id: v.id });
      knownIds.add(v.id);
    }
  }
  for (const w of childWidgets) {
    if (!knownIds.has(w.id)) {
      existingOrder.push({ type: 'widget', id: w.id });
      knownIds.add(w.id);
    }
  }

  const sourceIndex = existingOrder.findIndex((e) => e.id === sourceItemId);
  if (sourceIndex === -1) return tab;
  const [moved] = existingOrder.splice(sourceIndex, 1);
  let targetIndex = existingOrder.findIndex((e) => e.id === targetItemId);
  if (targetIndex === -1) return tab;
  if (position === 'after') targetIndex += 1;
  existingOrder.splice(targetIndex, 0, moved);

  const nextVariants = [...variants].sort((a, b) => {
    const idxA = existingOrder.findIndex((e) => e.id === a.id);
    const idxB = existingOrder.findIndex((e) => e.id === b.id);
    return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
  });

  const nextDefaultVariantId = nextVariants[0]?.id || tab.defaultVariantId;
  const nextUrl = nextVariants[0]?.url || tab.url;

  return {
    ...tab,
    urlVariants: nextVariants.length > 0 ? nextVariants : tab.urlVariants,
    defaultVariantId: nextDefaultVariantId,
    url: nextUrl,
    groupItemOrder: existingOrder,
    updatedAt: Date.now(),
  };
}

const initialGroupTab: Tab = {
  id: 'group-1',
  url: 'https://apple.com',
  customTitle: 'Tech',
  favourite: true,
  isGroup: true,
  defaultVariantId: 'v-apple',
  urlVariants: [
    { id: 'v-apple', url: 'https://apple.com', name: 'Apple' },
    { id: 'v-google', url: 'https://google.com', name: 'Google' },
    { id: 'v-github', url: 'https://github.com', name: 'GitHub' },
  ],
  groupItemOrder: [
    { type: 'tab', id: 'v-apple' },
    { type: 'tab', id: 'v-google' },
    { type: 'tab', id: 'v-github' },
  ],
};

const childWidgets: WorkspaceWidget[] = [
  {
    id: 'w-clock-1',
    style: 'clock',
    size: 'small',
    parentGroupId: 'group-1',
  },
];

// Test 1a: Move v-github before v-apple
const reorderedA = reorderGroupVariantsLogic(initialGroupTab, childWidgets, 'v-github', 'v-apple', 'before');
assert(reorderedA.groupItemOrder?.[0].id === 'v-github', 'v-github must now be first in groupItemOrder');
assert(reorderedA.groupItemOrder?.[1].id === 'v-apple', 'v-apple must now be second in groupItemOrder');
assert(reorderedA.urlVariants?.[0].id === 'v-github', 'urlVariants must also be sorted with v-github first');
assert(reorderedA.url === 'https://github.com', 'default url must update to the new first variant URL');
assert(reorderedA.defaultVariantId === 'v-github', 'defaultVariantId must update to v-github');

// Test 1b: Move child widget w-clock-1 after v-apple
const reorderedWithWidget = reorderGroupVariantsLogic(initialGroupTab, childWidgets, 'w-clock-1', 'v-apple', 'after');
const orderIds = reorderedWithWidget.groupItemOrder?.map((i) => i.id);
assert(
  JSON.stringify(orderIds) === JSON.stringify(['v-apple', 'w-clock-1', 'v-google', 'v-github']),
  `w-clock-1 should be inserted directly after v-apple: got ${JSON.stringify(orderIds)}`
);

console.log('✓ Group internal reordering tests passed.');

// -------------------------------------------------------------
// Test 2: Extracting tab variant out of group to shelf (preserve single-item group)
// -------------------------------------------------------------
interface WorkspaceDataTest {
  tabs: Tab[];
  widgets: WorkspaceWidget[];
  operations: any[];
}

function reorderFavouriteItemLogic(
  data: WorkspaceDataTest,
  sourceId: string,
  targetId: string,
  position: 'before' | 'after'
): WorkspaceDataTest {
  type FavItem = { id: string; type: 'tab' | 'widget'; createdAt?: number };

  const allItems: FavItem[] = [
    ...data.tabs
      .filter((t) => Boolean(t.favourite))
      .map((t) => ({ id: t.id, type: 'tab' as const, order: t.order, createdAt: t.createdAt })),
    ...(data.widgets || [])
      .filter((w) => !w.parentGroupId)
      .map((w) => ({ id: w.id, type: 'widget' as const, order: w.order, createdAt: w.createdAt })),
  ];

  allItems.sort((a: any, b: any) => {
    if (a.order !== undefined && b.order !== undefined) {
      if (a.order !== b.order) return a.order - b.order;
      return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
    }
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
  });

  const sourceIdx = allItems.findIndex((i) => i.id === sourceId);
  const targetIdx = allItems.findIndex((i) => i.id === targetId);
  if (targetIdx < 0) return data;

  const sourceWidget = (data.widgets || []).find((w) => w.id === sourceId);
  const sourceGroupTab = data.tabs.find(
    (t) => Boolean(t.favourite) && t.urlVariants?.some((v) => v.id === sourceId)
  );
  let moved: FavItem;
  let extractedFromGroupId: string | undefined = undefined;
  let extractedVariantTab: Tab | undefined = undefined;

  if (sourceIdx < 0 && sourceWidget && sourceWidget.parentGroupId) {
    extractedFromGroupId = sourceWidget.parentGroupId;
    moved = { id: sourceWidget.id, type: 'widget', createdAt: sourceWidget.createdAt };
  } else if (sourceIdx < 0 && sourceGroupTab) {
    extractedFromGroupId = sourceGroupTab.id;
    const variant = sourceGroupTab.urlVariants?.find((v) => v.id === sourceId);
    if (!variant) return data;

    const newTabId = 'new-tab-' + variant.id;
    extractedVariantTab = {
      id: newTabId,
      url: variant.url,
      customTitle: variant.name,
      favIconUrl: variant.favIconUrl,
      pinned: false,
      favourite: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    moved = { id: extractedVariantTab.id, type: 'tab', createdAt: extractedVariantTab.createdAt };
  } else if (sourceIdx >= 0) {
    [moved] = allItems.splice(sourceIdx, 1);
  } else {
    return data;
  }

  let isParentGroupEmpty = false;
  const parentGroupTab = extractedFromGroupId
    ? data.tabs.find((t) => t.id === extractedFromGroupId)
    : undefined;

  if (extractedFromGroupId && parentGroupTab) {
    const remainingVariants = (parentGroupTab.urlVariants || []).filter((v) =>
      extractedVariantTab ? v.id !== sourceId && Boolean(v.url) : Boolean(v.url)
    );
    const remainingWidgets = (data.widgets || []).filter((w) =>
      w.parentGroupId === extractedFromGroupId && (sourceWidget ? w.id !== sourceId : true)
    );
    isParentGroupEmpty = remainingVariants.length === 0 && remainingWidgets.length === 0;
  }

  if (isParentGroupEmpty && extractedFromGroupId) {
    const groupIdxInAll = allItems.findIndex((i) => i.id === extractedFromGroupId);
    if (groupIdxInAll >= 0) {
      if (targetId === extractedFromGroupId) {
        allItems.splice(groupIdxInAll, 1, moved);
      } else {
        allItems.splice(groupIdxInAll, 1);
        const newTargetIdx = allItems.findIndex((i) => i.id === targetId);
        const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
        allItems.splice(insertIdx, 0, moved);
      }
    }
  } else {
    const newTargetIdx = allItems.findIndex((i) => i.id === targetId);
    const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
    allItems.splice(insertIdx, 0, moved);
  }

  const orderMap = new Map<string, number>();
  allItems.forEach((item, idx) => {
    orderMap.set(item.id, (idx + 1) * 1000);
  });

  const operations: any[] = [];

  if (extractedVariantTab) {
    extractedVariantTab.order = orderMap.get(extractedVariantTab.id);
    operations.push({ type: 'TAB_CREATE', id: extractedVariantTab.id, tab: extractedVariantTab });
  }

  let baseTabs = data.tabs;
  if (extractedVariantTab) {
    baseTabs = [...baseTabs, extractedVariantTab];
  }
  if (isParentGroupEmpty && extractedFromGroupId) {
    operations.push({ type: 'TAB_DELETE', id: extractedFromGroupId });
    baseTabs = baseTabs.filter((t) => t.id !== extractedFromGroupId);
  }

  const updatedTabs = baseTabs.map((t) => {
    const newOrder = orderMap.get(t.id);
    let updatedTab = t;
    if (extractedFromGroupId && t.id === extractedFromGroupId && !isParentGroupEmpty) {
      const nextOrder = (t.groupItemOrder || []).filter((e) => e.id !== sourceId);
      const nextVariants = (t.urlVariants || []).filter((v) =>
        extractedVariantTab ? v.id !== sourceId && Boolean(v.url) : Boolean(v.url)
      );
      const nextDefaultVariantId = nextVariants[0]?.id || undefined;
      const nextUrl = nextVariants[0]?.url || t.url;
      updatedTab = {
        ...updatedTab,
        urlVariants: nextVariants.length > 0 ? nextVariants : undefined,
        defaultVariantId: nextDefaultVariantId,
        url: nextUrl,
        groupItemOrder: nextOrder.length > 0 ? nextOrder : undefined,
        updatedAt: Date.now(),
      };
      operations.push({ type: 'TAB_UPDATE', id: t.id, changes: updatedTab });
    }
    if (newOrder !== undefined) {
      return {
        ...updatedTab,
        order: newOrder,
      };
    }
    return updatedTab;
  });

  const updatedWidgets = (data.widgets || []).map((w) => {
    const newOrder = orderMap.get(w.id);
    const isExtracted = extractedFromGroupId && w.id === sourceId;
    if (newOrder !== undefined || isExtracted) {
      return {
        ...w,
        parentGroupId: isExtracted ? undefined : w.parentGroupId,
        order: newOrder !== undefined ? newOrder : w.order,
      };
    }
    return w;
  });

  if (extractedFromGroupId && sourceWidget) {
    operations.push({ type: 'WIDGET_UPDATE', id: sourceId, parentGroupId: null, order: orderMap.get(sourceId) });
  }

  return {
    tabs: updatedTabs,
    widgets: updatedWidgets,
    operations,
  };
}

// Case 2a: Group with 2 variants. Extract 1 variant before standalone tab 'shelf-tab-1'.
// Since 1 variant remains, group should NOT be deleted, but preserved as a single-item group!
const testState2: WorkspaceDataTest = {
  tabs: [
    {
      id: 'shelf-tab-1',
      url: 'https://news.ycombinator.com',
      customTitle: 'HN',
      favourite: true,
      order: 1000,
    },
    {
      id: 'group-2',
      url: 'https://github.com',
      customTitle: 'Dev',
      favourite: true,
      isGroup: true,
      order: 2000,
      urlVariants: [
        { id: 'v-gh', url: 'https://github.com', name: 'GitHub' },
        { id: 'v-gl', url: 'https://gitlab.com', name: 'GitLab' },
      ],
      groupItemOrder: [
        { type: 'tab', id: 'v-gh' },
        { type: 'tab', id: 'v-gl' },
      ],
    },
  ],
  widgets: [],
  operations: [],
};

const result2 = reorderFavouriteItemLogic(testState2, 'v-gl', 'shelf-tab-1', 'before');
assert(result2.tabs.length === 3, 'Should have 3 tabs: extracted tab, shelf-tab-1, and group-2');
const extractedTab = result2.tabs.find((t) => t.id === 'new-tab-v-gl');
assert(Boolean(extractedTab), 'Extracted tab must exist');
assert(extractedTab?.url === 'https://gitlab.com', 'Extracted tab url must be GitLab');
assert(extractedTab?.customTitle === 'GitLab', 'Extracted tab title must be GitLab');
assert(extractedTab?.order === 1000, 'Extracted tab placed before shelf-tab-1 must have lowest order (1000)');

const retainedGroup = result2.tabs.find((t) => t.id === 'group-2');
assert(Boolean(retainedGroup), 'Parent group must be retained as single-item group');
assert(retainedGroup?.urlVariants?.length === 1, 'Parent group must have 1 variant remaining');
assert(retainedGroup?.urlVariants?.[0].id === 'v-gh', 'Parent group remaining variant must be v-gh');
assert(retainedGroup?.groupItemOrder?.length === 1, 'Parent group groupItemOrder must have 1 item remaining');
assert(!result2.operations.some((op) => op.type === 'TAB_DELETE'), 'Parent group must NOT be deleted');

console.log('✓ Extract variant to shelf with single-item group preservation passed.');

// -------------------------------------------------------------
// Test 3: Extract the last item out of a group (empty group deletion)
// -------------------------------------------------------------
const testState3: WorkspaceDataTest = {
  tabs: [
    {
      id: 'shelf-tab-1',
      url: 'https://news.ycombinator.com',
      customTitle: 'HN',
      favourite: true,
      order: 1000,
    },
    {
      id: 'group-single',
      url: 'https://github.com',
      customTitle: 'Dev',
      favourite: true,
      isGroup: true,
      order: 2000,
      urlVariants: [
        { id: 'v-only', url: 'https://github.com', name: 'GitHub' },
      ],
      groupItemOrder: [
        { type: 'tab', id: 'v-only' },
      ],
    },
  ],
  widgets: [],
  operations: [],
};

// Drag v-only before shelf-tab-1: group-single becomes empty (0 items) and should be auto-deleted
const result3 = reorderFavouriteItemLogic(testState3, 'v-only', 'shelf-tab-1', 'after');
assert(result3.tabs.length === 2, 'Should only have shelf-tab-1 and the extracted tab');
assert(!result3.tabs.some((t) => t.id === 'group-single'), 'Empty group-single must be removed from tabs');
assert(result3.operations.some((op) => op.type === 'TAB_DELETE' && op.id === 'group-single'), 'TAB_DELETE operation must be emitted for empty group');

console.log('✓ Extract last variant out of group auto-deletes empty group passed.');

// -------------------------------------------------------------
// Test 4: Extract child widget out of group onto shelf
// -------------------------------------------------------------
const testState4: WorkspaceDataTest = {
  tabs: [
    {
      id: 'group-with-widget',
      url: 'https://apple.com',
      customTitle: 'Apple & Clock',
      favourite: true,
      isGroup: true,
      order: 1000,
      urlVariants: [
        { id: 'v-apple', url: 'https://apple.com', name: 'Apple' },
      ],
      groupItemOrder: [
        { type: 'tab', id: 'v-apple' },
        { type: 'widget', id: 'w-clock' },
      ],
    },
  ],
  widgets: [
    {
      id: 'w-clock',
      style: 'clock',
      size: 'small',
      parentGroupId: 'group-with-widget',
    },
  ],
  operations: [],
};

// Extract w-clock after group-with-widget
const result4 = reorderFavouriteItemLogic(testState4, 'w-clock', 'group-with-widget', 'after');
const extractedWidget = result4.widgets.find((w) => w.id === 'w-clock');
assert(extractedWidget?.parentGroupId === undefined, 'Extracted widget parentGroupId must be undefined');
assert(extractedWidget?.order !== undefined, 'Extracted widget must have order on shelf');
assert(result4.tabs.length === 1 && result4.tabs[0].id === 'group-with-widget', 'Group must remain as single-item group with v-apple');
assert(result4.tabs[0].groupItemOrder?.length === 1 && result4.tabs[0].groupItemOrder[0].id === 'v-apple', 'Group groupItemOrder must have w-clock removed');

console.log('✓ Extract child widget to shelf passed.');
console.log('ALL tests passed successfully!');
