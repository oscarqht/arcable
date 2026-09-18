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

console.log('Tab association promotion unit tests passed.');
