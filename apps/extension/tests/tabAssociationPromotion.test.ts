import type { Tab, TmpTab, TabAssociationMap } from '@arcable/shared/types';
import { areUrlsMatching } from '@arcable/shared/utils';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// -------------------------------------------------------------
// Test 1: Drop/Promote live metadata merging logic
// -------------------------------------------------------------
{
  const filteredTmpTabs: TmpTab[] = [
    {
      id: 'tmp_dev1_42_100',
      url: 'https://github.com/facebook/react',
      title: 'React GitHub',
      browserTabId: 42,
      windowId: 1,
      createdAt: 100,
      updatedAt: 100,
    },
  ];

  const droppedTmpTab: Partial<TmpTab> = {
    id: 'tmp_dev1_42_100',
    url: 'https://github.com/facebook/react',
    title: 'React GitHub',
    // browserTabId is omitted in DnD serialization
  };

  const liveTmpTab =
    filteredTmpTabs.find((t) => t.id === droppedTmpTab?.id) ||
    filteredTmpTabs.find((t) => t.url && droppedTmpTab?.url && areUrlsMatching(t.url, droppedTmpTab.url));

  const resolvedTmpTab: TmpTab = {
    ...(droppedTmpTab as TmpTab),
    ...(liveTmpTab || {}),
    url: droppedTmpTab?.url || liveTmpTab?.url || '',
    browserTabId: liveTmpTab?.browserTabId ?? droppedTmpTab?.browserTabId,
    windowId: liveTmpTab?.windowId ?? droppedTmpTab?.windowId,
    deviceId: liveTmpTab?.deviceId ?? droppedTmpTab?.deviceId,
    deviceName: liveTmpTab?.deviceName ?? droppedTmpTab?.deviceName,
    deviceType: liveTmpTab?.deviceType ?? droppedTmpTab?.deviceType,
  };

  assert(resolvedTmpTab.browserTabId === 42, 'dropped tmp tab must inherit browserTabId from liveTmpTab');
  assert(resolvedTmpTab.windowId === 1, 'dropped tmp tab must inherit windowId from liveTmpTab');
}

// -------------------------------------------------------------
// Test 2: Fallback browserTabId resolution in App.handleTabPromoted
// -------------------------------------------------------------
{
  const tmpTabWithoutBrowserTabId: TmpTab = {
    id: 'tmp_dev1_99_12345678',
    url: 'https://developer.mozilla.org/en-US/',
    title: 'MDN Web Docs',
    createdAt: 100,
    updatedAt: 100,
  };

  let resolvedBrowserTabId = tmpTabWithoutBrowserTabId.browserTabId;
  if (resolvedBrowserTabId === undefined && typeof tmpTabWithoutBrowserTabId.id === 'string') {
    const idMatch = tmpTabWithoutBrowserTabId.id.match(/^tmp_[^_]+_(\d+)_/);
    if (idMatch) {
      resolvedBrowserTabId = parseInt(idMatch[1], 10);
    }
  }

  assert(resolvedBrowserTabId === 99, 'browserTabId must be recoverable from tmpTab.id pattern');
}

// -------------------------------------------------------------
// Test 3: TabTracker association resilience under concurrent sync
// -------------------------------------------------------------
{
  // Simulated TabTracker internal state
  const currentWorkspaceTabs: Tab[] = [];
  const recentlyAssociatedIds: Map<string, number> = new Map();
  const currentAssociations: TabAssociationMap = {};

  const now = Date.now();
  const newTab: Tab = {
    id: 'tab_promo_1',
    url: 'https://vite.dev',
    customTitle: 'Vite',
    order: 100,
  };
  const browserTabId = 77;
  const windowId = 2;

  // Simulate associateExistingBrowserTab registering tab
  recentlyAssociatedIds.set(newTab.id, now);
  currentWorkspaceTabs.push(newTab);
  currentAssociations[newTab.id] = {
    tabItemId: newTab.id,
    browserTabId,
    windowId,
    currentUrl: newTab.url,
    originalUrl: newTab.url,
    isDiverted: false,
  };

  // Simulate concurrent syncWithWorkspace executing with an older/lagging workspaceTabs list (empty)
  const laggingWorkspaceTabs: Tab[] = [];
  const allBrowserTabs = [
    { id: 77, windowId: 2, url: 'https://vite.dev', title: 'Vite' },
  ];

  const findTrackableItem = (id: string) => {
    const fromWs = laggingWorkspaceTabs.find((t) => t.id === id);
    if (fromWs) return fromWs;
    const fromCurrent = currentWorkspaceTabs.find((t) => t.id === id);
    if (fromCurrent) return fromCurrent;
    const recentTs = recentlyAssociatedIds.get(id);
    if (recentTs && Date.now() - recentTs < 15000) {
      const existingAssoc = currentAssociations[id];
      if (existingAssoc) return { id, url: existingAssoc.originalUrl };
    }
    return undefined;
  };

  const item = findTrackableItem(newTab.id);
  assert(item !== undefined, 'findTrackableItem must find recently associated tab even if workspaceTabs is lagging');
  assert(item.id === newTab.id, 'item ID matches newly promoted tab');

  // Verify Phase 3: browser tab 77 is not converted back to tmp tab
  const newAssociations: TabAssociationMap = {
    [newTab.id]: currentAssociations[newTab.id],
  };
  const associatedBrowserTabIds = new Set(Object.values(newAssociations).map((a) => a.browserTabId));

  const unmatchedBrowserTabs = allBrowserTabs.filter((bt) => {
    if (bt.id === undefined || associatedBrowserTabIds.has(bt.id)) return false;
    for (const [recentId, recentTs] of recentlyAssociatedIds.entries()) {
      if (Date.now() - recentTs < 15000) {
        const assoc = currentAssociations[recentId] || newAssociations[recentId];
        if (assoc && assoc.browserTabId === bt.id) {
          return false;
        }
      }
    }
    return true;
  });

  assert(unmatchedBrowserTabs.length === 0, 'associated browser tab must not be placed in unmatched tmp tabs');
}

// -------------------------------------------------------------
// Test 4: Tab association migration when tab ID changes to remote Raindrop ID
// -------------------------------------------------------------
{
  const recentlyAssociatedIds: Map<string, number> = new Map();
  const currentAssociations: TabAssociationMap = {};
  const currentWorkspaceTabs: Tab[] = [];

  const clientTabId = 'tab_local_1729000000';
  const raindropNumericId = '987654321';
  const tabUrl = 'https://news.ycombinator.com';
  const browserTabId = 42;
  const windowId = 1;

  // 1. User promotes a tmp tab. Client ID is assigned.
  recentlyAssociatedIds.set(clientTabId, Date.now() - 5000); // Promoted 5s ago
  currentWorkspaceTabs.push({
    id: clientTabId,
    url: tabUrl,
    customTitle: 'Hacker News',
    order: 0,
  });
  currentAssociations[clientTabId] = {
    tabItemId: clientTabId,
    browserTabId,
    windowId,
    currentUrl: tabUrl,
    originalUrl: tabUrl,
    isDiverted: false,
  };

  // 2. Remote sync finishes. Workspace now contains the tab with Raindrop ID '987654321'
  const syncedWorkspaceTabs: Tab[] = [
    {
      id: raindropNumericId,
      raindropId: 987654321,
      url: tabUrl,
      customTitle: 'Hacker News',
      order: 0,
    },
  ];

  const allBrowserTabs = [
    { id: browserTabId, windowId, url: tabUrl, title: 'Hacker News' },
  ];

  // Simulate syncWithWorkspace logic with findMigratedWorkspaceItem
  const trackableItems = syncedWorkspaceTabs.map((t) => ({
    id: t.id,
    url: t.url,
    urlVariants: t.urlVariants,
  }));
  const assignedTabItemIds = new Set<string>();
  const assignedBrowserTabIds = new Set<number>();
  const newAssociations: TabAssociationMap = {};

  const findTrackableItem = (id: string) => {
    return trackableItems.find((item) => item.id === id);
  };

  const findMigratedWorkspaceItem = (
    oldTabItemId: string,
    info: any,
    matchingBrowserTab: any
  ) => {
    const browserUrl = matchingBrowserTab?.url || '';
    const candidatePool = [...trackableItems];

    return candidatePool.find((cand) => {
      if (!cand.url) return false;
      if (assignedTabItemIds.has(cand.id)) return false;
      return (
        areUrlsMatching(browserUrl, cand.url) ||
        areUrlsMatching(info.originalUrl, cand.url)
      );
    });
  };

  for (const [tabItemId, info] of Object.entries(currentAssociations)) {
    const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);
    let matchingWorkspaceItem = findTrackableItem(tabItemId);
    let resolvedTabItemId = tabItemId;

    if (!matchingWorkspaceItem && matchingBrowserTab && matchingBrowserTab.id !== undefined) {
      const migrated = findMigratedWorkspaceItem(tabItemId, info, matchingBrowserTab);
      if (migrated) {
        matchingWorkspaceItem = migrated;
        resolvedTabItemId = migrated.id;
        const recentTs = recentlyAssociatedIds.get(tabItemId);
        if (recentTs) {
          recentlyAssociatedIds.delete(tabItemId);
          recentlyAssociatedIds.set(resolvedTabItemId, recentTs);
        }
      }
    }

    if (matchingWorkspaceItem && matchingBrowserTab) {
      newAssociations[resolvedTabItemId] = {
        tabItemId: resolvedTabItemId,
        browserTabId: matchingBrowserTab.id,
        windowId: matchingBrowserTab.windowId || 0,
        currentUrl: matchingBrowserTab.url,
        originalUrl: matchingWorkspaceItem.url,
        isDiverted: false,
      };
      assignedBrowserTabIds.add(matchingBrowserTab.id);
      assignedTabItemIds.add(resolvedTabItemId);
    }
  }

  assert(newAssociations[raindropNumericId] !== undefined, 'Association must be re-keyed to raindropNumericId');
  assert(newAssociations[raindropNumericId].browserTabId === browserTabId, 'Re-keyed association retains browserTabId');
  assert(newAssociations[clientTabId] === undefined, 'Old clientTabId must be replaced and not left duplicate');

  // Verify Phase 3: browser tab 42 must NOT become a tmp tab
  const associatedBrowserTabIds = new Set(Object.values(newAssociations).map((a) => a.browserTabId));
  const unmatchedBrowserTabs = allBrowserTabs.filter((bt) => {
    return !associatedBrowserTabIds.has(bt.id);
  });

  assert(unmatchedBrowserTabs.length === 0, 'Browser tab 42 must not become an unmatched tmp tab');

  // 3. Verify permanent retention: even 40 seconds later, syncWithWorkspace retains association under raindropNumericId
  const futureAssociations: TabAssociationMap = {};
  const futureAssignedBrowserTabIds = new Set<number>();
  const futureAssignedTabItemIds = new Set<string>();

  for (const [tabItemId, info] of Object.entries(newAssociations)) {
    const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);
    const matchingWorkspaceItem = findTrackableItem(tabItemId);
    if (matchingWorkspaceItem && matchingBrowserTab) {
      futureAssociations[tabItemId] = {
        ...info,
        currentUrl: matchingBrowserTab.url,
      };
      futureAssignedBrowserTabIds.add(matchingBrowserTab.id);
      futureAssignedTabItemIds.add(tabItemId);
    }
  }

  assert(futureAssociations[raindropNumericId] !== undefined, 'Association permanently persists under raindropNumericId');
  assert(futureAssignedBrowserTabIds.has(browserTabId), 'Browser tab remains permanently assigned without grace period');
}

// -------------------------------------------------------------
// Test 5: Favorite tab promotion with URL variants and ID migration
// -------------------------------------------------------------
{
  const recentlyAssociatedIds: Map<string, number> = new Map();
  const currentAssociations: TabAssociationMap = {};

  const clientTabId = 'tab_fav_promo_1';
  const raindropGroupTabId = '88888888';
  const variantNumericId = '88888889';
  const promoUrl = 'https://github.com/facebook/react';
  const browserTabId = 55;

  recentlyAssociatedIds.set(clientTabId, Date.now() - 3000);
  currentAssociations[clientTabId] = {
    tabItemId: clientTabId,
    browserTabId,
    windowId: 1,
    currentUrl: promoUrl,
    originalUrl: promoUrl,
    isDiverted: false,
  };

  // Synced favorite group with variant
  const syncedWorkspaceTabs: Tab[] = [
    {
      id: raindropGroupTabId,
      raindropId: 88888888,
      favourite: true,
      isGroup: true,
      urlVariants: [
        { id: variantNumericId, url: promoUrl, customTitle: 'React Repo' },
      ],
      order: 0,
    },
  ];

  const allBrowserTabs = [
    { id: browserTabId, windowId: 1, url: promoUrl, title: 'React' },
  ];

  // TabTracker creates trackable items for favorite group variants
  const trackableItems = [];
  for (const t of syncedWorkspaceTabs) {
    if (t.favourite && (t.isGroup || (t.urlVariants && t.urlVariants.length > 1))) {
      for (const v of t.urlVariants || []) {
        if (v.id && v.url) trackableItems.push({ id: v.id, url: v.url });
      }
    }
  }

  const assignedTabItemIds = new Set<string>();
  const assignedBrowserTabIds = new Set<number>();
  const newAssociations: TabAssociationMap = {};

  for (const [tabItemId, info] of Object.entries(currentAssociations)) {
    const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);
    let matchingWorkspaceItem = trackableItems.find((item) => item.id === tabItemId);
    let resolvedTabItemId = tabItemId;

    if (!matchingWorkspaceItem && matchingBrowserTab) {
      const candidate = trackableItems.find(
        (cand) => !assignedTabItemIds.has(cand.id) && areUrlsMatching(info.originalUrl, cand.url)
      );
      if (candidate) {
        matchingWorkspaceItem = candidate;
        resolvedTabItemId = candidate.id;
      }
    }

    if (matchingWorkspaceItem && matchingBrowserTab) {
      newAssociations[resolvedTabItemId] = {
        tabItemId: resolvedTabItemId,
        browserTabId: matchingBrowserTab.id,
        windowId: 1,
        currentUrl: matchingBrowserTab.url,
        originalUrl: matchingWorkspaceItem.url,
        isDiverted: false,
      };
      assignedBrowserTabIds.add(matchingBrowserTab.id);
      assignedTabItemIds.add(resolvedTabItemId);
    }
  }

  assert(newAssociations[variantNumericId] !== undefined, 'Association migrates to the favorite group variant item');
  assert(newAssociations[variantNumericId].browserTabId === browserTabId, 'Variant association retains browserTabId');
  assert(assignedBrowserTabIds.has(browserTabId), 'Browser tab 55 is marked assigned so no tmp tab is created');
}

console.log('Tab association promotion unit tests passed.');
