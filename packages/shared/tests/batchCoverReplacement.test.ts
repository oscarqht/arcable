import test from 'node:test';
import assert from 'node:assert/strict';
import type { Tab } from '../src/types/workspace';
import { applyBatchCoverReplacements, buildBatchCoverReplacementPreview } from '../src/utils/batchCoverReplacement';

const cover = 'https://covers.test/new.png';
const tab = (id: string, url: string, extra: Partial<Tab> = {}): Tab => ({ id, url, pinned: false, ...extra });
const grouped = (): Tab => tab('variants', 'http://old.test/default', {
  customTitle: 'Keep title', note: 'Keep note', customEmojiIcon: '🦚', order: 42,
  favIconUrl: 'https://covers.test/old.png', defaultVariantId: 'default',
  urlVariants: [
    { id: 'secondary', name: 'Secondary', url: 'http://old.test/secondary', customEmojiIcon: '🦊' },
    { id: 'default', name: 'Default', url: 'http://old.test/default', favIconUrl: 'https://covers.test/old.png' },
  ],
});

test('cover matching is literal and case-sensitive across raw URL components and templates', () => {
  const tabs = [tab('path', 'https://example.test/path?a.b={{env}}#a.b'), tab('upper', 'https://A.B.test'), tab('regex', 'https://aXb.test')];
  const rows = buildBatchCoverReplacementPreview(tabs, 'a.b', cover);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tabId, 'path');
  assert.equal(rows[0].url, tabs[0].url);
  assert.equal(buildBatchCoverReplacementPreview(tabs, '{{env}}', cover).length, 1);
});

test('requires find text and a cover, and excludes covers already selected', () => {
  const tabs = [tab('a', 'https://match.test', { favIconUrl: cover })];
  assert.deepEqual(buildBatchCoverReplacementPreview(tabs, '', cover), []);
  assert.deepEqual(buildBatchCoverReplacementPreview(tabs, 'match', ''), []);
  assert.deepEqual(buildBatchCoverReplacementPreview(tabs, 'match', cover), []);
});

test('matches all saved scopes and preserves all URLs and unrelated metadata', () => {
  const tabs = [
    tab('normal', 'http://match.test/root', { parentSpaceId: 's1', note: 'keep', customEmojiIcon: '🏠' }),
    tab('folder', 'http://match.test/folder', { parentSpaceId: 's2', parentFolderId: 'nested' }),
    tab('pinned', 'http://match.test/pinned', { parentSpaceId: 's2', pinned: true }),
    tab('favourite', 'http://match.test/favourite', { favourite: true }),
    tab('unmatched', 'https://else.test'),
  ];
  const rows = buildBatchCoverReplacementPreview(tabs, 'match.test', cover);
  const result = applyBatchCoverReplacements(tabs, rows);
  assert.equal(result.appliedCount, 4);
  assert.deepEqual(result.tabs, tabs.map((item, i) => i < 4 ? { ...item, favIconUrl: cover } : item));
  assert.equal(result.tabs[4], tabs[4]);
  assert.equal(tabs[0].favIconUrl, undefined);
});

test('default URL mirror appears once and excluded variants remain unchanged', () => {
  const original = grouped();
  const rows = buildBatchCoverReplacementPreview([original], 'old.test', cover);
  assert.equal(rows.length, 2);
  const result = applyBatchCoverReplacements([original], rows.filter((row) => row.variantId === 'secondary'));
  assert.equal(result.tabs[0].favIconUrl, original.favIconUrl);
  assert.equal(result.tabs[0].urlVariants?.[0].favIconUrl, cover);
  assert.equal(result.tabs[0].urlVariants?.[0].customEmojiIcon, '🦊');
  assert.equal(result.tabs[0].urlVariants?.[1], original.urlVariants?.[1]);
});

test('default cover mirrors primary without changing variant names, order, IDs, URLs or emoji', () => {
  const original = grouped();
  const result = applyBatchCoverReplacements([original], buildBatchCoverReplacementPreview([original], 'old.test', cover));
  assert.deepEqual(result.tabs[0], { ...original, favIconUrl: cover, urlVariants: original.urlVariants?.map((variant) => ({ ...variant, favIconUrl: cover })) });
});

test('favourite group variants update their covers without changing the parent group identity', () => {
  const original = { ...grouped(), favourite: true, isGroup: true };
  const result = applyBatchCoverReplacements([original], buildBatchCoverReplacementPreview([original], 'old.test', cover));
  assert.equal(result.appliedCount, 2);
  assert.equal(result.tabs[0].favIconUrl, original.favIconUrl);
  assert.equal(result.tabs[0].customEmojiIcon, original.customEmojiIcon);
  assert.ok(result.tabs[0].urlVariants?.every((variant) => variant.favIconUrl === cover));
});

test('stale URLs, changed covers and deleted records are skipped', () => {
  const original = [tab('a', 'http://match.test'), tab('b', 'http://match.test'), tab('c', 'http://match.test')];
  const rows = buildBatchCoverReplacementPreview(original, 'match', cover);
  const latest = [{ ...original[0], url: 'http://edited.test' }, { ...original[1], favIconUrl: 'edited.png' }];
  const result = applyBatchCoverReplacements(latest, rows);
  assert.equal(result.tabs, latest);
  assert.equal(result.appliedCount, 0);
  assert.equal(result.skippedCount, 3);
});

test('default cover edited during preview is not overwritten through its variant mirror', () => {
  const original = grouped();
  const rows = buildBatchCoverReplacementPreview([original], '/default', cover);
  const latest = { ...original, favIconUrl: 'edited.png' };
  assert.equal(applyBatchCoverReplacements([latest], rows).appliedCount, 0);
});

test('a new default during preview keeps the old default independently editable', () => {
  const original = grouped();
  const rows = buildBatchCoverReplacementPreview([original], '/default', cover);
  const latest = { ...original, defaultVariantId: 'secondary', url: original.urlVariants![0].url, favIconUrl: undefined };
  const result = applyBatchCoverReplacements([latest], rows);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.tabs[0].favIconUrl, undefined);
  assert.equal(result.tabs[0].url, latest.url);
  assert.equal(result.tabs[0].urlVariants?.[1].favIconUrl, cover);
});

test('latest metadata is retained and applying duplicate or already applied rows is idempotent', () => {
  const original = grouped();
  const rows = buildBatchCoverReplacementPreview([original], '/secondary', cover);
  const latest = { ...original, note: 'Edited while previewing', order: 100 };
  const result = applyBatchCoverReplacements([latest], [...rows, ...rows]);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.tabs[0].note, latest.note);
  assert.equal(result.tabs[0].order, latest.order);
  assert.equal(applyBatchCoverReplacements(result.tabs, rows).appliedCount, 0);
});

test('a default variant with an inherited primary cover gains the selected cover on both records', () => {
  const original = grouped();
  original.urlVariants![1].favIconUrl = undefined;
  const rows = buildBatchCoverReplacementPreview([original], '/default', cover);
  const result = applyBatchCoverReplacements([original], rows);
  assert.equal(result.tabs[0].favIconUrl, cover);
  assert.equal(result.tabs[0].urlVariants?.[1].favIconUrl, cover);
});
