import browser from 'webextension-polyfill';
import { setCopySuccessBadge, setCopyFailureBadge } from './badge';

/**
 * Clipboard context menu functionality for copying tab URL and title data.
 * Migrated and adapted from Nenya extension.
 */

export const COPY_MENU_IDS = {
  PARENT: 'arcable_copy_parent',
  URL: 'arcable_copy_url',
  TITLE_DASH_URL: 'arcable_copy_title_dash_url',
  TITLE_URL: 'arcable_copy_title_url',
  MARKDOWN_LINK: 'arcable_copy_markdown_link',
  TITLE: 'arcable_copy_title',
} as const;

export type CopyFormatType = 'url' | 'title' | 'title-dash-url' | 'title-url' | 'markdown-link';

export interface TabData {
  title: string;
  url: string;
}

/**
 * Check if a menu item ID is an Arcable copy menu item.
 */
export function isCopyMenuItem(menuItemId: string): boolean {
  return (
    menuItemId === COPY_MENU_IDS.URL ||
    menuItemId === COPY_MENU_IDS.TITLE ||
    menuItemId === COPY_MENU_IDS.TITLE_DASH_URL ||
    menuItemId === COPY_MENU_IDS.TITLE_URL ||
    menuItemId === COPY_MENU_IDS.MARKDOWN_LINK
  );
}

/**
 * Map menu item ID to copy format type.
 */
export function getCopyFormatType(menuItemId: string): CopyFormatType | null {
  switch (menuItemId) {
    case COPY_MENU_IDS.URL:
      return 'url';
    case COPY_MENU_IDS.TITLE:
      return 'title';
    case COPY_MENU_IDS.TITLE_DASH_URL:
      return 'title-dash-url';
    case COPY_MENU_IDS.TITLE_URL:
      return 'title-url';
    case COPY_MENU_IDS.MARKDOWN_LINK:
      return 'markdown-link';
    default:
      return null;
  }
}

/**
 * Check if a URL belongs to browser internal pages that prohibit script injection.
 */
export function isExtensionOrSystemPage(url?: string): boolean {
  if (!url || typeof url !== 'string') return true;
  return (
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('devtools://') ||
    url.startsWith('view-source:')
  );
}

/**
 * Format tab data as URLs only.
 */
export function formatUrl(tabData: TabData[]): string {
  return tabData.map((tab) => tab.url).join('\n');
}

/**
 * Format tab data as titles only.
 */
export function formatTitle(tabData: TabData[]): string {
  return tabData.map((tab) => tab.title || tab.url).join('\n');
}

/**
 * Format tab data as "Title - URL".
 */
export function formatTitleDashUrl(tabData: TabData[]): string {
  return tabData.map((tab) => `${tab.title || tab.url} - ${tab.url}`).join('\n');
}

/**
 * Format tab data as "Title\nURL", separated by double newlines for multiple tabs.
 */
export function formatTitleUrl(tabData: TabData[]): string {
  return tabData.map((tab) => `${tab.title || tab.url}\n${tab.url}`).join('\n\n');
}

/**
 * Format tab data as markdown links "[Title](URL)".
 */
export function formatMarkdownLink(tabData: TabData[]): string {
  return tabData.map((tab) => `[${tab.title || tab.url}](${tab.url})`).join('\n');
}

/**
 * Format tab data according to specified format type.
 */
export function formatTabData(formatType: CopyFormatType, tabData: TabData[]): string {
  switch (formatType) {
    case 'url':
      return formatUrl(tabData);
    case 'title':
      return formatTitle(tabData);
    case 'title-dash-url':
      return formatTitleDashUrl(tabData);
    case 'title-url':
      return formatTitleUrl(tabData);
    case 'markdown-link':
      return formatMarkdownLink(tabData);
    default:
      return '';
  }
}

/**
 * Extract clean tab data from chrome or browser tabs.
 */
export function getTabData(tabs: Array<{ title?: string; url?: string }>): TabData[] {
  const validTabs = tabs.filter(
    (tab) => tab && typeof tab.url === 'string' && tab.url.length > 0
  );

  return validTabs.map((tab) => {
    const title = typeof tab.title === 'string' && tab.title.trim() ? tab.title.trim() : (tab.url || '');
    return {
      title,
      url: tab.url || '',
    };
  });
}

/**
 * Write plain text to system clipboard across Chrome MV3 service worker and Firefox.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. If navigator.clipboard is available directly in this scope (Firefox background page)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to script injection
    }
  }

  // 2. Script injection into an available injectable tab
  try {
    let targetTabId: number | undefined;

    // First attempt: active tab in current window
    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabs[0]?.id && activeTabs[0]?.url && !isExtensionOrSystemPage(activeTabs[0].url)) {
      targetTabId = activeTabs[0].id;
    } else {
      // Second attempt: any tab in current window
      const winTabs = await browser.tabs.query({ currentWindow: true });
      const found = winTabs.find((t) => t.id && t.url && !isExtensionOrSystemPage(t.url));
      if (found?.id) {
        targetTabId = found.id;
      } else {
        // Third attempt: any tab across all windows
        const anyTabs = await browser.tabs.query({});
        const anyFound = anyTabs.find((t) => t.id && t.url && !isExtensionOrSystemPage(t.url));
        if (anyFound?.id) {
          targetTabId = anyFound.id;
        }
      }
    }

    if (typeof targetTabId === 'number' && typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (textToCopy: string) => {
          return new Promise<void>((resolve, reject) => {
            if (navigator?.clipboard?.writeText) {
              navigator.clipboard.writeText(textToCopy).then(resolve).catch(() => {
                try {
                  const el = document.createElement('textarea');
                  el.value = textToCopy;
                  el.setAttribute('readonly', '');
                  el.style.position = 'fixed';
                  el.style.left = '-9999px';
                  el.style.top = '-9999px';
                  document.body.appendChild(el);
                  el.select();
                  const successful = document.execCommand('copy');
                  document.body.removeChild(el);
                  if (successful) resolve();
                  else reject(new Error('execCommand copy returned false'));
                } catch (e) {
                  reject(e);
                }
              });
            } else {
              try {
                const el = document.createElement('textarea');
                el.value = textToCopy;
                el.setAttribute('readonly', '');
                el.style.position = 'fixed';
                el.style.left = '-9999px';
                el.style.top = '-9999px';
                document.body.appendChild(el);
                el.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(el);
                if (successful) resolve();
                else reject(new Error('execCommand copy returned false'));
              } catch (e) {
                reject(e);
              }
            }
          });
        },
        args: [text],
      });
      return true;
    }
  } catch (error) {
    console.warn('[clipboard] Failed to copy text to clipboard:', error);
  }

  return false;
}

/**
 * Handle copy operation for single or multiple tabs.
 */
export async function handleCopyOperation(
  formatType: CopyFormatType,
  targetTab?: { id?: number; title?: string; url?: string }
): Promise<boolean> {
  try {
    // Check highlighted tabs for multi-tab selection
    let tabs = await browser.tabs.query({ currentWindow: true, highlighted: true });

    if (!tabs || tabs.length <= 1) {
      if (targetTab && targetTab.url) {
        tabs = [targetTab as browser.Tabs.Tab];
      } else if (!tabs || tabs.length === 0) {
        tabs = await browser.tabs.query({ currentWindow: true, active: true });
      }
    }

    const tabData = getTabData(tabs);
    if (tabData.length === 0) {
      if (targetTab?.url) {
        tabData.push({
          title: targetTab.title || targetTab.url,
          url: targetTab.url,
        });
      } else {
        setCopyFailureBadge();
        return false;
      }
    }

    const text = formatTabData(formatType, tabData);
    if (!text) {
      setCopyFailureBadge();
      return false;
    }

    const success = await copyToClipboard(text);
    if (success) {
      setCopySuccessBadge();
      return true;
    } else {
      setCopyFailureBadge();
      return false;
    }
  } catch (error) {
    console.warn('[clipboard] Copy operation failed:', error);
    setCopyFailureBadge();
    return false;
  }
}

/**
 * Create context menu items for all Copy formats.
 */
export function createCopyContextMenuItems(contexts: chrome.contextMenus.ContextType[]): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;

  // Parent menu: 📋 Copy
  chrome.contextMenus.create({
    id: COPY_MENU_IDS.PARENT,
    title: '📋 Copy',
    contexts,
  });

  // 1. Copy URL
  chrome.contextMenus.create({
    id: COPY_MENU_IDS.URL,
    parentId: COPY_MENU_IDS.PARENT,
    title: '🔗 URL',
    contexts,
  });

  // 2. Title - URL
  chrome.contextMenus.create({
    id: COPY_MENU_IDS.TITLE_DASH_URL,
    parentId: COPY_MENU_IDS.PARENT,
    title: '🔤 Title - URL',
    contexts,
  });

  // 3. Title\nURL
  chrome.contextMenus.create({
    id: COPY_MENU_IDS.TITLE_URL,
    parentId: COPY_MENU_IDS.PARENT,
    title: '🔤 Title\\nURL',
    contexts,
  });

  // 4. [Title](URL)
  chrome.contextMenus.create({
    id: COPY_MENU_IDS.MARKDOWN_LINK,
    parentId: COPY_MENU_IDS.PARENT,
    title: 'Ⓜ️ [Title](URL)',
    contexts,
  });

  // 5. Title
  chrome.contextMenus.create({
    id: COPY_MENU_IDS.TITLE,
    parentId: COPY_MENU_IDS.PARENT,
    title: '🔤 Title',
    contexts,
  });
}
