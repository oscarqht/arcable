import browser from 'webextension-polyfill';

export { browser };

/**
 * Helper to query active tab across Chrome and Firefox.
 */
export async function getActiveTab(): Promise<browser.Tabs.Tab | undefined> {
  try {
    let tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    }
    return tabs[0];
  } catch (error) {
    console.error('Error getting active tab:', error);
    return undefined;
  }
}

/**
 * Captures a screenshot of the visible area of the active tab.
 * Returns a data URL (e.g. "data:image/jpeg;base64,...") or null if capture fails.
 */
export async function captureActiveTabScreenshot(windowId?: number): Promise<string | null> {
  const options = { format: 'jpeg' as const, quality: 85 };

  // 1. Try webextension-polyfill browser.tabs.captureVisibleTab
  try {
    if (typeof browser !== 'undefined' && typeof (browser.tabs as any)?.captureVisibleTab === 'function') {
      const dataUrl = windowId !== undefined
        ? await (browser.tabs as any).captureVisibleTab(windowId, options)
        : await (browser.tabs as any).captureVisibleTab(options);
      if (dataUrl) return dataUrl;
    }
  } catch (err) {
    console.warn('[Arcable] browser.tabs.captureVisibleTab failed, trying chrome fallback:', err);
  }

  // 2. Try chrome.tabs.captureVisibleTab directly
  if (typeof chrome !== 'undefined' && typeof (chrome.tabs as any)?.captureVisibleTab === 'function') {
    return new Promise((resolve) => {
      try {
        const callback = (dataUrl?: string) => {
          if (chrome.runtime.lastError || !dataUrl) {
            console.warn('[Arcable] chrome.tabs.captureVisibleTab failed:', chrome.runtime.lastError?.message);
            resolve(null);
          } else {
            resolve(dataUrl);
          }
        };

        if (windowId !== undefined) {
          chrome.tabs.captureVisibleTab(windowId, options, callback);
        } else {
          chrome.tabs.captureVisibleTab(options, callback);
        }
      } catch (e) {
        console.warn('[Arcable] chrome.tabs.captureVisibleTab threw:', e);
        resolve(null);
      }
    });
  }

  return null;
}

/**
 * Storage wrapper for cross-browser storage sync/local.
 */
export const storage = {
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const result = await browser.storage.local.get(key);
      return result[key] !== undefined ? (result[key] as T) : defaultValue;
    } catch (error) {
      console.error(`Error reading key "${key}" from storage:`, error);
      return defaultValue;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`Error saving key "${key}" to storage:`, error);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await browser.storage.local.remove(key);
    } catch (error) {
      console.error(`Error removing key "${key}" from storage:`, error);
    }
  },
};

/**
 * Checks whether the extension is running on Android (e.g. Firefox for Android).
 */
export async function isAndroidPlatform(): Promise<boolean> {
  try {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getPlatformInfo) {
      const info = await browser.runtime.getPlatformInfo();
      return info.os === 'android';
    }
  } catch (error) {
    console.warn('Could not determine platform:', error);
  }
  return false;
}

/**
 * Robust helper to open the options/settings page.
 * On Firefox for Android, browser.runtime.openOptionsPage can fail or behave erratically;
 * this automatically falls back to opening options/index.html in a tab.
 */
export async function openOptionsPageSafely(): Promise<void> {
  try {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.openOptionsPage) {
      await browser.runtime.openOptionsPage();
      return;
    }
  } catch (err) {
    console.warn('[Arcable] openOptionsPage failed, falling back to tab:', err);
  }

  try {
    await browser.tabs.create({ url: browser.runtime.getURL('options/index.html') });
  } catch (tabErr) {
    console.error('[Arcable] Failed to open options tab:', tabErr);
  }
}

/**
 * Robust helper to open the Arcable workspace/sidepanel.
 * Uses Chrome SidePanel on Chrome, Firefox Sidebar on desktop Firefox,
 * or opens the sidepanel workspace in a new tab on mobile (Firefox for Android).
 */
export async function openWorkspaceSafely(): Promise<void> {
  // 1. Chrome SidePanel
  if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
    try {
      const win = await new Promise<chrome.windows.Window | undefined>((resolve) => {
        if (chrome.windows && chrome.windows.getCurrent) {
          chrome.windows.getCurrent(resolve);
        } else {
          resolve(undefined);
        }
      });
      if (win?.id !== undefined) {
        await chrome.sidePanel.open({ windowId: win.id });
        return;
      }
    } catch (err) {
      console.warn('[Arcable] chrome.sidePanel.open failed:', err);
    }
  }

  // 2. Firefox Desktop Sidebar
  if (typeof browser !== 'undefined' && (browser as any).sidebarAction && typeof (browser as any).sidebarAction.open === 'function') {
    try {
      await (browser as any).sidebarAction.open();
      return;
    } catch (err) {
      console.warn('[Arcable] sidebarAction.open failed:', err);
    }
  }

  // 3. Firefox for Android or fallback: open workspace in a tab (or focus existing tab)
  try {
    const sidepanelUrl = browser.runtime.getURL('sidepanel/index.html');
    const tabs = await browser.tabs.query({});
    const existingTab = tabs.find(
      (t) => t.url === sidepanelUrl || (t.url && t.url.startsWith(sidepanelUrl))
    );
    if (existingTab && existingTab.id !== undefined) {
      await browser.tabs.update(existingTab.id, { active: true });
      return;
    }
    await browser.tabs.create({ url: sidepanelUrl });
  } catch (tabErr) {
    console.error('[Arcable] Failed to open workspace tab:', tabErr);
  }
}

export interface UpdateCheckResult {
  status: 'throttled' | 'no_update' | 'update_available' | 'error';
  version?: string;
  error?: string;
}

/**
 * Robust cross-browser update checker.
 * Uses native WebExtension runtime.requestUpdateCheck API.
 */
export async function requestUpdateCheckSafely(): Promise<UpdateCheckResult> {
  // 1. Try webextension-polyfill browser.runtime.requestUpdateCheck
  if (typeof browser !== 'undefined' && browser.runtime && typeof (browser.runtime as any).requestUpdateCheck === 'function') {
    try {
      const res = await (browser.runtime as any).requestUpdateCheck();
      if (Array.isArray(res)) {
        return {
          status: res[0] as any,
          version: res[1]?.version,
        };
      }
      if (res && typeof res === 'object') {
        return {
          status: res.status || 'no_update',
          version: res.version,
        };
      }
    } catch (err: any) {
      // polyfill may reject if Chrome throws or in dev mode
      console.warn('[Arcable] browser.runtime.requestUpdateCheck threw, checking chrome fallback:', err);
    }
  }

  // 2. Try chrome.runtime.requestUpdateCheck callback
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.requestUpdateCheck === 'function') {
    return new Promise((resolve) => {
      try {
        chrome.runtime.requestUpdateCheck((status, details) => {
          if (chrome.runtime.lastError) {
            resolve({
              status: 'error',
              error: chrome.runtime.lastError.message || 'Update check failed',
            });
          } else {
            resolve({
              status: status as any,
              version: details?.version,
            });
          }
        });
      } catch (err: any) {
        resolve({
          status: 'error',
          error: err?.message || 'Native update check failed',
        });
      }
    });
  }

  return {
    status: 'error',
    error: 'Update check is not supported in this environment.',
  };
}

/**
 * Safely reloads the extension across Chrome and Firefox.
 */
export function reloadExtensionSafely(): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.reload === 'function') {
      chrome.runtime.reload();
      return;
    }
  } catch (e) {
    console.warn('[Arcable] chrome.runtime.reload threw:', e);
  }

  try {
    if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.reload === 'function') {
      browser.runtime.reload();
      return;
    }
  } catch (e) {
    console.warn('[Arcable] browser.runtime.reload threw:', e);
  }
}

