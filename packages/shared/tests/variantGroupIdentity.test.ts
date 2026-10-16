import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructWorkspace } from '../src/utils/raindropSync';
import type { RaindropBookmarkItem } from '../src/types/raindrop';

for (const collectionId of [1, 2]) {
  for (const reverse of [false, true]) {
    test(`distinct variant groups retain shared URLs (collection ${collectionId}, reverse ${reverse})`, () => {
      const groups = [
        ['webapp', ['webapp', 'https://web.whisperim.app'], ['dev', 'http://localhost:6175'],
          ['bro', 'http://100.99.123.84:3300'], ['repo', 'http://100.99.123.84:3100'], ['gitlab', 'https://git.insea.io/whisper/web']],
        ['desktop', ['desktop', 'https://git.insea.io/whisper/desktop'],
          ['bro', 'http://100.99.123.84:3300'], ['repo', 'http://100.99.123.84:3100'], ['gitlab', 'https://git.insea.io/whisper/desktop-repo']],
      ] as const;
      let id = 100;
      const orderedGroups = reverse ? [...groups].reverse() : groups;
      const items: RaindropBookmarkItem[] = orderedGroups.flatMap(([title, ...variants]) =>
        variants.map(([name, link]) => ({ _id: id++, title: `${title} ||| ${name}`, link, collectionId, order: id }))
      );
      const root = { _id: 1, title: 'Arcable v2', count: items.length };
      const space = { _id: 2, title: 'Whisper', parent: { $id: 1 }, count: items.length };
      const result = reconstructWorkspace({ root, collections: [root, space], items });
      assert.equal(result.tabs.length, 2);
      for (const [title, ...variants] of groups) {
        const tab = result.tabs.find((tab) => tab.customTitle === title);
        assert.ok(tab, `Missing ${title} tab`);
        assert.deepEqual(tab.urlVariants?.map(({ name, url }) => [name, url]), variants);
        assert.equal(tab.defaultVariantId, tab.urlVariants?.[0].id);
      }
      assert.equal(new Set(result.tabs.flatMap((tab) => tab.urlVariants?.map((variant) => variant.id) || [])).size, 9);
    });
  }
}

test('a variant name does not identify another group', () => {
  const root = { _id: 1, title: 'Arcable v2', count: 4 };
  const result = reconstructWorkspace({ root, collections: [root], items: [
    { _id: 1, title: 'webapp ||| desktop', link: 'https://example.com/a', collectionId: 1 },
    { _id: 2, title: 'webapp ||| dev', link: 'https://example.com/b', collectionId: 1 },
    { _id: 3, title: 'desktop ||| desktop', link: 'https://example.com/c', collectionId: 1 },
    { _id: 4, title: 'desktop ||| repo', link: 'https://example.com/d', collectionId: 1 },
  ] });
  assert.deepEqual(result.tabs.map((tab) => tab.customTitle), ['webapp', 'desktop']);
});

test('a standalone bookmark retains its shared URL beside a differently named group', () => {
  const root = { _id: 1, title: 'Arcable v2', count: 3 };
  const result = reconstructWorkspace({ root, collections: [root], items: [
    { _id: 1, title: 'webapp', link: 'https://example.com/shared', collectionId: 1 },
    { _id: 2, title: 'desktop ||| bro', link: 'https://example.com/shared', collectionId: 1 },
    { _id: 3, title: 'desktop ||| repo', link: 'https://example.com/repo', collectionId: 1 },
  ] });
  assert.equal(result.tabs.length, 2);
  assert.equal(result.tabs.find((tab) => tab.customTitle === 'webapp')?.urlVariants, undefined);
  assert.deepEqual(result.tabs.find((tab) => tab.customTitle === 'desktop')?.urlVariants?.map((variant) => variant.id), ['2', '3']);
});
