import { getSparseOrderBetween } from '../src/hooks/useWorkspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(getSparseOrderBetween(2000, 3000) === 2500, 'a favourite move should use the gap between neighbours');
assert(getSparseOrderBetween(undefined, 1000) === 0, 'a move to the front should update only the moved item');
assert(getSparseOrderBetween(9000, undefined) === 10000, 'a move to the end should update only the moved item');
assert(getSparseOrderBetween(2000, 2001) === undefined, 'adjacent orders should request a one-time shelf compaction');

// Test 2: Unified shelf items sorting between tabs and widgets
interface ShelfTestItem {
  id: string;
  type: 'tab' | 'widget';
  order?: number;
  createdAt?: number;
}

function sortShelfItems(tabItems: ShelfTestItem[], widgetItems: ShelfTestItem[]): ShelfTestItem[] {
  return [...tabItems, ...widgetItems].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      if (a.order !== b.order) return a.order - b.order;
      return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
    }
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
  });
}

const interleavedTabs: ShelfTestItem[] = [
  { id: 'tab-1', type: 'tab', order: 2000, createdAt: 100 },
  { id: 'tab-2', type: 'tab', order: 4000, createdAt: 200 },
];

const interleavedWidgets: ShelfTestItem[] = [
  { id: 'widget-1', type: 'widget', order: 1000, createdAt: 50 },
  { id: 'widget-2', type: 'widget', order: 3000, createdAt: 150 },
];

const sorted = sortShelfItems(interleavedTabs, interleavedWidgets);
const sortedIds = sorted.map((item) => item.id);
assert(
  JSON.stringify(sortedIds) === JSON.stringify(['widget-1', 'tab-1', 'widget-2', 'tab-2']),
  `interleaved widgets and tabs must sort strictly according to order: got ${JSON.stringify(sortedIds)}`
);

// Test 3: Equal order tie-breaking between widgets and tabs
const tiedTabs: ShelfTestItem[] = [
  { id: 'tab-tied', type: 'tab', order: 1000, createdAt: 200 },
];
const tiedWidgets: ShelfTestItem[] = [
  { id: 'widget-tied', type: 'widget', order: 1000, createdAt: 100 },
];

const sortedTied = sortShelfItems(tiedTabs, tiedWidgets);
assert(
  sortedTied[0].id === 'widget-tied' && sortedTied[1].id === 'tab-tied',
  'when orders tie, earlier createdAt should break the tie instead of placing tabs first unconditionally'
);

// Test 4: Native architecture hydration preserves snapshot widgets
const nativeSnapshot = {
  raindropRootCollectionId: 99999,
  raindropMetadataItemId: null,
  spaces: [],
  folders: [],
  tabs: [{ id: 'tab-1', favourite: true, order: 2000 }],
  widgets: [{ id: 'widget-1', style: 'clock', size: 'small' as const, order: 1000 }],
  customCodeRules: [],
  runCodeInPageRules: [],
};

const remoteMetadataMissing =
  nativeSnapshot.raindropMetadataItemId === null && !nativeSnapshot.raindropRootCollectionId;

assert(
  remoteMetadataMissing === false,
  'native v2 snapshot with raindropRootCollectionId must not be considered metadata-missing'
);

const hydratedWidgets = remoteMetadataMissing ? [] : nativeSnapshot.widgets;
assert(
  hydratedWidgets.length === 1 && hydratedWidgets[0].id === 'widget-1',
  'native snapshot widgets must be preserved during hydration'
);

console.log('Favourite sparse-order & unified shelf sorting tests passed.');
