import React, { useState, useEffect } from 'react';
import { Header, Card, Button, Badge } from '@arcable/shared/components';
import { getLocalFolderExpanded, setLocalFolderExpanded, useSystemTheme } from '@arcable/shared/hooks';
import {
  formatDate,
  generateId,
  cleanUrl,
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  removeStoredPendingOperations,
  replayOperations,
} from '@arcable/shared/utils';
import { ArcableItem, RaindropAuthState, ExtensionResponse, SyncResult } from '@arcable/shared/types';
import { browser, getActiveTab, openOptionsPageSafely, openWorkspaceSafely } from '../utils/browser';

export const App: React.FC = () => {
  const { isDark } = useSystemTheme();
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
    browser.storage.local.get(['arcable_items', 'arcable_workspace_snapshot']).then((res: any) => {
      if (res.arcable_items && Array.isArray(res.arcable_items)) {
        setItems(res.arcable_items);
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

    // Load Raindrop auth state from background
    browser.runtime.sendMessage({ type: 'RAINDROP_GET_AUTH_STATE' }).then((rawRes) => {
      const res = rawRes as ExtensionResponse<RaindropAuthState>;
      if (res && res.success && res.data) {
        setAuthState(res.data);
        // If authenticated, perform initial background sync to pull latest changes from other devices
        if (res.data.isAuthenticated) {
          void handleSyncWorkspaceSilent();
        }
      }
    });
  }, []);

  const handleSaveCurrentTab = async () => {
    if (!currentTab.url) return;
    setSaving(true);

    const now = Date.now();
    const tabId = generateId('tab');

    // 1. Update quick items list
    const newItem: ArcableItem = {
      id: tabId,
      title: currentTab.title || 'Untitled Page',
      url: currentTab.url,
      tags: ['Extension', 'Bookmark'],
      createdAt: now,
      updatedAt: now,
    };

    const updated = [newItem, ...items];
    await browser.storage.local.set({ arcable_items: updated });
    setItems(updated);

    // 2. Add tab to active workspace & record TAB_CREATE operation
    if (typeof window !== 'undefined') {
      try {
        let workspace: any = null;
        const rawWorkspace = window.localStorage.getItem('arcable_workspace_data');
        if (rawWorkspace) {
          workspace = JSON.parse(rawWorkspace);
        }
        if (!workspace || !Array.isArray(workspace.spaces) || workspace.spaces.length === 0) {
          workspace = {
            activeSpaceId: 'space_personal',
            version: 1,
            spaces: [{ id: 'space_personal', name: 'Personal', emojiIcon: '🏠', colors: '#33e895', createdAt: now, updatedAt: now }],
            folders: [],
            tabs: [],
          };
        }

        const activeSpaceId = workspace.activeSpaceId || workspace.spaces[0]?.id || 'space_personal';
        const spaceTabs = (workspace.tabs || []).filter((t: any) => !t.favourite && t.parentSpaceId === activeSpaceId);
        const maxOrder = spaceTabs.reduce((max: number, t: any) => Math.max(max, t.order ?? 0), 0);

        const newWorkspaceTab = {
          id: tabId,
          url: currentTab.url,
          customTitle: currentTab.title || undefined,
          parentSpaceId: activeSpaceId,
          pinned: false,
          favourite: false,
          order: maxOrder + 1000,
          createdAt: now,
          updatedAt: now,
        };

        workspace.tabs = [...(workspace.tabs || []), newWorkspaceTab];
        workspace.version = (workspace.version || 1) + 1;
        window.localStorage.setItem('arcable_workspace_data', JSON.stringify(workspace));

        // Queue operation
        const pendingOps = getStoredPendingOperations();
        pendingOps.push({
          id: `op_${now}_${generateId('op')}`,
          type: 'TAB_CREATE' as const,
          entityId: tabId,
          payload: newWorkspaceTab,
          deviceId: getOrCreateDeviceId(),
          timestamp: now,
          lamportSeq: Date.now(),
        });
        window.localStorage.setItem('arcable_pending_ops', JSON.stringify(pendingOps));
      } catch (err) {
        console.warn('Failed to update local workspace storage in popup:', err);
      }
    }

    setSaving(false);

    // 3. Auto-sync to Raindrop if authenticated
    if (authState.isAuthenticated) {
      void handleSyncWorkspaceSilent();
    }
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
        // Also save to workspace and sync
        await handleSaveCurrentTab();
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

  const [syncingWorkspace, setSyncingWorkspace] = useState(false);
  const [workspaceSyncSuccess, setWorkspaceSyncSuccess] = useState(false);

  const handleSyncWorkspaceSilent = async () => {
    try {
      let localState: any = undefined;
      if (typeof window !== 'undefined') {
        const storedWorkspaceRaw = window.localStorage.getItem('arcable_workspace_data');
        if (storedWorkspaceRaw) {
          try {
            localState = JSON.parse(storedWorkspaceRaw);
          } catch {}
        }
      }

      const deviceId = getOrCreateDeviceId();
      const pendingOps = getStoredPendingOperations();
      const syncedOpIds = pendingOps.map((op) => op.id);

      const rawRes = await browser.runtime.sendMessage({
        type: 'RAINDROP_SYNC_WORKSPACE',
        payload: {
          deviceName: getStoredDeviceName(undefined, 'Ext'),
          localState,
          deviceId,
          pendingOps,
        },
      });
      const response = rawRes as ExtensionResponse<SyncResult>;

      if (response && response.success) {
        removeStoredPendingOperations(syncedOpIds);
        if (response.data?.latestSnapshot && typeof window !== 'undefined') {
          const remainingOps = getStoredPendingOperations();
          const snapshot = remainingOps.length > 0
            ? replayOperations(response.data.latestSnapshot, remainingOps)
            : response.data.latestSnapshot;
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
    } catch {
      // Non-blocking silent sync
    }
  };

  const handleSyncWorkspace = async () => {
    if (!authState.isAuthenticated) return;
    setSyncingWorkspace(true);
    setWorkspaceSyncSuccess(false);

    try {
      let localState: any = undefined;
      if (typeof window !== 'undefined') {
        const storedWorkspaceRaw = window.localStorage.getItem('arcable_workspace_data');
        if (storedWorkspaceRaw) {
          try {
            localState = JSON.parse(storedWorkspaceRaw);
          } catch {}
        }
      }

      const deviceId = getOrCreateDeviceId();
      const pendingOps = getStoredPendingOperations();
      const syncedOpIds = pendingOps.map((op) => op.id);

      const rawRes = await browser.runtime.sendMessage({
        type: 'RAINDROP_SYNC_WORKSPACE',
        payload: {
          deviceName: getStoredDeviceName(undefined, 'Ext'),
          localState,
          deviceId,
          pendingOps,
        },
      });
      const response = rawRes as ExtensionResponse<SyncResult>;

      if (response && response.success) {
        removeStoredPendingOperations(syncedOpIds);
        if (response.data?.latestSnapshot && typeof window !== 'undefined') {
          const remainingOps = getStoredPendingOperations();
          const snapshot = remainingOps.length > 0
            ? replayOperations(response.data.latestSnapshot, remainingOps)
            : response.data.latestSnapshot;
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
        setWorkspaceSyncSuccess(true);
        setTimeout(() => setWorkspaceSyncSuccess(false), 3000);
      } else {
        alert(`Workspace sync error: ${response?.error || 'Failed'}`);
      }
    } catch (e: any) {
      alert(`Workspace sync error: ${e.message}`);
    } finally {
      setSyncingWorkspace(false);
    }
  };

  const handleClear = async () => {
    await browser.storage.local.remove('arcable_items');
    setItems([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', backgroundColor: isDark ? '#0b0f19' : '#f8fafc', color: isDark ? '#f8fafc' : '#0f172a' }}>
      <Header
        title="Arcable"
        logoSrc={browser.runtime.getURL('icons/icon32.png')}
        badgeText="Extension"
        badgeVariant="info"
        actions={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void openWorkspaceSafely()}
              title="Open Arcable Workspace"
              style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
            >
              📑 Workspace
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void openOptionsPageSafely()} title="Settings">
              ⚙️
            </Button>
          </div>
        }
      />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Raindrop Status Banner in Popup */}
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: authState.isAuthenticated
              ? (isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4')
              : (isDark ? '#151e2e' : '#f8fafc'),
            border: `1px solid ${
              authState.isAuthenticated
                ? (isDark ? 'rgba(34, 197, 94, 0.35)' : '#bbf7d0')
                : (isDark ? '#243247' : '#e2e8f0')
            }`,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>💧</span>
            <div style={{ fontSize: '12px', color: isDark ? '#e2e8f0' : '#334155' }}>
              {authState.isAuthenticated && authState.user ? (
                <>Raindrop: <strong>{authState.user.name}</strong></>
              ) : (
                <>Raindrop: <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>Not connected</span></>
              )}
            </div>
          </div>
          {authState.isAuthenticated ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void openOptionsPageSafely()}
              style={{ fontSize: '11px', padding: '2px 8px', height: '22px' }}
            >
              Connect
            </Button>
          )}
        </div>

        <Card title="Current Page" subtitle={currentTab.url ? cleanUrl(currentTab.url) : 'No tab detected'}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: isDark ? '#e2e8f0' : '#334155', marginBottom: '12px' }}>
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

            {authState.isAuthenticated && (
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', borderColor: isDark ? 'rgba(56, 189, 248, 0.4)' : '#bae6fd', color: isDark ? '#38bdf8' : '#0284c7' }}
                onClick={handleSyncWorkspace}
                isLoading={syncingWorkspace}
              >
                {workspaceSyncSuccess ? '✓ Workspace Synced!' : '☁️ Sync Workspace to Raindrop'}
              </Button>
            )}
          </div>
        </Card>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>
              Saved Items ({items.length})
            </span>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} style={{ color: isDark ? '#f87171' : '#ef4444' }}>
                Clear All
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: isDark ? '#64748b' : '#94a3b8', fontSize: '13px' }}>
              No items saved yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: isDark ? '#151e2e' : '#ffffff',
                    border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, color: isDark ? '#f8fafc' : '#0f172a' }}>{item.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {item.tags.map((tag: string) => (
                        <Badge key={tag} variant="default">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: isDark ? '#64748b' : '#94a3b8' }}>{formatDate(item.createdAt)}</span>
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
