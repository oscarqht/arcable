import { Tab, TabAssociationMap, AssociatedTabInfo } from '@arcable/shared/types';
import { normalizeUrl, areUrlsMatching } from '@arcable/shared/utils';
import { browser } from './browser';

const SESSION_KEY = 'arcable_tab_associations';

// In-memory fallback if storage is unavailable
let memoryAssociations: TabAssociationMap = {};

type ChangeListener = (associations: TabAssociationMap) => void;
type TabActivatedListener = (tabItemId: string) => void;

class TabTracker {
  private listeners: Set<ChangeListener> = new Set();
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

  private notifyActivated(tabItemId: string) {
    for (const listener of this.tabActivatedListeners) {
      try {
        listener(tabItemId);
      } catch (err) {
        console.warn('[TabTracker] Error in tabActivated listener:', err);
      }
    }
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
        newAssociations[item.id] = {
          tabItemId: item.id,
          browserTabId: prevTab.id,
          windowId: prevTab.windowId || 0,
          currentUrl: prevTab.url || prevTab.pendingUrl || item.url,
          originalUrl: item.url,
          isDiverted: false,
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
        newAssociations[item.id] = {
          tabItemId: item.id,
          browserTabId: matchingTab.id,
          windowId: matchingTab.windowId || 0,
          currentUrl: matchingTab.url || matchingTab.pendingUrl || item.url,
          originalUrl: item.url,
          isDiverted: false,
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
          newAssociations[tabItemId] = {
            tabItemId,
            browserTabId: matchingBrowserTab.id,
            windowId: matchingBrowserTab.windowId || 0,
            currentUrl,
            originalUrl: matchingWorkspaceItem.url || info.originalUrl,
            isDiverted: true,
          };
        }
      }
    }

    await this.saveAssociations(newAssociations);
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

  // Open a new browser tab and associate it with tab item
  public async openAndAssociateTab(tabItemId: string, url: string): Promise<void> {
    try {
      const newTab = await browser.tabs.create({ url, active: true });
      if (newTab && newTab.id !== undefined) {
        const associations = await this.getAssociations();
        associations[tabItemId] = {
          tabItemId,
          browserTabId: newTab.id,
          windowId: newTab.windowId || 0,
          currentUrl: url,
          originalUrl: url,
          isDiverted: false,
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
      });
    }

    const tabsApi = typeof browser !== 'undefined' && browser.tabs ? browser.tabs : (typeof chrome !== 'undefined' ? chrome.tabs : null);
    
    // 1. Tab created
    if (tabsApi && tabsApi.onCreated) {
      tabsApi.onCreated.addListener(async () => {
        if (this.currentWorkspaceTabs.length > 0) {
          await this.syncWithWorkspace(this.currentWorkspaceTabs);
        }
      });
    }

    // 2. Tab updated (URL changes / navigation / title load)
    if (tabsApi && tabsApi.onUpdated) {
      tabsApi.onUpdated.addListener(async (tabId: number, changeInfo: any, tab: any) => {
        if (this.currentWorkspaceTabs.length > 0) {
          await this.syncWithWorkspace(this.currentWorkspaceTabs);
        }
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
      });
    }

    // 4. Tab activated (user selected browser tab)
    if (tabsApi && tabsApi.onActivated) {
      tabsApi.onActivated.addListener(async (activeInfo: any) => {
        const associations = await this.getAssociations();
        for (const [tabItemId, info] of Object.entries(associations)) {
          if (info.browserTabId === activeInfo.tabId) {
            this.notifyActivated(tabItemId);
          }
        }
      });
    }
  }
}

export const tabTracker = new TabTracker();
