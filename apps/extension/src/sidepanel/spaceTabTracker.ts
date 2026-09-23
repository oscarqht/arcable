import { Tab } from '@arcable/shared/types';

declare const chrome: any;
declare const browser: any;

export const SPACE_LAST_ACTIVE_TAB_KEY = 'arcable_space_last_active_browser_tabs';

export interface SpaceActiveTabRecord {
  browserTabId: number;
  tabItemId?: string;
  updatedAt?: number;
}

export type SpaceActiveTabEntry = SpaceActiveTabRecord | number;

/**
 * Maps windowId -> { [spaceId]: SpaceActiveTabEntry }
 */
export type WindowSpaceActiveTabMap = Record<number, Record<string, SpaceActiveTabEntry>>;

// In-memory cache for fast synchronous reads and fallback when storage is unavailable
let memorySpaceActiveTabs: WindowSpaceActiveTabMap = {};

/**
 * Normalize an entry from storage into a SpaceActiveTabRecord.
 * Supports legacy number values for backwards compatibility.
 */
export function normalizeRecord(entry: SpaceActiveTabEntry | undefined | null): SpaceActiveTabRecord | null {
  if (!entry) return null;
  if (typeof entry === 'number') {
    return { browserTabId: entry, updatedAt: 0 };
  }
  if (typeof entry === 'object' && typeof entry.browserTabId === 'number') {
    return entry;
  }
  return null;
}

/**
 * Test helper to reset internal in-memory state
 */
export function resetMemorySpaceActiveTabsForTest(): void {
  memorySpaceActiveTabs = {};
}

/**
 * Retrieve the full window-space tab map from local storage (with session migration & memory fallback).
 */
export async function getSpaceActiveTabsMap(): Promise<WindowSpaceActiveTabMap> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const res = await chrome.storage.local.get(SPACE_LAST_ACTIVE_TAB_KEY);
        if (res && res[SPACE_LAST_ACTIVE_TAB_KEY]) {
          memorySpaceActiveTabs = { ...(res[SPACE_LAST_ACTIVE_TAB_KEY] as WindowSpaceActiveTabMap) };
          return memorySpaceActiveTabs;
        }
      } catch {}
    }
    if (typeof browser !== 'undefined' && (browser as any).storage?.local) {
      try {
        const res = await (browser as any).storage.local.get(SPACE_LAST_ACTIVE_TAB_KEY);
        if (res && res[SPACE_LAST_ACTIVE_TAB_KEY]) {
          memorySpaceActiveTabs = { ...(res[SPACE_LAST_ACTIVE_TAB_KEY] as WindowSpaceActiveTabMap) };
          return memorySpaceActiveTabs;
        }
      } catch {}
    }

    // Migration fallback from session storage if local is not populated yet
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const res = await chrome.storage.session.get(SPACE_LAST_ACTIVE_TAB_KEY);
        if (res && res[SPACE_LAST_ACTIVE_TAB_KEY]) {
          memorySpaceActiveTabs = { ...(res[SPACE_LAST_ACTIVE_TAB_KEY] as WindowSpaceActiveTabMap) };
          void saveSpaceActiveTabsMap(memorySpaceActiveTabs);
          return memorySpaceActiveTabs;
        }
      } catch {}
    }
    if (typeof browser !== 'undefined' && (browser as any).storage?.session) {
      try {
        const res = await (browser as any).storage.session.get(SPACE_LAST_ACTIVE_TAB_KEY);
        if (res && res[SPACE_LAST_ACTIVE_TAB_KEY]) {
          memorySpaceActiveTabs = { ...(res[SPACE_LAST_ACTIVE_TAB_KEY] as WindowSpaceActiveTabMap) };
          void saveSpaceActiveTabsMap(memorySpaceActiveTabs);
          return memorySpaceActiveTabs;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[SpaceTabTracker] Could not read from local storage:', err);
  }
  return memorySpaceActiveTabs;
}

/**
 * Persist the window-space tab map to local storage.
 */
async function saveSpaceActiveTabsMap(map: WindowSpaceActiveTabMap): Promise<void> {
  memorySpaceActiveTabs = { ...map };
  let saved = false;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.set({ [SPACE_LAST_ACTIVE_TAB_KEY]: memorySpaceActiveTabs });
        saved = true;
      } catch {}
    }
    if (!saved && typeof browser !== 'undefined' && (browser as any).storage?.local) {
      try {
        await (browser as any).storage.local.set({ [SPACE_LAST_ACTIVE_TAB_KEY]: memorySpaceActiveTabs });
        saved = true;
      } catch {}
    }
  } catch (err) {
    console.warn('[SpaceTabTracker] Could not save to local storage:', err);
  }
}

/**
 * Resolves whether a tab item belongs to a space.
 * Only tabs directly belonging to the space (including folder items) qualify.
 * Favorite tabs (global) and tmp tabs (temporary) are excluded.
 */
export function resolveSpaceIdForTabItem(tabItemId: string, workspaceTabs: Tab[]): string | null {
  if (!tabItemId || !Array.isArray(workspaceTabs) || tabItemId.startsWith('tmp_')) {
    return null;
  }
  const tab = workspaceTabs.find(
    (t) => t.id === tabItemId || t.urlVariants?.some((v) => v.id === tabItemId)
  );
  if (!tab || tab.favourite) {
    return null;
  }
  return tab.parentSpaceId || null;
}

/**
 * Remember the active browser tab for a specific space in a specific browser window.
 * Saves both numeric browserTabId and the workspace tabItemId to survive reloads & restarts.
 */
export async function rememberActiveTabForSpace(
  windowId: number,
  spaceId: string,
  browserTabId: number,
  tabItemId?: string
): Promise<void> {
  if (!spaceId || browserTabId === undefined || browserTabId <= 0) {
    return;
  }
  const currentMap = await getSpaceActiveTabsMap();
  const windowMap = { ...(currentMap[windowId] || {}) };
  const existing = normalizeRecord(windowMap[spaceId]);
  const now = Date.now();

  windowMap[spaceId] = {
    browserTabId,
    tabItemId: tabItemId || existing?.tabItemId,
    updatedAt: now,
  };

  const updatedMap: WindowSpaceActiveTabMap = {
    ...currentMap,
    [windowId]: windowMap,
  };
  await saveSpaceActiveTabsMap(updatedMap);
}

/**
 * Get the remembered SpaceActiveTabRecord for a space in a given window.
 * If allowFallback is true, falls back to the most recent record across all windows if current window has no record.
 */
export async function getRememberedActiveTabRecordForSpace(
  windowId: number,
  spaceId: string,
  allowFallback: boolean = false
): Promise<SpaceActiveTabRecord | null> {
  if (!spaceId) return null;
  const map = await getSpaceActiveTabsMap();
  const entry = map[windowId]?.[spaceId];
  const normalized = normalizeRecord(entry);
  if (normalized) {
    return normalized;
  }

  if (!allowFallback) {
    return null;
  }

  // Cross-window fallback: find the most recently active record for this space
  let bestCandidate: SpaceActiveTabRecord | null = null;
  let bestTimestamp = -1;
  for (const [winIdStr, spaceTabs] of Object.entries(map)) {
    if (Number(winIdStr) === windowId) continue;
    const candidateEntry = spaceTabs[spaceId];
    const rec = normalizeRecord(candidateEntry);
    if (rec) {
      const ts = rec.updatedAt ?? 0;
      if (ts > bestTimestamp) {
        bestTimestamp = ts;
        bestCandidate = rec;
      }
    }
  }

  return bestCandidate;
}

/**
 * Get the remembered browser tab ID for a space in a given window.
 */
export async function getRememberedActiveTabForSpace(
  windowId: number,
  spaceId: string,
  allowFallback: boolean = false
): Promise<number | null> {
  const record = await getRememberedActiveTabRecordForSpace(windowId, spaceId, allowFallback);
  return record ? record.browserTabId : null;
}

/**
 * Forget any remembered references to a closed browser tab ID across all windows and spaces.
 */
export async function forgetBrowserTab(browserTabId: number): Promise<void> {
  if (browserTabId === undefined || browserTabId <= 0) return;
  const currentMap = await getSpaceActiveTabsMap();
  let changed = false;
  const updatedMap: WindowSpaceActiveTabMap = {};

  for (const [winIdStr, spaceTabs] of Object.entries(currentMap)) {
    const winId = Number(winIdStr);
    const updatedSpaceTabs: Record<string, SpaceActiveTabEntry> = {};
    for (const [spaceId, entry] of Object.entries(spaceTabs)) {
      const rec = normalizeRecord(entry);
      if (rec && rec.browserTabId === browserTabId) {
        changed = true;
      } else {
        updatedSpaceTabs[spaceId] = entry;
      }
    }
    if (Object.keys(updatedSpaceTabs).length > 0) {
      updatedMap[winId] = updatedSpaceTabs;
    }
  }

  if (changed) {
    await saveSpaceActiveTabsMap(updatedMap);
  }
}

export type TabAssociationLookup = (
  tabItemId: string
) =>
  | Promise<{ browserTabId?: number; windowId?: number } | undefined>
  | { browserTabId?: number; windowId?: number }
  | undefined;

/**
 * Activate the remembered browser tab for a space in the given window, if it exists.
 * Verifies that the tab is still open and belongs to this window before activating.
 * If the tab was closed or tab IDs changed on restart, checks if tabItemId has an open associated tab.
 * Returns true if a remembered tab was found and activated; false otherwise.
 */
export async function activateRememberedTabForSpace(
  windowId: number,
  spaceId: string,
  tabsApi?: any,
  lookupAssociatedTab?: TabAssociationLookup
): Promise<boolean> {
  if (!spaceId) return false;
  const record = await getRememberedActiveTabRecordForSpace(windowId, spaceId, true);
  if (!record) {
    return false;
  }

  const api =
    tabsApi ||
    (typeof browser !== 'undefined' && browser.tabs
      ? browser.tabs
      : typeof chrome !== 'undefined'
      ? chrome.tabs
      : null);
  if (!api) return false;

  const tryActivateBrowserTab = async (tabId: number): Promise<boolean> => {
    try {
      let tab: any = null;
      if (typeof api.get === 'function') {
        tab = await api.get(tabId);
      } else if (typeof api.query === 'function') {
        const tabs = await api.query({});
        tab = tabs.find((t: any) => t.id === tabId);
      }

      if (tab && tab.id !== undefined) {
        if (tab.windowId === undefined || tab.windowId === windowId) {
          if (!tab.active && typeof api.update === 'function') {
            await api.update(tabId, { active: true });
          }
          return true;
        }
      }
    } catch {}
    return false;
  };

  // 1. Try recorded browserTabId
  if (record.browserTabId && (await tryActivateBrowserTab(record.browserTabId))) {
    // If it was from cross-window fallback, record it for this window
    await rememberActiveTabForSpace(windowId, spaceId, record.browserTabId, record.tabItemId);
    return true;
  }

  // 2. If recorded browserTabId failed (e.g. browser restart renumbered tab IDs), try resolving via tabItemId
  if (record.tabItemId) {
    let resolvedBrowserTabId: number | undefined;

    // Check custom lookup first if provided (e.g. from App.tsx tabAssociations)
    if (lookupAssociatedTab) {
      try {
        const assoc = await lookupAssociatedTab(record.tabItemId);
        if (assoc && assoc.browserTabId) {
          resolvedBrowserTabId = assoc.browserTabId;
        }
      } catch {}
    }

    // Fallback: check storage.local 'arcable_tab_associations'
    if (!resolvedBrowserTabId) {
      try {
        let assocMap: Record<string, any> | undefined;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const res = await chrome.storage.local.get('arcable_tab_associations');
          assocMap = res?.arcable_tab_associations;
        } else if (typeof browser !== 'undefined' && (browser as any).storage?.local) {
          const res = await (browser as any).storage.local.get('arcable_tab_associations');
          assocMap = res?.arcable_tab_associations;
        }
        if (assocMap && assocMap[record.tabItemId]?.browserTabId) {
          resolvedBrowserTabId = assocMap[record.tabItemId].browserTabId;
        }
      } catch {}
    }

    if (resolvedBrowserTabId && (await tryActivateBrowserTab(resolvedBrowserTabId))) {
      await rememberActiveTabForSpace(windowId, spaceId, resolvedBrowserTabId, record.tabItemId);
      return true;
    }
  }

  // Stale or invalid tab — clean up
  if (record.browserTabId) {
    await forgetBrowserTab(record.browserTabId);
  }
  return false;
}
