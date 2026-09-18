import { Tab, TabAssociationMap, AssociatedTabInfo, TmpTab, TmpTabCustomTitleRecord, TabUrlVariant } from '@arcable/shared/types';
import {
  areUrlsMatching,
  normalizeUrl,
  extractTabNotificationBadge,
  getOrCreateDeviceId,
  getStoredDeviceName,
} from '@arcable/shared/utils';
import { browser, isAndroidPlatform } from './browser';
import { reconcileTmpTabs } from './tmpTabDiff';

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
  private recentlyAssociatedIds: Map<string, number> = new Map();
  private cachedDeviceId: string = '';
  private cachedDeviceName: string = '';
  private cachedIsAndroid: boolean | null = null;
  private hasCompletedInitialSync = false;

  constructor() {
    this.setupListeners();
    void this.loadDeviceInfo();
    void this.loadPlatformInfo();
  }

  public async loadPlatformInfo(): Promise<boolean> {
    if (this.cachedIsAndroid !== null) {
      return this.cachedIsAndroid;
    }
    try {
      this.cachedIsAndroid = await isAndroidPlatform();
    } catch {
      this.cachedIsAndroid = false;
    }
    return this.cachedIsAndroid;
  }

  public async loadDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
    if (this.cachedDeviceId && this.cachedDeviceName) {
      return { deviceId: this.cachedDeviceId, deviceName: this.cachedDeviceName };
    }
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const res = (await browser.storage.local.get(['arcable_device_id', 'arcable_device_name'])) as Record<string, any>;
        if (typeof res.arcable_device_id === 'string' && res.arcable_device_id) this.cachedDeviceId = res.arcable_device_id;
        if (typeof res.arcable_device_name === 'string' && res.arcable_device_name) this.cachedDeviceName = res.arcable_device_name;
      }
      if (!this.cachedDeviceId && typeof window !== 'undefined') {
        this.cachedDeviceId = window.localStorage.getItem('arcable_device_id') || '';
      }
      if (!this.cachedDeviceName && typeof window !== 'undefined') {
        this.cachedDeviceName = window.localStorage.getItem('arcable_device_name') || '';
      }
      if (!this.cachedDeviceId) {
        this.cachedDeviceId = getOrCreateDeviceId();
        if (typeof browser !== 'undefined' && browser.storage?.local) {
          await browser.storage.local.set({ arcable_device_id: this.cachedDeviceId });
        }
      }
      if (!this.cachedDeviceName) {
        this.cachedDeviceName = getStoredDeviceName(undefined, 'Ext');
        if (typeof browser !== 'undefined' && browser.storage?.local) {
          await browser.storage.local.set({ arcable_device_name: this.cachedDeviceName });
        }
      }
    } catch {}
    return { deviceId: this.cachedDeviceId, deviceName: this.cachedDeviceName };
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
    const reconciled = reconcileTmpTabs(memoryTmpTabs, tmpTabs);
    if (!reconciled.changed) return;

    memoryTmpTabs = reconciled.tabs;
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
  private pendingInitialTitles: Map<number, string> = new Map();
  /** Browser tab IDs that are in the process of being closed — excluded from syncWithWorkspace queries */
  private closingTabIds: Set<number> = new Set();
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * Register an initial title for a newly opened tmp tab without marking it as a permanent customTitle.
   * Immediately adds or updates the in-memory tmp tab so the UI reflects it instantly while loading.
   */
  public registerInitialTmpTab(browserTabId: number, url: string, initialTitle?: string): void {
    const trimmedTitle = initialTitle?.trim();
    if (trimmedTitle) {
      this.pendingInitialTitles.set(browserTabId, trimmedTitle);
    }

    const currentDevId = this.cachedDeviceId || 'dev';
    const now = Date.now();
    const existingIndex = memoryTmpTabs.findIndex((t) => t.browserTabId === browserTabId);

    if (existingIndex >= 0) {
      if (trimmedTitle) {
        memoryTmpTabs = memoryTmpTabs.map((t, idx) =>
          idx === existingIndex ? { ...t, title: trimmedTitle, updatedAt: now } : t
        );
        this.notifyTmpTabs(memoryTmpTabs);
      }
    } else {
      const newTmp: TmpTab = {
        id: `tmp_${currentDevId}_${browserTabId}_${now}`,
        url,
        title: trimmedTitle || '',
        browserTabId,
        windowId: 0,
        createdAt: now,
        updatedAt: now,
        deviceType: 'Ext',
        deviceId: this.cachedDeviceId || undefined,
        deviceName: this.cachedDeviceName || undefined,
      };
      memoryTmpTabs = [newTmp, ...memoryTmpTabs];
      this.notifyTmpTabs(memoryTmpTabs);
    }
  }

  /**
   * Debounced wrapper around syncWithWorkspace for tab event listeners.
   * Prevents rapid-fire syncs (e.g. onCreated → onUpdated bursts) from
   * racing with an in-progress closeTmpTab and resurrecting closing tabs.
   */
  private scheduleSync(delayMs: number = 350): void {
    if (this.syncDebounceTimer !== null) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      void this.syncWithWorkspace(this.currentWorkspaceTabs);
    }, delayMs);
  }

  private urlsMatchForDivergence(currentUrl: string, storedUrl: string, urlVariants?: TabUrlVariant[]): boolean {
    if (!currentUrl || !storedUrl) return false;
    const candidateUrls = [storedUrl, ...(urlVariants || []).map((v) => v.url)];
    return candidateUrls.some((candidate) => {
      if (!candidate) return false;
      return normalizeUrl(currentUrl) === normalizeUrl(candidate);
    });
  }

  public async syncWithWorkspace(workspaceTabs: Tab[]): Promise<TabAssociationMap> {
    return this.runWithLock(async () => {
      this.currentWorkspaceTabs = workspaceTabs;
      let allBrowserTabs: any[] = [];
      try {
        allBrowserTabs = await browser.tabs.query({});
      } catch (err) {
        console.warn('[TabTracker] tabs.query failed:', err);
      }

      // Exclude tabs that are actively being closed — they may still appear
      // in browser.tabs.query() briefly while the close is in flight.
      if (this.closingTabIds.size > 0) {
        allBrowserTabs = allBrowserTabs.filter((bt) => !this.closingTabIds.has(bt.id));
      }

      const currentAssociations = await this.getAssociations();
      const newAssociations: TabAssociationMap = {};
      const assignedBrowserTabIds = new Set<number>();
      const assignedTabItemIds = new Set<string>();

      // Only the first sync that actually carries real saved tabs (i.e. once the workspace has
      // loaded on extension/sidepanel startup) is allowed to match already-open browser tabs
      // against saved items on URL alone. This lets already-open tabs get recognized as their
      // saved item instead of showing up as tmp tabs. Every later sync stays restricted to
      // pendingCreations so manually opened tabs are never silently re-associated at runtime.
      // Guarded on workspaceTabs.length: tab-event listeners (onCreated/onUpdated) can debounce
      // into a sync with `currentWorkspaceTabs` still empty before the real workspace data has
      // loaded — that call must not consume the one-shot flag, or the real sync that follows
      // would lose its chance to do the broad match.
      const isInitialSync = !this.hasCompletedInitialSync && workspaceTabs.length > 0;
      if (isInitialSync) this.hasCompletedInitialSync = true;

      // Extract trackable items from workspace:
      // Includes both standalone saved tabs AND individual items in tab groups (variants of group tabs)
      interface TrackableTabItem {
        id: string;
        url: string;
        urlVariants?: TabUrlVariant[];
      }

      const trackableItems: TrackableTabItem[] = [];
      for (const t of workspaceTabs) {
        // Only favorite groups have each child variant tracked separately as an individual trackable item.
        // Normal tab items (in spaces/folders/pinned) with URL variants are tracked as a single tab under t.id.
        const isFavoriteGroup = Boolean(t.favourite && (t.isGroup || (t.urlVariants && t.urlVariants.length > 1)));
        if (isFavoriteGroup && t.urlVariants && t.urlVariants.length > 0) {
          // Add each child variant as a trackable tab item
          for (const v of t.urlVariants) {
            if (v.id && v.url) {
              trackableItems.push({
                id: v.id,
                url: v.url,
              });
            }
          }
        } else if (t.url || (t.urlVariants && t.urlVariants.length > 0)) {
          const tabUrl = t.url || t.urlVariants?.[0]?.url || '';
          if (tabUrl) {
            trackableItems.push({
              id: t.id,
              url: tabUrl,
              urlVariants: t.urlVariants,
            });
          }
        }
      }

      const now = Date.now();
      // Prune expired entries older than 30s
      for (const [id, ts] of this.recentlyAssociatedIds.entries()) {
        if (now - ts > 30000) {
          this.recentlyAssociatedIds.delete(id);
        }
      }

      const findTrackableItem = (id: string): TrackableTabItem | undefined => {
        const found = trackableItems.find((item) => item.id === id);
        if (found) return found;
        const fromWs = workspaceTabs.find((t) => t.id === id);
        if (fromWs) {
          this.recentlyAssociatedIds.delete(id);
          return { id: fromWs.id, url: fromWs.url, urlVariants: fromWs.urlVariants };
        }
        const fromCurrent = this.currentWorkspaceTabs.find((t) => t.id === id);
        if (fromCurrent) {
          return { id: fromCurrent.id, url: fromCurrent.url, urlVariants: fromCurrent.urlVariants };
        }
        const recentTs = this.recentlyAssociatedIds.get(id);
        if (recentTs && now - recentTs < 15000) {
          const existingAssoc = currentAssociations[id];
          if (existingAssoc) {
            return { id, url: existingAssoc.originalUrl, urlVariants: undefined };
          }
        }
        return undefined;
      };

      // Step 1: Retain valid non-diverted existing associations (strictly 1-to-1)
      for (const [tabItemId, info] of Object.entries(currentAssociations)) {
        const matchingWorkspaceItem = findTrackableItem(tabItemId);
        const matchingBrowserTab = allBrowserTabs.find((bt) => bt.id === info.browserTabId);

        if (
          matchingWorkspaceItem &&
          matchingBrowserTab &&
          matchingBrowserTab.id !== undefined &&
          !assignedBrowserTabIds.has(matchingBrowserTab.id)
        ) {
          const currentUrl = matchingBrowserTab.url || matchingBrowserTab.pendingUrl || '';
          if (this.urlsMatchForDivergence(currentUrl, matchingWorkspaceItem.url, matchingWorkspaceItem.urlVariants)) {
            const badge = extractTabNotificationBadge(matchingBrowserTab.title || matchingBrowserTab.pendingTitle);
            newAssociations[tabItemId] = {
              tabItemId,
              browserTabId: matchingBrowserTab.id,
              windowId: matchingBrowserTab.windowId || 0,
              currentUrl: currentUrl || matchingWorkspaceItem.url,
              originalUrl: matchingWorkspaceItem.url,
              isDiverted: false,
              badge: badge || undefined,
              favIconUrl: matchingBrowserTab.favIconUrl,
            };
            assignedBrowserTabIds.add(matchingBrowserTab.id);
            assignedTabItemIds.add(tabItemId);
          }
        }
      }

      // Step 2: Direct matching for workspace items with pending creations (explicitly clicked to open),
      // plus — on the initial sync only — every other unassociated saved item, so tabs that were
      // already open when the extension loaded get recognized instead of becoming tmp tabs.
      // Outside of the initial sync, manually opened tabs must never be automatically associated
      // with saved tab items.
      const unassociatedWorkspaceTabs = trackableItems.filter(
        (item) =>
          !assignedTabItemIds.has(item.id) &&
          Boolean(item.url) &&
          (isInitialSync || this.pendingCreations.has(item.id))
      );

      for (const item of unassociatedWorkspaceTabs) {
        if (assignedTabItemIds.has(item.id) || !item.url) continue;

        const candidateUrls = [item.url, ...(item.urlVariants || []).map((v) => v.url)].filter(Boolean);
        const matchingBrowserTab = allBrowserTabs.find(
          (bt) =>
            bt.id !== undefined &&
            !assignedBrowserTabIds.has(bt.id) &&
            candidateUrls.some((candidate) => areUrlsMatching(bt.url || bt.pendingUrl, candidate))
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
            favIconUrl: matchingBrowserTab.favIconUrl,
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

        const matchingWorkspaceItem = findTrackableItem(tabItemId);
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
            favIconUrl: matchingBrowserTab.favIconUrl || info.favIconUrl,
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
        // Never convert tabs that belong to recently associated tab items into tmp tabs
        for (const [recentId, recentTs] of this.recentlyAssociatedIds.entries()) {
          if (now - recentTs < 15000) {
            const assoc = currentAssociations[recentId] || newAssociations[recentId];
            if (assoc && assoc.browserTabId === bt.id) {
              return false;
            }
          }
        }
        const rawUrl = bt.url || bt.pendingUrl || '';
        if (
          rawUrl.startsWith('chrome-extension://') ||
          rawUrl.startsWith('moz-extension://') ||
          rawUrl.startsWith('devtools://')
        ) {
          return false;
        }
        // Firefox for Android never lets the browser reach zero tabs: closing the
        // last tab (e.g. via closeTmpTab) makes it auto-open a blank "New Tab" to
        // replace it. Without this, that auto-created tab gets tracked right back
        // into the tmp tabs list a moment after the user deleted it. Exclude
        // untouched blank tabs from tracking on Android since they carry no real
        // content yet — a genuine navigation will show up on the next sync once
        // the user actually loads something.
        if (this.cachedIsAndroid && !bt.title) {
          const isBlankNewTab =
            rawUrl === '' ||
            rawUrl === 'about:blank' ||
            rawUrl.startsWith('about:newtab') ||
            rawUrl.startsWith('chrome://newtab') ||
            rawUrl.startsWith('edge://newtab');
          if (isBlankNewTab) return false;
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

        const currentDevId = this.cachedDeviceId || 'dev';
        const existingTmp = memoryTmpTabs.find((t) => t.browserTabId === bt.id);
        const createdAt = existingTmp?.createdAt || Date.now();
        const tabUniqueId = existingTmp?.id || `tmp_${currentDevId}_${bt.id}_${createdAt}`;

        const rawBtTitle = bt.title && bt.title.trim() ? bt.title.trim() : '';
        const pendingTitle = bt.id !== undefined ? this.pendingInitialTitles.get(bt.id) : undefined;
        let resolvedTitle: string;

        if (pendingTitle) {
          const hasLoadedRealTitle =
            Boolean(rawBtTitle) &&
            !isBlankNewTab &&
            rawBtTitle !== currentUrl &&
            rawBtTitle !== 'about:blank';

          if (hasLoadedRealTitle) {
            resolvedTitle = rawBtTitle;
            if (bt.id !== undefined) {
              this.pendingInitialTitles.delete(bt.id);
            }
          } else {
            resolvedTitle = pendingTitle;
          }
        } else {
          resolvedTitle = rawBtTitle || existingTmp?.title || (isBlankNewTab ? 'New Tab' : '');
        }

        return {
          id: tabUniqueId,
          url: currentUrl,
          title: resolvedTitle,
          customTitle: matchedCustomTitle,
          favIconUrl: bt.favIconUrl || existingTmp?.favIconUrl,
          browserTabId: bt.id,
          windowId: bt.windowId || 0,
          badge: extractTabNotificationBadge(bt.title || bt.pendingTitle) || undefined,
          deviceId: this.cachedDeviceId || undefined,
          deviceName: this.cachedDeviceName || undefined,
          deviceType: 'Ext',
          createdAt,
          updatedAt: Date.now(),
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
    // Mark this tab as closing immediately so syncWithWorkspace (triggered by
    // onRemoved / onUpdated events) never re-adds it to the tmp tabs list.
    this.closingTabIds.add(browserTabId);
    // Also prune from in-memory list immediately so subscribers see the removal
    // before the async storage write completes.
    memoryTmpTabs = memoryTmpTabs.filter((t) => t.browserTabId !== browserTabId);
    this.notifyTmpTabs(memoryTmpTabs);

    return this.runWithLock(async () => {
      try {
        await browser.tabs.remove(browserTabId).catch(() => {});
        this.pendingInitialTitles.delete(browserTabId);
        await this.removeTmpTabCustomTitle(browserTabId);
        const currentTmpTabs = await this.getTmpTabs();
        const updated = currentTmpTabs.filter((t) => t.browserTabId !== browserTabId);
        await this.saveTmpTabs(updated);
      } catch (err) {
        console.warn('[TabTracker] Error closing tmp tab:', err);
      } finally {
        // Remove closing flag after all writes are done (onRemoved fires by now)
        this.closingTabIds.delete(browserTabId);
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

  // Update the URL of an already-associated browser tab to a variant URL, and update its originalUrl/reference URL
  public async updateAssociatedTabUrl(tabItemId: string, newUrl: string): Promise<void> {
    const associations = await this.getAssociations();
    const assoc = associations[tabItemId];

    if (!assoc) {
      await this.openAndAssociateTab(tabItemId, newUrl);
      return;
    }

    let tabUpdated = false;
    try {
      if (typeof browser !== 'undefined' && browser.tabs) {
        await browser.tabs.update(assoc.browserTabId, { url: newUrl, active: true });
        tabUpdated = true;
      } else if (typeof chrome !== 'undefined' && chrome.tabs) {
        await chrome.tabs.update(assoc.browserTabId, { url: newUrl, active: true });
        tabUpdated = true;
      }
    } catch (tabErr) {
      console.warn('[TabTracker] Browser tab not found when updating variant URL, reopening:', tabErr);
    }

    if (!tabUpdated) {
      await this.runWithLock(async () => {
        const fresh = await this.getAssociations();
        delete fresh[tabItemId];
        await this.saveAssociations(fresh);
      });
      await this.openAndAssociateTab(tabItemId, newUrl);
      return;
    }

    if (assoc.windowId) {
      try {
        if (typeof browser !== 'undefined' && browser.windows) {
          await browser.windows.update(assoc.windowId, { focused: true });
        } else if (typeof chrome !== 'undefined' && chrome.windows) {
          await chrome.windows.update(assoc.windowId, { focused: true });
        }
      } catch {}
    }

    await this.runWithLock(async () => {
      const fresh = await this.getAssociations();
      if (fresh[tabItemId]) {
        fresh[tabItemId].originalUrl = newUrl;
        fresh[tabItemId].currentUrl = newUrl;
        fresh[tabItemId].isDiverted = false;
        await this.saveAssociations(fresh);
      }
    });
    this.notifyActivated(tabItemId);
  }

  // Associate an existing open browser tab with a workspace tab item (e.g. when promoting a tmp tab)
  public async associateExistingBrowserTab(
    tabItemId: string,
    browserTabId: number,
    originalUrl: string,
    windowId?: number,
    urlVariants?: TabUrlVariant[],
    tabData?: Partial<Tab>
  ): Promise<void> {
    return this.runWithLock(async () => {
      try {
        let finalBrowserTabId = browserTabId;
        let finalWindowId = windowId || 0;
        let currentUrl = originalUrl;
        let title = '';
        let tabFound = false;

        const tabsApi =
          typeof browser !== 'undefined' && browser.tabs
            ? browser.tabs
            : typeof chrome !== 'undefined' && chrome.tabs
            ? chrome.tabs
            : null;

        if (tabsApi && finalBrowserTabId) {
          try {
            const bt = await tabsApi.get(finalBrowserTabId);
            if (bt) {
              currentUrl = bt.url || (bt as any).pendingUrl || originalUrl;
              finalWindowId = bt.windowId || finalWindowId;
              title = bt.title || (bt as any).pendingTitle || '';
              tabFound = true;
            }
          } catch {
            // Tab not found by ID (e.g. invalid, closed, or stale ID)
          }
        }

        // Fallback: If not found by tab ID, search open browser tabs by URL
        if (!tabFound && tabsApi && tabsApi.query) {
          try {
            const allOpenTabs = await tabsApi.query({});
            const candidateUrls = [originalUrl, ...(urlVariants || []).map((v) => v.url)].filter(Boolean);
            const matchedTab = allOpenTabs.find((bt: any) =>
              bt.id !== undefined && candidateUrls.some((u) => areUrlsMatching(bt.url || bt.pendingUrl, u))
            );
            if (matchedTab && matchedTab.id !== undefined) {
              finalBrowserTabId = matchedTab.id;
              finalWindowId = matchedTab.windowId || finalWindowId;
              currentUrl = matchedTab.url || (matchedTab as any).pendingUrl || originalUrl;
              title = matchedTab.title || (matchedTab as any).pendingTitle || '';
              tabFound = true;
            }
          } catch (queryErr) {
            console.warn('[TabTracker] Fallback tab query failed:', queryErr);
          }
        }

        if (!finalBrowserTabId) {
          console.warn('[TabTracker] Cannot associate tab item without a valid browserTabId:', tabItemId);
          return;
        }

        // Register in recentlyAssociatedIds with timestamp to guard against race conditions with workspace sync
        this.recentlyAssociatedIds.set(tabItemId, Date.now());

        // Immediately update currentWorkspaceTabs so any concurrent or scheduled sync sees this tab item
        const existingIdx = this.currentWorkspaceTabs.findIndex((t) => t.id === tabItemId);
        const wsTabEntry: Tab = {
          id: tabItemId,
          url: originalUrl,
          urlVariants,
          ...(tabData || {}),
        } as Tab;
        if (existingIdx >= 0) {
          this.currentWorkspaceTabs[existingIdx] = {
            ...this.currentWorkspaceTabs[existingIdx],
            ...wsTabEntry,
          };
        } else {
          this.currentWorkspaceTabs = [...this.currentWorkspaceTabs, wsTabEntry];
        }

        const badge = extractTabNotificationBadge(title);
        const associations = await this.getAssociations();

        // Strictly 1-to-1: clear any existing association tied to this finalBrowserTabId or tabItemId
        for (const [id, info] of Object.entries(associations)) {
          if (info.browserTabId === finalBrowserTabId || id === tabItemId) {
            delete associations[id];
          }
        }

        const isDiverted = Boolean(
          currentUrl && originalUrl && !this.urlsMatchForDivergence(currentUrl, originalUrl, urlVariants)
        );

        associations[tabItemId] = {
          tabItemId,
          browserTabId: finalBrowserTabId,
          windowId: finalWindowId,
          currentUrl: currentUrl || originalUrl,
          originalUrl,
          isDiverted,
          badge: badge || undefined,
        };

        await this.saveAssociations(associations);

        // Remove custom title record for this tab if one existed
        await this.removeTmpTabCustomTitle(finalBrowserTabId);

        // Remove from tmp tabs list immediately
        const currentTmpTabs = await this.getTmpTabs();
        const updatedTmpTabs = currentTmpTabs.filter(
          (t) => t.browserTabId !== finalBrowserTabId && t.id !== tabItemId
        );
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
    
    // 1. Tab created — debounce so we don't race with close operations
    if (tabsApi && tabsApi.onCreated) {
      tabsApi.onCreated.addListener(() => {
        this.scheduleSync(350);
      });
    }

    // 2. Tab updated (URL changes / navigation / title load) — debounce and
    //    skip if this tab is actively being closed (avoids resurrection).
    if (tabsApi && tabsApi.onUpdated) {
      tabsApi.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
        if (this.closingTabIds.has(tabId)) return;

        const rawTitle = (changeInfo?.title ?? tab?.title)?.trim();
        if (rawTitle && rawTitle !== 'about:blank') {
          const currentUrl = tab?.url || '';
          const isBlank =
            currentUrl.startsWith('chrome://newtab') ||
            currentUrl.startsWith('about:newtab') ||
            currentUrl.startsWith('edge://newtab') ||
            currentUrl === 'about:blank';

          const isMeaningfulTitle = !isBlank && rawTitle !== currentUrl;
          if (isMeaningfulTitle) {
            this.pendingInitialTitles.delete(tabId);
          }

          let updatedInMemory = false;
          memoryTmpTabs = memoryTmpTabs.map((t) => {
            if (t.browserTabId === tabId) {
              const targetTitle = isMeaningfulTitle ? rawTitle : (t.title || rawTitle);
              if (t.title !== targetTitle) {
                updatedInMemory = true;
                return {
                  ...t,
                  title: targetTitle,
                  url: tab?.url || t.url,
                  favIconUrl: tab?.favIconUrl || t.favIconUrl,
                  updatedAt: Date.now(),
                };
              }
            }
            return t;
          });

          if (updatedInMemory) {
            this.notifyTmpTabs(memoryTmpTabs);
          }
        }

        this.scheduleSync(350);
      });
    }


    // 3. Tab removed (closed)
    if (tabsApi && tabsApi.onRemoved) {
      tabsApi.onRemoved.addListener(async (tabId: number) => {
        this.pendingInitialTitles.delete(tabId);
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
