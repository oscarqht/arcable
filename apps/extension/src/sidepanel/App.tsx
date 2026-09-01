import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WorkspaceManager,
  WorkspaceManagerHandle,
  DeviceModal,
  ActionDropdownItem,
} from '@arcable/shared/components';
import { TabAssociationMap, Tab, TmpTab } from '@arcable/shared/types';
import { getLocalFolderExpanded, setLocalFolderExpanded, useSystemTheme } from '@arcable/shared/hooks';
import { getStoredDeviceName, setStoredDeviceName, getStoredPendingOperations, replayOperations, areUrlsMatching } from '@arcable/shared/utils';
import { browser, getActiveTab } from '../utils/browser';
import { tabTracker } from '../utils/tabTracker';

export const App: React.FC = () => {
  const { isDark } = useSystemTheme();
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [activeTabInfo, setActiveTabInfo] = useState<{ title?: string; url?: string; favIconUrl?: string } | null>(null);
  const [tabAssociations, setTabAssociations] = useState<TabAssociationMap>({});
  const [tmpTabs, setTmpTabs] = useState<TmpTab[]>([]);
  const [highlightedTabId, setHighlightedTabId] = useState<string | null>(null);
  const [hasRaindropAuth, setHasRaindropAuth] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

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

    // Initial tmp tabs subscription
    tabTracker.getTmpTabs().then(setTmpTabs);
    const unsubTmpTabs = tabTracker.subscribeTmpTabs(setTmpTabs);

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


    // Check initial Raindrop auth & cached snapshot
    browser.storage.local.get(['arcable_raindrop_auth', 'arcable_workspace_snapshot']).then((res: any) => {
      const auth = res.arcable_raindrop_auth;
      if (auth && auth.isAuthenticated) {
        setHasRaindropAuth(true);
      }
      if (res.arcable_workspace_snapshot && typeof window !== 'undefined') {
        const local = window.localStorage.getItem('arcable_workspace_data');
        if (!local) {
          let snapshot = res.arcable_workspace_snapshot;
          const remainingOps = getStoredPendingOperations();
          if (remainingOps.length > 0) {
            snapshot = replayOperations(snapshot, remainingOps);
          }
          const merged = {
            ...snapshot,
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
        }
      }
      // Perform initial tab tracking sync once local snapshot is processed
      syncTabsWithTracker();
    });

    browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((res: any) => {
      if (res && res.success && res.data?.isAuthenticated) {
        setHasRaindropAuth(true);
      }
    });

    // Listen for storage changes (e.g. login/logout in options or background sync updates)
    const handleStorageChange = (changes: Record<string, any>, area: string) => {
      if (area === 'local') {
        if (changes.arcable_raindrop_auth) {
          setHasRaindropAuth(Boolean(changes.arcable_raindrop_auth.newValue?.isAuthenticated));
        }
        if (changes.arcable_workspace_snapshot?.newValue && typeof window !== 'undefined') {
          let snapshot = changes.arcable_workspace_snapshot.newValue;
          const remainingOps = getStoredPendingOperations();
          if (remainingOps.length > 0) {
            snapshot = replayOperations(snapshot, remainingOps);
          }
          try {
            const raw = window.localStorage.getItem('arcable_workspace_data');
            const current = raw ? JSON.parse(raw) : null;
            const currentActive = current?.activeSpaceId;
            const activeSpaceStillExists = snapshot.spaces?.some((s: any) => s.id === currentActive);
            const merged = {
              ...snapshot,
              folders: (snapshot.folders || []).map((f: any) => {
                const isExp = f.isExpanded !== undefined ? f.isExpanded : getLocalFolderExpanded(f.id, true);
                setLocalFolderExpanded(f.id, isExp);
                return {
                  ...f,
                  isExpanded: isExp,
                };
              }),
              activeSpaceId: activeSpaceStillExists
                ? currentActive
                : (snapshot.activeSpaceId || snapshot.spaces?.[0]?.id || 'space_personal'),
            };
            window.localStorage.setItem('arcable_workspace_data', JSON.stringify(merged));
          } catch {
            const merged = {
              ...snapshot,
              folders: (snapshot.folders || []).map((f: any) => {
                const isExp = f.isExpanded !== undefined ? f.isExpanded : getLocalFolderExpanded(f.id, true);
                setLocalFolderExpanded(f.id, isExp);
                return {
                  ...f,
                  isExpanded: isExp,
                };
              }),
            };
            window.localStorage.setItem(
              'arcable_workspace_data',
              JSON.stringify(merged)
            );
          }
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

    // Listen to tab activation changes
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
      const listener = () => updateActiveTab();
      chrome.tabs.onActivated.addListener(listener);
      return () => {
        unsubAssociations();
        unsubTmpTabs();
        unsubActivated();
        chrome.tabs.onActivated.removeListener(listener);
        browser.storage.onChanged.removeListener(handleStorageChange);
      };
    }

    return () => {
      unsubAssociations();
      unsubTmpTabs();
      unsubActivated();
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
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_SEARCH',
      payload: { query },
    });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to search Raindrop');
    }
    return res.data || { items: [], collections: [] };
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

  const handleOpenTab = async (url: string, tabId?: string) => {
    if (tabId) {
      setHighlightedTabId(tabId);
    }
    try {
      // Check if this is a tmp tab
      if (tabId && tabId.startsWith('tmp_')) {
        const matchingTmp = tmpTabs.find((t) => t.id === tabId || areUrlsMatching(t.url, url));
        if (matchingTmp && matchingTmp.browserTabId !== undefined) {
          await tabTracker.activateTab(matchingTmp.browserTabId, matchingTmp.windowId);
          return;
        }
      }

      // Check if this specific tab item is already associated
      if (tabId && tabAssociations[tabId]) {
        const assoc = tabAssociations[tabId];
        await tabTracker.activateTab(assoc.browserTabId, assoc.windowId);
        return;
      }

      // Prioritize associating new browser tab with the tab item being clicked
      if (tabId) {
        await tabTracker.openAndAssociateTab(tabId, url);
        return;
      }

      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('arcable_workspace_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          const allTabs = (parsed.tabs || []) as Tab[];
          const matchingItem = allTabs.find((t) => areUrlsMatching(t.url, url));

          if (matchingItem && tabAssociations[matchingItem.id]) {
            const assoc = tabAssociations[matchingItem.id];
            await tabTracker.activateTab(assoc.browserTabId, assoc.windowId);
            return;
          } else if (matchingItem) {
            await tabTracker.openAndAssociateTab(matchingItem.id, url);
            return;
          }
        }
      }
      await browser.tabs.create({ url, active: true });
    } catch (e) {
      console.warn('Failed to open tab via browser API, falling back to window.open:', e);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCloseTmpTab = async (tab: TmpTab) => {
    if (tab.browserTabId !== undefined) {
      await tabTracker.closeTmpTab(tab.browserTabId);
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
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        backgroundColor: isDark ? '#0b0f19' : '#f8fafc',
        color: isDark ? '#f8fafc' : '#0f172a',
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
          defaultViewMode="focused"
          headerTitle="Sidepanel Workspace"
          hideControlBarActions={true}
          tabAssociations={tabAssociations}
          tmpTabs={tmpTabs}
          onCloseTmpTab={handleCloseTmpTab}
          highlightedTabId={highlightedTabId}
          onOpenTab={handleOpenTab}
          onCloseAssociatedTab={handleCloseAssociatedTab}
          onResetDivertedUrl={handleResetDivertedUrl}
          onTabsChange={handleTabsChange}
          onCaptureCurrentTab={handleCaptureCurrentTab}
          bottomBarMenuItems={bottomBarMenuItems}
          onSyncRaindrop={hasRaindropAuth ? handleSyncRaindrop : undefined}
          onSearchRaindrop={hasRaindropAuth ? handleSearchRaindrop : undefined}
          onSyncStateChange={setIsSyncing}
        />
      </div>

      <DeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        onFetchDevices={handleFetchDevices}
        onRenameDevice={handleRenameDevice}
        onDeleteDevice={handleDeleteDevice}
        onDeleteOtherDevices={handleDeleteOtherDevices}
      />
    </div>
  );
};

