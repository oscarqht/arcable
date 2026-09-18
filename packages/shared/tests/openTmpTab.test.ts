import test from 'node:test';
import assert from 'node:assert/strict';
import { Tab, TabUrlVariant } from '../src/types/workspace';
import { ActionDropdownItem } from '../src/components/workspace/ActionDropdown';
import { cleanUrl } from '../src/utils/format';

function buildTabMenuItems(
  tab: Tab,
  onOpenTmpTab?: (url: string, title?: string) => void,
  onOpen?: (url: string, tabId?: string, options?: any) => void
): ActionDropdownItem[] {
  const displayTitle = tab.customTitle || tab.title || cleanUrl(tab.url) || 'Untitled Tab';

  const handleOpenTmpTab = (urlToOpen: string, titleToUse?: string) => {
    if (onOpenTmpTab) {
      onOpenTmpTab(urlToOpen, titleToUse);
    } else if (onOpen) {
      onOpen(urlToOpen, undefined, { inNewTab: true, asTmpTab: true });
    }
  };

  const validVariants = (tab.urlVariants || []).filter((v) => Boolean(v.url));
  const hasMultipleVariants = validVariants.length > 1;

  const tmpTabMenuItem: ActionDropdownItem = {
    id: 'open-tmp-tab',
    label: 'Open in new tab',
    ...(hasMultipleVariants
      ? {
          children: validVariants.map((v, idx) => ({
            id: `open-tmp-var-${v.id || idx}`,
            label: v.name || cleanUrl(v.url) || 'Variant',
            onClick: (e?: any) => {
              handleOpenTmpTab(v.url, v.name || displayTitle);
            },
          })),
        }
      : {
          onClick: (e?: any) => {
            if (tab.url) {
              handleOpenTmpTab(tab.url, displayTitle);
            }
          },
        }),
  };

  return [
    { id: 'copy-url', label: 'Copy URL', onClick: () => {} },
    tmpTabMenuItem,
  ];
}

test('Tab without variants: Open in new tab is a top-level menu item without children', () => {
  const tab: Tab = {
    id: 'tab_1',
    url: 'https://example.com/docs',
    title: 'Example Documentation',
    pinned: false,
    spaceId: 'space_1',
  };

  let openedUrl: string | null = null;
  let openedTitle: string | null = null;

  const items = buildTabMenuItems(tab, (url, title) => {
    openedUrl = url;
    openedTitle = title || null;
  });

  assert.equal(items.filter((i) => i.label === 'Open in new tab').length, 1);
  const tmpItem = items.find((i) => i.id === 'open-tmp-tab');
  assert.ok(tmpItem, 'Open in new tab item must exist');
  assert.equal(tmpItem.label, 'Open in new tab');
  assert.equal(tmpItem.children, undefined, 'Must not have children when tab has no variants');

  tmpItem.onClick?.({} as any);
  assert.equal(openedUrl, 'https://example.com/docs');
  assert.equal(openedTitle, 'Example Documentation');
});

test('Tab with single variant: Open in new tab does not show secondary level', () => {
  const tab: Tab = {
    id: 'tab_single_var',
    url: 'https://example.com',
    customTitle: 'Single Variant Tab',
    pinned: false,
    spaceId: 'space_1',
    urlVariants: [
      { id: 'v1', name: 'Default', url: 'https://example.com' },
    ],
  };

  let openedUrl: string | null = null;
  const items = buildTabMenuItems(tab, (url) => {
    openedUrl = url;
  });

  const tmpItem = items.find((i) => i.id === 'open-tmp-tab');
  assert.ok(tmpItem);
  assert.equal(tmpItem.children, undefined);

  tmpItem.onClick?.({} as any);
  assert.equal(openedUrl, 'https://example.com');
});

test('Tab with multiple variants: Open in new tab has secondary level with all variant names', () => {
  const variants: TabUrlVariant[] = [
    { id: 'v1', name: 'App', url: 'https://github.com' },
    { id: 'v2', name: 'Issues', url: 'https://github.com/issues' },
    { id: 'v3', name: 'Pull Requests', url: 'https://github.com/pulls' },
  ];

  const tab: Tab = {
    id: 'tab_github',
    url: 'https://github.com',
    customTitle: 'GitHub Workspace',
    pinned: false,
    spaceId: 'space_1',
    urlVariants: variants,
  };

  let openedUrl: string | null = null;
  let openedTitle: string | null = null;

  const items = buildTabMenuItems(tab, (url, title) => {
    openedUrl = url;
    openedTitle = title || null;
  });

  const tmpItem = items.find((i) => i.id === 'open-tmp-tab');
  assert.ok(tmpItem, 'Open in new tab item must exist');
  assert.equal(tmpItem.label, 'Open in new tab');
  assert.ok(Array.isArray(tmpItem.children), 'Must have children array for multiple variants');
  assert.equal(tmpItem.children.length, 3, 'Children must list all 3 variants');

  // Verify variant names
  assert.equal(tmpItem.children[0].label, 'App');
  assert.equal(tmpItem.children[1].label, 'Issues');
  assert.equal(tmpItem.children[2].label, 'Pull Requests');

  // Simulate choosing second variant ("Issues")
  tmpItem.children[1].onClick?.({} as any);
  assert.equal(openedUrl, 'https://github.com/issues');
  assert.equal(openedTitle, 'Issues');

  // Simulate choosing third variant ("Pull Requests")
  tmpItem.children[2].onClick?.({} as any);
  assert.equal(openedUrl, 'https://github.com/pulls');
  assert.equal(openedTitle, 'Pull Requests');
});

test('Fallback opens via onOpen with asTmpTab: true when onOpenTmpTab is not provided', () => {
  const tab: Tab = {
    id: 'tab_fallback',
    url: 'https://news.ycombinator.com',
    title: 'Hacker News',
    pinned: false,
    spaceId: 'space_1',
  };

  let calledUrl: string | null = null;
  let calledOptions: any = null;

  const items = buildTabMenuItems(tab, undefined, (url, tabId, options) => {
    calledUrl = url;
    calledOptions = options;
  });

  const tmpItem = items.find((i) => i.id === 'open-tmp-tab');
  assert.ok(tmpItem);
  tmpItem.onClick?.({} as any);

  assert.equal(calledUrl, 'https://news.ycombinator.com');
  assert.deepEqual(calledOptions, { inNewTab: true, asTmpTab: true });
});
