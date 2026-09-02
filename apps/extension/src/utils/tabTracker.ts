import { Tab, TabAssociationMap, AssociatedTabInfo, TmpTab, TmpTabCustomTitleRecord } from '@arcable/shared/types';
import { areUrlsMatching, extractTabNotificationBadge } from '@arcable/shared/utils';
import { browser } from './browser';

const SESSION_KEY = 'arcable_tab_associations';
const STORAGE_KEY_TMP_TABS = 'arcable_tmp_tabs';
const STORAGE_KEY_TMP_TAB_CUSTOM_TITLES = 'arcable_tmp_tab_custom_titles';

// In-memory fallback if storage is unavailable
let memoryAssociations: TabAssociationMap = {};
let memoryTmpTabs: TmpTab[] = [];
let memoryTmpTabCustomTitles: TmpTabCustomTitleRecord[] = [];

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

  // Load custom title records from local storage (or browser storage)
  public async getTmpTabCustomTitles(): Promise<TmpTabCustomTitleRecord[]> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const res = await browser.storage.local.get(STORAGE_KEY_TMP_TAB_CUSTOM_TITLES);
        if (res && res[STORAGE_KEY_TMP_TAB_CUSTOM_TITLES] && Array.isArray(res[STORAGE_KEY_TMP_TAB_CUSTOM_TITLES])) {
          memoryTmpTabCustomTitles = [...res[STORAGE_KEY_TMP_TAB_CUSTOM_TITLES]];
          return memoryTmpTabCustomTitles;
        }
      }
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(STORAGE_KEY_TMP_TAB_CUSTOM_TITLES);
        if (raw) {
          memoryTmpTabCustomTitles = JSON.parse(raw);
          return memoryTmpTabCustomTitles;
        }
      }
    } catch (err) {
      console.warn('[TabTracker] Could not read tmpTabCustomTitles from storage:', err);
    }
    return [...memoryTmpTabCustomTitles];
  }

  // Save custom title records to storage
  private async saveTmpTabCustomTitles(records: TmpTabCustomTitleRecord[]): Promise<void> {
    memoryTmpTabCustomTitles = [...records];
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        await browser.storage.local.set({ [STORAGE_KEY_TMP_TAB_CUSTOM_TITLES]: memoryTmpTabCustomTitles });
      }
    } catch {}

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY_TMP_TAB_CUSTOM_TITLES, JSON.stringify(memoryTmpTabCustomTitles));
      }
    } catch (err) {
      console.warn('[TabTracker] Could not save tmpTabCustomTitles to storage:', err);
    }
  }

  // Set or clear custom title for a tmp tab
  public async setTmpTabCustomTitle(browserTabId: number | undefined, url: string, customTitle: string): Promise<void> {
    return this.runWithLock(async () => {
      const trimmed = customTitle.trim();
      const records = await this.getTmpTabCustomTitles();
      let updatedRecords: TmpTabCustomTitleRecord[];

      if (!trimmed) {
        // Clear / remove custom title for this tab
        updatedRecords = records.filter(
          (r) => !(browserTabId !== undefined && r.tabId === browserTabId) && !areUrlsMatching(r.url, url)
        );
      } else {
        // Update existing matching entry or add new record
        const existingIndex = records.findIndex(
          (r) => (browserTabId !== undefined && r.tabId === browserTabId) || areUrlsMatching(r.url, url)
        );
        const newRecord: TmpTabCustomTitleRecord = {
          tabId: browserTabId,
          url,
          customTitle: trimmed,
          updatedAt: Date.now(),
        };
        if (existingIndex >= 0) {
          updatedRecords = [...records];
          updatedRecords[existingIndex] = newRecord;
        } else {
          updatedRecords = [...records, newRecord];
        }
      }

      await this.saveTmpTabCustomTitles(updatedRecords);

      // Update in-memory tmp tabs and notify subscribers immediately
      const currentTmp = await this.getTmpTabs();
      const updatedTmp = currentTmp.map((t) => {
        if ((browserTabId !== undefined && t.browserTabId === browserTabId) || areUrlsMatching(t.url, url)) {
          return {
            ...t,
            customTitle: trimmed || undefined,
          };
        }
        return t;
      });
      await this.saveTmpTabs(updatedTmp);
    });
  }

  // Remove custom title when a tmp tab is closed
  public async removeTmpTabCustomTitle(browserTabId: number): Promise<void> {
    const records = await this.getTmpTabCustomTitles();
    const filtered = records.filter((r) => r.tabId !== browserTabId);
    if (filtered.length !== records.length) {
      await this.saveTmpTabCustomTitles(filtered);
    }
  }

  private lockPromise: Promise<any> = Promise.resolve();
  private pendingCreations: Map<string, { tabItemId: string; url: string; timestamp: number }> = new Map();

  private runWithLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lockPromise.then(
      () => fn(),
      () => fn()
    );
    this.lockPromise = next.catch(() => {});
    return next;
  }

  public registerPendingCreation(tabItemId: string, url: string): void {
    const now = Date.now();
    for (const [id, entry] of this.pendingCreations.entries()) {
      if (now - entry.timestamp > 15000) {
        this.pendingCreations.delete(id);
      }
    }
    this.pendingCreations.set(tabItemId, { tabItemId, url, timestamp: now });
  }

  public unregisterPendingCreation(tabItemId: string): void {
    this.pendingCreations.delete(tabItemId);
  }

  // Full synchronization between open browser tabs and workspace items (strictly 1-to-1)
  public async syncWithWorkspace(workspaceTabs: Tab[]): Promise<TabAssociationMap> {
    return this.runWithLock(async () => {
      this.currentWorkspaceTabs = workspaceTabs;
      let allBrowserTabs: any[] = [];
      try {
        allBrowserTabs = await browser.tabs.query({});
      } catch (err) {
        console.warn('[TabTracker] tabs.query failed:', err);
      }

      const currentAssociations = await this.getAssociations();
      const newAssociations: TabAssociationMap = {};
      const assignedBrowserTabIds = new Set<number>();
      const assignedTabItemIds = new Set<string>();

      // Step 1: Retain valid non-diverted existing associations (strictly 1-to-1)
      for (const [tabItemId, info] of Object.entries(currentAssociations)) {
        const matchingWorkspaceItem = workspaceTabs.find((t) => t.id === tabItemId);
        const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);

        if (
          matchingWorkspaceItem &&
          matchingBrowserTab &&
          matchingBrowserTab.id !== undefined &&
          !assignedBrowserTabIds.has(matchingBrowserTab.id)
        ) {
          const currentUrl = matchingBrowserTab.url || matchingBrowserTab.pendingUrl || '';
          if (areUrlsMatching(currentUrl, matchingWorkspaceItem.url)) {
            const badge = extractTabNotificationBadge(matchingBrowserTab.title || matchingBrowserTab.pendingTitle);
            newAssociations[tabItemId] = {
              tabItemId,
              browserTabId: matchingBrowserTab.id,
              windowId: matchingBrowserTab.windowId || 0,
              currentUrl: currentUrl || matchingWorkspaceItem.url,
              originalUrl: matchingWorkspaceItem.url,
              isDiverted: false,
              badge: badge || undefined,
            };
            assignedBrowserTabIds.add(matchingBrowserTab.id);
            assignedTabItemIds.add(tabItemId);
          }
        }
      }

      // Step 2: Direct matching ONLY for workspace items with pending creations (explicitly clicked to open)
      // Manually opened tabs must never be automatically associated with saved tab items.
      const unassociatedWorkspaceTabs = workspaceTabs.filter(
        (item) => !assignedTabItemIds.has(item.id) && Boolean(item.url) && this.pendingCreations.has(item.id)
      );

      for (const item of unassociatedWorkspaceTabs) {
        if (assignedTabItemIds.has(item.id) || !item.url) continue;

        const matchingBrowserTab = allBrowserTabs.find(
          (bt) =>
            bt.id !== undefined &&
            !assignedBrowserTabIds.has(bt.id) &&
            areUrlsMatching(bt.url || bt.pendingUrl, item.url)
        );

        if (matchingBrowserTab && matchingBrowserTab.id !== undefined) {
          const badge = extractTabNotificationBadge(matchingBrowserTab.title || matchingBrowserTab.pendingTitle);
          newAssociations[item.id] = {
            tabItemId: item.id,
            browserTabId: matchingBrowserTab.id,
            windowId: matchingBrowserTab.windowId || 0,
            currentUrl: matchingBrowserTab.url || matchingBrowserTab.pendingUrl || item.url,
            originalUrl: item.url,
            isDiverted: false,
            badge: badge || undefined,
          };
          assignedBrowserTabIds.add(matchingBrowserTab.id);
          assignedTabItemIds.add(item.id);
          this.pendingCreations.delete(item.id);
        }
      }

      // Step 3: Diverted associations retention (if browser tab navigated to external URL)
      for (const [tabItemId, info] of Object.entries(currentAssociations)) {
        if (assignedTabItemIds.has(tabItemId)) continue;
        if (assignedBrowserTabIds.has(info.browserTabId)) continue;

        const matchingWorkspaceItem = workspaceTabs.find((t) => t.id === tabItemId);
        const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);

        if (matchingWorkspaceItem && matchingBrowserTab && matchingBrowserTab.id !== undefined) {
          const currentUrl = matchingBrowserTab.url || matchingBrowserTab.pendingUrl || '';
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
          assignedBrowserTabIds.add(matchingBrowserTab.id);
          assignedTabItemIds.add(tabItemId);
        }
      }

      await this.saveAssociations(newAssociations);

      // Phase 3: Track unmatched browser tabs in tmp tabs list
      const associatedBrowserTabIds = new Set(Object.values(newAssociations).map((a) => a.browserTabId));
      const unmatchedBrowserTabs = allBrowserTabs.filter((bt) => {
        if (bt.id === undefined || associatedBrowserTabIds.has(bt.id)) return false;
        const rawUrl = bt.url || bt.pendingUrl || '';
        if (
          rawUrl.startsWith('chrome-extension://') ||
          rawUrl.startsWith('moz-extension://') ||
          rawUrl.startsWith('devtools://')
        ) {
          return false;
        }
        return true;
      });

      const customTitleRecords = await this.getTmpTabCustomTitles();
      let customTitlesModified = false;
      const updatedCustomTitles = [...customTitleRecords];
      const usedCustomTitleIndices = new Set<number>();

      const newTmpTabs: TmpTab[] = unmatchedBrowserTabs.map((bt) => {
        const currentUrl = bt.url || bt.pendingUrl || 'about:blank';
        let matchedCustomTitle: string | undefined;

        // Rule 1: Match by exact tabId first (handles in-session tab navigation - user navigated URL!)
        // "once assigned a custom title, stick with that title regardless of what url that tab navigate to"
        const idMatchIdx = updatedCustomTitles.findIndex(
          (r, idx) => !usedCustomTitleIndices.has(idx) && bt.id !== undefined && r.tabId === bt.id
        );

        if (idMatchIdx >= 0) {
          matchedCustomTitle = updatedCustomTitles[idMatchIdx].customTitle;
          usedCustomTitleIndices.add(idMatchIdx);
          // If URL changed due to navigation, update stored record's URL so it persists latest URL
          if (currentUrl && !areUrlsMatching(updatedCustomTitles[idMatchIdx].url, currentUrl)) {
            updatedCustomTitles[idMatchIdx] = {
              ...updatedCustomTitles[idMatchIdx],
              url: currentUrl,
              updatedAt: Date.now(),
            };
            customTitlesModified = true;
          }
        } else {
          // Rule 2: If not matched by tabId, match by URL (handles browser restart when Chrome creates new tab IDs)
          const urlMatchIdx = updatedCustomTitles.findIndex(
            (r, idx) => !usedCustomTitleIndices.has(idx) && currentUrl && areUrlsMatching(r.url, currentUrl)
          );
          if (urlMatchIdx >= 0) {
            matchedCustomTitle = updatedCustomTitles[urlMatchIdx].customTitle;
            usedCustomTitleIndices.add(urlMatchIdx);
            // Rebind new tabId to this record
            if (bt.id !== undefined && updatedCustomTitles[urlMatchIdx].tabId !== bt.id) {
              updatedCustomTitles[urlMatchIdx] = {
                ...updatedCustomTitles[urlMatchIdx],
                tabId: bt.id,
                updatedAt: Date.now(),
              };
              customTitlesModified = true;
            }
          }
        }

        const isBlankNewTab =
          currentUrl.startsWith('chrome://newtab') ||
          currentUrl.startsWith('about:newtab') ||
          currentUrl.startsWith('edge://newtab') ||
          currentUrl === 'about:blank';

        return {
          id: `tmp_${bt.id}`,
          url: currentUrl,
          title: bt.title || (isBlankNewTab ? 'New Tab' : ''),
          customTitle: matchedCustomTitle,
          favIconUrl: bt.favIconUrl,
          browserTabId: bt.id,
          windowId: bt.windowId || 0,
          badge: extractTabNotificationBadge(bt.title || bt.pendingTitle) || undefined,
          createdAt: Date.now(),
        };
      });

      if (customTitlesModified) {
        await this.saveTmpTabCustomTitles(updatedCustomTitles);
      }

      await this.saveTmpTabs(newTmpTabs);

      return newAssociations;
    });
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
    return this.runWithLock(async () => {
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
    });
  }

  // Close the associated browser tab and break association (strictly 1-to-1)
  public async closeAssociatedTab(browserTabId: number, tabItemId: string): Promise<void> {
    return this.runWithLock(async () => {
      try {
        await browser.tabs.remove(browserTabId).catch(() => {});
        const associations = await this.getAssociations();
        if (associations[tabItemId]) {
          delete associations[tabItemId];
        }
        await this.saveAssociations(associations);
      } catch (err) {
        console.warn('[TabTracker] Error closing tab:', err);
      }
    });
  }

  // Close a temporary tab
  public async closeTmpTab(browserTabId: number): Promise<void> {
    return this.runWithLock(async () => {
      try {
        await browser.tabs.remove(browserTabId).catch(() => {});
        await this.removeTmpTabCustomTitle(browserTabId);
        const currentTmpTabs = await this.getTmpTabs();
        const updated = currentTmpTabs.filter((t) => t.browserTabId !== browserTabId);
        await this.saveTmpTabs(updated);
      } catch (err) {
        console.warn('[TabTracker] Error closing tmp tab:', err);
      }
    });
  }

  // Open a new browser tab and associate it with tab item (strictly 1-to-1)
  public async openAndAssociateTab(tabItemId: string, url: string): Promise<void> {
    try {
      this.registerPendingCreation(tabItemId, url);
      const newTab = await browser.tabs.create({ url, active: true });
      if (newTab && newTab.id !== undefined) {
        const newTabId = newTab.id;
        const windowId = newTab.windowId || 0;
        const title = newTab.title || (newTab as any).pendingTitle;
        await this.runWithLock(async () => {
          const associations = await this.getAssociations();
          const badge = extractTabNotificationBadge(title);
          // Strictly 1-to-1: clear any existing association tied to this browserTabId or tabItemId
          for (const [id, info] of Object.entries(associations)) {
            if (info.browserTabId === newTabId || id === tabItemId) {
              delete associations[id];
            }
          }
          associations[tabItemId] = {
            tabItemId,
            browserTabId: newTabId,
            windowId,
            currentUrl: url,
            originalUrl: url,
            isDiverted: false,
            badge: badge || undefined,
          };
          await this.saveAssociations(associations);
        });
      }
    } catch (err) {
      console.warn('[TabTracker] Error opening new tab:', err);
      // Fallback
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      this.unregisterPendingCreation(tabItemId);
    }
  }

  // Associate an existing open browser tab with a workspace tab item (e.g. when promoting a tmp tab)
  public async associateExistingBrowserTab(
    tabItemId: string,
    browserTabId: number,
    originalUrl: string,
    windowId?: number
  ): Promise<void> {
    return this.runWithLock(async () => {
      try {
        let currentUrl = originalUrl;
        let finalWindowId = windowId || 0;
        let title = '';

        try {
          if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.get) {
            const bt = await browser.tabs.get(browserTabId);
            if (bt) {
              currentUrl = bt.url || (bt as any).pendingUrl || originalUrl;
              finalWindowId = bt.windowId || finalWindowId;
              title = bt.title || (bt as any).pendingTitle || '';
            }
          } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.get) {
            const bt = await chrome.tabs.get(browserTabId);
            if (bt) {
              currentUrl = bt.url || (bt as any).pendingUrl || originalUrl;
              finalWindowId = bt.windowId || finalWindowId;
              title = bt.title || (bt as any).pendingTitle || '';
            }
          }
        } catch (err) {
          console.warn('[TabTracker] Could not get tab details for browserTabId:', browserTabId, err);
        }

        const badge = extractTabNotificationBadge(title);
        const associations = await this.getAssociations();

        // Strictly 1-to-1: clear any existing association tied to this browserTabId or tabItemId
        for (const [id, info] of Object.entries(associations)) {
          if (info.browserTabId === browserTabId || id === tabItemId) {
            delete associations[id];
          }
        }

        const isDiverted = Boolean(currentUrl && originalUrl && !areUrlsMatching(currentUrl, originalUrl));

        associations[tabItemId] = {
          tabItemId,
          browserTabId,
          windowId: finalWindowId,
          currentUrl: currentUrl || originalUrl,
          originalUrl,
          isDiverted,
          badge: badge || undefined,
        };

        await this.saveAssociations(associations);

        // Remove custom title record for this tab if one existed
        await this.removeTmpTabCustomTitle(browserTabId);

        // Remove from tmp tabs list immediately
        const currentTmpTabs = await this.getTmpTabs();
        const updatedTmpTabs = currentTmpTabs.filter((t) => t.browserTabId !== browserTabId);
        await this.saveTmpTabs(updatedTmpTabs);

        // Notify active listener so UI highlights the newly created tab item
        this.notifyActivated(tabItemId);
      } catch (err) {
        console.warn('[TabTracker] Error associating existing browser tab:', err);
      }
    });
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
        if (changes[STORAGE_KEY_TMP_TAB_CUSTOM_TITLES]) {
          const newVal = (changes[STORAGE_KEY_TMP_TAB_CUSTOM_TITLES].newValue as TmpTabCustomTitleRecord[]) || [];
          memoryTmpTabCustomTitles = [...newVal];
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
        await this.runWithLock(async () => {
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

          await this.removeTmpTabCustomTitle(tabId);

          const tmpTabs = await this.getTmpTabs();
          const updatedTmp = tmpTabs.filter((t) => t.browserTabId !== tabId);
          if (updatedTmp.length !== tmpTabs.length) {
            await this.saveTmpTabs(updatedTmp);
          }
        });
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
