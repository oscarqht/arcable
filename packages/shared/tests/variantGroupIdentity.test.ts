import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRaindropTitle, reconstructWorkspace } from '../src/utils/raindropSync';
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

for (const collectionId of [1, 2, 3]) {
  for (const reverse of [false, true]) {
    test(`only the exact variant delimiter groups bookmark names (collection ${collectionId}, reverse ${reverse})`, () => {
      const names = [
        'foo', 'foo (bar)', 'foo (2)', 'foo [bar]', 'foo {bar}',
        'foo <bar>', 'foo & "bar" / \\ # + = @ ! ?', 'foo — 中文 🚀',
        'foo|bar', 'foo||bar', 'foo|||bar', 'foo |||bar', 'foo||| bar',
        'foo:::bar',
      ];
      const root = { _id: 1, title: 'Arcable v2', count: names.length + 1 };
      const space = { _id: 2, title: 'Space', parent: { $id: 1 } };
      const folder = { _id: 3, title: 'Folder', parent: { $id: 2 } };
      const items: RaindropBookmarkItem[] = names.map((title, index) => ({
        _id: index + 100,
        title: encodeRaindropTitle(title),
        link: `https://example.com/${index}`,
        collectionId,
      }));
      items.push({ _id: 200, title: 'foo ||| staging (测试) & <dev>', link: 'https://example.com/staging', collectionId });
      const result = reconstructWorkspace({ root, collections: [root, space, folder], items: reverse ? items.reverse() : items });
      assert.equal(result.tabs.length, names.length);
      for (const [index, name] of names.entries()) {
        const tab = result.tabs.find((tab) => tab.customTitle === name);
        assert.ok(tab, `Missing bookmark ${name}`);
        assert.equal(tab.url, `https://example.com/${index}`);
        if (name === 'foo') {
          assert.deepEqual(tab.urlVariants?.map(({ name }) => name), ['foo', 'staging (测试) & <dev>']);
        } else {
          assert.equal(tab.urlVariants, undefined, `${name} must stay standalone`);
        }
      }
    });
  }
}

test('variant groups preserve punctuation in their base names', () => {
  const names = ['foo', 'foo:::bar', 'foo (bar)', 'foo <bar> 中文 🚀'];
  const root = { _id: 1, title: 'Arcable v2', count: names.length * 2 };
  const result = reconstructWorkspace({ root, collections: [root], items: names.flatMap((name, index) =>
    ['prod', 'dev'].map((variant, variantIndex) => ({
      _id: 100 + index * 2 + variantIndex,
      title: encodeRaindropTitle(`${name} ||| ${variant}`),
      link: `https://example.com/${index}/${variant}`,
      collectionId: 1,
    }))
  ) });
  assert.deepEqual(result.tabs.map((tab) => tab.customTitle), names);
  for (const tab of result.tabs) {
    assert.deepEqual(tab.urlVariants?.map((variant) => variant.name), ['prod', 'dev']);
  }
});

test('a differently cased base name does not merge into a standalone bookmark', () => {
  const root = { _id: 1, title: 'Arcable v2', count: 3 };
  const result = reconstructWorkspace({ root, collections: [root], items: [
    { _id: 1, title: 'Foo', link: 'https://example.com/standalone', collectionId: 1 },
    { _id: 2, title: 'foo ||| prod', link: 'https://example.com/prod', collectionId: 1 },
    { _id: 3, title: 'foo ||| dev', link: 'https://example.com/dev', collectionId: 1 },
  ] });
  assert.equal(result.tabs.length, 2);
  assert.equal(result.tabs.find((tab) => tab.customTitle === 'Foo')?.urlVariants, undefined);
  assert.deepEqual(result.tabs.find((tab) => tab.customTitle === 'foo')?.urlVariants?.map((variant) => variant.id), ['2', '3']);
});
