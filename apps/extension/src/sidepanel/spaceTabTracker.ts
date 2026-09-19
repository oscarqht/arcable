import { Tab } from '@arcable/shared/types';

declare const chrome: any;
declare const browser: any;

export const SPACE_LAST_ACTIVE_TAB_KEY = 'arcable_space_last_active_browser_tabs';

/**
 * Maps windowId -> { [spaceId]: browserTabId }
 */
export type WindowSpaceActiveTabMap = Record<number, Record<string, number>>;

// In-memory cache for fast synchronous reads and fallback when storage.session is unavailable
let memorySpaceActiveTabs: WindowSpaceActiveTabMap = {};

/**
 * Test helper to reset internal in-memory state
 */
export function resetMemorySpaceActiveTabsForTest(): void {
  memorySpaceActiveTabs = {};
}

/**
 * Retrieve the full window-space tab map from session storage (with memory fallback).
 */
export async function getSpaceActiveTabsMap(): Promise<WindowSpaceActiveTabMap> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const res = await chrome.storage.session.get(SPACE_LAST_ACTIVE_TAB_KEY);
        if (res && res[SPACE_LAST_ACTIVE_TAB_KEY]) {
          memorySpaceActiveTabs = { ...(res[SPACE_LAST_ACTIVE_TAB_KEY] as WindowSpaceActiveTabMap) };
          return memorySpaceActiveTabs;
        }
      } catch {}
    }
    if (typeof browser !== 'undefined' && (browser as any).storage?.session) {
      try {
        const res = await (browser as any).storage.session.get(SPACE_LAST_ACTIVE_TAB_KEY);
        if (res && res[SPACE_LAST_ACTIVE_TAB_KEY]) {
          memorySpaceActiveTabs = { ...(res[SPACE_LAST_ACTIVE_TAB_KEY] as WindowSpaceActiveTabMap) };
          return memorySpaceActiveTabs;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[SpaceTabTracker] Could not read from session storage:', err);
  }
  return memorySpaceActiveTabs;
}

/**
 * Persist the window-space tab map to session storage.
 */
async function saveSpaceActiveTabsMap(map: WindowSpaceActiveTabMap): Promise<void> {
  memorySpaceActiveTabs = { ...map };
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.set({ [SPACE_LAST_ACTIVE_TAB_KEY]: memorySpaceActiveTabs });
        return;
      } catch {}
    }
    if (typeof browser !== 'undefined' && (browser as any).storage?.session) {
      try {
        await (browser as any).storage.session.set({ [SPACE_LAST_ACTIVE_TAB_KEY]: memorySpaceActiveTabs });
        return;
      } catch {}
    }
  } catch (err) {
    console.warn('[SpaceTabTracker] Could not save to session storage:', err);
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
 */
export async function rememberActiveTabForSpace(
  windowId: number,
  spaceId: string,
  browserTabId: number
): Promise<void> {
  if (!spaceId || browserTabId === undefined || browserTabId <= 0) {
    return;
  }
  const currentMap = await getSpaceActiveTabsMap();
  const windowMap = { ...(currentMap[windowId] || {}) };
  if (windowMap[spaceId] === browserTabId) {
    return;
  }
  windowMap[spaceId] = browserTabId;
  const updatedMap: WindowSpaceActiveTabMap = {
    ...currentMap,
    [windowId]: windowMap,
  };
  await saveSpaceActiveTabsMap(updatedMap);
}

/**
 * Get the remembered browser tab ID for a space in a given window.
 */
export async function getRememberedActiveTabForSpace(
  windowId: number,
  spaceId: string
): Promise<number | null> {
  if (!spaceId) return null;
  const map = await getSpaceActiveTabsMap();
  const tabId = map[windowId]?.[spaceId];
  return typeof tabId === 'number' ? tabId : null;
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
    const updatedSpaceTabs: Record<string, number> = {};
    for (const [spaceId, tabId] of Object.entries(spaceTabs)) {
      if (tabId === browserTabId) {
        changed = true;
      } else {
        updatedSpaceTabs[spaceId] = tabId;
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

/**
 * Activate the remembered browser tab for a space in the given window, if it exists.
 * Verifies that the tab is still open and belongs to this window before activating.
 * If the tab no longer exists or belongs to another window, cleans up the stale reference.
 * Returns true if a remembered tab was found and activated; false otherwise.
 */
export async function activateRememberedTabForSpace(
  windowId: number,
  spaceId: string,
  tabsApi?: any
): Promise<boolean> {
  if (!spaceId) return false;
  const rememberedTabId = await getRememberedActiveTabForSpace(windowId, spaceId);
  if (!rememberedTabId) {
    return false;
  }

  const api = tabsApi || (typeof browser !== 'undefined' && browser.tabs ? browser.tabs : (typeof chrome !== 'undefined' ? chrome.tabs : null));
  if (!api) return false;

  try {
    let tab: any = null;
    if (typeof api.get === 'function') {
      tab = await api.get(rememberedTabId);
    } else if (typeof api.query === 'function') {
      const tabs = await api.query({});
      tab = tabs.find((t: any) => t.id === rememberedTabId);
    }

    if (tab && tab.id !== undefined) {
      // If the tab is in the same window (or windowId is not specified on tab)
      if (tab.windowId === undefined || tab.windowId === windowId) {
        if (!tab.active && typeof api.update === 'function') {
          await api.update(rememberedTabId, { active: true });
        }
        return true;
      }
    }
  } catch (err) {
    // Tab does not exist anymore
  }

  // Stale or invalid tab — clean up
  await forgetBrowserTab(rememberedTabId);
  return false;
}
