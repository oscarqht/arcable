import { Tab, TabAssociationMap, AssociatedTabInfo, TmpTab } from '@arcable/shared/types';
import { areUrlsMatching, extractTabNotificationBadge } from '@arcable/shared/utils';
import { browser } from './browser';

const SESSION_KEY = 'arcable_tab_associations';
const STORAGE_KEY_TMP_TABS = 'arcable_tmp_tabs';

// In-memory fallback if storage is unavailable
let memoryAssociations: TabAssociationMap = {};
let memoryTmpTabs: TmpTab[] = [];

type ChangeListener = (associations: TabAssociationMap) => void;
type TmpTabsChangeListener = (tmpTabs: TmpTab[]) => void;
type TabActivatedListener = (tabItemId: string | null) => void;

class TabTracker {
  private listeners: Set<ChangeListener> = new Set();
  private tmpTabsListeners: Set<TmpTabsChangeListener> = new Set();
  private tabActivatedListeners: Set<TabActivatedListener> = new Set();
  private isInitialized = false;
  private currentWorkspaceTabs: Tab[] = [];

  constructor() {
    this.setupListeners();
  }

  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    // Immediately notify listener with current associations
    try {
      listener({ ...memoryAssociations });
    } catch {}
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeTmpTabs(listener: TmpTabsChangeListener): () => void {
    this.tmpTabsListeners.add(listener);
    try {
      listener([...memoryTmpTabs]);
    } catch {}
    return () => {
      this.tmpTabsListeners.delete(listener);
    };
  }

  public onTabItemActivated(listener: TabActivatedListener): () => void {
    this.tabActivatedListeners.add(listener);
    return () => {
      this.tabActivatedListeners.delete(listener);
    };
  }

  private notify(associations: TabAssociationMap) {
    const copy = { ...associations };
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (err) {
        console.warn('[TabTracker] Error in listener:', err);
      }
    }
  }

  private notifyTmpTabs(tabs: TmpTab[]) {
    const copy = [...tabs];
    for (const listener of this.tmpTabsListeners) {
      try {
        listener(copy);
      } catch (err) {
        console.warn('[TabTracker] Error in tmpTabs listener:', err);
      }
    }
  }

  private notifyActivated(tabItemId: string | null) {
    for (const listener of this.tabActivatedListeners) {
      try {
        listener(tabItemId);
      } catch (err) {
        console.warn('[TabTracker] Error in tabActivated listener:', err);
      }
    }
  }

  // Get the active tab item ID (workspace tab ID or tmp tab ID) for the active browser tab
  public async getActiveTabItemId(): Promise<string | null> {
    try {
      let activeTab: any = null;
      if (typeof browser !== 'undefined' && browser.tabs) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs[0];
        if (!activeTab) {
          const lastFocusedTabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
          activeTab = lastFocusedTabs[0];
        }
      } else if (typeof chrome !== 'undefined' && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs[0];
        if (!activeTab) {
          const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          activeTab = lastFocusedTabs[0];
        }
      }

      if (!activeTab || activeTab.id === undefined) return null;

      const associations = await this.getAssociations();
      for (const [tabItemId, info] of Object.entries(associations)) {
        if (info.browserTabId === activeTab.id) {
          return tabItemId;
        }
      }

      const tmpTabs = await this.getTmpTabs();
      const matchingTmp = tmpTabs.find((t) => t.browserTabId === activeTab.id);
      if (matchingTmp) {
        return matchingTmp.id;
      }

      if (activeTab.url) {
        const matchingWorkspaceTab = this.currentWorkspaceTabs.find((t) =>
          areUrlsMatching(t.url, activeTab.url)
        );
        if (matchingWorkspaceTab) {
          return matchingWorkspaceTab.id;
        }
      }
    } catch (err) {
      console.warn('[TabTracker] Error getting active tab item ID:', err);
    }
    return null;
  }


  // Load associations from session storage (or local storage fallback)
  public async getAssociations(): Promise<TabAssociationMap> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          const res = await chrome.storage.session.get(SESSION_KEY);
          if (res && res[SESSION_KEY]) {
            memoryAssociations = { ...(res[SESSION_KEY] as TabAssociationMap) };
            return memoryAssociations;
          }
        } catch {}
      }
      if (typeof browser !== 'undefined' && (browser as any).storage?.session) {
        try {
          const res = await (browser as any).storage.session.get(SESSION_KEY);
          if (res && res[SESSION_KEY]) {
            memoryAssociations = { ...(res[SESSION_KEY] as TabAssociationMap) };
            return memoryAssociations;
          }
        } catch {}
      }
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        try {
          const res = await browser.storage.local.get(SESSION_KEY);
          if (res && res[SESSION_KEY]) {
            memoryAssociations = { ...(res[SESSION_KEY] as TabAssociationMap) };
            return memoryAssociations;
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[TabTracker] Could not read associations from storage, using memory fallback:', err);
    }
    return { ...memoryAssociations };
  }

  // Save associations to session storage / local storage
  private async saveAssociations(associations: TabAssociationMap): Promise<void> {
    memoryAssociations = { ...associations };
    this.notify(memoryAssociations);

    let saved = false;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          await chrome.storage.session.set({ [SESSION_KEY]: memoryAssociations });
          saved = true;
        } catch {}
      }
      if (!saved && typeof browser !== 'undefined' && (browser as any).storage?.session) {
        try {
          await (browser as any).storage.session.set({ [SESSION_KEY]: memoryAssociations });
          saved = true;
        } catch {}
      }
    } catch {}

    // Also persist to browser.storage.local for cross-context safety
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        await browser.storage.local.set({ [SESSION_KEY]: memoryAssociations });
      }
    } catch (err) {
      console.warn('[TabTracker] Could not save associations to storage:', err);
    }
  }

  // Load tmp tabs from local storage (or browser storage)
  public async getTmpTabs(): Promise<TmpTab[]> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const res = await browser.storage.local.get(STORAGE_KEY_TMP_TABS);
        if (res && res[STORAGE_KEY_TMP_TABS] && Array.isArray(res[STORAGE_KEY_TMP_TABS])) {
          memoryTmpTabs = [...res[STORAGE_KEY_TMP_TABS]];
          return memoryTmpTabs;
        }
      }
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(STORAGE_KEY_TMP_TABS);
        if (raw) {
          memoryTmpTabs = JSON.parse(raw);
          return memoryTmpTabs;
        }
      }
    } catch (err) {
      console.warn('[TabTracker] Could not read tmpTabs from storage:', err);
    }
    return [...memoryTmpTabs];
  }

  // Save tmp tabs strictly to local storage
  private async saveTmpTabs(tmpTabs: TmpTab[]): Promise<void> {
    memoryTmpTabs = [...tmpTabs];
    this.notifyTmpTabs(memoryTmpTabs);

    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        await browser.storage.local.set({ [STORAGE_KEY_TMP_TABS]: memoryTmpTabs });
      }
    } catch {}

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY_TMP_TABS, JSON.stringify(memoryTmpTabs));
      }
    } catch (err) {
      console.warn('[TabTracker] Could not save tmpTabs to storage:', err);
    }
  }

  // Full synchronization between open browser tabs and workspace items
  public async syncWithWorkspace(workspaceTabs: Tab[]): Promise<TabAssociationMap> {
    this.currentWorkspaceTabs = workspaceTabs;
    let allBrowserTabs: any[] = [];
    try {
      allBrowserTabs = await browser.tabs.query({});
    } catch (err) {
      console.warn('[TabTracker] tabs.query failed:', err);
    }

    const currentAssociations = await this.getAssociations();
    const newAssociations: TabAssociationMap = {};

    // Phase 1: Match every workspace tab against open browser tabs
    // If a tab is open with a matching URL, ANY workspace item with that URL associates with it.
    for (const item of workspaceTabs) {
      if (!item.url) continue;

      // 1a. Check if previously associated tab is still open and has matching URL
      const prevInfo = currentAssociations[item.id];
      const prevTab = prevInfo ? allBrowserTabs.find((bt) => bt.id === prevInfo.browserTabId) : null;
      if (
        prevTab &&
        prevTab.id !== undefined &&
        areUrlsMatching(prevTab.url || prevTab.pendingUrl, item.url)
      ) {
        const badge = extractTabNotificationBadge(prevTab.title || prevTab.pendingTitle);
        newAssociations[item.id] = {
          tabItemId: item.id,
          browserTabId: prevTab.id,
          windowId: prevTab.windowId || 0,
          currentUrl: prevTab.url || prevTab.pendingUrl || item.url,
          originalUrl: item.url,
          isDiverted: false,
          badge: badge || undefined,
        };
        continue;
      }

      // 1b. Otherwise find first available open tab with matching URL
      const matchingTab = allBrowserTabs.find(
        (bt) =>
          bt.id !== undefined &&
          areUrlsMatching(bt.url || bt.pendingUrl, item.url)
      );

      if (matchingTab && matchingTab.id !== undefined) {
        const badge = extractTabNotificationBadge(matchingTab.title || matchingTab.pendingTitle);
        newAssociations[item.id] = {
          tabItemId: item.id,
          browserTabId: matchingTab.id,
          windowId: matchingTab.windowId || 0,
          currentUrl: matchingTab.url || matchingTab.pendingUrl || item.url,
          originalUrl: item.url,
          isDiverted: false,
          badge: badge || undefined,
        };
      }
    }

    // Phase 2: Preserve diverted associations for tabs that haven't matched another workspace item
    for (const [tabItemId, info] of Object.entries(currentAssociations)) {
      if (newAssociations[tabItemId]) continue; // already matched in phase 1

      const matchingWorkspaceItem = workspaceTabs.find((t) => t.id === tabItemId);
      const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);

      if (matchingWorkspaceItem && matchingBrowserTab && matchingBrowserTab.id !== undefined) {
        const currentUrl = matchingBrowserTab.url || matchingBrowserTab.pendingUrl || '';
        // If this tab directly matches a workspace item's URL, do not keep it diverted for a different item
        const matchesOtherItem = workspaceTabs.some((other) => areUrlsMatching(currentUrl, other.url));

        if (!matchesOtherItem) {
          const badge = extractTabNotificationBadge(matchingBrowserTab.title || matchingBrowserTab.pendingTitle);
          newAssociations[tabItemId] = {
            tabItemId,
            browserTabId: matchingBrowserTab.id,
            windowId: matchingBrowserTab.windowId || 0,
            currentUrl,
            originalUrl: matchingWorkspaceItem.url || info.originalUrl,
            isDiverted: true,
            badge: badge || undefined,
          };
        }
      }
    }

    await this.saveAssociations(newAssociations);

    // Phase 3: Track unmatched browser tabs in tmp tabs list
    const associatedBrowserTabIds = new Set(Object.values(newAssociations).map((a) => a.browserTabId));
    const unmatchedBrowserTabs = allBrowserTabs.filter((bt) => {
      if (bt.id === undefined || associatedBrowserTabIds.has(bt.id)) return false;
      const url = bt.url || bt.pendingUrl || '';
      if (!url) return false;
      if (
        url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://') ||
        url.startsWith('devtools://')
      ) {
        return false;
      }
      return true;
    });

    const newTmpTabs: TmpTab[] = unmatchedBrowserTabs.map((bt) => ({
      id: `tmp_${bt.id}`,
      url: bt.url || bt.pendingUrl || '',
      title: bt.title || '',
      favIconUrl: bt.favIconUrl,
      browserTabId: bt.id,
      windowId: bt.windowId || 0,
      badge: extractTabNotificationBadge(bt.title || bt.pendingTitle) || undefined,
      createdAt: Date.now(),
    }));

    await this.saveTmpTabs(newTmpTabs);

    return newAssociations;
  }

  // Activate browser tab and focus its window
  public async activateTab(browserTabId: number, windowId?: number): Promise<void> {
    try {
      if (windowId !== undefined && typeof browser.windows !== 'undefined' && browser.windows.update) {
        await browser.windows.update(windowId, { focused: true }).catch(() => {});
      }
      await browser.tabs.update(browserTabId, { active: true });
    } catch (err) {
      console.warn('[TabTracker] Error activating tab:', err);
    }
  }

  // Activate tab, navigate back to original URL, and clear diverted status
  public async activateAndResetUrl(
    browserTabId: number,
    windowId: number | undefined,
    originalUrl: string,
    tabItemId: string
  ): Promise<void> {
    try {
      if (windowId !== undefined && typeof browser.windows !== 'undefined' && browser.windows.update) {
        await browser.windows.update(windowId, { focused: true }).catch(() => {});
      }
      await browser.tabs.update(browserTabId, { url: originalUrl, active: true });

      const associations = await this.getAssociations();
      if (associations[tabItemId]) {
        associations[tabItemId] = {
          ...associations[tabItemId],
          currentUrl: originalUrl,
          isDiverted: false,
        };
        await this.saveAssociations(associations);
      }
    } catch (err) {
      console.warn('[TabTracker] Error resetting tab URL:', err);
    }
  }

  // Close the associated browser tab and break association
  public async closeAssociatedTab(browserTabId: number, tabItemId: string): Promise<void> {
    try {
      await browser.tabs.remove(browserTabId).catch(() => {});
      const associations = await this.getAssociations();
      for (const [id, info] of Object.entries(associations)) {
        if (info.browserTabId === browserTabId || id === tabItemId) {
          delete associations[id];
        }
      }
      await this.saveAssociations(associations);
    } catch (err) {
      console.warn('[TabTracker] Error closing tab:', err);
    }
  }

  // Close a temporary tab
  public async closeTmpTab(browserTabId: number): Promise<void> {
    try {
      await browser.tabs.remove(browserTabId).catch(() => {});
      const currentTmpTabs = await this.getTmpTabs();
      const updated = currentTmpTabs.filter((t) => t.browserTabId !== browserTabId);
      await this.saveTmpTabs(updated);
    } catch (err) {
      console.warn('[TabTracker] Error closing tmp tab:', err);
    }
  }

  // Open a new browser tab and associate it with tab item
  public async openAndAssociateTab(tabItemId: string, url: string): Promise<void> {
    try {
      const newTab = await browser.tabs.create({ url, active: true });
      if (newTab && newTab.id !== undefined) {
        const associations = await this.getAssociations();
        const badge = extractTabNotificationBadge(newTab.title || (newTab as any).pendingTitle);
        associations[tabItemId] = {
          tabItemId,
          browserTabId: newTab.id,
          windowId: newTab.windowId || 0,
          currentUrl: url,
          originalUrl: url,
          isDiverted: false,
          badge: badge || undefined,
        };
        // Also associate any other workspace tabs that have matching URL
        for (const item of this.currentWorkspaceTabs) {
          if (item.url && areUrlsMatching(item.url, url)) {
            associations[item.id] = {
              tabItemId: item.id,
              browserTabId: newTab.id,
              windowId: newTab.windowId || 0,
              currentUrl: url,
              originalUrl: item.url,
              isDiverted: false,
              badge: badge || undefined,
            };
          }
        }
        await this.saveAssociations(associations);
      }
    } catch (err) {
      console.warn('[TabTracker] Error opening new tab:', err);
      // Fallback
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // Setup browser event listeners
  private setupListeners() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Listen to storage changes across contexts
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (changes[SESSION_KEY]) {
          const newVal = (changes[SESSION_KEY].newValue as TabAssociationMap) || {};
          memoryAssociations = { ...newVal };
          this.notify(memoryAssociations);
        }
        if (changes[STORAGE_KEY_TMP_TABS]) {
          const newVal = (changes[STORAGE_KEY_TMP_TABS].newValue as TmpTab[]) || [];
          memoryTmpTabs = [...newVal];
          this.notifyTmpTabs(memoryTmpTabs);
        }
      });
    }

    const tabsApi = typeof browser !== 'undefined' && browser.tabs ? browser.tabs : (typeof chrome !== 'undefined' ? chrome.tabs : null);
    
    // 1. Tab created
    if (tabsApi && tabsApi.onCreated) {
      tabsApi.onCreated.addListener(async () => {
        await this.syncWithWorkspace(this.currentWorkspaceTabs);
      });
    }

    // 2. Tab updated (URL changes / navigation / title load)
    if (tabsApi && tabsApi.onUpdated) {
      tabsApi.onUpdated.addListener(async (tabId: number, changeInfo: any, tab: any) => {
        await this.syncWithWorkspace(this.currentWorkspaceTabs);
      });
    }

    // 3. Tab removed (closed)
    if (tabsApi && tabsApi.onRemoved) {
      tabsApi.onRemoved.addListener(async (tabId: number) => {
        const associations = await this.getAssociations();
        let changed = false;

        for (const [tabItemId, info] of Object.entries(associations)) {
          if (info.browserTabId === tabId) {
            delete associations[tabItemId];
            changed = true;
          }
        }

        if (changed) {
          await this.saveAssociations(associations);
        }

        const tmpTabs = await this.getTmpTabs();
        const updatedTmp = tmpTabs.filter((t) => t.browserTabId !== tabId);
        if (updatedTmp.length !== tmpTabs.length) {
          await this.saveTmpTabs(updatedTmp);
        }
      });
    }

    // 4. Tab activated (user selected browser tab)
    if (tabsApi && tabsApi.onActivated) {
      tabsApi.onActivated.addListener(async (activeInfo: any) => {
        const associations = await this.getAssociations();
        let found = false;
        for (const [tabItemId, info] of Object.entries(associations)) {
          if (info.browserTabId === activeInfo.tabId) {
            this.notifyActivated(tabItemId);
            found = true;
            break;
          }
        }
        if (!found) {
          const tmpTabs = await this.getTmpTabs();
          const matchingTmp = tmpTabs.find((t) => t.browserTabId === activeInfo.tabId);
          if (matchingTmp) {
            this.notifyActivated(matchingTmp.id);
            found = true;
          }
        }
        if (!found) {
          // Fallback: sync with current workspace tabs and check again
          const updatedAssociations = await this.syncWithWorkspace(this.currentWorkspaceTabs);
          for (const [tabItemId, info] of Object.entries(updatedAssociations)) {
            if (info.browserTabId === activeInfo.tabId) {
              this.notifyActivated(tabItemId);
              found = true;
              break;
            }
          }
          if (!found) {
            const updatedTmp = await this.getTmpTabs();
            const matchingTmp = updatedTmp.find((t) => t.browserTabId === activeInfo.tabId);
            if (matchingTmp) {
              this.notifyActivated(matchingTmp.id);
              found = true;
            }
          }
        }
        if (!found) {
          this.notifyActivated(null);
        }
      });
    }
  }
}

export const tabTracker = new TabTracker();

