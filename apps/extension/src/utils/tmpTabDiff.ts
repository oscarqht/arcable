import type { TmpTab } from '@arcable/shared/types';

const TMP_TAB_CONTENT_KEYS: Array<Exclude<keyof TmpTab, 'updatedAt'>> = [
  'id',
  'url',
  'title',
  'customTitle',
  'favIconUrl',
  'browserTabId',
  'windowId',
  'badge',
  'deviceId',
  'deviceName',
  'deviceType',
  'spaceId',
  'createdAt',
];

function hasSameTmpTabContent(left: TmpTab, right: TmpTab): boolean {
  return TMP_TAB_CONTENT_KEYS.every((key) => Object.is(left[key], right[key]));
}

/**
 * Keeps temporary-tab snapshots stable when a tracker pass observes no real
 * browser-tab changes. `updatedAt` is deliberately ignored as an input because
 * regenerating that timestamp must not manufacture a storage change by itself.
 */
export function reconcileTmpTabs(
  previous: TmpTab[],
  candidates: TmpTab[],
  now: number = Date.now()
): { tabs: TmpTab[]; changed: boolean } {
  const previousById = new Map(previous.map((tab) => [tab.id, tab]));
  let changed = previous.length !== candidates.length;

  const tabs = candidates.map((candidate) => {
    const existing = previousById.get(candidate.id);
    if (existing && hasSameTmpTabContent(existing, candidate)) return existing;
    changed = true;
    return {
      ...candidate,
      createdAt: candidate.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
  });

  if (!changed) {
    changed = tabs.some((tab, index) => tab !== previous[index]);
  }

  return { tabs, changed };
}

/** Browser metadata needed to refresh already-tracked temporary tabs. */
export interface BrowserTmpTabSnapshot {
  id?: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  status?: string;
}

/**
 * Refreshes browser-owned metadata without recreating a temporary tab. A
 * loading tab can report its old URL/title alongside a new pending URL, so the
 * destination takes precedence and the old title is withheld until it loads.
 */
export function reconcileTmpTabsWithBrowserTabs(
  previous: TmpTab[],
  browserTabs: BrowserTmpTabSnapshot[],
  now: number = Date.now()
): { tabs: TmpTab[]; changed: boolean } {
  const browserTabsById = new Map(
    browserTabs
      .filter((tab): tab is BrowserTmpTabSnapshot & { id: number } => typeof tab.id === 'number')
      .map((tab) => [tab.id, tab])
  );
  let changed = false;
  const tabs: TmpTab[] = [];

  for (const existing of previous) {
    if (typeof existing.browserTabId !== 'number') {
      tabs.push(existing);
      continue;
    }

    const browserTab = browserTabsById.get(existing.browserTabId);
    if (!browserTab) {
      changed = true;
      continue;
    }

    const pendingNavigation = browserTab.status === 'loading' && Boolean(browserTab.pendingUrl);
    const nextUrl = (pendingNavigation ? browserTab.pendingUrl : browserTab.url || browserTab.pendingUrl) || existing.url;
    const urlChanged = nextUrl !== existing.url;
    const rawTitle = browserTab.title?.trim();
    const staleLoadingTitle = urlChanged && browserTab.status === 'loading' && rawTitle === existing.title;
    const nextTitle = staleLoadingTitle
      ? undefined
      : rawTitle && rawTitle !== 'about:blank' && rawTitle !== nextUrl
        ? rawTitle
        : urlChanged ? undefined : existing.title;
    const staleLoadingFavicon =
      urlChanged && browserTab.status === 'loading' && browserTab.favIconUrl === existing.favIconUrl;
    const nextFavIconUrl = staleLoadingFavicon
      ? undefined
      : browserTab.favIconUrl || (urlChanged ? undefined : existing.favIconUrl);

    if (
      nextUrl === existing.url &&
      nextTitle === existing.title &&
      nextFavIconUrl === existing.favIconUrl
    ) {
      tabs.push(existing);
      continue;
    }

    changed = true;
    tabs.push({
      ...existing,
      url: nextUrl,
      title: nextTitle,
      favIconUrl: nextFavIconUrl,
      updatedAt: now,
    });
  }

  return { tabs, changed };
}
