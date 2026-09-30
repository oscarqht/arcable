import browser from 'webextension-polyfill';

export const STORAGE_KEY_AUTO_PIP = 'arcable_auto_pip';

/**
 * Initializes tab tracking for auto-entering and exiting Picture-in-Picture mode.
 * When switching away from a tab within the same window, sends AUTO_PIP_ENTER to the previous tab.
 * When switching to a tab, sends AUTO_PIP_EXIT to restore the video inline.
 */
export function initAutoPipBackground(): void {
  // Store the active tab ID for each browser window
  const activeTabByWindow = new Map<number, number>();

  // Seed current active tabs across windows
  void browser.tabs
    .query({ active: true })
    .then((tabs) => {
      for (const tab of tabs) {
        if (tab.windowId !== undefined && tab.id !== undefined) {
          activeTabByWindow.set(tab.windowId, tab.id);
        }
      }
    })
    .catch((err) => {
      console.warn('[Arcable AutoPiP Background] Failed to query initial active tabs:', err);
    });

  // Listen to tab activation changes
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    const { tabId: newTabId, windowId } = activeInfo;
    const previousTabId = activeTabByWindow.get(windowId);
    activeTabByWindow.set(windowId, newTabId);

    // Only trigger when switching tabs within the same window
    if (!previousTabId || previousTabId === newTabId) {
      return;
    }

    try {
      const stored = await browser.storage.local.get(STORAGE_KEY_AUTO_PIP);
      const isAutoPipEnabled = stored[STORAGE_KEY_AUTO_PIP] !== false;
      if (!isAutoPipEnabled) {
        return;
      }

      // 1. Tell previous tab to enter Picture-in-Picture if an eligible video is playing
      try {
        await browser.tabs.sendMessage(previousTabId, { type: 'AUTO_PIP_ENTER' });
      } catch {
        // Tab might be restricted (chrome://, about:, extensions) or closed
      }

      // 2. Tell newly active tab to exit Picture-in-Picture and restore inline
      try {
        await browser.tabs.sendMessage(newTabId, { type: 'AUTO_PIP_EXIT' });
      } catch {
        // Tab might not be a standard web page
      }
    } catch (err) {
      console.warn('[Arcable AutoPiP Background] Error in onActivated listener:', err);
    }
  });

  // Clean up closed tabs
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const currentActive = activeTabByWindow.get(removeInfo.windowId);
    if (currentActive === tabId) {
      activeTabByWindow.delete(removeInfo.windowId);
    }
  });

  // Clean up closed windows
  if (browser.windows?.onRemoved) {
    browser.windows.onRemoved.addListener((windowId) => {
      activeTabByWindow.delete(windowId);
    });
  }
}
