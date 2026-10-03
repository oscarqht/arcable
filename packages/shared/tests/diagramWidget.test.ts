import {
  WorkspaceWidget,
  DiagramConfig,
  DiagramChartStyle,
  DiagramDataPoint,
} from '../src/types/workspace';
import {
  createDefaultDiagramConfig,
  computePieSlices,
  getDataPointColor,
  DIAGRAM_PALETTES,
  DIAGRAM_PRESET_TEMPLATES,
} from '../src/utils/diagram';
import {
  widgetToRaindropItemInput,
  reconstructWorkspace,
  RaindropItem,
} from '../src/utils/raindropSync';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running Diagram Widget unit and integration tests...');

// -------------------------------------------------------------
// Test 1: createDefaultDiagramConfig
// -------------------------------------------------------------
const defaultConfig = createDefaultDiagramConfig();
assert(defaultConfig.title === 'Metrics', 'Default title should be "Metrics"');
assert(defaultConfig.chartStyle === 'bar', 'Default chart style should be "bar"');
assert(defaultConfig.colorScheme === 'vibrant', 'Default colorScheme should be "vibrant"');
assert(Array.isArray(defaultConfig.dataPoints), 'dataPoints should be an array');
assert(defaultConfig.dataPoints!.length >= 4, 'Default data points should have at least 4 items');
console.log('✓ Test 1 passed: createDefaultDiagramConfig');

// -------------------------------------------------------------
// Test 2: getDataPointColor
// -------------------------------------------------------------
const pointWithCustomColor: DiagramDataPoint = { id: '1', label: 'Custom', value: 10, color: '#ff00aa' };
const customColor = getDataPointColor(pointWithCustomColor, 0, 'vibrant');
assert(customColor === '#ff00aa', 'Custom color should take precedence');

const pointWithoutColor: DiagramDataPoint = { id: '2', label: 'Default', value: 20 };
const paletteColor0 = getDataPointColor(pointWithoutColor, 0, 'ocean');
assert(paletteColor0 === DIAGRAM_PALETTES.ocean[0], 'Should use ocean palette color index 0');

const paletteColor1 = getDataPointColor(pointWithoutColor, 1, 'ocean');
assert(paletteColor1 === DIAGRAM_PALETTES.ocean[1], 'Should use ocean palette color index 1');
console.log('✓ Test 2 passed: getDataPointColor');

// -------------------------------------------------------------
// Test 3: computePieSlices - normal multi-slice
// -------------------------------------------------------------
const samplePoints: DiagramDataPoint[] = [
  { id: 'p1', label: 'A', value: 25 },
  { id: 'p2', label: 'B', value: 75 },
];
const slices = computePieSlices(samplePoints, 100, 100, 50, 0, 'vibrant');
assert(slices.length === 2, 'Should create 2 slices');
assert(slices[0].percentage === 25, 'First slice should be 25%');
assert(slices[1].percentage === 75, 'Second slice should be 75%');
assert(slices[0].pathD.startsWith('M 100 100'), 'Standard pie path should start from center (100, 100)');
assert(!slices[0].pathD.includes('NaN'), 'Slice path must not contain NaN');
assert(!slices[1].pathD.includes('NaN'), 'Slice path must not contain NaN');
console.log('✓ Test 3 passed: computePieSlices normal multi-slice');

// -------------------------------------------------------------
// Test 4: computePieSlices - doughnut mode (innerRadius > 0)
// -------------------------------------------------------------
const donutSlices = computePieSlices(samplePoints, 100, 100, 50, 25, 'vibrant');
assert(donutSlices.length === 2, 'Should create 2 donut slices');
assert(!donutSlices[0].pathD.startsWith('M 100 100'), 'Donut path should not start at center');
assert(!donutSlices[0].pathD.includes('NaN'), 'Donut path must not contain NaN');
console.log('✓ Test 4 passed: computePieSlices doughnut mode');

// -------------------------------------------------------------
// Test 5: computePieSlices - 100% single slice edge case
// -------------------------------------------------------------
const singlePoint: DiagramDataPoint[] = [{ id: 'solo', label: 'All', value: 100 }];
const singleSlices = computePieSlices(singlePoint, 100, 100, 50, 0, 'vibrant');
assert(singleSlices.length === 1, 'Should create 1 full-circle slice');
assert(singleSlices[0].percentage === 100, 'Single slice should be 100%');
assert(!singleSlices[0].pathD.includes('NaN'), 'Full circle path must not contain NaN');
assert(singleSlices[0].pathD.includes('A 50 50'), 'Full circle path should contain arc command');

const singleDonutSlices = computePieSlices(singlePoint, 100, 100, 50, 25, 'vibrant');
assert(singleDonutSlices.length === 1, 'Should create 1 full-circle donut');
assert(!singleDonutSlices[0].pathD.includes('NaN'), 'Full donut path must not contain NaN');
console.log('✓ Test 5 passed: computePieSlices 100% single slice');

// -------------------------------------------------------------
// Test 6: computePieSlices - empty or all-zero data points
// -------------------------------------------------------------
assert(computePieSlices([], 100, 100, 50).length === 0, 'Empty points should return empty slices');
assert(
  computePieSlices([{ id: 'z1', label: 'Zero', value: 0 }], 100, 100, 50).length === 0,
  'All zero points should return empty slices'
);
console.log('✓ Test 6 passed: computePieSlices empty / all-zero');

// -------------------------------------------------------------
// Test 7: Diagram widget serialization to Raindrop item
// -------------------------------------------------------------
const diagramWidget: WorkspaceWidget = {
  id: 'w-diag-1',
  style: 'diagram',
  size: 'small',
  order: 500,
  config: {
    title: 'Team Velocity',
    chartStyle: 'line',
    colorScheme: 'emerald',
    dataPoints: [
      { id: 'dp-1', label: 'Sprint 1', value: 34 },
      { id: 'dp-2', label: 'Sprint 2', value: 48 },
    ],
    unit: 'pts',
  },
  createdAt: 1710000000000,
};

const raindropItem = widgetToRaindropItemInput(diagramWidget, 999);
assert(raindropItem.title.includes('diagram'), 'Raindrop title should include diagram');
assert(raindropItem.excerpt.includes('"style":"diagram"'), 'Excerpt must contain style diagram');
assert(raindropItem.excerpt.includes('"chartStyle":"line"'), 'Excerpt must contain chartStyle line');
assert(raindropItem.excerpt.includes('"Sprint 1"'), 'Excerpt must contain data point label');
assert(raindropItem.excerpt.includes('34'), 'Excerpt must contain data point value');
console.log('✓ Test 7 passed: Diagram widget serialization to Raindrop');

// -------------------------------------------------------------
// Test 8: Workspace reconstruction restores Diagram widget & config
// -------------------------------------------------------------
const mockRootCollection = { _id: 999, title: 'Arcable', parent: null } as any;
const mockRemoteRaindropItem: RaindropItem = {
  _id: 8881,
  title: 'Arcable Widget: diagram',
  link: 'arcable://widget/w-diag-1',
  collectionId: 999,
  excerpt: JSON.stringify({
    id: 'w-diag-1',
    style: 'diagram',
    size: 'small',
    config: {
      title: 'Sales Q3',
      bottomTitle: 'Goal: $200',
      chartStyle: 'doughnut',
      dataPoints: [
        { id: 'd-1', label: 'North', value: 120 },
        { id: 'd-2', label: 'South', value: 90 },
      ],
      unit: '$',
    },
  }),
  sort: 1,
  tags: ['arcable-widget'],
  created: '2026-10-01T00:00:00Z',
  lastUpdate: '2026-10-01T00:00:00Z',
};

const reconstructed = reconstructWorkspace(
  {
    root: mockRootCollection,
    collections: [mockRootCollection],
    spaces: [],
    folders: [],
    items: [mockRemoteRaindropItem],
    archiveRootId: null,
  },
  'space-1'
);

const restoredWidget = reconstructed.widgets.find((w) => w.id === 'w-diag-1');
assert(restoredWidget !== undefined, 'Restored widget must exist');
assert(restoredWidget.style === 'diagram', 'Restored widget style must be diagram');
const restoredConfig = restoredWidget.config as DiagramConfig;
assert(restoredConfig.title === 'Sales Q3', 'Title must be restored');
assert(restoredConfig.bottomTitle === 'Goal: $200', 'Custom bottomTitle must be restored');
assert(restoredConfig.chartStyle === 'doughnut', 'chartStyle must be doughnut');
assert(restoredConfig.dataPoints?.length === 2, 'Must restore 2 data points');
assert(restoredConfig.dataPoints?.[0].label === 'North', 'Data point label must match');
assert(restoredConfig.dataPoints?.[0].value === 120, 'Data point value must match');
assert(restoredConfig.unit === '$', 'Unit must match');
console.log('✓ Test 8 passed: Workspace reconstruction of Diagram widget with bottomTitle');

// -------------------------------------------------------------
// Test 9: Preset templates validity
// -------------------------------------------------------------
assert(DIAGRAM_PRESET_TEMPLATES.length >= 4, 'Should have at least 4 preset templates');
DIAGRAM_PRESET_TEMPLATES.forEach((tpl) => {
  assert(Boolean(tpl.name), 'Preset template must have name');
  assert(
    ['bar', 'line', 'area', 'pie', 'doughnut'].includes(tpl.chartStyle),
    `Invalid chartStyle: ${tpl.chartStyle}`
  );
  assert(Array.isArray(tpl.dataPoints) && tpl.dataPoints.length > 0, 'Preset must have dataPoints');
});
console.log('✓ Test 9 passed: Preset templates validity');

// -------------------------------------------------------------
// Test 10: Clear all data points and custom bottomTitle calculation
// -------------------------------------------------------------
function resolveBottomDisplayText(config: DiagramConfig): string {
  const custom = config.bottomTitle !== undefined && config.bottomTitle !== null ? config.bottomTitle.trim() : '';
  const pts = config.dataPoints || [];
  const total = pts.reduce((a, b) => a + (Number(b.value) || 0), 0);
  const unit = config.unit || '';
  if (custom !== '') return custom;
  if (pts.length > 0) return `${total}${unit}`;
  return '--';
}

// Case 1: Custom bottom title takes priority over data sum
assert(
  resolveBottomDisplayText({ title: 'My Chart', bottomTitle: 'Target Met', dataPoints: [{ id: '1', label: 'X', value: 50 }] }) === 'Target Met',
  'Custom bottomTitle should override auto sum'
);

// Case 2: Blank bottom title falls back to sum
assert(
  resolveBottomDisplayText({ title: 'My Chart', bottomTitle: '', unit: '$', dataPoints: [{ id: '1', label: 'X', value: 50 }, { id: '2', label: 'Y', value: 25 }] }) === '75$',
  'Blank bottomTitle should fall back to sum + unit'
);

// Case 3: Cleared data points with custom bottom title displays custom bottom title
assert(
  resolveBottomDisplayText({ title: 'My Chart', bottomTitle: 'Pending', dataPoints: [] }) === 'Pending',
  'Cleared points with custom bottomTitle should show custom bottomTitle'
);

// Case 4: Cleared data points without custom bottom title displays '--'
assert(
  resolveBottomDisplayText({ title: 'My Chart', bottomTitle: '', dataPoints: [] }) === '--',
  'Cleared points with blank bottomTitle should show "--"'
);
console.log('✓ Test 10 passed: Clear all data points & bottom title resolution');

console.log('\nAll Diagram Widget tests passed successfully!');
