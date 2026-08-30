import React, { useState, useEffect, useRef } from 'react';
import {
  Header,
  WorkspaceManager,
  WorkspaceManagerHandle,
  DropletIcon,
  ZapIcon,
  PlusIcon,
  BracesIcon,
  DevicesIcon,
  DeviceModal,
} from '@arcable/shared/components';
import { getLocalFolderExpanded, setLocalFolderExpanded } from '@arcable/shared/hooks';
import { getStoredDeviceName, setStoredDeviceName } from '@arcable/shared/utils';
import { browser, getActiveTab } from '../utils/browser';

export const App: React.FC = () => {
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
          const snapshot = res.arcable_workspace_snapshot;
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
          const snapshot = changes.arcable_workspace_snapshot.newValue;
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
        backgroundColor: '#f8fafc',
      }}
    >
      <Header
        title="Arcable"
        logoSrc={browser.runtime.getURL('icons/icon32.png')}
        badgeText="Sidepanel"
        badgeVariant="info"
        actions={
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                border: '1px solid #bae6fd',
                background: isSyncing ? '#f0f9ff' : '#e0f2fe',
                color: '#0284c7',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isSyncing ? 'spin 1s linear infinite' : 'none',
                }}
              >
                <DropletIcon size={15} color="#0284c7" />
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
                border: '1px solid #5c7c6f',
                background: '#5c7c6f',
                color: '#ffffff',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: isCapturing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                opacity: isCapturing ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              <ZapIcon size={15} color="#ffffff" />
            </button>

            {/* 3. Add space */}
            <button
              type="button"
              onClick={() => workspaceRef.current?.openNewSpace()}
              title="Add Space"
              aria-label="Add Space"
              style={{
                border: '1px solid #e2e8f0',
                background: '#f1f5f9',
                color: '#0284c7',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
            >
              <PlusIcon size={15} color="#0284c7" />
            </button>

            {/* 4. Devices management */}
            <button
              type="button"
              onClick={() => setIsDeviceModalOpen(true)}
              title="Manage Connected Devices"
              aria-label="Manage Connected Devices"
              style={{
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
            >
              <DevicesIcon size={15} color="#64748b" />
            </button>

            {/* 5. JSON */}
            <button
              type="button"
              onClick={() => workspaceRef.current?.openJsonModal()}
              title="Inspect Workspace JSON"
              aria-label="Inspect Workspace JSON"
              style={{
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
            >
              <BracesIcon size={15} color="#64748b" />
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
                color: '#64748b',
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

