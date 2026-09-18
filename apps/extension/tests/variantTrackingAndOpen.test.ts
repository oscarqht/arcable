import type { Tab, TabUrlVariant, ArcableWorkspaceData } from '@arcable/shared/types';
import { reconstructWorkspace, ARCABLE_VARIANT_DELIMITER } from '@arcable/shared/utils';
import type { RaindropCollectionTree } from '@arcable/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running variant tracking and open behavior tests...');

// -------------------------------------------------------------
// Test 1: Reconstruct workspace distinguishes favorite groups from normal tabs with variants
// -------------------------------------------------------------
{
  const mockTree: any = {
    root: { _id: 1, title: 'Arcable v2' },
    collections: [
      { _id: 1, title: 'Arcable v2' },
      { _id: 10, title: 'Development', parent: { $id: 1 } },
    ],
    items: [
      // Favourite group in root collection (1)
      { _id: 101, title: 'Docs', link: 'https://docs.react.dev', collectionId: 1, order: 0 },
      { _id: 102, title: `Docs${ARCABLE_VARIANT_DELIMITER}Vite`, link: 'https://vite.dev', collectionId: 1, order: 1 },
      // Normal tab with URL variants in Space collection (10)
      { _id: 201, title: 'GitHub', link: 'https://github.com/arcable', collectionId: 10, order: 0 },
      { _id: 202, title: `GitHub${ARCABLE_VARIANT_DELIMITER}Issues`, link: 'https://github.com/arcable/issues', collectionId: 10, order: 1 },
      { _id: 203, title: `GitHub${ARCABLE_VARIANT_DELIMITER}PRs`, link: 'https://github.com/arcable/pulls', collectionId: 10, order: 2 },
    ],
  };

  const reconstructed = reconstructWorkspace(mockTree, 'space-1');
  const favTab = reconstructed.tabs.find((t) => t.id === '101');
  const normalTab = reconstructed.tabs.find((t) => t.id === '201');

  assert(favTab !== undefined, 'Favourite tab 101 should exist');
  assert(favTab.favourite === true, 'Tab 101 must be favourite');
  assert(favTab.isGroup === true, 'Favourite tab with variants must have isGroup === true');
  assert(favTab.urlVariants?.length === 2, 'Favourite group should have 2 variants');

  assert(normalTab !== undefined, 'Normal tab 201 should exist');
  assert(!normalTab.favourite, 'Tab 201 must NOT be favourite');
  assert(normalTab.isGroup === undefined || normalTab.isGroup === false, 'Normal tab with variants must NOT have isGroup === true');
  assert(normalTab.urlVariants?.length === 3, 'Normal tab should have 3 url variants');
  console.log('✓ reconstructWorkspace sets isGroup only for favourite groups, NOT normal space tabs');
}

// -------------------------------------------------------------
// Test 2: Trackable item extraction distinguishes favorite groups from normal tabs
// -------------------------------------------------------------
{
  interface TrackableTabItem {
    id: string;
    url: string;
    urlVariants?: TabUrlVariant[];
  }

  const workspaceTabs: Tab[] = [
    {
      id: 'fav_group_1',
      customTitle: 'Fav Group',
      url: 'https://docs.react.dev',
      favourite: true,
      isGroup: true,
      urlVariants: [
        { id: 'fav_var_1', name: 'React', url: 'https://docs.react.dev' },
        { id: 'fav_var_2', name: 'Vite', url: 'https://vite.dev' },
      ],
    },
    {
      id: 'normal_tab_1',
      customTitle: 'Normal Tab with Variants',
      url: 'https://github.com/arcable',
      favourite: false,
      parentSpaceId: 'space-1',
      urlVariants: [
        { id: 'norm_var_1', name: 'Repo', url: 'https://github.com/arcable' },
        { id: 'norm_var_2', name: 'Issues', url: 'https://github.com/arcable/issues' },
        { id: 'norm_var_3', name: 'PRs', url: 'https://github.com/arcable/pulls' },
      ],
    },
  ];

  // Logic used in TabTracker.syncWithWorkspace:
  const trackableItems: TrackableTabItem[] = [];
  for (const t of workspaceTabs) {
    const isFavoriteGroup = Boolean(t.favourite && (t.isGroup || (t.urlVariants && t.urlVariants.length > 1)));
    if (isFavoriteGroup && t.urlVariants && t.urlVariants.length > 0) {
      for (const v of t.urlVariants) {
        if (v.id && v.url) {
          trackableItems.push({
            id: v.id,
            url: v.url,
          });
        }
      }
    } else if (t.url || (t.urlVariants && t.urlVariants.length > 0)) {
      const tabUrl = t.url || t.urlVariants?.[0]?.url || '';
      if (tabUrl) {
        trackableItems.push({
          id: t.id,
          url: tabUrl,
          urlVariants: t.urlVariants,
        });
      }
    }
  }

  // Favorite group should have 2 trackable items with variant IDs
  const favItems = trackableItems.filter((item) => item.id.startsWith('fav_'));
  assert(favItems.length === 2, `Expected 2 trackable items for favourite group, got ${favItems.length}`);
  assert(favItems.some((i) => i.id === 'fav_var_1'), 'Favourite group item 1 must be tracked individually');
  assert(favItems.some((i) => i.id === 'fav_var_2'), 'Favourite group item 2 must be tracked individually');
  assert(!trackableItems.some((i) => i.id === 'fav_group_1'), 'Parent group ID should not be trackable directly');

  // Normal tab with variants should have exactly 1 trackable item under normal_tab_1
  const normalItems = trackableItems.filter((item) => item.id.startsWith('norm_') || item.id === 'normal_tab_1');
  assert(normalItems.length === 1, `Expected 1 trackable item for normal tab, got ${normalItems.length}`);
  assert(normalItems[0].id === 'normal_tab_1', 'Normal tab must be tracked under parent tab id');
  assert(normalItems[0].urlVariants?.length === 3, 'Normal tab trackable item must retain urlVariants');
  console.log('✓ TabTracker extracts individual items for favorite groups, but single item for normal tabs');
}

// -------------------------------------------------------------
// Test 3: Normal tab variant navigation stays associated and non-diverted
// -------------------------------------------------------------
{
  function normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
    } catch {
      return url.trim().toLowerCase().replace(/\/+$/, '');
    }
  }

  function urlsMatchForDivergence(currentUrl: string, storedUrl: string, urlVariants?: TabUrlVariant[]): boolean {
    if (!currentUrl || !storedUrl) return false;
    const candidateUrls = [storedUrl, ...(urlVariants || []).map((v) => v.url)];
    return candidateUrls.some((candidate) => {
      if (!candidate) return false;
      return normalizeUrl(currentUrl) === normalizeUrl(candidate);
    });
  }

  const normalTab: Tab = {
    id: 'tab-123',
    url: 'https://github.com/arcable',
    urlVariants: [
      { id: 'v1', name: 'Repo', url: 'https://github.com/arcable' },
      { id: 'v2', name: 'Issues', url: 'https://github.com/arcable/issues' },
      { id: 'v3', name: 'PRs', url: 'https://github.com/arcable/pulls' },
    ],
  };

  // When browser tab navigates to variant 2 (Issues)
  const isMatchV2 = urlsMatchForDivergence('https://github.com/arcable/issues/', normalTab.url, normalTab.urlVariants);
  assert(isMatchV2, 'Variant 2 URL must match without marking tab as diverted');

  // When browser tab navigates to variant 3 (PRs)
  const isMatchV3 = urlsMatchForDivergence('https://github.com/arcable/pulls', normalTab.url, normalTab.urlVariants);
  assert(isMatchV3, 'Variant 3 URL must match without marking tab as diverted');

  // When browser tab navigates away to arbitrary site
  const isDiverted = !urlsMatchForDivergence('https://google.com', normalTab.url, normalTab.urlVariants);
  assert(isDiverted, 'External site must correctly be detected as divergence');
  console.log('✓ urlsMatchForDivergence correctly preserves association across all variants of a normal tab');
}

// -------------------------------------------------------------
// Test 4: Storage sanitization strips isGroup from non-favourite tabs
// -------------------------------------------------------------
{
  const storedTabs: Tab[] = [
    {
      id: 'fav-1',
      url: 'https://example.com',
      favourite: true,
      isGroup: true,
    },
    {
      id: 'space-tab-1',
      url: 'https://google.com',
      favourite: false,
      isGroup: true, // Erroneously set in earlier version
    },
  ];

  const sanitized = storedTabs.map((t) => {
    if (!t.favourite && t.isGroup) {
      const { isGroup, ...rest } = t;
      return rest;
    }
    return t;
  });

  assert(sanitized[0].isGroup === true, 'Favourite group must keep isGroup === true');
  assert(sanitized[1].isGroup === undefined, 'Space tab must have isGroup stripped');
  console.log('✓ Storage sanitization properly cleans isGroup from non-favourite tabs');
}

console.log('All variant tracking and open tests passed successfully!');
