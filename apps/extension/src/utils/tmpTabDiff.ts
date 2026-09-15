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
