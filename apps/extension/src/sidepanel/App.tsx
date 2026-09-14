import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WorkspaceManager,
  WorkspaceManagerHandle,
  DeviceModal,
  BackupRestoreModal,
  ActionDropdownItem,
} from '@arcable/shared/components';
import { TabAssociationMap, Tab, TmpTab, AudibleTab, MediaControlAction, Space, TabUrlVariant, TabOpenOptions } from '@arcable/shared/types';
import { getLocalFolderExpanded, setLocalFolderExpanded, useSystemTheme, getSortedSpaces, useIsMobile } from '@arcable/shared/hooks';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  setStoredDeviceName,
  getStoredPendingOperations,
  replayOperations,
  areUrlsMatching,
  getSpaceThemeStyles,
  SpaceThemeTokens,
} from '@arcable/shared/utils';
import { browser, getActiveTab, captureActiveTabScreenshot, isAndroidPlatform } from '../utils/browser';
import { tabTracker } from '../utils/tabTracker';
import { audioTracker } from '../utils/audioTracker';

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
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SIDEPANEL_LAST_SPACE_KEY, spaceId);
    } catch {}
  }
  try {
    void browser.storage.local.set({ [SIDEPANEL_LAST_SPACE_KEY]: spaceId });
  } catch {}
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
          const sorted = getSortedSpaces(parsed.spaces || []);
          const lastSpaceId = getStoredLastSpaceId();
          let activeId: string | undefined;

          if (lastSpaceId && sorted.some((s: any) => s.id === lastSpaceId)) {
            activeId = lastSpaceId;
          } else if (sorted.some((s: any) => s.id === parsed.activeSpaceId)) {
            activeId = parsed.activeSpaceId;
          } else {
            activeId = sorted[0]?.id;
          }

          if (activeId) {
            setStoredLastSpaceId(activeId);
            if (parsed.activeSpaceId !== activeId) {
              parsed.activeSpaceId = activeId;
              window.localStorage.setItem('arcable_workspace_data', JSON.stringify(parsed));
            }
            const space = sorted.find((s: any) => s.id === activeId) || sorted[0];
            if (space) {
              return getSpaceThemeStyles(space.colors, isDark);
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
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Sync tabTracker with local workspace tabs
  const syncTabsWithTracker = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('arcable_workspace_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tabs && Array.isArray(parsed.tabs)) {
          void tabTracker.syncWithWorkspace(parsed.tabs);
        }
      }
    } catch {}
  }, []);

  const handleTabsChange = useCallback((tabs: Tab[]) => {
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
    const unsubActivated = tabTracker.onTabItemActivated((tabItemId) => {
      setHighlightedTabId(tabItemId);
      if (tabItemId && workspaceRef.current) {
        workspaceRef.current.revealAndHighlightTab(tabItemId);
      }
    });

    // Check currently active tab item on mount
    tabTracker.getActiveTabItemId().then((tabItemId) => {
      if (tabItemId) {
        setHighlightedTabId(tabItemId);
        if (workspaceRef.current) {
          workspaceRef.current.revealAndHighlightTab(tabItemId);
        }
      }
    });


    // Check initial Raindrop auth and cached snapshot
    browser.storage.local.get(['arcable_raindrop_auth', 'arcable_workspace_snapshot', 'arcable_device_id', SIDEPANEL_LAST_SPACE_KEY]).then((res: any) => {
      if (res.arcable_device_id) {
        setCurrentDeviceId(res.arcable_device_id);
      } else {
        const devId = getOrCreateDeviceId();
        setCurrentDeviceId(devId);
        void browser.storage.local.set({ arcable_device_id: devId });
      }

      const auth = res.arcable_raindrop_auth;
      const isRaindropAuth = Boolean(auth && auth.isAuthenticated);
      setHasRaindropAuth(isRaindropAuth);

      if (res[SIDEPANEL_LAST_SPACE_KEY] && !getStoredLastSpaceId()) {
        setStoredLastSpaceId(res[SIDEPANEL_LAST_SPACE_KEY]);
      }

      if (isRaindropAuth && res.arcable_workspace_snapshot && typeof window !== 'undefined') {
        let snapshot = res.arcable_workspace_snapshot;
        const remainingOps = getStoredPendingOperations();
        if (remainingOps.length > 0) {
          snapshot = replayOperations(snapshot, remainingOps);
        }

        const sorted = getSortedSpaces(snapshot.spaces || []);
        const lastSelected = getStoredLastSpaceId() || res[SIDEPANEL_LAST_SPACE_KEY];
        const spaceStillExists = lastSelected && sorted.some((s: any) => s.id === lastSelected);
        const resolvedActiveSpaceId = spaceStillExists
          ? lastSelected
          : (sorted[0]?.id || 'space_personal');

        setStoredLastSpaceId(resolvedActiveSpaceId);

        const merged = {
          ...snapshot,
          activeSpaceId: resolvedActiveSpaceId,
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
        workspaceRef.current?.setActiveSpace?.(resolvedActiveSpaceId);
      }
      // Perform initial tab tracking sync once local snapshot is processed
      syncTabsWithTracker();
    });

    browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((res: any) => {
      if (res && res.success) {
        setHasRaindropAuth(Boolean(res.data?.isAuthenticated));
      }
    });

    // Listen for storage changes (e.g. login/logout in options or background sync updates)
    const handleStorageChange = (changes: Record<string, any>, area: string) => {
      if (area === 'local') {
        if (changes.arcable_raindrop_auth) {
          setHasRaindropAuth(Boolean(changes.arcable_raindrop_auth.newValue?.isAuthenticated));
        }
        if (changes.arcable_device_id?.newValue) {
          setCurrentDeviceId(changes.arcable_device_id.newValue);
        }
        if (changes[SIDEPANEL_LAST_SPACE_KEY]?.newValue) {
          const newId = changes[SIDEPANEL_LAST_SPACE_KEY].newValue;
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(SIDEPANEL_LAST_SPACE_KEY, newId);
            } catch {}
          }
          workspaceRef.current?.setActiveSpace?.(newId);
        }
        if (changes.arcable_workspace_snapshot?.newValue && typeof window !== 'undefined') {
          let snapshot = changes.arcable_workspace_snapshot.newValue;
          const remainingOps = getStoredPendingOperations();
          if (remainingOps.length > 0) {
            snapshot = replayOperations(snapshot, remainingOps);
          }
          const sorted = getSortedSpaces(snapshot.spaces || []);
          const lastSelected = getStoredLastSpaceId();
          const spaceStillExists = lastSelected && sorted.some((s: any) => s.id === lastSelected);
          const resolvedActiveSpaceId = spaceStillExists
            ? lastSelected
            : (sorted[0]?.id || 'space_personal');

          setStoredLastSpaceId(resolvedActiveSpaceId);

          const merged = {
            ...snapshot,
            activeSpaceId: resolvedActiveSpaceId,
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
          workspaceRef.current?.setActiveSpace?.(resolvedActiveSpaceId);
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
        browser.storage.onChanged.removeListener(handleStorageChange);
      };
    }

    return () => {
      unsubAssociations();
      unsubTmpTabs();
      unsubAudible();
      unsubActivated();
      window.removeEventListener('focus', handleFocus);
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);



  const handleSyncRaindrop = async (syncParams?: {
    localState: any;
    deviceId: string;
    pendingOps: any[];
  }) => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_SYNC_WORKSPACE',
      payload: {
        deviceName: getStoredDeviceName(undefined, 'Ext'),
        localState: syncParams?.localState,
        deviceId: syncParams?.deviceId,
        pendingOps: syncParams?.pendingOps,
      },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to sync with Raindrop');
    }
    return res.data;
  };

  const handleSearchRaindrop = async (query: string) => {
    try {
      const res: any = await browser.runtime.sendMessage({
        type: 'RAINDROP_SEARCH',
        payload: { query },
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

  const handleFetchDevices = async () => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_GET_DEVICES',
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to fetch devices');
    }
    return res.data || [];
  };

  const handleRenameDevice = async (deviceId: string, newName: string) => {
    setStoredDeviceName(newName);
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_RENAME_DEVICE',
      payload: { deviceId, newName },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to rename device');
    }
    return res.data || [];
  };

  const handleDeleteDevice = async (deviceId: string) => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_DELETE_DEVICE',
      payload: { deviceId },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to delete device');
    }
    return res.data || [];
  };

  const handleDeleteOtherDevices = async (keepDeviceId: string) => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_DELETE_OTHER_DEVICES',
      payload: { keepDeviceId },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to delete other devices');
    }
    return res.data || [];
  };

  const handleRestoreComplete = useCallback((restoredSnapshot: any) => {
    if (typeof window !== 'undefined' && restoredSnapshot) {
      const sorted = getSortedSpaces(restoredSnapshot.spaces || []);
      const lastSelected = getStoredLastSpaceId();
      const spaceStillExists = lastSelected && sorted.some((s: any) => s.id === lastSelected);
      const resolvedActiveSpaceId = spaceStillExists
        ? lastSelected
        : (sorted[0]?.id || 'space_personal');
      setStoredLastSpaceId(resolvedActiveSpaceId);
      const toSave = {
        ...restoredSnapshot,
        activeSpaceId: resolvedActiveSpaceId,
      };
      window.localStorage.setItem('arcable_workspace_data', JSON.stringify(toSave));
      void browser.storage.local.set({
        arcable_workspace_snapshot: toSave,
        arcable_pending_ops: [],
      });
      syncTabsWithTracker();
      window.location.reload();
    }
  }, [syncTabsWithTracker]);

  const handleActiveSpaceChange = useCallback((activeSpace: Space | null) => {
    if (activeSpace?.id) {
      setStoredLastSpaceId(activeSpace.id);
    }
  }, []);

  const handleOpenTab = async (url: string, tabId?: string, tmpTabInfo?: TmpTab, options?: TabOpenOptions) => {
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

        // Otherwise (remote tmp tab from another device, or not currently open locally, or inNewTab):
        // Open a new tab in the local browser and take over in current device
        const newTab = await browser.tabs.create({ url, active: true });
        const customTitle = tmpTabInfo?.customTitle || localTmp?.customTitle;
        if (newTab && newTab.id !== undefined && customTitle) {
          await tabTracker.setTmpTabCustomTitle(newTab.id, url, customTitle);
        }
        return;
      }

      // Check if this specific tab item is already associated (unless shift-clicked for new tab)
      if (tabId && tabAssociations[tabId] && !inNewTab) {
        const assoc = tabAssociations[tabId];
        await tabTracker.activateTab(assoc.browserTabId, assoc.windowId);
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
      setHighlightedTabId(tab.id);
      const inNewTab = Boolean(options?.inNewTab);

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
    [isMobile]
  );

  const handleCloseTmpTab = async (tab: TmpTab) => {
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
    if (tmpTab.browserTabId !== undefined) {
      await tabTracker.associateExistingBrowserTab(
        newTab.id,
        tmpTab.browserTabId,
        newTab.url,
        tmpTab.windowId
      );
    }
  };




  const handleCloseAssociatedTab = async (tabId: string) => {
    const assoc = tabAssociations[tabId];
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
        pleaseParse: {},
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
      id: 'devices',
      label: 'Manage Connected Devices',
      icon: <span style={{ fontSize: '15px', display: 'inline-flex' }}>📱</span>,
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
      onClick: () => void browser.runtime.openOptionsPage(),
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
      }}
    >
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
        }}
      >
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
          onCloseTmpTab={handleCloseTmpTab}
          onRenameTmpTab={handleRenameTmpTab}
          onTabPromoted={handleTabPromoted}
          highlightedTabId={highlightedTabId}
          onOpenTab={handleOpenTab}
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
          onSyncRaindrop={hasRaindropAuth ? handleSyncRaindrop : undefined}
          onSearchRaindrop={hasRaindropAuth ? handleSearchRaindrop : undefined}
          onSyncStateChange={setIsSyncing}
        />
      </div>

      <DeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        currentDeviceId={currentDeviceId || undefined}
        onFetchDevices={hasRaindropAuth ? handleFetchDevices : undefined}
        onRenameDevice={hasRaindropAuth ? handleRenameDevice : undefined}
        onDeleteDevice={hasRaindropAuth ? handleDeleteDevice : undefined}
        onDeleteOtherDevices={hasRaindropAuth ? handleDeleteOtherDevices : undefined}
      />

      <BackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreComplete={handleRestoreComplete}
      />
    </div>
  );
};
