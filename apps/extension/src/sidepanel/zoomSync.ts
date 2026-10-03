import { useEffect } from 'react';
import { browser, getActiveTab, isZenBrowser } from '../utils/browser';

export const STORAGE_KEY_ZEN_ZOOM_SYNC = 'arcable_zen_zoom_sync';

/**
 * Scales the extension UI to match the target zoom factor using CSS transform (Option A).
 * Adjusts width and height inversely so the layout stays fluid and doesn't get clipped or overflow.
 */
export function applyZoomToExtensionPage(zoomFactor: number): void {
  if (typeof document === 'undefined' || !document.documentElement) return;

  const factor = !zoomFactor || zoomFactor <= 0 || !Number.isFinite(zoomFactor) ? 1 : zoomFactor;

  // Set CSS variable for child components to inspect
  document.documentElement.style.setProperty('--extension-zoom-factor', String(factor));

  // If 1.0 (default 100%), remove inline styles to avoid unnecessary CSS stacking contexts
  if (Math.abs(factor - 1) < 0.001) {
    document.documentElement.style.transform = '';
    document.documentElement.style.transformOrigin = '';
    document.documentElement.style.width = '';
    document.documentElement.style.height = '';
  } else {
    document.documentElement.style.transform = `scale(${factor})`;
    document.documentElement.style.transformOrigin = 'top left';
    document.documentElement.style.width = `${100 / factor}%`;
    document.documentElement.style.height = `${100 / factor}%`;
  }
}

/**
 * Safely fetches the zoom factor of the active tab (or specified tabId).
 * Supports webextension-polyfill (Firefox / Zen Browser) and Chrome API fallback.
 */
export async function getActiveTabZoom(tabId?: number): Promise<number> {
  // 1. Try browser.tabs.getZoom()
  try {
    if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.getZoom === 'function') {
      const zoom = tabId !== undefined ? await browser.tabs.getZoom(tabId) : await browser.tabs.getZoom();
      if (typeof zoom === 'number' && zoom > 0 && Number.isFinite(zoom)) {
        return zoom;
      }
    }
  } catch {
    // If calling without tabId failed, try with active tab ID
    if (tabId === undefined) {
      try {
        const activeTab = await getActiveTab();
        if (activeTab?.id !== undefined && typeof browser !== 'undefined' && browser.tabs) {
          const zoom = await browser.tabs.getZoom(activeTab.id);
          if (typeof zoom === 'number' && zoom > 0 && Number.isFinite(zoom)) {
            return zoom;
          }
        }
      } catch {}
    }
  }

  // 2. Try chrome.tabs.getZoom (Chromium fallback)
  if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.getZoom === 'function') {
    return new Promise<number>((resolve) => {
      try {
        const cb = (zoom: number) => {
          if (chrome.runtime?.lastError || !zoom || zoom <= 0 || !Number.isFinite(zoom)) {
            resolve(1);
          } else {
            resolve(zoom);
          }
        };
        if (tabId !== undefined) {
          chrome.tabs.getZoom(tabId, cb);
        } else {
          chrome.tabs.getZoom(cb);
        }
      } catch {
        resolve(1);
      }
    });
  }

  return 1;
}

/**
 * Checks whether Zen zoom sync is currently active.
 * - If user explicitly toggled it in storage (true or false), honors that.
 * - If not explicitly set in storage, automatically enables if running in Zen Browser.
 */
export async function isZenZoomSyncActive(): Promise<boolean> {
  try {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const res = await browser.storage.local.get(STORAGE_KEY_ZEN_ZOOM_SYNC);
      if (res && res[STORAGE_KEY_ZEN_ZOOM_SYNC] !== undefined) {
        return Boolean(res[STORAGE_KEY_ZEN_ZOOM_SYNC]);
      }
    }
  } catch (err) {
    console.warn('[Arcable] Error checking zoom sync storage key:', err);
  }

  return await isZenBrowser();
}

/**
 * Subscribes to tab zoom changes, tab activation, and window focus to keep
 * the extension side panel zoom level synchronized with the active tab.
 */
export function setupZenZoomSync(): () => void {
  let isCleanedUp = false;
  let activeSync = false;
  let currentActiveTabId: number | null = null;

  const syncZoomWithActiveTab = async (explicitTabId?: number) => {
    if (isCleanedUp || !activeSync) return;
    try {
      let targetTabId = explicitTabId;
      if (targetTabId === undefined) {
        const activeTab = await getActiveTab();
        if (activeTab?.id !== undefined) {
          targetTabId = activeTab.id;
          currentActiveTabId = activeTab.id;
        }
      } else {
        currentActiveTabId = targetTabId;
      }

      const zoomFactor = await getActiveTabZoom(targetTabId);
      if (!isCleanedUp && activeSync) {
        applyZoomToExtensionPage(zoomFactor);
      }
    } catch (error) {
      console.warn('[Arcable] Error syncing zoom with active tab:', error);
    }
  };

  const handleZoomChange = (zoomChangeInfo: { tabId: number; oldZoomFactor: number; newZoomFactor: number }) => {
    if (isCleanedUp || !activeSync) return;
    if (currentActiveTabId !== null && zoomChangeInfo.tabId === currentActiveTabId) {
      applyZoomToExtensionPage(zoomChangeInfo.newZoomFactor);
      return;
    }
    void getActiveTab().then((activeTab) => {
      if (!isCleanedUp && activeSync && activeTab?.id === zoomChangeInfo.tabId) {
        currentActiveTabId = activeTab.id;
        applyZoomToExtensionPage(zoomChangeInfo.newZoomFactor);
      }
    });
  };

  const handleTabActivated = (activeInfo: { tabId: number; windowId?: number }) => {
    if (isCleanedUp || !activeSync) return;
    currentActiveTabId = activeInfo.tabId;
    void syncZoomWithActiveTab(activeInfo.tabId);
  };

  const handleFocus = () => {
    if (isCleanedUp || !activeSync) return;
    void syncZoomWithActiveTab();
  };

  const handleStorageChange = (changes: Record<string, any>, areaName?: string) => {
    if ((areaName === 'local' || !areaName) && changes[STORAGE_KEY_ZEN_ZOOM_SYNC]) {
      const newValue = Boolean(changes[STORAGE_KEY_ZEN_ZOOM_SYNC].newValue);
      activeSync = newValue;
      if (newValue) {
        void syncZoomWithActiveTab();
      } else {
        applyZoomToExtensionPage(1);
      }
    }
  };

  // Determine initial state
  void isZenZoomSyncActive().then((isActive) => {
    if (isCleanedUp) return;
    activeSync = isActive;
    if (activeSync) {
      void syncZoomWithActiveTab();
    }
  });

  // Attach listeners
  const tabsApi = typeof browser !== 'undefined' && browser.tabs ? browser.tabs : (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (tabsApi && (tabsApi as any).onZoomChange) {
    (tabsApi as any).onZoomChange.addListener(handleZoomChange);
  }

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(handleTabActivated);
  } else if (tabsApi && tabsApi.onActivated) {
    tabsApi.onActivated.addListener(handleTabActivated as any);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
  }

  const storageApi = typeof browser !== 'undefined' && browser.storage ? browser.storage : (typeof chrome !== 'undefined' ? chrome.storage : null);
  if (storageApi && storageApi.onChanged) {
    storageApi.onChanged.addListener(handleStorageChange);
  }

  return () => {
    isCleanedUp = true;
    activeSync = false;
    applyZoomToExtensionPage(1);

    if (tabsApi && (tabsApi as any).onZoomChange) {
      try {
        (tabsApi as any).onZoomChange.removeListener(handleZoomChange);
      } catch {}
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
      try {
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      } catch {}
    } else if (tabsApi && tabsApi.onActivated) {
      try {
        tabsApi.onActivated.removeListener(handleTabActivated as any);
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
    }

    if (storageApi && storageApi.onChanged) {
      try {
        storageApi.onChanged.removeListener(handleStorageChange);
      } catch {}
    }
  };
}

/**
 * React hook to enable Zen zoom sync during the lifetime of the side panel.
 */
export function useZenZoomSync(): void {
  useEffect(() => {
    const cleanup = setupZenZoomSync();
    return () => {
      cleanup();
    };
  }, []);
}
