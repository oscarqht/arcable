import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import test from 'node:test';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';

// Load the production TSX, following the shared hook regression test harness.
const require = createRequire(import.meta.url);
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (module, filename) => module._compile(ts.transpileModule(
    readFileSync(filename, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } },
  ).outputText, filename);
}
const { FavouriteTabsShelf } = require('../../../packages/shared/src/components/workspace/FavouriteTabsShelf.tsx');
const { TabFavicon } = require('../../../packages/shared/src/components/workspace/TabFavicon.tsx');
const { getFavouriteGroupBadge } = require('../../../packages/shared/src/utils/favouriteGroupBadge.ts');
const { getSpaceThemeStyles } = require('../../../packages/shared/src/utils/spaceTheme.ts');

// Run with NODE_ENV=development so React exposes act.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
globalThis.window = Object.assign(new EventTarget(), {
  innerWidth: 1280,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});
const variant = (id) => ({ id, name: id, url: `https://${id}.example` });
const group = (variants, extra = {}) => ({ id: 'group', url: variants[0]?.url || '', favourite: true, isGroup: true, urlVariants: variants, ...extra });
const association = (id, badge) => ({ tabItemId: id, browserTabId: 1, windowId: 1, originalUrl: '', currentUrl: '', isDiverted: false, badge });
const associations = (badges) => Object.fromEntries(Object.entries(badges).map(([id, badge]) => [id, association(id, badge)]));
const props = (tab, badges = {}, extra = {}) => ({
  tabs: [tab], tabAssociations: associations(badges),
  onEditTab() {}, onDeleteTab() {}, onToggleFavouriteTab() {}, onAddFavouriteTab() {}, ...extra,
});
const badgeSpans = (view) => view.root.findAll((node) => node.type === 'span' && node.props.style?.backgroundColor === '#ef4444');
async function mount(t, initialProps) {
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(FavouriteTabsShelf, initialProps)); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}
async function update(view, nextProps) {
  await act(async () => view.update(React.createElement(FavouriteTabsShelf, nextProps)));
}

test('group tile sums numeric/string counts beyond the four-item preview, not parent or unrelated associations', async (t) => {
  const variants = ['a', 'b', 'c', 'd', 'e', 'f'].map(variant);
  const view = await mount(t, props(group(variants), { a: '2', b: 3, e: '7', f: '1', group: 50, unrelated: 100 }));
  assert.equal(view.root.findAllByType(TabFavicon).length, 4, 'preview remains limited to four icons');
  const badges = badgeSpans(view);
  assert.equal(badges.length, 1);
  assert.deepEqual(badges[0].children, ['13']);
  assert.equal(badges[0].props.style.top, '3px');
  assert.equal(badges[0].props.style.right, '3px');
  assert.equal(badges[0].parent.parent.props.style.height, '56px', 'badge is anchored to the tile, not an icon');
});

test('zero, absent and invalid member counts do not render a group badge', async (t) => {
  const variants = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(variant);
  const view = await mount(t, props(group(variants), { a: 0, b: '0', c: null, d: '', e: 'unread', f: -2, g: NaN }));
  assert.equal(badgeSpans(view).length, 0);
  await update(view, props(group(variants), {}, { tabAssociations: undefined }));
  assert.equal(badgeSpans(view).length, 0);
});

test('mounted group badge updates on counts, associations and membership changes, and disappears at zero', async (t) => {
  const a = variant('a');
  const b = variant('b');
  const c = variant('c');
  const tab = group([a, b]);
  const badges = { a: 2, b: 3, c: 7 };
  const view = await mount(t, props(tab, badges));
  assert.deepEqual(badgeSpans(view)[0].children, ['5']);
  await update(view, props(tab, { ...badges, b: 4 }));
  assert.deepEqual(badgeSpans(view)[0].children, ['6']);
  await update(view, props({ ...tab, urlVariants: [a, b, c] }, badges));
  assert.deepEqual(badgeSpans(view)[0].children, ['12']);
  await update(view, props({ ...tab, urlVariants: [b] }, badges));
  assert.deepEqual(badgeSpans(view)[0].children, ['3']);
  await update(view, props({ ...tab, urlVariants: [b] }));
  assert.equal(badgeSpans(view).length, 0, 'closing the associated member clears its count');
  await update(view, props(tab, { a: 0, b: '0' }));
  assert.equal(badgeSpans(view).length, 0);
});

test('custom-icon groups use the same aggregate badge with dark-theme styling', async (t) => {
  const tab = group([variant('a'), variant('b')], { customEmojiIcon: '📬' });
  const view = await mount(t, props(tab, { a: '4', b: '5' }, { themeStyles: getSpaceThemeStyles(undefined, true) }));
  assert.equal(view.root.findAllByType(TabFavicon).length, 1);
  assert.equal(view.root.findByType(TabFavicon).props.badge, undefined, 'no duplicate badge on the custom icon');
  assert.deepEqual(badgeSpans(view)[0].children, ['9']);
  assert.equal(badgeSpans(view)[0].props.style.border, '1.5px solid #1e293b');
});

test('widgets and invalid URL variants never contribute, including widget-only groups', async (t) => {
  const widgets = [{ id: 'widget', parentGroupId: 'group', style: 'note', size: 'small', config: {} }];
  const tab = group([variant('a'), { ...variant('invalid'), url: '' }], { groupItemOrder: [{ type: 'widget', id: 'widget' }, { type: 'tab', id: 'a' }] });
  const view = await mount(t, props(tab, { a: 3, widget: 80, invalid: 20, group: 50 }, { widgets }));
  assert.deepEqual(badgeSpans(view)[0].children, ['3']);
  await update(view, props(group([]), { widget: 80, group: 50 }, { widgets }));
  assert.equal(badgeSpans(view).length, 0);
});

test('implicit variant groups aggregate while individual tab badges retain their existing behavior', async (t) => {
  const view = await mount(t, props(group([variant('a'), variant('b')], { isGroup: false }), { a: 3, b: 4 }));
  assert.deepEqual(badgeSpans(view)[0].children, ['7']);
  const single = { id: 'single', url: 'https://single.example', favourite: true };
  await update(view, props(single, { single: '99+' }));
  assert.equal(badgeSpans(view).length, 1);
  assert.deepEqual(badgeSpans(view)[0].children, ['99+']);
  assert.equal(badgeSpans(view)[0].props.style.top, '-4px');
  assert.equal(badgeSpans(view)[0].props.style.right, '-7px');
});

test('capped member counts preserve a lower-bound marker without capping exact aggregate totals', () => {
  const variants = ['a', 'b'].map(variant);
  assert.equal(getFavouriteGroupBadge(variants, associations({ a: '99+', b: 3 })), '102+');
  assert.equal(getFavouriteGroupBadge(variants, associations({ a: 75, b: '80' })), 155);
  assert.equal(getFavouriteGroupBadge([], associations({ a: 3 })), undefined);
});
