import test from 'node:test';
import assert from 'node:assert/strict';
import type { Tab } from '../src/types/workspace';
import { applyBatchUrlReplacements, buildBatchUrlReplacementPreview } from '../src/utils/batchUrlReplacement';

const tab = (id: string, url: string, extra: Partial<Tab> = {}): Tab => ({ id, url, pinned: false, ...extra });
const grouped = (): Tab => tab('group', 'http://old.test/a', {
  favourite: true,
  customTitle: 'Keep this title',
  customEmojiIcon: '🐦',
  note: 'Keep this note',
  favIconUrl: 'http://old.test/icon.png',
  order: 42,
  defaultVariantId: 'default',
  urlVariants: [
    { id: 'secondary', name: 'Secondary', url: 'http://old.test/b', favIconUrl: 'http://old.test/b.ico' },
    { id: 'default', name: 'Default', url: 'http://old.test/a', customEmojiIcon: '🦚' },
  ],
});

test('literal replacement spans every component and occurrence, case-sensitively', () => {
  const tabs = [tab('a', 'http://old.test/old?old=old#old'), tab('b', 'https://OLD.test')];
  const rows = buildBatchUrlReplacementPreview(tabs, 'old', 'new');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].after, 'http://new.test/new?new=new#new');
  assert.equal(applyBatchUrlReplacements(tabs, rows).tabs[1], tabs[1]);
});

test('find and replacement treat regex syntax and dollar substitutions literally', () => {
  const tabs = [tab('a', 'https://example.test/a.b/aXb/a.b')];
  const rows = buildBatchUrlReplacementPreview(tabs, 'a.b', '$&$1$$');
  assert.equal(rows[0].after, 'https://example.test/$&$1$$/aXb/$&$1$$');
});

test('raw replacement does not normalize slashes, protocols, ports or templates', () => {
  const tabs = [tab('a', 'http://1.2.3.4:3300/abc?env={{env}}#part')];
  assert.deepEqual(buildBatchUrlReplacementPreview(tabs, ':3000', ':4000'), []);
  const rows = buildBatchUrlReplacementPreview(tabs, 'http://1.2.3.4:3300', 'https://example.com/');
  assert.equal(rows[0].after, 'https://example.com//abc?env={{env}}#part');
  assert.equal(buildBatchUrlReplacementPreview(tabs, '{{env}}', '{{other}}')[0].after,
    'http://1.2.3.4:3300/abc?env={{other}}#part');
});

test('empty find and unchanged text produce no actionable preview', () => {
  const tabs = [tab('a', 'https://example.test')];
  assert.deepEqual(buildBatchUrlReplacementPreview(tabs, '', 'x'), []);
  assert.deepEqual(buildBatchUrlReplacementPreview(tabs, 'test', 'test'), []);
});

test('all saved tabs are searched regardless of space, folders, pinning or favourites', () => {
  const tabs = [
    tab('root', 'old', { parentSpaceId: 'a' }),
    tab('folder', 'old', { parentSpaceId: 'b', parentFolderId: 'nested' }),
    tab('pinned', 'old', { parentSpaceId: 'b', pinned: true }),
    tab('favourite', 'old', { favourite: true }),
  ];
  assert.deepEqual(buildBatchUrlReplacementPreview(tabs, 'old', 'new').map((row) => row.tabId), tabs.map((item) => item.id));
});

test('default primary mirror is counted once, and each variant can be excluded independently', () => {
  const original = grouped();
  const rows = buildBatchUrlReplacementPreview([original], 'old.test', 'new.test');
  assert.equal(rows.length, 2);
  const result = applyBatchUrlReplacements([original], rows.filter((row) => row.variantId === 'secondary'));
  assert.equal(result.appliedCount, 1);
  assert.equal(result.tabs[0].url, original.url);
  assert.equal(result.tabs[0].urlVariants?.[0].url, 'http://new.test/b');
  assert.equal(result.tabs[0].urlVariants?.[1], original.urlVariants?.[1]);
});

test('default variant replacement preserves metadata, IDs and existing order', () => {
  const original = grouped();
  const rows = buildBatchUrlReplacementPreview([original], 'old.test', 'new.test');
  const result = applyBatchUrlReplacements([original], rows);
  assert.equal(result.tabs[0].url, 'http://new.test/a');
  assert.deepEqual(result.tabs[0], {
    ...original,
    url: 'http://new.test/a',
    urlVariants: original.urlVariants?.map((variant) => ({ ...variant, url: variant.url.replace('old.test', 'new.test') })),
  });
  assert.equal(original.urlVariants?.[0].url, 'http://old.test/b');
});

test('empty replacement can clear a default variant and its primary mirror', () => {
  const original = grouped();
  const rows = buildBatchUrlReplacementPreview([original], original.url, '');
  const result = applyBatchUrlReplacements([original], rows);
  assert.equal(result.tabs[0].url, '');
  assert.equal(result.tabs[0].urlVariants?.[1].url, '');
  assert.equal(result.tabs[0].defaultVariantId, 'default');
});

test('stale, deleted, or already applied rows do not overwrite current URLs', () => {
  const original = [tab('a', 'https://old.test'), tab('b', 'https://old.test')];
  const rows = buildBatchUrlReplacementPreview(original, 'old', 'new');
  const latest = [tab('a', 'https://edited.test')];
  const result = applyBatchUrlReplacements(latest, rows);
  assert.equal(result.tabs, latest);
  assert.equal(result.appliedCount, 0);
  assert.equal(result.skippedCount, 2);
  const once = applyBatchUrlReplacements(original, rows);
  assert.equal(applyBatchUrlReplacements(once.tabs, rows).appliedCount, 0);
});

test('latest metadata is retained while still-current reviewed URLs change', () => {
  const original = grouped();
  const rows = buildBatchUrlReplacementPreview([original], 'old.test', 'new.test');
  const latest = { ...original, note: 'Edited while previewing', order: 99 };
  const result = applyBatchUrlReplacements([latest], rows);
  assert.equal(result.tabs[0].note, latest.note);
  assert.equal(result.tabs[0].order, latest.order);
});

test('changing the default during preview follows the latest default mirror', () => {
  const original = grouped();
  const rows = buildBatchUrlReplacementPreview([original], 'old.test', 'new.test');
  const latest = { ...original, defaultVariantId: 'secondary', url: 'http://old.test/b' };
  const result = applyBatchUrlReplacements([latest], rows.filter((row) => row.variantId === 'default'));
  assert.equal(result.tabs[0].url, latest.url);
  assert.equal(result.tabs[0].urlVariants?.[1].url, 'http://new.test/a');
});

test('a divergent primary remains independently selectable and duplicate rows apply once', () => {
  const original = { ...grouped(), url: 'http://old.test/independent' };
  const rows = buildBatchUrlReplacementPreview([original], 'old.test', 'new.test');
  assert.equal(rows.length, 3);
  const primary = rows.find((row) => row.variantId === undefined)!;
  const result = applyBatchUrlReplacements([original], [primary, primary]);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.tabs[0].url, 'http://new.test/independent');
  assert.equal(result.tabs[0].urlVariants, original.urlVariants);
});
