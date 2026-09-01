import { AudibleTab } from '@arcable/shared/types';
import { browser } from './browser';

type AudioChangeListener = (tabs: AudibleTab[]) => void;

class AudioTracker {
  private listeners: Set<AudioChangeListener> = new Set();
  private audibleTabs: Map<number, AudibleTab> = new Map();
  private isInitialized = false;

  constructor() {
    this.setupListeners();
  }

  public subscribe(listener: AudioChangeListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current audible tabs
    try {
      listener(this.getAudibleTabsList());
    } catch {}
    // Ensure initial refresh
    if (!this.isInitialized) {
      void this.refreshAudibleTabs();
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getAudibleTabsList(): AudibleTab[] {
    return Array.from(this.audibleTabs.values());
  }

  public async getAudibleTabs(): Promise<AudibleTab[]> {
    await this.refreshAudibleTabs();
    return this.getAudibleTabsList();
  }

  public async refreshAudibleTabs(): Promise<void> {
    try {
      let tabs: any[] = [];
      if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
        tabs = await browser.tabs.query({ audible: true });
      } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        tabs = await chrome.tabs.query({ audible: true });
      }

      this.audibleTabs.clear();
      for (const tab of tabs) {
        if (tab.id !== undefined) {
          this.audibleTabs.set(tab.id, {
            id: tab.id,
            windowId: tab.windowId,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            audible: tab.audible,
            muted: tab.mutedInfo ? tab.mutedInfo.muted : tab.muted,
          });
        }
      }
      this.isInitialized = true;
      this.notify();
    } catch (err) {
      console.warn('[AudioTracker] Failed to query audible tabs:', err);
    }
  }

  public async activateTab(tabId: number, windowId?: number): Promise<void> {
    try {
      if (typeof browser !== 'undefined' && browser.tabs) {
        await browser.tabs.update(tabId, { active: true });
        if (windowId !== undefined && browser.windows) {
          await browser.windows.update(windowId, { focused: true });
        }
      } else if (typeof chrome !== 'undefined' && chrome.tabs) {
        await chrome.tabs.update(tabId, { active: true });
        if (windowId !== undefined && chrome.windows) {
          await chrome.windows.update(windowId, { focused: true });
        }
      }
    } catch (err) {
      console.warn('[AudioTracker] Failed to activate tab:', err);
    }
  }

  public async toggleMute(tabId: number, targetMuted?: boolean): Promise<void> {
    try {
      const currentTab = this.audibleTabs.get(tabId);
      const shouldMute = targetMuted !== undefined ? targetMuted : !currentTab?.muted;

      if (typeof browser !== 'undefined' && browser.tabs) {
        await browser.tabs.update(tabId, { muted: shouldMute });
      } else if (typeof chrome !== 'undefined' && chrome.tabs) {
        await chrome.tabs.update(tabId, { muted: shouldMute });
      }

      if (currentTab) {
        this.audibleTabs.set(tabId, { ...currentTab, muted: shouldMute });
        this.notify();
      }
    } catch (err) {
      console.warn('[AudioTracker] Failed to toggle mute on tab:', err);
    }
  }

  private notify() {
    const list = this.getAudibleTabsList();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.warn('[AudioTracker] Error in listener:', err);
      }
    }
  }

  private setupListeners() {
    // Initial fetch
    void this.refreshAudibleTabs();

    if (typeof chrome === 'undefined' && typeof browser === 'undefined') {
      return;
    }

    const tabsApi = typeof chrome !== 'undefined' && chrome.tabs ? chrome.tabs : (browser as any)?.tabs;
    if (!tabsApi) return;

    // Listen to tab updates (audible state, muted state, title/favIcon updates)
    if (tabsApi.onUpdated) {
      tabsApi.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
        const isAudibleChanged = changeInfo.audible !== undefined;
        const isMutedChanged = changeInfo.mutedInfo !== undefined;
        const isMetadataChanged = changeInfo.title || changeInfo.favIconUrl || changeInfo.url;

        if (isAudibleChanged || isMutedChanged || isMetadataChanged) {
          const isAudible = tab.audible === true;
          if (isAudible) {
            this.audibleTabs.set(tabId, {
              id: tabId,
              windowId: tab.windowId,
              title: tab.title,
              url: tab.url,
              favIconUrl: tab.favIconUrl,
              audible: tab.audible,
              muted: tab.mutedInfo ? tab.mutedInfo.muted : tab.muted,
            });
            this.notify();
          } else if (this.audibleTabs.has(tabId)) {
            // Tab stopped being audible
            this.audibleTabs.delete(tabId);
            this.notify();
          }
        }
      });
    }

    // Listen to tab removal
    if (tabsApi.onRemoved) {
      tabsApi.onRemoved.addListener((tabId: number) => {
        if (this.audibleTabs.has(tabId)) {
          this.audibleTabs.delete(tabId);
          this.notify();
        }
      });
    }

    // Listen to tab replacement (e.g. prerendering)
    if (tabsApi.onReplaced) {
      tabsApi.onReplaced.addListener((addedTabId: number, removedTabId: number) => {
        if (this.audibleTabs.has(removedTabId)) {
          this.audibleTabs.delete(removedTabId);
          void this.refreshAudibleTabs();
        }
      });
    }
  }
}

export const audioTracker = new AudioTracker();
