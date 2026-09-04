import browser from 'webextension-polyfill';

export { browser };

/**
 * Helper to query active tab across Chrome and Firefox.
 */
export async function getActiveTab(): Promise<browser.Tabs.Tab | undefined> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  } catch (error) {
    console.error('Error getting active tab:', error);
    return undefined;
  }
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

  // 3. Firefox for Android or fallback: open workspace in a tab
  try {
    await browser.tabs.create({ url: browser.runtime.getURL('sidepanel/index.html') });
  } catch (tabErr) {
    console.error('[Arcable] Failed to open workspace tab:', tabErr);
  }
}

