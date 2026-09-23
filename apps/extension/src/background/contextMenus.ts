import browser from 'webextension-polyfill';
import { RunCodeRule } from '@arcable/shared/types';
import { matchAnyUrlPattern, sortRunCodeRules } from '@arcable/shared/utils';
import { RUN_CODE_IN_PAGE_STORAGE_KEY, runCodeInPageRule } from './runCodeRunner';
import { handleScreenshotCapture } from './screenshot';
import {
  createCopyContextMenuItems,
  isCopyMenuItem,
  getCopyFormatType,
  handleCopyOperation,
} from './clipboard';

export const SCREENSHOT_MENU_IDS = {
  TAKE_SCREENSHOT: 'arcable_take_screenshot',
  CAPTURE_FULL_PAGE: 'arcable_capture_full_page',
} as const;

const MENU_ROOT_ID = 'arcable_run_code_root';
const MENU_ITEM_PREFIX = 'arcable_run_code_item_';

const CONTEXTS: chrome.contextMenus.ContextType[] = [
  'page',
  'frame',
  'selection',
  'link',
  'image',
  'video',
  'audio',
  'editable',
];

async function getRunCodeRules(): Promise<RunCodeRule[]> {
  try {
    const res = await browser.storage.local.get(RUN_CODE_IN_PAGE_STORAGE_KEY);
    const rules = res[RUN_CODE_IN_PAGE_STORAGE_KEY];
    return Array.isArray(rules) ? sortRunCodeRules(rules as RunCodeRule[]) : [];
  } catch (err) {
    console.warn('[contextMenus] Error reading run code rules:', err);
    return [];
  }
}

export async function getMatchingCodeRules(url: string): Promise<RunCodeRule[]> {
  if (!url || typeof url !== 'string' || url.startsWith('chrome://') || url.startsWith('about:')) {
    return [];
  }
  const rules = await getRunCodeRules();
  const matched = rules.filter((rule) => {
    if (rule.disabled) return false;
    if (!rule.code || !rule.code.trim()) return false;
    if (!rule.patterns || rule.patterns.length === 0) return false;
    return matchAnyUrlPattern(rule.patterns, url);
  });
  return sortRunCodeRules(matched);
}

let isUpdatingMenu = false;

export async function updateRunCodeContextMenus(currentUrl?: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  if (isUpdatingMenu) return;
  isUpdatingMenu = true;

  try {
    // 1. Resolve current active tab URL if not provided
    let targetUrl = currentUrl;
    if (!targetUrl) {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      targetUrl = tabs[0]?.url;
    }

    const matchingRules = targetUrl ? await getMatchingCodeRules(targetUrl) : [];

    // Remove all existing arcable context menu items
    await new Promise<void>((resolve) => {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          // ignore
        }
        resolve();
      });
    });

    // 1. Create Copy context menu items
    createCopyContextMenuItems(CONTEXTS);

    // 2. Always create top-level screenshot context menu items
    chrome.contextMenus.create({
      id: SCREENSHOT_MENU_IDS.TAKE_SCREENSHOT,
      title: '📸 Take Screenshot',
      contexts: CONTEXTS,
    });

    chrome.contextMenus.create({
      id: SCREENSHOT_MENU_IDS.CAPTURE_FULL_PAGE,
      title: '📜 Capture Full Page',
      contexts: CONTEXTS,
    });

    // 3. Create Run Code items if matching rules exist for this page
    if (matchingRules.length > 0) {
      chrome.contextMenus.create({
        id: MENU_ROOT_ID,
        title: '⚡ Run Code in Page',
        contexts: CONTEXTS,
      });

      for (const rule of matchingRules) {
        chrome.contextMenus.create({
          id: `${MENU_ITEM_PREFIX}${rule.id}`,
          parentId: MENU_ROOT_ID,
          title: rule.title || 'Untitled Snippet',
          contexts: CONTEXTS,
        });
      }
    }
  } catch (err) {
    console.warn('[contextMenus] Failed to update context menus:', err);
  } finally {
    isUpdatingMenu = false;
  }
}

export function initContextMenuListeners(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;

  // Handle menu item clicks
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const tabId = tab?.id;

    if (typeof info.menuItemId === 'string' && isCopyMenuItem(info.menuItemId)) {
      const formatType = getCopyFormatType(info.menuItemId);
      if (formatType) {
        void handleCopyOperation(formatType, tab);
      }
      return;
    }

    if (info.menuItemId === SCREENSHOT_MENU_IDS.TAKE_SCREENSHOT) {
      if (typeof tabId === 'number') {
        void handleScreenshotCapture(tabId, 'viewport');
      }
      return;
    }

    if (info.menuItemId === SCREENSHOT_MENU_IDS.CAPTURE_FULL_PAGE) {
      if (typeof tabId === 'number') {
        void handleScreenshotCapture(tabId, 'fullpage');
      }
      return;
    }

    if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_ITEM_PREFIX)) {
      const ruleId = info.menuItemId.replace(MENU_ITEM_PREFIX, '');
      if (typeof tabId === 'number') {
        void runCodeInPageRule(ruleId, tabId).catch((err) => {
          console.error('[contextMenus] Execution error:', err);
        });
      }
    }
  });

  // Listen to tab activation changes to update context menus
  if (browser.tabs?.onActivated) {
    browser.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        if (tab?.url) {
          void updateRunCodeContextMenus(tab.url);
        }
      } catch {}
    });
  }

  // Listen to tab URL updates
  if (browser.tabs?.onUpdated) {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active && tab.url) {
        void updateRunCodeContextMenus(tab.url);
      }
    });
  }

  // Listen to storage changes for runCodeInPageRules
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[RUN_CODE_IN_PAGE_STORAGE_KEY]) {
      void updateRunCodeContextMenus();
    }
  });

  // Initial update
  void updateRunCodeContextMenus();
}
