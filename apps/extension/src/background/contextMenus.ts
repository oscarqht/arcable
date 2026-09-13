import browser from 'webextension-polyfill';
import { RunCodeRule } from '@arcable/shared/types';
import { matchAnyUrlPattern } from '@arcable/shared/utils';
import { RUN_CODE_IN_PAGE_STORAGE_KEY, runCodeInPageRule } from './runCodeRunner';

const MENU_ROOT_ID = 'arcable_run_code_root';
const MENU_ITEM_PREFIX = 'arcable_run_code_item_';

async function getRunCodeRules(): Promise<RunCodeRule[]> {
  try {
    const res = await browser.storage.local.get(RUN_CODE_IN_PAGE_STORAGE_KEY);
    const rules = res[RUN_CODE_IN_PAGE_STORAGE_KEY];
    return Array.isArray(rules) ? (rules as RunCodeRule[]) : [];
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
  return rules.filter((rule) => {
    if (rule.disabled) return false;
    if (!rule.code || !rule.code.trim()) return false;
    // If no patterns specified, does it run on all pages or none? In Nenya, rules without patterns only run if pattern matches or if empty pattern isn't allowed.
    if (!rule.patterns || rule.patterns.length === 0) return false;
    return matchAnyUrlPattern(rule.patterns, url);
  });
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

    if (matchingRules.length === 0) {
      return;
    }

    // Create root parent menu
    chrome.contextMenus.create({
      id: MENU_ROOT_ID,
      title: 'Run Code in Page',
      contexts: ['page', 'frame', 'selection', 'link', 'editable'],
    });

    // Create submenu items for each matching rule
    for (const rule of matchingRules) {
      chrome.contextMenus.create({
        id: `${MENU_ITEM_PREFIX}${rule.id}`,
        parentId: MENU_ROOT_ID,
        title: rule.title || 'Untitled Snippet',
        contexts: ['page', 'frame', 'selection', 'link', 'editable'],
      });
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
    if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_ITEM_PREFIX)) {
      const ruleId = info.menuItemId.replace(MENU_ITEM_PREFIX, '');
      const tabId = tab?.id;
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
