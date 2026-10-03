import { useEffect } from 'react';
import {
  browser,
  getActiveTab,
  getPreviousActiveTab,
  isFirefox,
  isInternalOrExtensionUrl,
  isZenBrowser,
} from '../utils/browser';

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
 * Safely fetches the default zoom factor from the browser's zoom settings.
 * In Firefox / Zen Browser, this retrieves the global default zoom preference
 * (configured via Zen Browser Settings > Default zoom, e.g. 0.9 for 90%).
 */
export async function getDefaultZoomFactor(tabId?: number): Promise<number | null> {
  // 1. Try webextension-polyfill browser.tabs.getZoomSettings
  try {
    if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.getZoomSettings === 'function') {
      const settings = tabId !== undefined
        ? await browser.tabs.getZoomSettings(tabId)
        : await browser.tabs.getZoomSettings();
      if (
        settings &&
        typeof settings.defaultZoomFactor === 'number' &&
        settings.defaultZoomFactor > 0 &&
        Number.isFinite(settings.defaultZoomFactor)
      ) {
        return settings.defaultZoomFactor;
      }
    }
  } catch {}

  // 2. Try chrome.tabs.getZoomSettings (Chromium fallback)
  if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.getZoomSettings === 'function') {
    return new Promise<number | null>((resolve) => {
      try {
        const cb = (settings?: chrome.tabs.ZoomSettings) => {
          if (
            chrome.runtime?.lastError ||
            !settings ||
            typeof settings.defaultZoomFactor !== 'number' ||
            settings.defaultZoomFactor <= 0 ||
            !Number.isFinite(settings.defaultZoomFactor)
          ) {
            resolve(null);
          } else {
            resolve(settings.defaultZoomFactor);
          }
        };
        if (tabId !== undefined) {
          chrome.tabs.getZoomSettings(tabId, cb);
        } else {
          chrome.tabs.getZoomSettings(cb);
        }
      } catch {
        resolve(null);
      }
    });
  }

  return null;
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
 * Resolves the effective target zoom factor for the extension side panel:
 * - If the active tab is an internal or settings page (e.g. about:preferences,
 *   about:blank, new tab, extension page), internal pages stay at 1.0 in Firefox/Zen.
 *   In this case, we use the browser's global defaultZoomFactor (e.g. 0.9 for 90%).
 * - If the active tab is a normal web page:
 *   - Uses tabZoom if it has an explicit custom zoom.
 *   - If tabZoom is 1.0 and defaultZoomFactor is set (e.g. 0.9), honors defaultZoomFactor.
 */
export async function resolveEffectiveZoom(targetTab?: { id?: number; url?: string }): Promise<number> {
  let activeTab = targetTab;
  if (!activeTab || activeTab.id === undefined) {
    try {
      activeTab = await getActiveTab();
    } catch {}
  }

  const defaultZoom = await getDefaultZoomFactor(activeTab?.id);
  const isInternal = Boolean(activeTab?.url && isInternalOrExtensionUrl(activeTab.url));

  if (isInternal) {
    if (defaultZoom !== null && defaultZoom > 0 && Number.isFinite(defaultZoom)) {
      return defaultZoom;
    }

    try {
      const prevTab = await getPreviousActiveTab();
      if (prevTab?.id !== undefined && prevTab.url && !isInternalOrExtensionUrl(prevTab.url)) {
        const prevZoom = await getActiveTabZoom(prevTab.id);
        if (prevZoom > 0 && Number.isFinite(prevZoom)) {
          return prevZoom;
        }
      }
    } catch {}

    return 1;
  }

  const tabZoom = activeTab?.id !== undefined ? await getActiveTabZoom(activeTab.id) : 1;

  if (tabZoom > 0 && Number.isFinite(tabZoom) && Math.abs(tabZoom - 1) > 0.001) {
    return tabZoom;
  }

  if (defaultZoom !== null && defaultZoom > 0 && Number.isFinite(defaultZoom)) {
    return defaultZoom;
  }

  return tabZoom;
}

/**
 * Checks whether Zen zoom sync is currently active.
 * - If user explicitly toggled it in storage (true or false), honors that.
 * - If not explicitly set in storage, automatically enables if running in Zen Browser or Firefox.
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

  const inZen = await isZenBrowser();
  if (inZen) return true;
  return isFirefox();
}

/**
 * Subscribes to tab zoom changes, tab activation, URL updates, and window focus to keep
 * the extension side panel zoom level synchronized with Zen Browser settings and active tab.
 */
export function setupZenZoomSync(): () => void {
  let isCleanedUp = false;
  let activeSync = false;
  let currentActiveTabId: number | null = null;

  const syncZoom = async (explicitTabId?: number) => {
    if (isCleanedUp || !activeSync) return;
    try {
      let targetTab: { id?: number; url?: string } | undefined;
      const activeTab = await getActiveTab();

      if (explicitTabId !== undefined) {
        currentActiveTabId = explicitTabId;
        if (activeTab?.id === explicitTabId) {
          targetTab = activeTab;
        } else {
          try {
            if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.get === 'function') {
              targetTab = await browser.tabs.get(explicitTabId);
            }
          } catch {}
          if (!targetTab) {
            targetTab = { id: explicitTabId };
          }
        }
      } else if (activeTab?.id !== undefined) {
        currentActiveTabId = activeTab.id;
        targetTab = activeTab;
      }

      const zoomFactor = await resolveEffectiveZoom(targetTab);
      if (!isCleanedUp && activeSync) {
        applyZoomToExtensionPage(zoomFactor);
      }
    } catch (error) {
      console.warn('[Arcable] Error syncing zoom with active tab:', error);
    }
  };

  const handleZoomChange = (zoomChangeInfo: { tabId: number; oldZoomFactor: number; newZoomFactor: number; zoomSettings?: any }) => {
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
    void syncZoom(activeInfo.tabId);
  };

  const handleTabUpdated = (tabId: number, changeInfo: { status?: string; url?: string }) => {
    if (isCleanedUp || !activeSync) return;
    if (tabId === currentActiveTabId || changeInfo.status === 'complete' || changeInfo.url) {
      void syncZoom();
    }
  };

  const handleInteraction = () => {
    if (isCleanedUp || !activeSync) return;
    void syncZoom();
  };

  const handleStorageChange = (changes: Record<string, any>, areaName?: string) => {
    if ((areaName === 'local' || !areaName) && changes[STORAGE_KEY_ZEN_ZOOM_SYNC]) {
      const newValue = Boolean(changes[STORAGE_KEY_ZEN_ZOOM_SYNC].newValue);
      activeSync = newValue;
      if (newValue) {
        void syncZoom();
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
      void syncZoom();
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

  if (tabsApi && tabsApi.onUpdated) {
    tabsApi.onUpdated.addListener(handleTabUpdated);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleInteraction);
    window.addEventListener('mouseenter', handleInteraction);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleInteraction);
  }

  const storageApi = typeof browser !== 'undefined' && browser.storage ? browser.storage : (typeof chrome !== 'undefined' ? chrome.storage : null);
  if (storageApi && storageApi.onChanged) {
    storageApi.onChanged.addListener(handleStorageChange);
  }

  // Periodic poll to catch browser preference changes (such as changing "Default zoom" in Zen settings)
  // that do not emit tab zoom events
  const pollTimer = setInterval(() => {
    if (!isCleanedUp && activeSync) {
      void syncZoom();
    }
  }, 1500);

  if (typeof pollTimer === 'object' && typeof (pollTimer as any)?.unref === 'function') {
    (pollTimer as any).unref();
  }

  return () => {
    isCleanedUp = true;
    activeSync = false;
    clearInterval(pollTimer);
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

    if (tabsApi && tabsApi.onUpdated) {
      try {
        tabsApi.onUpdated.removeListener(handleTabUpdated);
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleInteraction);
      window.removeEventListener('mouseenter', handleInteraction);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleInteraction);
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
