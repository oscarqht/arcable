import React, { useState, useEffect } from 'react';
import { Header, Card, Button, Badge } from '@arcable/shared/components';
import { formatDate, generateId, cleanUrl } from '@arcable/shared/utils';
import { ArcableItem, RaindropAuthState, ExtensionResponse } from '@arcable/shared/types';
import { browser, getActiveTab } from '../utils/browser';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<{ title?: string; url?: string }>({});
  const [items, setItems] = useState<ArcableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingRaindrop, setSavingRaindrop] = useState(false);
  const [raindropSuccess, setRaindropSuccess] = useState(false);

  // Raindrop Auth
  const [authState, setAuthState] = useState<RaindropAuthState>({ isAuthenticated: false });

  useEffect(() => {
    // Load current active tab info
    getActiveTab().then((tab) => {
      if (tab) {
        setCurrentTab({ title: tab.title, url: tab.url });
      }
    });

    // Load saved items from extension storage
    browser.storage.local.get('arcable_items').then((res) => {
      if (res.arcable_items && Array.isArray(res.arcable_items)) {
        setItems(res.arcable_items);
      }
    });

    // Load Raindrop auth state from background
    browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((rawRes) => {
      const res = rawRes as ExtensionResponse<RaindropAuthState>;
      if (res && res.success && res.data) {
        setAuthState(res.data);
      }
    });
  }, []);

  const handleSaveCurrentTab = async () => {
    if (!currentTab.url) return;
    setSaving(true);

    const newItem: ArcableItem = {
      id: generateId('tab'),
      title: currentTab.title || 'Untitled Page',
      url: currentTab.url,
      tags: ['Extension', 'Bookmark'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [newItem, ...items];
    await browser.storage.local.set({ arcable_items: updated });
    setItems(updated);
    setSaving(false);
  };

  const handleSaveToRaindrop = async () => {
    if (!currentTab.url || !authState.isAuthenticated) return;
    setSavingRaindrop(true);
    setRaindropSuccess(false);

    try {
      const rawRes = await browser.runtime.sendMessage({
        type: 'RAINDROP_SAVE_BOOKMARK',
        payload: {
          title: currentTab.title || currentTab.url,
          link: currentTab.url,
          tags: ['Arcable', 'Extension'],
        },
      });
      const response = rawRes as ExtensionResponse;

      if (response && response.success) {
        setRaindropSuccess(true);
        // Also save locally
        handleSaveCurrentTab();
        setTimeout(() => setRaindropSuccess(false), 3000);
      } else {
        alert(`Raindrop save error: ${response?.error || 'Failed'}`);
      }
    } catch (e: any) {
      alert(`Raindrop error: ${e.message}`);
    } finally {
      setSavingRaindrop(false);
    }
  };

  const handleClear = async () => {
    await browser.storage.local.remove('arcable_items');
    setItems([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <Header
        title="Arcable"
        badgeText="Extension"
        badgeVariant="info"
        actions={
          <Button size="sm" variant="ghost" onClick={() => browser.runtime.openOptionsPage()}>
            ⚙️
          </Button>
        }
      />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Raindrop Status Banner in Popup */}
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: authState.isAuthenticated ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${authState.isAuthenticated ? '#bbf7d0' : '#e2e8f0'}`,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>💧</span>
            <div style={{ fontSize: '12px', color: '#334155' }}>
              {authState.isAuthenticated && authState.user ? (
                <>Raindrop: <strong>{authState.user.name}</strong></>
              ) : (
                <>Raindrop: <span style={{ color: '#94a3b8' }}>Not connected</span></>
              )}
            </div>
          </div>
          {authState.isAuthenticated ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => browser.runtime.openOptionsPage()}
              style={{ fontSize: '11px', padding: '2px 8px', height: '22px' }}
            >
              Connect
            </Button>
          )}
        </div>

        <Card title="Current Page" subtitle={currentTab.url ? cleanUrl(currentTab.url) : 'No tab detected'}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '12px' }}>
            {currentTab.title || 'Looking up active tab...'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {authState.isAuthenticated && (
              <Button
                variant="primary"
                size="sm"
                style={{ width: '100%' }}
                onClick={handleSaveToRaindrop}
                isLoading={savingRaindrop}
                disabled={!currentTab.url}
              >
                {raindropSuccess ? '✓ Saved to Raindrop!' : '💧 Save to Raindrop'}
              </Button>
            )}

            <Button
              variant={authState.isAuthenticated ? 'secondary' : 'primary'}
              size="sm"
              style={{ width: '100%' }}
              onClick={handleSaveCurrentTab}
              isLoading={saving}
              disabled={!currentTab.url}
            >
              Save to Local Workspace
            </Button>
          </div>
        </Card>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
              Saved Items ({items.length})
            </span>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} style={{ color: '#ef4444' }}>
                Clear All
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '13px' }}>
              No items saved yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{item.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {item.tags.map((tag: string) => (
                        <Badge key={tag} variant="default">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
