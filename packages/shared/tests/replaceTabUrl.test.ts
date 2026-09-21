import test from 'node:test';
import assert from 'node:assert/strict';
import { Tab, TabUrlVariant } from '../src/types/workspace';
import {
  computeTabUrlReplacement,
  buildReplaceWithCurrentUrlMenuItem,
} from '../src/utils/tabUtils';

test('computeTabUrlReplacement: tab without variants updates primary url', () => {
  const tab: Tab = {
    id: 'tab_simple',
    url: 'https://example.com/old',
    pinned: false,
  };

  const updates = computeTabUrlReplacement(tab, 'https://example.com/new', undefined, 'https://example.com/favicon.ico');
  assert.equal(updates.url, 'https://example.com/new');
  assert.equal(updates.favIconUrl, 'https://example.com/favicon.ico');
  assert.equal(updates.urlVariants, undefined);
});

test('computeTabUrlReplacement: tab with single variant updates both variant and primary url', () => {
  const tab: Tab = {
    id: 'tab_single_var',
    url: 'https://example.com/old',
    pinned: false,
    urlVariants: [
      { id: 'var_1', name: 'Main', url: 'https://example.com/old' },
    ],
  };

  const updates = computeTabUrlReplacement(tab, 'https://example.com/new');
  assert.equal(updates.url, 'https://example.com/new');
  assert.ok(updates.urlVariants);
  assert.equal(updates.urlVariants.length, 1);
  assert.equal(updates.urlVariants[0].url, 'https://example.com/new');
  assert.equal(updates.defaultVariantId, 'var_1');
});

test('computeTabUrlReplacement: tab with multiple variants when replacing specific default variant', () => {
  const variants: TabUrlVariant[] = [
    { id: 'var_prod', name: 'Production', url: 'https://app.com' },
    { id: 'var_stage', name: 'Staging', url: 'https://stage.app.com' },
  ];
  const tab: Tab = {
    id: 'tab_multi',
    url: 'https://app.com',
    defaultVariantId: 'var_prod',
    urlVariants: variants,
    pinned: false,
  };

  const updates = computeTabUrlReplacement(tab, 'https://new-prod.app.com', 'var_prod');
  assert.equal(updates.url, 'https://new-prod.app.com');
  assert.ok(updates.urlVariants);
  assert.equal(updates.urlVariants[0].url, 'https://new-prod.app.com');
  assert.equal(updates.urlVariants[1].url, 'https://stage.app.com');
  assert.equal(updates.defaultVariantId, 'var_prod');
});

test('computeTabUrlReplacement: tab with multiple variants when replacing non-default variant preserves tab.url', () => {
  const variants: TabUrlVariant[] = [
    { id: 'var_prod', name: 'Production', url: 'https://app.com' },
    { id: 'var_stage', name: 'Staging', url: 'https://stage.app.com' },
  ];
  const tab: Tab = {
    id: 'tab_multi',
    url: 'https://app.com',
    defaultVariantId: 'var_prod',
    urlVariants: variants,
    pinned: false,
  };

  const updates = computeTabUrlReplacement(tab, 'https://new-staging.app.com', 'var_stage');
  // Primary URL should NOT be updated because var_stage is not default
  assert.equal(updates.url, undefined);
  assert.ok(updates.urlVariants);
  assert.equal(updates.urlVariants[0].url, 'https://app.com');
  assert.equal(updates.urlVariants[1].url, 'https://new-staging.app.com');
  assert.equal(updates.defaultVariantId, 'var_prod');
});

test('buildReplaceWithCurrentUrlMenuItem: tab without variants has top-level onClick and no children', () => {
  const tab: Tab = {
    id: 'tab_no_var',
    url: 'https://github.com/oscarqht/arcable',
    pinned: false,
  };

  let replacedVariantId: string | undefined = 'initial';
  const item = buildReplaceWithCurrentUrlMenuItem({
    tab,
    onReplaceWithCurrentUrl: (variantId) => {
      replacedVariantId = variantId;
    },
    dividerAfter: true,
  });

  assert.equal(item.id, 'replace-with-current-url');
  assert.equal(item.label, 'Replace with current url');
  assert.equal(item.dividerAfter, true);
  assert.equal(item.children, undefined);
  assert.ok(typeof item.onClick === 'function');

  item.onClick?.({} as any);
  assert.equal(replacedVariantId, undefined);
});

test('buildReplaceWithCurrentUrlMenuItem: tab with single variant has top-level onClick and no children', () => {
  const tab: Tab = {
    id: 'tab_one_var',
    url: 'https://google.com',
    pinned: false,
    urlVariants: [
      { id: 'v1', name: 'Search', url: 'https://google.com' },
    ],
  };

  let called = false;
  const item = buildReplaceWithCurrentUrlMenuItem({
    tab,
    onReplaceWithCurrentUrl: () => {
      called = true;
    },
  });

  assert.equal(item.id, 'replace-with-current-url');
  assert.equal(item.label, 'Replace with current url');
  assert.equal(item.children, undefined);
  assert.ok(typeof item.onClick === 'function');

  item.onClick?.({} as any);
  assert.equal(called, true);
});

test('buildReplaceWithCurrentUrlMenuItem: tab with multiple variants renders secondary menu items (children)', () => {
  const tab: Tab = {
    id: 'tab_multi_var',
    url: 'https://docs.google.com/document/d/1',
    pinned: false,
    urlVariants: [
      { id: 'var_doc', name: 'Design Doc', url: 'https://docs.google.com/document/d/1' },
      { id: 'var_sheet', name: 'Tracking Sheet', url: 'https://docs.google.com/spreadsheets/d/2' },
      { id: 'var_slide', name: 'Presentation', url: 'https://docs.google.com/presentation/d/3' },
    ],
  };

  let chosenVariantId: string | undefined = undefined;
  const item = buildReplaceWithCurrentUrlMenuItem({
    tab,
    onReplaceWithCurrentUrl: (variantId) => {
      chosenVariantId = variantId;
    },
    dividerAfter: true,
  });

  assert.equal(item.id, 'replace-with-current-url');
  assert.equal(item.label, 'Replace with current url');
  assert.equal(item.dividerAfter, true);
  assert.ok(Array.isArray(item.children));
  assert.equal(item.children!.length, 3);

  assert.equal(item.children![0].id, 'replace-var-var_doc');
  assert.equal(item.children![0].label, 'Design Doc');

  assert.equal(item.children![1].id, 'replace-var-var_sheet');
  assert.equal(item.children![1].label, 'Tracking Sheet');

  assert.equal(item.children![2].id, 'replace-var-var_slide');
  assert.equal(item.children![2].label, 'Presentation');

  // Clicking secondary menu item for sheet
  item.children![1].onClick?.({} as any);
  assert.equal(chosenVariantId, 'var_sheet');

  // Clicking secondary menu item for slide
  item.children![2].onClick?.({} as any);
  assert.equal(chosenVariantId, 'var_slide');
});
