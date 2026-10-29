import browser from 'webextension-polyfill';
import { STORAGE_KEY_ACTION_MODE, getActionMode } from '../utils/actionMode';

// Read storage inside the queue so startup, auth updates and rapid preference changes
// cannot restore an outdated mode. Never await storage in the click handler itself:
// Firefox requires sidebarAction.open() to run within the original user gesture.
let pendingUpdate = Promise.resolve();
export function syncExtensionActionBehavior(): Promise<void> {
  pendingUpdate = pendingUpdate.catch(() => {}).then(async () => {
    const stored = await browser.storage.local.get(STORAGE_KEY_ACTION_MODE);
    const popup = getActionMode(stored[STORAGE_KEY_ACTION_MODE]) === 'popup';
    const sidePanel = typeof chrome !== 'undefined' ? chrome.sidePanel : undefined;
    if (sidePanel?.setPanelBehavior) {
      await sidePanel.setPanelBehavior({ openPanelOnActionClick: !popup });
    }
    await browser.action.setPopup({ popup: popup ? 'popup/index.html' : '' });
  });
  return pendingUpdate;
}

export function initExtensionActionBehavior(): void {
  void syncExtensionActionBehavior().catch(console.warn);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY_ACTION_MODE]) {
      void syncExtensionActionBehavior().catch(console.warn);
    }
  });
}
