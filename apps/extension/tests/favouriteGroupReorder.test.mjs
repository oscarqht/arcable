import assert from 'node:assert/strict';
import {
  serializeGroupMeta,
  parseGroupMeta,
  attachGroupMetaToNote,
  reconstructWorkspace,
} from '../../../packages/shared/dist/utils/raindropSync.js';

console.log('Testing Favourite Group Reordering and Raindrop Synchronization...');

// Test 1: Serialization and parsing of group metadata
{
  const tab = {
    id: 'tab-1',
    customTitle: 'My Dev Tools',
    url: 'https://github.com',
    defaultVariantId: 'var-2',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'var-2', name: 'GitHub', url: 'https://github.com' },
      { id: 'var-1', name: 'GitLab', url: 'https://gitlab.com' },
      { id: 'var-3', name: 'Bitbucket', url: 'https://bitbucket.org' },
    ],
  };

  const serialized = serializeGroupMeta(tab);
  assert.match(serialized, /<!--arcable-group:\{.*\}-->/, 'Should format as HTML comment markdown');

  const parsed = parseGroupMeta(serialized);
  assert.ok(parsed, 'Parsed meta should not be null');
  assert.equal(parsed.defaultVariantId, 'var-2');
  assert.equal(parsed.firstName, 'GitHub');
  assert.equal(parsed.variants.length, 3);
  assert.equal(parsed.variants[0].id, 'var-2');
  assert.equal(parsed.variants[1].id, 'var-1');
  assert.equal(parsed.variants[2].id, 'var-3');

  // Test attaching to existing note
  const noteWithUserText = attachGroupMetaToNote('Existing user notes on this group', tab);
  assert.ok(noteWithUserText.startsWith('Existing user notes on this group\n<!--arcable-group:'));
  const parsedFromUserNote = parseGroupMeta(noteWithUserText);
  assert.equal(parsedFromUserNote.variants[0].id, 'var-2');

  // Test updating group meta replaces old meta without duplicating
  const tabUpdated = {
    ...tab,
    urlVariants: [
      { id: 'var-3', name: 'Bitbucket', url: 'https://bitbucket.org' },
      { id: 'var-2', name: 'GitHub', url: 'https://github.com' },
      { id: 'var-1', name: 'GitLab', url: 'https://gitlab.com' },
    ],
  };
  const updatedNote = attachGroupMetaToNote(noteWithUserText, tabUpdated);
  const matchCount = (updatedNote.match(/<!--arcable-group:/g) || []).length;
  assert.equal(matchCount, 1, 'Should only contain one metadata comment block');
  const parsedUpdated = parseGroupMeta(updatedNote);
  assert.equal(parsedUpdated.variants[0].id, 'var-3');
  console.log('✓ Group metadata serialization, parsing, and note attachment passed');
}

// Test 2: reconstructWorkspace preserves variant sequence even when Raindrop returns scrambled order
{
  const rootCollection = { _id: 1000, title: 'Arcable v2' };

  // Primary bookmark in Raindrop (e.g. ID 101) with embedded group metadata specifying sequence: [103, 102, 101]
  const groupMetaComment = serializeGroupMeta({
    id: '101',
    url: 'https://item3.com',
    customTitle: 'Daily Tools',
    defaultVariantId: '103',
    urlVariants: [
      { id: '103', name: 'Item Three', url: 'https://item3.com' },
      { id: '102', name: 'Item Two', url: 'https://item2.com' },
      { id: '101', name: 'Item One', url: 'https://item1.com' },
    ],
  });

  const baseBookmark = {
    _id: 101,
    title: 'Daily Tools',
    link: 'https://item1.com',
    collectionId: 1000,
    note: `Some notes\n${groupMetaComment}`,
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };

  // Secondary bookmarks returned in arbitrary order
  const secondaryBookmark1 = {
    _id: 102,
    title: 'Daily Tools ||| Item Two',
    link: 'https://item2.com',
    collectionId: 1000,
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };

  const secondaryBookmark2 = {
    _id: 103,
    title: 'Daily Tools ||| Item Three',
    link: 'https://item3.com',
    collectionId: 1000,
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };

  // Scrambled tree items (e.g., Raindrop returns 101, then 102, then 103, or 102 first)
  const tree = {
    root: rootCollection,
    collections: [rootCollection],
    items: [secondaryBookmark1, baseBookmark, secondaryBookmark2],
  };

  const workspace = reconstructWorkspace(tree);
  assert.equal(workspace.tabs.length, 1, 'Should reconstruct 1 group tab');
  const groupTab = workspace.tabs[0];
  assert.equal(groupTab.isGroup, true, 'Tab should be recognized as a group');
  assert.equal(groupTab.customTitle, 'Daily Tools');
  assert.ok(groupTab.urlVariants, 'Should have urlVariants');
  assert.equal(groupTab.urlVariants.length, 3, 'Should have all 3 variants');

  // Verify reconstructed order matches the metadata order [103, 102, 101]
  assert.equal(groupTab.urlVariants[0].id, '103');
  assert.equal(groupTab.urlVariants[0].name, 'Item Three');
  assert.equal(groupTab.urlVariants[0].url, 'https://item3.com');

  assert.equal(groupTab.urlVariants[1].id, '102');
  assert.equal(groupTab.urlVariants[1].name, 'Item Two');
  assert.equal(groupTab.urlVariants[1].url, 'https://item2.com');

  assert.equal(groupTab.urlVariants[2].id, '101');
  assert.equal(groupTab.urlVariants[2].name, 'Item One', 'Base variant name must be preserved from metadata');
  assert.equal(groupTab.urlVariants[2].url, 'https://item1.com');

  // Tab default URL and defaultVariantId must match the first variant
  assert.equal(groupTab.url, 'https://item3.com');
  assert.equal(groupTab.defaultVariantId, '103');

  console.log('✓ reconstructWorkspace faithfully restored order and names from metadata');
}

// Test 3: Fallback when metadata is not present (backwards compatibility)
{
  const rootCollection = { _id: 1000, title: 'Arcable v2' };
  const baseBookmark = {
    _id: 201,
    title: 'Legacy Group',
    link: 'https://base.com',
    collectionId: 1000,
    order: 0,
    sort: 0,
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };
  const sec1 = {
    _id: 203,
    title: 'Legacy Group ||| Variant B',
    link: 'https://b.com',
    collectionId: 1000,
    order: 2,
    sort: 2,
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };
  const sec2 = {
    _id: 202,
    title: 'Legacy Group ||| Variant A',
    link: 'https://a.com',
    collectionId: 1000,
    order: 1,
    sort: 1,
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };

  const tree = {
    root: rootCollection,
    collections: [rootCollection],
    items: [sec1, baseBookmark, sec2],
  };

  const workspace = reconstructWorkspace(tree);
  assert.equal(workspace.tabs.length, 1);
  const groupTab = workspace.tabs[0];
  assert.equal(groupTab.urlVariants.length, 3);
  assert.equal(groupTab.urlVariants[0].id, '201');
  // Secondary variants ordered by order map / order: 202 (order 1) then 203 (order 2)
  assert.equal(groupTab.urlVariants[1].id, '202');
  assert.equal(groupTab.urlVariants[2].id, '203');
  console.log('✓ reconstructWorkspace backwards compatibility fallback passed');
}

// Test 4: Reordering mutation matches useWorkspace logic and persists through sync
{
  const groupTab = {
    id: 'group-1',
    customTitle: 'Dev Tools',
    url: 'https://alpha.com',
    defaultVariantId: 'v-1',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'v-1', name: 'Alpha', url: 'https://alpha.com' },
      { id: 'v-2', name: 'Beta', url: 'https://beta.com' },
      { id: 'v-3', name: 'Gamma', url: 'https://gamma.com' },
    ],
  };

  // Simulate reordering Beta (v-2) to before Alpha (v-1)
  const variants = [...groupTab.urlVariants];
  const sourceIdx = variants.findIndex((v) => v.id === 'v-2');
  const [moved] = variants.splice(sourceIdx, 1);
  const targetIdx = variants.findIndex((v) => v.id === 'v-1');
  variants.splice(targetIdx, 0, moved);

  const updatedTab = {
    ...groupTab,
    urlVariants: variants,
    defaultVariantId: variants[0].id,
    url: variants[0].url,
    updatedAt: Date.now(),
  };

  assert.equal(updatedTab.urlVariants[0].id, 'v-2');
  assert.equal(updatedTab.urlVariants[1].id, 'v-1');
  assert.equal(updatedTab.defaultVariantId, 'v-2');
  assert.equal(updatedTab.url, 'https://beta.com');

  const metaStr = serializeGroupMeta(updatedTab);
  const parsed = parseGroupMeta(metaStr);
  assert.equal(parsed.variants[0].id, 'v-2');
  assert.equal(parsed.variants[0].name, 'Beta');
  assert.equal(parsed.variants[1].id, 'v-1');
  assert.equal(parsed.variants[1].name, 'Alpha');
  assert.equal(parsed.defaultVariantId, 'v-2');
  console.log('✓ Group reordering mutation and serialization roundtrip passed');
}

console.log('All Favourite Group reordering and sync tests passed successfully!');
