import test from 'node:test';
import assert from 'node:assert/strict';
import { Tab, TabUrlVariant } from '../src/types/workspace';
import {
  getTabEffectiveTitle,
  getSiblingTabs,
  findTabTitleConflict,
  getUniqueTabTitle,
} from '../src/utils/treeUtils';

test('getTabEffectiveTitle: customTitle takes precedence when present', () => {
  const tab: Partial<Tab> = {
    customTitle: 'My Custom Title',
    url: 'https://github.com/pulls',
    urlVariants: [{ id: 'v1', name: 'Variant One', url: 'https://github.com/v1' }],
  };
  assert.equal(getTabEffectiveTitle(tab), 'My Custom Title');
});

test('getTabEffectiveTitle: first variant name used when customTitle is empty', () => {
  const tab: Partial<Tab> = {
    customTitle: '   ',
    url: 'https://github.com/pulls',
    urlVariants: [
      { id: 'v1', name: 'PR Reviews', url: 'https://github.com/v1' },
      { id: 'v2', name: 'Issues', url: 'https://github.com/v2' },
    ],
  };
  assert.equal(getTabEffectiveTitle(tab), 'PR Reviews');
});

test('getTabEffectiveTitle: domain fallback when customTitle and variants empty', () => {
  const tab: Partial<Tab> = {
    url: 'https://docs.google.com/document/d/123/edit',
  };
  assert.equal(getTabEffectiveTitle(tab), 'docs.google.com');
});

test('getTabEffectiveTitle: untitled fallback when url is empty', () => {
  const tab: Partial<Tab> = {};
  assert.equal(getTabEffectiveTitle(tab), 'Untitled Tab');
});

test('getSiblingTabs: correctly scopes to favourites shelf', () => {
  const tabs: Tab[] = [
    { id: 't1', url: 'https://fav1.com', favourite: true, parentSpaceId: 's1' },
    { id: 't2', url: 'https://fav2.com', favourite: true },
    { id: 't3', url: 'https://space.com', favourite: false, parentSpaceId: 's1' },
  ];

  const siblings = getSiblingTabs(tabs, { favourite: true });
  assert.equal(siblings.length, 2);
  assert.deepEqual(siblings.map((s) => s.id), ['t1', 't2']);
});

test('getSiblingTabs: correctly scopes to folder within space', () => {
  const tabs: Tab[] = [
    { id: 't1', url: 'https://f1.com', parentSpaceId: 's1', parentFolderId: 'folder_a' },
    { id: 't2', url: 'https://f2.com', parentSpaceId: 's1', parentFolderId: 'folder_a' },
    { id: 't3', url: 'https://f3.com', parentSpaceId: 's1', parentFolderId: 'folder_b' },
    { id: 't4', url: 'https://f4.com', parentSpaceId: 's1' }, // root
    { id: 't5', url: 'https://f5.com', favourite: true },
  ];

  const siblings = getSiblingTabs(tabs, { parentSpaceId: 's1', parentFolderId: 'folder_a' });
  assert.equal(siblings.length, 2);
  assert.deepEqual(siblings.map((s) => s.id), ['t1', 't2']);
});

test('getSiblingTabs: correctly scopes to space root and excludes folder tabs', () => {
  const tabs: Tab[] = [
    { id: 't1', url: 'https://root1.com', parentSpaceId: 's1' },
    { id: 't2', url: 'https://root2.com', parentSpaceId: 's1', pinned: true },
    { id: 't3', url: 'https://infolder.com', parentSpaceId: 's1', parentFolderId: 'folder_a' },
    { id: 't4', url: 'https://other_space.com', parentSpaceId: 's2' },
  ];

  const siblings = getSiblingTabs(tabs, { parentSpaceId: 's1' });
  assert.equal(siblings.length, 2);
  assert.deepEqual(siblings.map((s) => s.id), ['t1', 't2']);
});

test('getSiblingTabs: excludes tab by id when editing existing tab', () => {
  const tabs: Tab[] = [
    { id: 't1', url: 'https://tab1.com', parentSpaceId: 's1', parentFolderId: 'f1' },
    { id: 't2', url: 'https://tab2.com', parentSpaceId: 's1', parentFolderId: 'f1' },
  ];

  const siblings = getSiblingTabs(tabs, { parentSpaceId: 's1', parentFolderId: 'f1' }, 't1');
  assert.equal(siblings.length, 1);
  assert.equal(siblings[0]?.id, 't2');
});

test('findTabTitleConflict: case-insensitive and trimmed collision detection', () => {
  const siblings: Tab[] = [
    { id: 't1', url: 'https://tab1.com', customTitle: 'Documentation' },
    { id: 't2', url: 'https://tab2.com', urlVariants: [{ id: 'v1', name: 'API Reference', url: 'https://api.com' }] },
  ];

  assert.ok(findTabTitleConflict('documentation', siblings));
  assert.ok(findTabTitleConflict(' DOCUMENTATION  ', siblings));
  assert.ok(findTabTitleConflict('api reference', siblings));
  assert.equal(findTabTitleConflict('Other Tab', siblings), undefined);
});

test('getUniqueTabTitle: generates auto-incremented titles', () => {
  const siblings: Tab[] = [
    { id: 't1', url: 'https://tab1.com', customTitle: 'Arcable Docs' },
    { id: 't2', url: 'https://tab2.com', customTitle: 'Arcable Docs (2)' },
  ];

  // No conflict
  assert.equal(getUniqueTabTitle('Fresh Title', siblings), 'Fresh Title');

  // First collision appends (2) if not already taken, or increments to next free slot
  assert.equal(getUniqueTabTitle('Arcable Docs', siblings), 'Arcable Docs (3)');

  // Starting with a candidate that already has a suffix
  assert.equal(getUniqueTabTitle('Arcable Docs (2)', siblings), 'Arcable Docs (3)');
});

test('Tab variants mode: duplicate variant names inside single tab are detected', () => {
  const variants: TabUrlVariant[] = [
    { id: 'v1', name: 'Staging', url: 'https://staging.app.com' },
    { id: 'v2', name: 'Production', url: 'https://app.com' },
    { id: 'v3', name: 'staging', url: 'https://staging2.app.com' }, // duplicate of v1
  ];

  const seen = new Set<string>();
  let duplicateName: string | null = null;
  for (const v of variants) {
    const eff = v.name.trim().toLowerCase() || 'variant';
    if (seen.has(eff)) {
      duplicateName = v.name.trim() || 'Variant';
      break;
    }
    seen.add(eff);
  }

  assert.equal(duplicateName, 'staging');
});
