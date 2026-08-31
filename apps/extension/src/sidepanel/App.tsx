import React, { useState, useEffect, useRef } from 'react';
import {
  Header,
  WorkspaceManager,
  WorkspaceManagerHandle,
  DeviceModal,
} from '@arcable/shared/components';
import { getLocalFolderExpanded, setLocalFolderExpanded, useSystemTheme } from '@arcable/shared/hooks';
import { getStoredDeviceName, setStoredDeviceName, getStoredPendingOperations, replayOperations } from '@arcable/shared/utils';
import { browser, getActiveTab } from '../utils/browser';

export const App: React.FC = () => {
  const { isDark } = useSystemTheme();
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [activeTabInfo, setActiveTabInfo] = useState<{ title?: string; url?: string; favIconUrl?: string } | null>(null);
  const [hasRaindropAuth, setHasRaindropAuth] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  useEffect(() => {
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
        chrome.tabs.onActivated.removeListener(listener);
        browser.storage.onChanged.removeListener(handleStorageChange);
      };
    }

    return () => {
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
        deviceName: getStoredDeviceName('Sidepanel'),
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

  const handleOpenTab = async (url: string) => {
    try {
      await browser.tabs.create({ url, active: true });
    } catch (e) {
      console.warn('Failed to open tab via browser API, falling back to window.open:', e);
      window.open(url, '_blank', 'noopener,noreferrer');
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
      <Header
        title="Arcable"
        logoSrc={browser.runtime.getURL('icons/icon32.png')}
        actions={
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <style>{`@keyframes arcable-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            {/* 1. Raindrop sync */}
            <button
              type="button"
              onClick={async () => {
                if (!hasRaindropAuth) {
                  browser.runtime.openOptionsPage();
                  return;
                }
                if (workspaceRef.current) {
                  await workspaceRef.current.triggerSync();
                }
              }}
              disabled={isSyncing}
              title={
                !hasRaindropAuth
                  ? 'Connect Raindrop.io'
                  : isSyncing
                  ? 'Syncing with Raindrop...'
                  : 'Raindrop Sync'
              }
              aria-label="Raindrop Sync"
              style={{
                border: '1px solid transparent',
                background: 'transparent',
                color: isDark ? '#94a3b8' : '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                fontSize: '15px',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                display: 'inline-flex',
                opacity: isSyncing ? 0.5 : 1,
                animation: isSyncing ? 'arcable-spin 1s linear infinite' : 'none',
                transition: 'opacity 0.15s ease',
              }}>
                💧
              </span>
            </button>

            {/* 2. Add current tab */}
            <button
              type="button"
              onClick={handleCaptureCurrentTabFromHeader}
              disabled={isCapturing}
              title="Add Current Tab"
              aria-label="Add Current Tab"
              style={{
                border: '1px solid transparent',
                background: 'transparent',
                color: isDark ? '#94a3b8' : '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: isCapturing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                fontSize: '15px',
                opacity: isCapturing ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              ⚡
            </button>

            {/* 3. Add space */}
            <button
              type="button"
              onClick={() => workspaceRef.current?.openNewSpace()}
              title="Add Space"
              aria-label="Add Space"
              style={{
                border: '1px solid transparent',
                background: 'transparent',
                color: isDark ? '#94a3b8' : '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                fontSize: '15px',
                transition: 'all 0.15s ease',
              }}
            >
              ➕
            </button>

            {/* 4. Devices management */}
            <button
              type="button"
              onClick={() => setIsDeviceModalOpen(true)}
              title="Manage Connected Devices"
              aria-label="Manage Connected Devices"
              style={{
                border: '1px solid transparent',
                background: 'transparent',
                color: isDark ? '#94a3b8' : '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                fontSize: '15px',
                transition: 'all 0.15s ease',
              }}
            >
              📱
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => browser.runtime.openOptionsPage()}
              title="Extension Settings"
              aria-label="Extension Settings"
              style={{
                border: '1px solid transparent',
                background: 'transparent',
                color: isDark ? '#94a3b8' : '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                fontSize: '15px',
                transition: 'all 0.15s ease',
              }}
            >
              ⚙️
            </button>
          </div>
        }
      />

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
          onOpenTab={handleOpenTab}
          onCaptureCurrentTab={handleCaptureCurrentTab}
          onSyncRaindrop={hasRaindropAuth ? handleSyncRaindrop : undefined}
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

