import assert from 'node:assert/strict';
import {
  ARCABLE_COLLECTION_NAME,
  ARCABLE_VARIANT_DELIMITER,
  ARCABLE_WIDGET_LINK_PREFIX,
  reconstructWorkspace,
  serializeGroupMeta,
  parseGroupMeta,
} from '../src/utils/raindropSync';
import { applyOperation, createWorkspaceOperation } from '../src/utils/syncEngine';
import type { Tab } from '../src/types/workspace';

const group = {
  id: '10',
  url: 'https://arcable.dev',
  customTitle: 'Widgets',
  favourite: true,
  isGroup: true,
  urlVariants: [],
  groupItemOrder: [{ type: 'widget', id: 'clock' }, { type: 'widget', id: 'notes' }],
  createdAt: 1,
  updatedAt: 1,
} as Tab;
const root = { _id: 1, title: ARCABLE_COLLECTION_NAME };
const widgetItems = ['clock', 'notes'].map((id, index) => ({
  _id: 20 + index,
  title: `[Widget] ${id}`,
  link: `${ARCABLE_WIDGET_LINK_PREFIX}${id}`,
  collectionId: 1,
  excerpt: JSON.stringify({ id, style: id, size: 'small', parentGroupId: '10', config: {} }),
}));

function hydrate(note: string, link: string, delimiter: boolean) {
  return reconstructWorkspace({
    root,
    collections: [root],
    items: [{
      _id: 10,
      collectionId: 1,
      title: `Widgets${delimiter ? `${ARCABLE_VARIANT_DELIMITER}Default` : ''}`,
      link,
      note,
    }, ...widgetItems],
  });
}

for (const delimiter of [false, true]) {
  for (const link of ['https://arcable.dev', 'https://old-real-tab.example']) {
    const workspace = hydrate(serializeGroupMeta(group), link, delimiter);
    assert.equal(workspace.tabs.length, 1);
    const hydrated = workspace.tabs[0];
    assert.equal(hydrated.customTitle, 'Widgets');
    assert.equal(hydrated.isGroup, true);
    assert.deepEqual(hydrated.urlVariants, [], 'an explicitly empty group must not resurrect its carrier URL');
    assert.equal(hydrated.defaultVariantId, undefined);
    assert.deepEqual(hydrated.groupItemOrder, group.groupItemOrder);
    assert.equal(workspace.widgets?.length, 2);
    assert(workspace.widgets?.every((widget) => widget.parentGroupId === hydrated.id));
    assert.deepEqual(JSON.parse(serializeGroupMeta(hydrated).slice('<!--arcable-group:'.length, -3)).variants, []);
  }
  const legacyNote = `<!--arcable-group:${JSON.stringify({ groupItemOrder: group.groupItemOrder })}-->`;
  const legacy = hydrate(legacyNote, 'https://arcable.dev', delimiter);
  assert.deepEqual(legacy.tabs[0].urlVariants, [], 'legacy widget-only metadata must not create a fake tab');
  const legacyWithoutNote = hydrate('', 'https://arcable.dev', delimiter);
  assert.deepEqual(legacyWithoutNote.tabs[0].urlVariants, []);
  assert.deepEqual(legacyWithoutNote.tabs[0].groupItemOrder, group.groupItemOrder);
}

const lastTabRemoved = { ...group, urlVariants: undefined, url: 'https://removed-tab.example' };
assert.deepEqual(parseGroupMeta(serializeGroupMeta(lastTabRemoved))?.variants, [],
  'removing the last real tab must persist an explicitly empty group');
assert.deepEqual(hydrate(serializeGroupMeta(lastTabRemoved), lastTabRemoved.url, true).tabs[0].urlVariants, []);

const legitimate = reconstructWorkspace({
  root,
  collections: [root],
  items: ['https://arcable.dev', 'https://arcable.dev/docs', 'https://example.com/arcable.dev'].map((link, index) => ({
    _id: 30 + index, collectionId: 1, title: `Bookmark ${index}`, link,
  })),
});
assert.equal(legitimate.tabs.length, 3, 'ordinary Arcable links must remain valid favourites');

const mixed = hydrate(serializeGroupMeta({
  ...group,
  urlVariants: [{ id: 'real-tab', name: 'Arcable', url: 'https://arcable.dev' }],
  groupItemOrder: [{ type: 'tab', id: 'real-tab' }, ...group.groupItemOrder!],
}), 'https://arcable.dev', true);
assert.equal(mixed.tabs[0].urlVariants?.length, 1, 'a real Arcable tab in a mixed group must be retained');
assert.equal(mixed.tabs[0].urlVariants?.[0].url, 'https://arcable.dev');
console.log('widgets-only group Raindrop hydration tests passed');

const hydratedGroup = hydrate(serializeGroupMeta(group), group.url, true);
const replayed = applyOperation(hydratedGroup, createWorkspaceOperation('TAB_UPDATE', '10', {
  urlVariants: [], defaultVariantId: null,
}));
assert.deepEqual(replayed.tabs[0].urlVariants, [], 'operation replay must retain an explicitly empty tab list');
assert.equal(replayed.tabs[0].defaultVariantId, undefined);
