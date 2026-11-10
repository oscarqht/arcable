import browser from 'webextension-polyfill';
import type { RaindropAuthState } from '@arcable/shared/types';
import { createRaindropBookmark, uploadRaindropCover, isPanelUrl } from '@arcable/shared/utils';
import { openOptionsPageSafely } from '../utils/browser';
import { captureTabScreenshot } from './screenshot';
import { setActionBadge } from './badge';

const DEFAULT_TITLE = 'Save page to Raindrop Unsorted with screenshot cover';
const savingTabs = new Set<number>();

export function initExtensionActionBehavior(getAuth: () => Promise<RaindropAuthState>) {
  const action = browser.action || (browser as any).browserAction;
  if (action?.setPopup) void action.setPopup({ popup: '' }).catch(() => {});
  if (action?.setTitle) void action.setTitle({ title: DEFAULT_TITLE }).catch(() => {});
  action?.onClicked.addListener((tab: browser.Tabs.Tab) => saveCurrentTab(tab, getAuth));
}

async function saveCurrentTab(tab: browser.Tabs.Tab, getAuth: () => Promise<RaindropAuthState>) {
  const tabId = tab.id;
  if (tabId === undefined || savingTabs.has(tabId)) return;
  const action = browser.action || (browser as any).browserAction;
  const status = (text: string, title: string, color: string) => {
    setActionBadge(text, color, 3000);
    if (action?.setTitle) void action.setTitle({ tabId, title }).catch(() => {});
  };
  savingTabs.add(tabId);
  let bookmarkCreated = false;
  try {
    if (!tab.url || !isPanelUrl(tab.url)) {
      status('!', 'Only HTTP(S) pages can be saved', '#ef4444');
      return;
    }
    status('…', 'Saving page and screenshot to Unsorted…', '#0284c7');
    const auth = await getAuth();
    if (!auth.isAuthenticated || !auth.accessToken) {
      await browser.storage.local.set({ optionsInitialTab: 'sync' });
      await openOptionsPageSafely();
      status('!', 'Connect Raindrop in Options, then click again to save this page', '#ef4444');
      return;
    }
    // captureVisibleTab captures the active tab in the window. Do not pair an
    // old URL with a screenshot of a tab switched to during token renewal.
    const current = await browser.tabs.get(tabId);
    const [active] = await browser.tabs.query({ active: true, windowId: current.windowId });
    if (current.url !== tab.url || active?.id !== tabId) throw new Error('Tab changed');
    const screenshot = await captureTabScreenshot(tabId);
    if (!screenshot) throw new Error('Screenshot capture failed');
    const after = await browser.tabs.get(tabId);
    const [stillActive] = await browser.tabs.query({ active: true, windowId: current.windowId });
    if (after.url !== current.url || stillActive?.id !== tabId) throw new Error('Tab changed');
    const bookmark = await createRaindropBookmark(auth.accessToken, {
      link: current.url!, title: current.title || current.url!, collectionId: -1,
      pleaseParse: { disabled: true },
    });
    bookmarkCreated = true;
    const cover = await uploadRaindropCover(auth.accessToken, bookmark._id, screenshot);
    if (!cover) throw new Error('Screenshot cover upload failed');
    status('✓', 'Saved to Unsorted with screenshot cover', '#10b981');
  } catch {
    status('!', bookmarkCreated
      ? 'Page saved to Unsorted, but screenshot cover upload failed'
      : 'Could not save page with screenshot. Check Raindrop connection and keep the tab active.', '#ef4444');
  } finally {
    savingTabs.delete(tabId);
  }
}
