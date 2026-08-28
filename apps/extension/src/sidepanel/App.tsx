import React, { useState, useEffect } from 'react';
import { Header, Button, WorkspaceManager } from '@arcable/shared/components';
import { browser, getActiveTab } from '../utils/browser';

export const App: React.FC = () => {
  const [activeTabInfo, setActiveTabInfo] = useState<{ title?: string; url?: string; favIconUrl?: string } | null>(null);
  const [hasRaindropAuth, setHasRaindropAuth] = useState(false);

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
          window.localStorage.setItem('arcable_workspace_data', JSON.stringify(res.arcable_workspace_snapshot));
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
              activeSpaceId: activeSpaceStillExists
                ? currentActive
                : (snapshot.activeSpaceId || snapshot.spaces?.[0]?.id || 'space_personal'),
            };
            window.localStorage.setItem('arcable_workspace_data', JSON.stringify(merged));
          } catch {
            window.localStorage.setItem(
              'arcable_workspace_data',
              JSON.stringify(snapshot)
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
        deviceName: 'Sidepanel',
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100%',
        overflowX: 'hidden',
        overflowY: 'auto',
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => browser.runtime.openOptionsPage()}
              title="Extension Settings"
            >
              ⚙️
            </Button>
          </div>
        }
      />

      <div
        style={{
          padding: '12px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflowX: 'hidden',
          overscrollBehavior: 'none',
        }}
      >
        <WorkspaceManager
          compact={true}
          defaultViewMode="focused"
          headerTitle="Sidepanel Workspace"
          onOpenTab={handleOpenTab}
          onCaptureCurrentTab={handleCaptureCurrentTab}
          onSyncRaindrop={hasRaindropAuth ? handleSyncRaindrop : undefined}
        />
      </div>
    </div>
  );
};
