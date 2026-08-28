import React, { useState, useEffect } from 'react';
import { Header, Button, WorkspaceManager } from '@arcable/shared/components';
import { browser, getActiveTab } from '../utils/browser';

export const App: React.FC = () => {
  const [activeTabInfo, setActiveTabInfo] = useState<{ title?: string; url?: string; favIconUrl?: string } | null>(null);
  const [hasRaindropAuth, setHasRaindropAuth] = useState(false);

  useEffect(() => {
    // Check Raindrop auth
    browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((res: any) => {
      if (res && res.success && res.data?.isAuthenticated) {
        setHasRaindropAuth(true);
      }
    });

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
      };
    }
  }, []);

  const handleSyncRaindrop = async () => {
    const res: any = await browser.runtime.sendMessage({
      type: 'RAINDROP_SYNC_WORKSPACE',
      payload: { deviceName: 'Sidepanel' },
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header
        title="Arcable"
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

      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <WorkspaceManager
          compact={true}
          headerTitle="Sidepanel Workspace"
          onOpenTab={handleOpenTab}
          onCaptureCurrentTab={handleCaptureCurrentTab}
          onSyncRaindrop={hasRaindropAuth ? handleSyncRaindrop : undefined}
        />
      </div>
    </div>
  );
};
