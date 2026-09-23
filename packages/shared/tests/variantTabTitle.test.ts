import test from 'node:test';
import assert from 'node:assert/strict';
import { Tab } from '../src/types/workspace';
import { getDomain } from '../src/utils/treeUtils';
import { cleanUrl } from '../src/utils/format';

function computeTabDisplayTitle(tab: Partial<Tab>, resolvedUrl?: string): string {
  const urlToUse = resolvedUrl || tab.url || '';
  const domain = getDomain(urlToUse);
  const firstVariantName = tab.urlVariants && tab.urlVariants.length > 0 ? tab.urlVariants[0]?.name?.trim() : undefined;
  return firstVariantName || tab.customTitle || domain || cleanUrl(urlToUse) || 'Untitled Tab';
}

test('Tab with variants: displays first variant name as tab display title', () => {
  const tab: Partial<Tab> = {
    id: 'tab-1',
    url: 'https://example.com/main',
    customTitle: 'Old Custom Title',
    urlVariants: [
      { id: 'v1', name: 'agent', url: 'https://antigravity.example.com' },
      { id: 'v2', name: 'termi', url: 'http://100.99.1.1:8080' },
      { id: 'v3', name: 'aistudio', url: 'https://aistudio.google.com' },
    ],
  };

  const title = computeTabDisplayTitle(tab);
  assert.equal(title, 'agent', 'Title should be the first variant name "agent"');
});

test('Tab with variants: falls back to customTitle if first variant name is empty', () => {
  const tab: Partial<Tab> = {
    id: 'tab-2',
    url: 'https://example.com/main',
    customTitle: 'Fallback Custom Title',
    urlVariants: [
      { id: 'v1', name: '   ', url: 'https://example.com/empty' },
      { id: 'v2', name: 'secondary', url: 'https://example.com/secondary' },
    ],
  };

  const title = computeTabDisplayTitle(tab);
  assert.equal(title, 'Fallback Custom Title', 'Title should fall back to customTitle when first variant name is whitespace');
});

test('Tab with variants: falls back to domain if first variant name and customTitle are empty', () => {
  const tab: Partial<Tab> = {
    id: 'tab-3',
    url: 'https://github.com/pulls',
    urlVariants: [
      { id: 'v1', name: '', url: 'https://github.com/pulls' },
    ],
  };

  const title = computeTabDisplayTitle(tab);
  assert.equal(title, 'github.com', 'Title should fall back to domain when first variant name is empty');
});

test('Tab without variants: uses customTitle as usual', () => {
  const tab: Partial<Tab> = {
    id: 'tab-4',
    url: 'https://google.com',
    customTitle: 'Search Engine',
  };

  const title = computeTabDisplayTitle(tab);
  assert.equal(title, 'Search Engine');
});
