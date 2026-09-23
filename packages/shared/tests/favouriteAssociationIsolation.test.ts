import type { Tab, TabUrlVariant } from '../src/types/workspace';
import type { TabAssociationMap, AudibleTab } from '../src/types/tabTracker';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running favouriteAssociationIsolation tests...');

// Logic matching packages/shared/src/components/workspace/FavouriteTabsShelf.tsx
function checkFavouriteGroupAssociation(
  groupTab: Tab,
  tabAssociations: TabAssociationMap,
  audibleTabs?: AudibleTab[]
): { isGroupAssociated: boolean; groupAudibleInfo: AudibleTab | undefined } {
  const validVariants = (groupTab.urlVariants || []).filter((v) => Boolean(v.url));
  let isGroupAssociated = false;
  let groupAudibleInfo: AudibleTab | undefined = undefined;

  if (tabAssociations) {
    if (tabAssociations[groupTab.id]) {
      isGroupAssociated = true;
      if (!groupAudibleInfo && audibleTabs) {
        groupAudibleInfo = audibleTabs.find((a) => a.id === tabAssociations[groupTab.id]?.browserTabId);
      }
    }
    for (const v of validVariants) {
      if (v.id && tabAssociations[v.id]) {
        isGroupAssociated = true;
        if (!groupAudibleInfo && audibleTabs) {
          groupAudibleInfo = audibleTabs.find((a) => a.id === tabAssociations[v.id]?.browserTabId);
        }
      }
      if (isGroupAssociated && groupAudibleInfo) break;
    }
  }

  return { isGroupAssociated, groupAudibleInfo };
}

// Logic matching packages/shared/src/components/workspace/FavouriteGroupPopover.tsx
function checkFavouriteVariantAssociation(
  variant: TabUrlVariant,
  tabAssociations: TabAssociationMap,
  highlightedTabId?: string | null
): { isAssociated: boolean; isItemHighlighted: boolean } {
  const itemAssoc = variant.id && tabAssociations ? tabAssociations[variant.id] : undefined;
  const isAssociated = Boolean(itemAssoc);
  const isItemHighlighted = Boolean(
    highlightedTabId && (
      variant.id === highlightedTabId ||
      (itemAssoc && tabAssociations && tabAssociations[highlightedTabId]?.browserTabId === itemAssoc.browserTabId)
    )
  );
  return { isAssociated, isItemHighlighted };
}

// -------------------------------------------------------------
// Test 1: Saved space tab has browser tab open with SAME URL as favourite group variant.
// The favourite group and variant must NOT be associated or highlighted.
// -------------------------------------------------------------
{
  const sharedUrl = 'https://github.com/arcable/arcable';

  const favGroupTab: Tab = {
    id: 'fav-group-1',
    url: sharedUrl,
    favourite: true,
    isGroup: true,
    pinned: false,
    urlVariants: [
      { id: 'fav-var-1', name: 'Arcable Repo', url: sharedUrl },
      { id: 'fav-var-2', name: 'Documentation', url: 'https://docs.arcable.com' },
    ],
  };

  // Associated tab belongs to space tab 'space-tab-999', NOT 'fav-var-1'
  const tabAssociations: TabAssociationMap = {
    'space-tab-999': {
      tabItemId: 'space-tab-999',
      browserTabId: 42,
      windowId: 1,
      currentUrl: sharedUrl,
      originalUrl: sharedUrl,
      isDiverted: false,
    },
  };

  const audibleTabs: AudibleTab[] = [
    { id: 42, url: sharedUrl, title: 'Arcable', audible: true, muted: false },
  ];

  // 1. Group level shelf check
  const groupStatus = checkFavouriteGroupAssociation(favGroupTab, tabAssociations, audibleTabs);
  assert(groupStatus.isGroupAssociated === false, 'Favourite group must NOT be associated when only space tab with same URL is open');
  assert(groupStatus.groupAudibleInfo === undefined, 'Favourite group must NOT inherit audible info from space tab with same URL');

  // 2. Variant level popover check
  const variantStatus = checkFavouriteVariantAssociation(
    favGroupTab.urlVariants![0],
    tabAssociations,
    'space-tab-999' // currently highlighted active tab in browser
  );
  assert(variantStatus.isAssociated === false, 'Favourite variant must NOT be associated when only space tab with same URL is open');
  assert(variantStatus.isItemHighlighted === false, 'Favourite variant must NOT be highlighted when space tab is active in browser');

  console.log('✓ Space tab with same URL does NOT light up favourite group or favourite variant');
}

// -------------------------------------------------------------
// Test 2: When favourite variant itself is opened, it lights up correctly.
// -------------------------------------------------------------
{
  const sharedUrl = 'https://github.com/arcable/arcable';

  const favGroupTab: Tab = {
    id: 'fav-group-1',
    url: sharedUrl,
    favourite: true,
    isGroup: true,
    pinned: false,
    urlVariants: [
      { id: 'fav-var-1', name: 'Arcable Repo', url: sharedUrl },
    ],
  };

  const tabAssociations: TabAssociationMap = {
    'fav-var-1': {
      tabItemId: 'fav-var-1',
      browserTabId: 101,
      windowId: 1,
      currentUrl: sharedUrl,
      originalUrl: sharedUrl,
      isDiverted: false,
    },
  };

  const audibleTabs: AudibleTab[] = [
    { id: 101, url: sharedUrl, title: 'Arcable', audible: true, muted: false },
  ];

  // 1. Group level check
  const groupStatus = checkFavouriteGroupAssociation(favGroupTab, tabAssociations, audibleTabs);
  assert(groupStatus.isGroupAssociated === true, 'Favourite group MUST be associated when its own variant is open');
  assert(groupStatus.groupAudibleInfo?.id === 101, 'Favourite group must have audible info when its own variant tab is playing audio');

  // 2. Variant level check
  const variantStatus = checkFavouriteVariantAssociation(
    favGroupTab.urlVariants![0],
    tabAssociations,
    'fav-var-1'
  );
  assert(variantStatus.isAssociated === true, 'Favourite variant MUST be associated when open in browser');
  assert(variantStatus.isItemHighlighted === true, 'Favourite variant MUST be highlighted when active in browser');

  console.log('✓ Favourite group and variant light up correctly when favourite variant itself is open');
}

console.log('All favouriteAssociationIsolation tests passed successfully!');
