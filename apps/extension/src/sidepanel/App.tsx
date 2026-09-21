import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WorkspaceManager,
  WorkspaceManagerHandle,
  BackupRestoreModal,
  DeviceModal,
  ActionDropdownItem,
} from '@arcable/shared/components';
import { TabAssociationMap, AssociatedTabInfo, Tab, TmpTab, AudibleTab, MediaControlAction, Space, TabUrlVariant, TabOpenOptions } from '@arcable/shared/types';
import { getLocalFolderExpanded, setLocalFolderExpanded, useSystemTheme, getSortedSpaces, useIsMobile, isLegacyDemoWorkspace } from '@arcable/shared/hooks';
import {
  clearStoredPendingOperations,
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  replayOperations,
  areUrlsMatching,
  getSpaceThemeStyles,
  getSpaceNoiseOverlayStyle,
  SpaceThemeTokens,
  searchRaindrop,
} from '@arcable/shared/utils';
import { browser, getActiveTab, captureActiveTabScreenshot, isAndroidPlatform } from '../utils/browser';
import { tabTracker } from '../utils/tabTracker';
import { audioTracker } from '../utils/audioTracker';
import { shouldPersistSidepanelSpaceId, resolveSidepanelActiveSpaceId, VIRTUAL_SYNCED_TABS_SPACE_ID } from './spaceSelection';
import {
  rememberActiveTabForSpace,
  activateRememberedTabForSpace,
  resolveSpaceIdForTabItem,
  forgetBrowserTab,
} from './spaceTabTracker';
export { resolveSidepanelActiveSpaceId };

export const SIDEPANEL_LAST_SPACE_KEY = 'arcable_sidepanel_last_active_space';

export function getStoredLastSpaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SIDEPANEL_LAST_SPACE_KEY);
  } catch {
    return null;
  }
}

export function setStoredLastSpaceId(spaceId: string): void {
  let shouldPersist = true;
  if (typeof window !== 'undefined') {
    try {
      const previousSpaceId = window.localStorage.getItem(SIDEPANEL_LAST_SPACE_KEY);
      shouldPersist = shouldPersistSidepanelSpaceId(previousSpaceId, spaceId);
      if (!shouldPersist) return;
      window.localStorage.setItem(SIDEPANEL_LAST_SPACE_KEY, spaceId);
    } catch {}
  }
  if (!shouldPersist) return;
  try {
    void browser.storage.local.set({ [SIDEPANEL_LAST_SPACE_KEY]: spaceId });
  } catch {}
}


function applySidepanelActiveSpace<T extends { spaces?: Space[]; activeSpaceId?: string }>(
  snapshot: T,
  lastSelectedId?: string | null
): T {
  const activeSpaceId = resolveSidepanelActiveSpaceId(
    snapshot.spaces,
    lastSelectedId,
    snapshot.activeSpaceId
  );
  if (!activeSpaceId) return snapshot;

  setStoredLastSpaceId(activeSpaceId);
  return { ...snapshot, activeSpaceId };
}

export function getStoredWorkspaceTabs(): Tab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('arcable_workspace_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.tabs)) return parsed.tabs;
    }
  } catch {}
  return [];
}

export const App: React.FC = () => {
  const { isDark } = useSystemTheme();
  const isMobileHook = useIsMobile();
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    void isAndroidPlatform().then((val) => {
      if (val) setIsAndroid(true);
    });
  }, []);
  const isMobile = isMobileHook || isAndroid;

  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [currentSpaceTheme, setCurrentSpaceTheme] = useState<SpaceThemeTokens>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('arcable_workspace_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          const lastSpaceId = getStoredLastSpaceId();
          const sorted = getSortedSpaces(parsed.spaces || []);
          const activeId = resolveSidepanelActiveSpaceId(parsed.spaces, lastSpaceId, parsed.activeSpaceId);

          if (activeId) {
            setStoredLastSpaceId(activeId);
            if (parsed.activeSpaceId !== activeId) {
              parsed.activeSpaceId = activeId;
              window.localStorage.setItem('arcable_workspace_data', JSON.stringify(parsed));
            }
            const space = sorted.find((s: any) => s.id === activeId) || sorted[0];
            if (space) {
              return getSpaceThemeStyles(space.colors, isDark, space.themeNoise);
            }
          }
        }
      } catch {}
    }
    return getSpaceThemeStyles(null, isDark);
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.background = currentSpaceTheme.containerBg;
      document.body.style.color = currentSpaceTheme.textColor;
      document.body.style.transition = 'background 0.35s cubic-bezier(0.25, 1, 0.5, 1), color 0.35s ease';
    }
  }, [currentSpaceTheme]);

  const [activeTabInfo, setActiveTabInfo] = useState<{ title?: string; url?: string; favIconUrl?: string } | null>(null);
  const [tabAssociations, setTabAssociations] = useState<TabAssociationMap>({});
  const [tmpTabs, setTmpTabs] = useState<TmpTab[]>([]);
  const [audibleTabs, setAudibleTabs] = useState<AudibleTab[]>([]);
  const [highlightedTabId, setHighlightedTabId] = useState<string | null>(null);
  const [hasRaindropAuth, setHasRaindropAuth] = useState(false);
  const [raindropToken, setRaindropToken] = useState<string | null>(null);
  const [isAuthStateLoaded, setIsAuthStateLoaded] = useState(false);
  const [raindropHydrated, setRaindropHydrated] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [currentDeviceName, setCurrentDeviceName] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const initialRaindropHydrationRef = useRef(false);
  const hasAppliedAuthoritativeSnapshotRef = useRef(false);
  const currentWindowIdRef = useRef<number | null>(null);
  const workspaceTabsRef = useRef<Tab[]>(getStoredWorkspaceTabs());
  const previousSpaceIdRef = useRef<string | null>(null);
  const isInitialSpaceMountRef = useRef<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchWindowId = async () => {
      try {
        if (typeof browser !== 'undefined' && browser.windows?.getCurrent) {
          const win = await browser.windows.getCurrent();
          if (win?.id !== undefined && isMounted) {
            currentWindowIdRef.current = win.id;
          }
        } else if (typeof chrome !== 'undefined' && chrome.windows?.getCurrent) {
          chrome.windows.getCurrent((win) => {
            if (win?.id !== undefined && isMounted) {
              currentWindowIdRef.current = win.id;
            }
          });
        }
      } catch (err) {
        console.warn('[Arcable] Error getting current window ID in sidepanel:', err);
      }
    };
    void fetchWindowId();
    return () => {
      isMounted = false;
    };
  }, []);

  // A newly opened side panel shows its cache while fetching the complete
  // Arcable tree. The successful Raindrop response replaces that cache before
  // automatic writes are allowed; replaying the local outbox here can recreate
  // stale spaces and favourites as duplicates.
  useEffect(() => {
    if (!hasRaindropAuth) {
      initialRaindropHydrationRef.current = false;
      hasAppliedAuthoritativeSnapshotRef.current = false;
      setRaindropHydrated(false);
      return;
    }
    let cancelled = false;
    initialRaindropHydrationRef.current = true;
    void browser.runtime.sendMessage({ type: 'RAINDROP_FETCH_WORKSPACE' }).then((res: any) => {
      if (cancelled) return;
      if (res?.success && res.data && typeof window !== 'undefined') {
        hasAppliedAuthoritativeSnapshotRef.current = true;
        clearStoredPendingOperations();
        const resolved = applySidepanelActiveSpace(res.data, getStoredLastSpaceId());
        window.localStorage.setItem('arcable_workspace_data', JSON.stringify(resolved));
        window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: resolved }));
        workspaceRef.current?.applySnapshot?.(resolved);
        setRaindropHydrated(true);
      }
    }).catch((error) => {
      console.warn('[Arcable Sidepanel] Initial Raindrop tree fetch failed:', error);
    }).finally(() => {
      initialRaindropHydrationRef.current = false;
    });
    return () => { cancelled = true; };
  }, [hasRaindropAuth]);

  // Sync tabTracker with local workspace tabs
  const syncTabsWithTracker = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('arcable_workspace_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tabs && Array.isArray(parsed.tabs)) {
          workspaceTabsRef.current = parsed.tabs;
          void tabTracker.syncWithWorkspace(parsed.tabs);
        }
      }
    } catch {}
  }, []);

  const handleTabsChange = useCallback((tabs: Tab[]) => {
    workspaceTabsRef.current = tabs;
    void tabTracker.syncWithWorkspace(tabs);
  }, []);


  useEffect(() => {
    // Initial tab associations subscription
    tabTracker.getAssociations().then(setTabAssociations);
    const unsubAssociations = tabTracker.subscribe(setTabAssociations);

    // Initial temporary tabs subscription
    tabTracker.getTmpTabs().then(setTmpTabs);
    const unsubTmpTabs = tabTracker.subscribeTmpTabs(setTmpTabs);

    // Initial audible tabs subscription
    audioTracker.getAudibleTabs().then(setAudibleTabs);
    const unsubAudible = audioTracker.subscribe(setAudibleTabs);

    // Tab activation listener (when user selects a browser tab)
    const unsubActivated = tabTracker.onTabItemActivated((tabItemId, details) => {
      setHighlightedTabId(tabItemId);
      if (tabItemId && workspaceRef.current) {
        workspaceRef.current.revealAndHighlightTab(tabItemId);
      }
      if (tabItemId && details?.browserTabId) {
        const winId = details.windowId ?? currentWindowIdRef.current;
        if (winId !== null && winId !== undefined) {
          const workspaceTabs = workspaceTabsRef.current.length > 0
            ? workspaceTabsRef.current
            : getStoredWorkspaceTabs();
          const spaceId = resolveSpaceIdForTabItem(tabItemId, workspaceTabs);
          if (spaceId) {
            void rememberActiveTabForSpace(winId, spaceId, details.browserTabId);
          }
        }
      }
    });

    // Check currently active tab item on mount (highlight only, do not force space switch)
    tabTracker.getActiveTabDetails().then((details) => {
      if (details.tabItemId) {
        setHighlightedTabId(details.tabItemId);
        if (details.browserTabId) {
          const winId = details.windowId ?? currentWindowIdRef.current;
          if (winId !== null && winId !== undefined) {
            const workspaceTabs = workspaceTabsRef.current.length > 0
              ? workspaceTabsRef.current
              : getStoredWorkspaceTabs();
            const spaceId = resolveSpaceIdForTabItem(details.tabItemId, workspaceTabs);
            if (spaceId) {
              void rememberActiveTabForSpace(winId, spaceId, details.browserTabId);
            }
          }
        }
      }
    });

    const handleTabRemoved = (tabId: number) => {
      void forgetBrowserTab(tabId);
    };
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener(handleTabRemoved);
    }


    // Check initial Raindrop auth and cached snapshot
    browser.storage.local.get(['arcable_raindrop_auth', 'arcable_workspace_snapshot', 'arcable_device_id', 'arcable_device_name', SIDEPANEL_LAST_SPACE_KEY]).then((res: any) => {
      if (res.arcable_device_id) {
        setCurrentDeviceId(res.arcable_device_id);
      } else {
        const devId = getOrCreateDeviceId();
        setCurrentDeviceId(devId);
        void browser.storage.local.set({ arcable_device_id: devId });
      }

      if (res.arcable_device_name) {
        setCurrentDeviceName(res.arcable_device_name);
      } else {
        const devName = getStoredDeviceName(undefined, 'Ext');
        setCurrentDeviceName(devName);
        void browser.storage.local.set({ arcable_device_name: devName });
      }

      const auth = res.arcable_raindrop_auth;
      const isRaindropAuth = Boolean(auth && auth.isAuthenticated);
      setHasRaindropAuth(isRaindropAuth);
      setRaindropToken(auth?.accessToken || null);

      if (res[SIDEPANEL_LAST_SPACE_KEY] && !getStoredLastSpaceId()) {
        setStoredLastSpaceId(res[SIDEPANEL_LAST_SPACE_KEY]);
      }

      if (hasAppliedAuthoritativeSnapshotRef.current) {
        // The asynchronous cache read began before the authoritative fetch.
        // Never let its stale result overwrite the fetched snapshot.
      } else if (isRaindropAuth && isLegacyDemoWorkspace(res.arcable_workspace_snapshot)) {
        void browser.storage.local.remove('arcable_workspace_snapshot');
      } else if (isRaindropAuth && res.arcable_workspace_snapshot && typeof window !== 'undefined') {
        const snapshot = res.arcable_workspace_snapshot;
        const resolvedSnapshot = applySidepanelActiveSpace(
          snapshot,
          getStoredLastSpaceId() || res[SIDEPANEL_LAST_SPACE_KEY]
        );

        const merged = {
          ...resolvedSnapshot,
          folders: (resolvedSnapshot.folders || []).map((f: any) => {
            const isExp = f.isExpanded !== undefined ? f.isExpanded : getLocalFolderExpanded(f.id, true);
            setLocalFolderExpanded(f.id, isExp);
            return {
              ...f,
              isExpanded: isExp,
            };
          }),
        };
        window.localStorage.setItem('arcable_workspace_data', JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: merged }));
        workspaceRef.current?.applySnapshot?.(merged);
        if (merged.activeSpaceId) workspaceRef.current?.setActiveSpace?.(merged.activeSpaceId);
      }
      // Perform initial tab tracking sync once local snapshot is processed
      syncTabsWithTracker();
    });

    browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((res: any) => {
      if (res && res.success) {
        setHasRaindropAuth(Boolean(res.data?.isAuthenticated));
      }
      setIsAuthStateLoaded(true);
    }).catch((error) => {
      console.warn('[Arcable Sidepanel] Failed to check Raindrop authentication:', error);
      setIsAuthStateLoaded(true);
    });

    // Listen for storage changes (e.g. login/logout in options or background sync updates)
    const handleStorageChange = (changes: Record<string, any>, area: string) => {
      if (area === 'local') {
        if (changes.arcable_raindrop_auth) {
          const authVal = changes.arcable_raindrop_auth.newValue;
          setHasRaindropAuth(Boolean(authVal?.isAuthenticated));
          setRaindropToken(authVal?.accessToken || null);
        }
        if (changes.arcable_device_id?.newValue) {
          setCurrentDeviceId(changes.arcable_device_id.newValue);
        }
        if (changes.arcable_device_name?.newValue) {
          setCurrentDeviceName(changes.arcable_device_name.newValue);
        }
        if (changes[SIDEPANEL_LAST_SPACE_KEY]?.newValue) {
          const newId = changes[SIDEPANEL_LAST_SPACE_KEY].newValue;
          const currentlyActiveId = workspaceRef.current?.getActiveSpace?.()?.id || getStoredLastSpaceId();
          if (currentlyActiveId !== newId) {
            if (typeof window !== 'undefined') {
              try {
                window.localStorage.setItem(SIDEPANEL_LAST_SPACE_KEY, newId);
              } catch {}
            }
            try {
              const raw = window.localStorage.getItem('arcable_workspace_data');
              if (raw) {
                const workspace = JSON.parse(raw);
                const resolvedId = resolveSidepanelActiveSpaceId(workspace.spaces, newId, workspace.activeSpaceId);
                if (resolvedId && resolvedId !== currentlyActiveId) {
                  workspaceRef.current?.setActiveSpace?.(resolvedId);
                }
              }
            } catch {}
          }
        }
        if (changes.arcable_workspace_snapshot?.newValue && isLegacyDemoWorkspace(changes.arcable_workspace_snapshot.newValue)) {
          void browser.storage.local.remove('arcable_workspace_snapshot');
          return;
        }
        if (changes.arcable_workspace_snapshot?.newValue && typeof window !== 'undefined') {
          let snapshot = changes.arcable_workspace_snapshot.newValue;
          // The fetch response is authoritative. Avoid briefly replaying the
          // old outbox through the storage listener before its direct handler
          // applies the same snapshot.
          const remainingOps = initialRaindropHydrationRef.current
            ? []
            : getStoredPendingOperations();
          if (initialRaindropHydrationRef.current) {
            clearStoredPendingOperations();
          }
          if (remainingOps.length > 0) {
            snapshot = replayOperations(snapshot, remainingOps);
          }
          const currentViewingSpaceId = workspaceRef.current?.getActiveSpace?.()?.id || getStoredLastSpaceId();
          const resolvedSnapshot = applySidepanelActiveSpace(snapshot, currentViewingSpaceId);

          const merged = {
            ...resolvedSnapshot,
            folders: (snapshot.folders || []).map((f: any) => {
              const isExp = f.isExpanded !== undefined ? f.isExpanded : getLocalFolderExpanded(f.id, true);
              setLocalFolderExpanded(f.id, isExp);
              return {
                ...f,
                isExpanded: isExp,
              };
            }),
          };
          window.localStorage.setItem('arcable_workspace_data', JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: merged }));
          workspaceRef.current?.applySnapshot?.(merged);
          syncTabsWithTracker();
        }
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    // Refresh active tab info on focus or mount
    const updateActiveTab = async () => {
      try {
        const tab = await getActiveTab();
        if (tab) {
          setActiveTabInfo({
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
          });
          const activeItemId = await tabTracker.getActiveTabItemId();
          if (activeItemId) {
            setHighlightedTabId(activeItemId);
          }
        }
      } catch (e) {
        console.warn('Error reading active tab in sidepanel:', e);
      }
    };

    updateActiveTab();

    const handleFocus = () => {
      browser.storage.local.get(['arcable_raindrop_auth']).then((res: any) => {
        if (res.arcable_raindrop_auth !== undefined) {
          setHasRaindropAuth(Boolean(res.arcable_raindrop_auth?.isAuthenticated));
        }
        browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((r: any) => {
          if (r && r.success) {
            setHasRaindropAuth(Boolean(r.data?.isAuthenticated));
          }
        });
      });
    };

    window.addEventListener('focus', handleFocus);

    // Listen to tab activation changes
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
      const listener = () => updateActiveTab();
      chrome.tabs.onActivated.addListener(listener);
      return () => {
        unsubAssociations();
        unsubTmpTabs();
        unsubAudible();
        unsubActivated();
        window.removeEventListener('focus', handleFocus);
        chrome.tabs.onActivated.removeListener(listener);
        chrome.tabs.onRemoved?.removeListener(handleTabRemoved);
        browser.storage.onChanged.removeListener(handleStorageChange);
      };
    }

    return () => {
      unsubAssociations();
      unsubTmpTabs();
      unsubAudible();
      unsubActivated();
      window.removeEventListener('focus', handleFocus);
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
        chrome.tabs.onRemoved.removeListener(handleTabRemoved);
      }
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);



  const handleSyncRaindrop = async (syncParams?: {
    localState: any;
    deviceId: string;
    pendingOps: any[];
    replaceBaseline?: boolean;
  }) => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_SYNC_WORKSPACE',
      payload: {
        deviceName: getStoredDeviceName(undefined, 'Ext'),
        localState: syncParams?.localState,
        deviceId: syncParams?.deviceId,
        pendingOps: syncParams?.pendingOps,
        replaceBaseline: syncParams?.replaceBaseline,
      },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to sync with Raindrop');
    }
    return res.data;
  };

  const handleSearchRaindrop = async (query: string, options?: { signal?: AbortSignal }) => {
    const trimmed = query.trim();
    if (!trimmed) {
      return { items: [], collections: [] };
    }

    if (options?.signal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    // Follow webapp's approach: perform fast, non-blocking search in sidepanel context
    if (raindropToken) {
      try {
        return await searchRaindrop(raindropToken, trimmed, { signal: options?.signal });
      } catch (err: any) {
        if (err?.name === 'AbortError' || options?.signal?.aborted) {
          throw err;
        }
        console.warn('[Arcable Sidepanel] Direct Raindrop search failed, falling back to background worker:', err);
      }
    }

    try {
      const res: any = await browser.runtime.sendMessage({
        type: 'RAINDROP_SEARCH',
        payload: { query: trimmed },
      });
      if (!res || !res.success) {
        if (res?.error === 'Not authenticated with Raindrop') {
          return { items: [], collections: [] };
        }
        throw new Error(res?.error || 'Failed to search Raindrop');
      }
      return res.data || { items: [], collections: [] };
    } catch (err: any) {
      if (err?.message === 'Not authenticated with Raindrop') {
        return { items: [], collections: [] };
      }
      throw err;
    }
  };

  const handleSearchCollectionCovers = useCallback(async (query: string): Promise<string[]> => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_SEARCH_COLLECTION_COVERS',
      payload: { query },
    });
    if (!res?.success) throw new Error(res?.error || 'Failed to search Raindrop collection covers');
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const handleRestoreComplete = useCallback(async (restoredSnapshot: any) => {
    if (typeof window !== 'undefined' && restoredSnapshot) {
      const toSave = applySidepanelActiveSpace(restoredSnapshot, getStoredLastSpaceId());
      window.localStorage.setItem('arcable_workspace_data', JSON.stringify(toSave));
      void browser.storage.local.set({
        arcable_workspace_snapshot: toSave,
        arcable_pending_ops: [],
      });

      // A local restore has no corresponding operation-log entries, so a
      // normal sync would merge remote history right over it and silently
      // revert the restored data. Push the restored snapshot as a brand-new
      // Raindrop baseline instead, so it becomes the authoritative state.
      if (hasRaindropAuth) {
        try {
          await handleSyncRaindrop({
            localState: toSave,
            deviceId: getOrCreateDeviceId(),
            pendingOps: [],
            replaceBaseline: true,
          });
        } catch (err) {
          console.warn('[Arcable] Failed to push restored workspace to Raindrop:', err);
        }
      }

      syncTabsWithTracker();
      window.location.reload();
    }
  }, [syncTabsWithTracker, hasRaindropAuth, handleSyncRaindrop]);

  const handleActiveSpaceChange = useCallback((activeSpace: Space | null) => {
    const nextSpaceId = activeSpace?.id;
    if (nextSpaceId) {
      setStoredLastSpaceId(nextSpaceId);
    }

    if (isInitialSpaceMountRef.current) {
      isInitialSpaceMountRef.current = false;
      previousSpaceIdRef.current = nextSpaceId || null;
      return;
    }

    if (nextSpaceId && nextSpaceId !== previousSpaceIdRef.current) {
      previousSpaceIdRef.current = nextSpaceId;
      const winId = currentWindowIdRef.current;
      if (winId !== null && winId !== undefined) {
        void activateRememberedTabForSpace(winId, nextSpaceId);
      } else {
        void browser.windows?.getCurrent?.().then((win) => {
          if (win?.id !== undefined) {
            currentWindowIdRef.current = win.id;
            void activateRememberedTabForSpace(win.id, nextSpaceId);
          }
        }).catch(() => {});
      }
    } else if (!nextSpaceId) {
      previousSpaceIdRef.current = null;
    }
  }, []);

  const handleOpenTab = async (url: string, tabId?: string, tmpTabInfo?: TmpTab, options?: TabOpenOptions) => {
    if (options?.asTmpTab) {
      try {
        const newTab = await browser.tabs.create({ url, active: true });
        if (newTab && newTab.id !== undefined && tmpTabInfo?.title) {
          tabTracker.registerInitialTmpTab(newTab.id, url, tmpTabInfo.title);
        }
        return;
      } catch (e) {
        console.warn('Failed to open tmp tab via browser API, falling back to window.open:', e);
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
    }

    if (tabId) {
      setHighlightedTabId(tabId);
    }
    const inNewTab = Boolean(options?.inNewTab);

    // In mobile device:
    // 1. Click tab item open URL in current tab;
    // 2. Shift+click open in new tab.
    if (isMobile) {
      if (!inNewTab) {
        try {
          const currentTab = await browser.tabs?.getCurrent?.();
          if (currentTab?.id !== undefined) {
            await browser.tabs.update(currentTab.id, { url, active: true });
            return;
          }
        } catch (err) {
          console.warn('browser.tabs.getCurrent failed:', err);
        }
        window.location.href = url;
        return;
      } else {
        try {
          await browser.tabs.create({ url, active: true });
        } catch {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return;
      }
    }

    try {
      // Check if this is a tmp tab
      if (tmpTabInfo || (tabId && tabId.startsWith('tmp_'))) {
        const localTmp = tmpTabs.find(
          (t) => (tabId && t.id === tabId) || (tmpTabInfo && t.id === tmpTabInfo.id)
        );
        
        // If it is already open locally in the browser, activate and focus it (unless shift-clicked for new tab)
        if (localTmp && localTmp.browserTabId !== undefined && !inNewTab) {
          await tabTracker.activateTab(localTmp.browserTabId, localTmp.windowId);
          return;
        }

        // Otherwise it is not open locally (or the user requested a new tab).
        const newTab = await browser.tabs.create({ url, active: true });
        const customTitle = tmpTabInfo?.customTitle || localTmp?.customTitle;
        const initialTitle = tmpTabInfo?.title || localTmp?.title;
        if (newTab && newTab.id !== undefined) {
          if (customTitle) {
            await tabTracker.setTmpTabCustomTitle(newTab.id, url, customTitle);
          } else if (initialTitle) {
            tabTracker.registerInitialTmpTab(newTab.id, url, initialTitle);
          }
        }
        return;
      }

      // Check if this specific tab item is already associated (unless shift-clicked for new tab)
      if (tabId && tabAssociations[tabId] && !inNewTab) {
        const assoc = tabAssociations[tabId];
        await tabTracker.activateTab(assoc.browserTabId, assoc.windowId);
        const winId = assoc.windowId ?? currentWindowIdRef.current;
        if (winId !== null && winId !== undefined) {
          const workspaceTabs = workspaceTabsRef.current.length > 0
            ? workspaceTabsRef.current
            : getStoredWorkspaceTabs();
          const spaceId = resolveSpaceIdForTabItem(tabId, workspaceTabs);
          if (spaceId) {
            void rememberActiveTabForSpace(winId, spaceId, assoc.browserTabId);
          }
        }
        return;
      }

      // Prioritize associating new browser tab with the tab item being clicked
      if (tabId && !inNewTab) {
        await tabTracker.openAndAssociateTab(tabId, url);
        return;
      }

      // When tabId is not provided or shift+click, open a new browser tab
      await browser.tabs.create({ url, active: true });
    } catch (e) {
      console.warn('Failed to open tab via browser API, falling back to window.open:', e);
      if (inNewTab) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = url;
      }
    }
  };

  const handleOpenVariant = useCallback(
    async (variantUrl: string, tab: Tab, variant: TabUrlVariant, options?: TabOpenOptions) => {
      const inNewTab = Boolean(options?.inNewTab);
      // Only favorite groups open each individual item in a separate browser tab and track them separately.
      // Normal tab items with URL variants must open all variants in the same tab.
      const isFavoriteGroup = Boolean(tab.favourite && (tab.isGroup || (tab.urlVariants && tab.urlVariants.length > 1)));

      // For favorite groups, each item is its own distinct tab item that opens/activates its own browser tab
      if (isFavoriteGroup && variant?.id) {
        setHighlightedTabId(variant.id);
        if (tabAssociations[variant.id] && !inNewTab) {
          const assoc = tabAssociations[variant.id];
          await tabTracker.activateTab(assoc.browserTabId, assoc.windowId);
          return;
        }
        if (!inNewTab) {
          await tabTracker.openAndAssociateTab(variant.id, variantUrl);
          return;
        }
        await browser.tabs.create({ url: variantUrl, active: true });
        return;
      }

      setHighlightedTabId(tab.id);

      // In mobile device:
      // 1. Click URL variant open URL in current tab;
      // 2. Shift+click open in new tab.
      if (isMobile) {
        if (!inNewTab) {
          try {
            const currentTab = await browser.tabs?.getCurrent?.();
            if (currentTab?.id !== undefined) {
              await browser.tabs.update(currentTab.id, { url: variantUrl, active: true });
              return;
            }
          } catch (err) {
            console.warn('browser.tabs.getCurrent failed:', err);
          }
          window.location.href = variantUrl;
          return;
        } else {
          try {
            await browser.tabs.create({ url: variantUrl, active: true });
          } catch {
            window.open(variantUrl, '_blank', 'noopener,noreferrer');
          }
          return;
        }
      }

      try {
        if (inNewTab) {
          await browser.tabs.create({ url: variantUrl, active: true });
        } else {
          await tabTracker.updateAssociatedTabUrl(tab.id, variantUrl);
        }
      } catch (e) {
        console.warn('Failed to open variant via tabTracker, falling back to window.open:', e);
        if (inNewTab) {
          window.open(variantUrl, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = variantUrl;
        }
      }
    },
    [isMobile, tabAssociations]
  );

  const handleOpenAsTmpTab = useCallback(async (url: string, title?: string) => {
    try {
      const newTab = await browser.tabs.create({ url, active: true });
      if (newTab && newTab.id !== undefined) {
        tabTracker.registerInitialTmpTab(newTab.id, url, title);
      }
    } catch (e) {
      console.warn('Failed to open tmp tab via browser API, falling back to window.open:', e);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleCloseTmpTab = async (tab: TmpTab) => {
    // Optimistically update tmpTabs in local state so the item disappears immediately
    // and the next item shifts up instantaneously without waiting for IPC
    setTmpTabs((prev) => prev.filter((t) => t.id !== tab.id));

    // Always remove this tab from arcable_tmp_tabs in browser.storage.local.
    // This prevents resurrection: even if the deviceId mismatch causes isLocal=false,
    // the background sync reads arcable_tmp_tabs and would re-upload the deleted tab.
    try {
      const stored = await browser.storage.local.get('arcable_tmp_tabs');
      const currentTmpTabs = (stored.arcable_tmp_tabs as TmpTab[]) || [];
      const updated = currentTmpTabs.filter((t) => t.id !== tab.id);
      if (updated.length !== currentTmpTabs.length) {
        await browser.storage.local.set({ arcable_tmp_tabs: updated });
      }
    } catch (err) {
      console.warn('[Sidepanel] Could not clean up arcable_tmp_tabs on delete:', err);
    }

    // Close the actual browser tab if it's a local tab (has a browserTabId).
    // We check browserTabId directly rather than relying on deviceId matching,
    // since the device ID stored on the tab may differ from currentDeviceId on
    // Firefox Mobile where storage contexts are separate.
    if (tab.browserTabId !== undefined) {
      await tabTracker.closeTmpTab(tab.browserTabId);
    }
  };


  const handleRenameTmpTab = async (tab: TmpTab, newTitle: string) => {
    await tabTracker.setTmpTabCustomTitle(tab.browserTabId, tab.url, newTitle);
  };

  const handleTabPromoted = async (newTab: Tab, tmpTab: TmpTab) => {
    setHighlightedTabId(newTab.id);
    workspaceRef.current?.revealAndHighlightTab?.(newTab.id);

    let targetBrowserTabId = tmpTab.browserTabId;
    let targetWindowId = tmpTab.windowId;

    // Fallback 1: match from local tmpTabs state or tracker
    if (targetBrowserTabId === undefined) {
      const matchInState =
        tmpTabs.find((t) => t.id === tmpTab.id) ||
        tmpTabs.find((t) => t.url && (areUrlsMatching(t.url, newTab.url) || areUrlsMatching(t.url, tmpTab.url)));
      if (matchInState?.browserTabId !== undefined) {
        targetBrowserTabId = matchInState.browserTabId;
        targetWindowId = matchInState.windowId ?? targetWindowId;
      }
    }

    // Fallback 2: extract browserTabId from tmpTab.id pattern (tmp_<deviceId>_<tabId>_<timestamp>)
    if (targetBrowserTabId === undefined && typeof tmpTab.id === 'string') {
      const idMatch = tmpTab.id.match(/^tmp_[^_]+_(\d+)_/);
      if (idMatch) {
        targetBrowserTabId = parseInt(idMatch[1], 10);
      }
    }

    // Fallback 3: query browser tabs for matching URL
    if (targetBrowserTabId === undefined && typeof browser !== 'undefined' && browser.tabs?.query) {
      try {
        const candidateUrls = [newTab.url, tmpTab.url, ...(newTab.urlVariants || []).map((v) => v.url)].filter(Boolean);
        const openTabs = await browser.tabs.query({});
        const matched = openTabs.find((bt: any) =>
          bt.id !== undefined && candidateUrls.some((u) => areUrlsMatching(bt.url || bt.pendingUrl, u))
        );
        if (matched && matched.id !== undefined) {
          targetBrowserTabId = matched.id;
          targetWindowId = matched.windowId ?? targetWindowId;
        }
      } catch (err) {
        console.warn('[Sidepanel] Failed to find open browser tab by URL during promote:', err);
      }
    }

    if (targetBrowserTabId !== undefined) {
      await tabTracker.associateExistingBrowserTab(
        newTab.id,
        targetBrowserTabId,
        newTab.url,
        targetWindowId,
        newTab.urlVariants,
        newTab
      );
    }
  };

  const handleCloseAssociatedTab = async (tabId: string) => {
    let assoc: AssociatedTabInfo | undefined = tabAssociations[tabId];
    if (!assoc) {
      assoc = Object.values(tabAssociations).find((a) => a?.tabItemId === tabId);
    }
    if (assoc) {
      await tabTracker.closeAssociatedTab(assoc.browserTabId, tabId);
    }
  };

  const handleResetDivertedUrl = async (tabId: string) => {
    const assoc = tabAssociations[tabId];
    if (assoc) {
      await tabTracker.activateAndResetUrl(assoc.browserTabId, assoc.windowId, assoc.originalUrl, tabId);
    }
  };

  const handleActivateAudibleTab = async (tabId: number, windowId?: number) => {
    await audioTracker.activateTab(tabId, windowId);
  };

  const handleToggleTabMute = async (tabId: number, muted?: boolean) => {
    await audioTracker.toggleMute(tabId, muted);
  };

  const handleMediaControl = async (tabId: number, action: MediaControlAction) => {
    await audioTracker.sendMediaControl(tabId, action);
  };


  const handleCaptureCurrentTab = async () => {
    try {
      const tab = await getActiveTab();
      if (tab && tab.url) {
        return {
          url: tab.url,
          title: tab.title || '',
          favIconUrl: tab.favIconUrl || '',
        };
      }
    } catch (e) {
      console.warn('Failed to get active tab:', e);
    }
    return null;
  };

  const handleCaptureCurrentTabFromHeader = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      if (workspaceRef.current) {
        await workspaceRef.current.captureCurrentTab();
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSaveCurrentTabToRaindrop = async () => {
    if (!hasRaindropAuth) {
      browser.runtime.openOptionsPage();
      throw new Error('Please connect your Raindrop.io account first in Settings.');
    }
    const tab = await getActiveTab();
    if (!tab || !tab.url) {
      throw new Error('No active tab URL detected.');
    }

    let coverDataUrl: string | undefined;
    try {
      const screenshot = await captureActiveTabScreenshot(tab.windowId);
      if (screenshot) {
        coverDataUrl = screenshot;
      }
    } catch (e) {
      console.warn('[Arcable] Failed to capture active tab screenshot for cover:', e);
    }

    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_SAVE_BOOKMARK',
      payload: {
        link: tab.url,
        title: tab.title || tab.url,
        collectionId: -1,
        coverDataUrl,
      },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to save bookmark to Raindrop');
    }
    return res.data;
  };

  const bottomBarMenuItems: ActionDropdownItem[] = [
    {
      id: 'sync-raindrop',
      label: isSyncing ? 'Syncing...' : hasRaindropAuth ? 'Raindrop Sync' : 'Connect Raindrop.io',
      icon: (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            animation: isSyncing ? 'arcable-spin 1s linear infinite' : 'none',
          }}
        >
          💧
        </span>
      ),
      onClick: async () => {
        if (!hasRaindropAuth) {
          browser.runtime.openOptionsPage();
          return;
        }
        if (workspaceRef.current) {
          await workspaceRef.current.triggerSync();
        }
      },
      disabled: isSyncing,
    },
    {
      id: 'capture-tab',
      label: isCapturing ? 'Adding Tab...' : 'Add Current Tab',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>⚡</span>,
      onClick: handleCaptureCurrentTabFromHeader,
      disabled: isCapturing,
    },
    {
      id: 'add-space',
      label: 'Add Space',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>➕</span>,
      onClick: () => workspaceRef.current?.openNewSpace(),
      dividerAfter: true,
    },
    {
      id: 'devices-sync',
      label: 'Devices & Synced Tabs',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>💻</span>,
      onClick: () => setIsDeviceModalOpen(true),
    },
    {
      id: 'backup-restore',
      label: 'Backup & Restore',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>💾</span>,
      onClick: () => setIsBackupModalOpen(true),
      dividerAfter: true,
    },
    {
      id: 'customize-site',
      label: 'Customize Site (JS/CSS)',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>🎨</span>,
      onClick: async () => {
        const tab = await getActiveTab();
        if (tab?.url) {
          await browser.storage.local.set({ customCodePrefillUrl: tab.url });
        }
        void browser.runtime.openOptionsPage();
      },
    },
    {
      id: 'run-code',
      label: 'Run Code in Page...',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>⚡</span>,
      onClick: async () => {
        await browser.storage.local.set({ optionsInitialTab: 'run-code' });
        void browser.runtime.openOptionsPage();
      },
    },
    {
      id: 'settings',
      label: 'Extension Settings',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>⚙️</span>,
      onClick: () => browser.runtime.openOptionsPage(),
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100dvh',
        width: '100%',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        background: currentSpaceTheme.containerBg,
        color: currentSpaceTheme.textColor,
        transition: 'background 0.35s cubic-bezier(0.25, 1, 0.5, 1), color 0.35s ease',
        position: 'relative',
      }}
    >
      {/* Texture & Grain Overlay for sidepanel background */}
      {Boolean(currentSpaceTheme.themeNoise && currentSpaceTheme.themeNoise > 0) && (
        <div
          aria-hidden="true"
          style={{
            ...getSpaceNoiseOverlayStyle(currentSpaceTheme.themeNoise, currentSpaceTheme.isDark, currentSpaceTheme.containerBg),
            transition: 'opacity 0.35s ease',
          }}
        />
      )}
      <style>{`@keyframes arcable-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          padding: '12px 12px 0 12px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'none',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {!isAuthStateLoaded ? (
          <div
            role="status"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: currentSpaceTheme.subtextColor,
              fontSize: '14px',
            }}
          >
            Checking Raindrop login…
          </div>
        ) : !hasRaindropAuth ? (
          <section
            aria-labelledby="raindrop-login-title"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '24px',
              borderRadius: '14px',
              border: `1px solid ${currentSpaceTheme.borderColor}`,
              background: currentSpaceTheme.shelfBg,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: '32px', marginBottom: '10px' }}>💧</div>
            <h1 id="raindrop-login-title" style={{ margin: '0 0 8px', fontSize: '19px', color: currentSpaceTheme.textColor }}>
              Log in to Raindrop.io
            </h1>
            <p style={{ margin: '0 0 18px', color: currentSpaceTheme.subtextColor, lineHeight: 1.45, fontSize: '14px' }}>
              Connect your account in Extension Settings to open your Arcable workspace.
            </p>
            <button
              type="button"
              onClick={() => void browser.runtime.openOptionsPage()}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '10px 14px',
                cursor: 'pointer',
                background: currentSpaceTheme.primaryColor,
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              Open Extension Settings
            </button>
          </section>
        ) : (
          <WorkspaceManager
          ref={workspaceRef}
          compact={true}
          showWidgets={true}
          defaultViewMode="focused"
          headerTitle="Sidepanel Workspace"
          hideControlBarActions={true}
          onThemeChange={setCurrentSpaceTheme}
          onActiveSpaceChange={handleActiveSpaceChange}
          tabAssociations={tabAssociations}
          tmpTabs={tmpTabs}
          currentDeviceId={currentDeviceId}
          onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
          onCloseTmpTab={handleCloseTmpTab}
          onRenameTmpTab={handleRenameTmpTab}
          onTabPromoted={handleTabPromoted}
          highlightedTabId={highlightedTabId}
          onOpenTab={handleOpenTab}
          onOpenTmpTab={handleOpenAsTmpTab}
          onOpenVariant={handleOpenVariant}
          onCloseAssociatedTab={handleCloseAssociatedTab}
          onResetDivertedUrl={handleResetDivertedUrl}
          onTabsChange={handleTabsChange}
          onCaptureCurrentTab={handleCaptureCurrentTab}
          bottomBarMenuItems={bottomBarMenuItems}
          audibleTabs={audibleTabs}
          onActivateAudibleTab={handleActivateAudibleTab}
          onToggleTabMute={handleToggleTabMute}
          onMediaControl={handleMediaControl}
          onSaveToRaindrop={handleSaveCurrentTabToRaindrop}

          hasRaindropAuth={hasRaindropAuth}
          raindropToken={raindropToken || undefined}
          autoSync={Boolean(hasRaindropAuth && raindropHydrated)}
          onSyncRaindrop={hasRaindropAuth ? handleSyncRaindrop : undefined}
          onSearchRaindrop={hasRaindropAuth ? handleSearchRaindrop : undefined}
          onSearchCollectionCovers={hasRaindropAuth ? handleSearchCollectionCovers : undefined}
          onSyncStateChange={setIsSyncing}
        />
        )}
      </div>

      <BackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreComplete={handleRestoreComplete}
      />

      <DeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        raindropToken={raindropToken || undefined}
        currentDeviceId={currentDeviceId}
        currentDeviceName={currentDeviceName}
        onOpenTmpTab={async (url, title, activate) => {
          const newTab = await browser.tabs.create({ url, active: activate ?? true });
          if (newTab.id) {
            tabTracker.registerInitialTmpTab(newTab.id, url, title);
          }
        }}
        onOpenAllTmpTabs={async (tabsToOpen) => {
          for (const t of tabsToOpen) {
            const newTab = await browser.tabs.create({ url: t.url, active: false });
            if (newTab.id) {
              tabTracker.registerInitialTmpTab(newTab.id, t.url, t.title);
            }
          }
        }}
        onFetchDevices={async () => {
          const res = (await browser.runtime.sendMessage({
            type: 'RAINDROP_GET_DEVICES',
            payload: { currentDeviceId },
          })) as any;
          if (res?.success && Array.isArray(res.data)) {
            return res.data;
          }
          throw new Error(res?.error || 'Failed to fetch devices');
        }}
        onRenameDevice={async (deviceId, newName) => {
          const res = (await browser.runtime.sendMessage({
            type: 'RAINDROP_RENAME_DEVICE',
            payload: { deviceId, newName },
          })) as any;
          if (res?.success && Array.isArray(res.data)) {
            setCurrentDeviceName(newName);
            return res.data;
          }
          throw new Error(res?.error || 'Failed to rename device');
        }}
        onDeleteDevice={async (deviceId) => {
          const res = (await browser.runtime.sendMessage({
            type: 'RAINDROP_DELETE_DEVICE',
            payload: { deviceId },
          })) as any;
          if (res?.success && Array.isArray(res.data)) {
            return res.data;
          }
          throw new Error(res?.error || 'Failed to delete device');
        }}
      />
    </div>
  );
};
