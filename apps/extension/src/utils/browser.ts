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
 * Detects the host operating system platform ('mac' | 'win' | 'linux' | 'other').
 */
export async function getPlatformOS(): Promise<'mac' | 'win' | 'linux' | 'other'> {
  try {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getPlatformInfo) {
      const info = await browser.runtime.getPlatformInfo();
      if (info.os === 'win') return 'win';
      if (info.os === 'mac') return 'mac';
      if (info.os === 'linux') return 'linux';
    }
  } catch (error) {
    console.warn('Could not determine platform via runtime API:', error);
  }

  if (typeof navigator !== 'undefined') {
    const platform = ((navigator as any).userAgentData?.platform || navigator.platform || '').toLowerCase();
    const ua = (navigator.userAgent || '').toLowerCase();
    if (platform.includes('win') || ua.includes('windows')) return 'win';
    if (platform.includes('mac') || ua.includes('macintosh')) return 'mac';
    if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  }

  return 'other';
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

/**
 * Detects whether the extension is running inside Zen Browser.
 * Checks navigator.userAgent as well as the Gecko browser.runtime.getBrowserInfo API.
 */
export async function isZenBrowser(): Promise<boolean> {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/Zen\/|zen/i.test(ua)) {
      return true;
    }
  }

  try {
    if (typeof browser !== 'undefined' && browser.runtime && (browser.runtime as any).getBrowserInfo) {
      const info = await (browser.runtime as any).getBrowserInfo();
      if (info && (/zen/i.test(info.name) || /zen/i.test(info.vendor))) {
        return true;
      }
    }
  } catch {
    // getBrowserInfo is Gecko-only, catch gracefully in Chromium
  }

  return false;
}

/**
 * Detects whether the extension is running inside Firefox.
 */
export function isFirefox(): boolean {
  if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) {
    return true;
  }
  return typeof browser !== 'undefined' && typeof (browser.runtime as any)?.getBrowserInfo === 'function';
}

/**
 * Detects whether the extension is running inside Brave browser.
 */
export function isBrave(): boolean {
  if (typeof navigator !== 'undefined') {
    if (Boolean((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function')) {
      return true;
    }
    if (/Brave/i.test(navigator.userAgent)) {
      return true;
    }
  }
  return false;
}

/**
 * Synchronous check whether chrome.userScripts is available in the current context.
 */
export function isUserScriptsAvailable(): boolean {
  try {
    const userScripts = (chrome as any)?.userScripts;
    return Boolean(
      userScripts &&
        (typeof userScripts.execute === 'function' || typeof userScripts.register === 'function')
    );
  } catch {
    return false;
  }
}

/**
 * Asynchronous cross-browser check whether user scripts are permitted and available.
 */
export async function checkUserScriptsAvailable(): Promise<boolean> {
  if (isFirefox()) {
    try {
      if (typeof browser !== 'undefined' && browser.permissions?.contains) {
        return await browser.permissions.contains({ permissions: ['userScripts'] });
      }
    } catch {
      return false;
    }
  }
  return isUserScriptsAvailable();
}

/**
 * Resolves the browser-specific extension details/settings URL.
 */
export function getExtensionDetailsUrl(): string {
  const extensionId =
    (typeof chrome !== 'undefined' && chrome.runtime?.id) ||
    (typeof browser !== 'undefined' && browser.runtime?.id) ||
    '';
  if (isBrave()) {
    return `brave://extensions/?id=${extensionId}`;
  }
  if (isFirefox()) {
    return 'about:addons';
  }
  return `chrome://extensions/?id=${extensionId}`;
}

/**
 * Opens the browser extension management details page for Arcable.
 * In Firefox, attempts to prompt for userScripts permission directly first.
 */
export async function openExtensionDetailsPage(): Promise<void> {
  if (isFirefox()) {
    try {
      if (typeof browser !== 'undefined' && browser.permissions?.request) {
        const granted = await browser.permissions.request({ permissions: ['userScripts'] });
        if (granted) return;
      }
    } catch (err) {
      console.warn('[Arcable] browser.permissions.request failed:', err);
    }
  }

  const url = getExtensionDetailsUrl();
  try {
    await browser.tabs.create({ url });
  } catch (err) {
    console.warn('[Arcable] Failed to open extension details page tab:', err);
  }
}

