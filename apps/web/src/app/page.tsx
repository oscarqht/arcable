'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Header,
  WorkspaceManager,
  WorkspaceManagerHandle,
  DropletIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  BackupRestoreModal,
  LogInIcon,
  LogOutIcon,
} from '@arcable/shared/components';
import { useSystemTheme } from '@arcable/shared/hooks';
import {
  clearStoredPendingOperations,
  getOrCreateDeviceId,
  getStoredDeviceName,
} from '@arcable/shared/utils';
import { RaindropAuthState, TabOpenOptions } from '@arcable/shared/types';

export default function HomePage() {
  const { isDark } = useSystemTheme();
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [isInitialSyncing, setIsInitialSyncing] = useState(false);
  const [isWorkspaceSyncing, setIsWorkspaceSyncing] = useState(false);
  const isSyncing = isInitialSyncing || isWorkspaceSyncing;
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasAutoFetchedRef = useRef(false);
  const [raindropHydrated, setRaindropHydrated] = useState(false);

  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Load auth status from API on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err) {
        setAuthError(decodeURIComponent(err));
        window.history.replaceState({}, '', window.location.pathname);
      }
      const auth = params.get('auth');
      if (auth === 'success') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    fetchAuthState();
  }, []);

  const fetchAuthState = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.isAuthenticated && data.user) {
          setAuthState({
            isAuthenticated: true,
            user: data.user,
            accessToken: data.token,
            authType: 'oauth',
          });
        } else {
          setAuthState({ isAuthenticated: false });
        }
      }
    } catch (e) {
      console.error('Failed to fetch auth state:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginWithOAuth = () => {
    setAuthError(null);
    window.location.href = '/api/auth/login';
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthState({ isAuthenticated: false });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/raindrop/sync', {
        headers: authState.accessToken
          ? { Authorization: `Bearer ${authState.accessToken}` }
          : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch workspace from Raindrop');
      }
      return data;
    } catch (err: any) {
      console.error('Workspace fetch error:', err);
      throw err;
    }
  }, [authState.accessToken]);

  // On page load, show the cached workspace while the remote tree is fetched.
  // A successful fetch is authoritative: do not replay the stale local outbox
  // over it, or a previous local create can be written back as a duplicate.
  useEffect(() => {
    if (!authState.isAuthenticated) {
      hasAutoFetchedRef.current = false;
      setRaindropHydrated(false);
      return;
    }
    if (hasAutoFetchedRef.current) return;
    hasAutoFetchedRef.current = true;

    setIsInitialSyncing(true);
    void handleFetchWorkspace()
      .then((res) => {
        if (res?.success && res.data) {
          clearStoredPendingOperations();
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('arcable_workspace_data', JSON.stringify(res.data));
            window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: res.data }));
          }
          workspaceRef.current?.applySnapshot?.(res.data);
          setRaindropHydrated(true);
        }
      })
      .catch((err) => {
        console.warn('[Arcable] Auto-fetch on page load error:', err);
      })
      .finally(() => {
        setIsInitialSyncing(false);
      });
  }, [authState.isAuthenticated, handleFetchWorkspace]);

  const handleSyncWorkspace = useCallback(async (syncParams?: {
    localState: any;
    deviceId?: string;
    pendingOps?: any[];
    replaceBaseline?: boolean;
  }) => {
    try {
      const res = await fetch('/api/raindrop/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authState.accessToken ? { Authorization: `Bearer ${authState.accessToken}` } : {}),
        },
        body: JSON.stringify({
          token: authState.accessToken,
          localState: syncParams?.localState,
          deviceId: syncParams?.deviceId,
          deviceName: getStoredDeviceName(undefined, 'Web App'),
          pendingOps: syncParams?.pendingOps,
          replaceBaseline: syncParams?.replaceBaseline,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync with Raindrop');
      }
      return data;
    } catch (err: any) {
      console.error('Workspace sync error:', err);
      throw err;
    }
  }, [authState.accessToken]);

  const handleSearchRaindrop = async (query: string) => {
    try {
      const res = await fetch(`/api/raindrop/search?query=${encodeURIComponent(query)}`, {
        headers: authState.accessToken
          ? { Authorization: `Bearer ${authState.accessToken}` }
          : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to search Raindrop bookmarks');
      }
      return data;
    } catch (err: any) {
      console.error('Raindrop search error:', err);
      throw err;
    }
  };

  const handleRestoreComplete = useCallback(async (restoredSnapshot: any) => {
    if (typeof window !== 'undefined' && restoredSnapshot) {
      window.localStorage.setItem('arcable_workspace_data', JSON.stringify(restoredSnapshot));
      try {
        window.localStorage.removeItem('arcable_pending_ops');
      } catch {}

      if (authState.isAuthenticated) {
        try {
          await handleSyncWorkspace({
            localState: restoredSnapshot,
            deviceId: getOrCreateDeviceId(),
            pendingOps: [],
            replaceBaseline: true,
          });
        } catch (err) {
          console.warn('[Arcable] Failed to push restored workspace to Raindrop:', err);
        }
      }

      window.location.reload();
    }
  }, [authState.isAuthenticated, handleSyncWorkspace]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#0b101b' : '#f8fafc',
        color: isDark ? '#f8fafc' : '#0f172a',
        transition: 'background-color 0.2s ease, color 0.2s ease',
      }}
    >
      <Header
        title="Arcable"
        leftContent={
          authState.isAuthenticated && authState.user ? (
            <span
              className="header-user-info"
              style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', marginLeft: '6px' }}
            >
              Signed in as <strong style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{authState.user.name}</strong>
            </span>
          ) : null
        }
        actions={
          <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }}>
            <button
              type="button"
              className="header-action-btn"
              onClick={async () => {
                if (workspaceRef.current) {
                  await workspaceRef.current.triggerSync();
                }
              }}
              disabled={isSyncing}
              title={isSyncing ? 'Syncing...' : 'Raindrop Sync'}
              aria-label={isSyncing ? 'Syncing...' : 'Raindrop Sync'}
              style={{
                border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                background: isDark
                  ? (isSyncing ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.18)')
                  : (isSyncing ? '#f0f9ff' : '#e0f2fe'),
                color: isDark ? '#38bdf8' : '#0284c7',
                fontSize: '12px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
                boxSizing: 'border-box',
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
                <DropletIcon size={14} color={isDark ? '#38bdf8' : '#0284c7'} />
              </span>
              <span className="header-btn-text">{isSyncing ? 'Syncing...' : 'Raindrop Sync'}</span>
            </button>

            <button
              type="button"
              className="header-action-btn"
              onClick={() => workspaceRef.current?.openNewSpace()}
              title="New Space"
              aria-label="New Space"
              style={{
                border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : 'none',
                background: isDark ? 'rgba(56, 189, 248, 0.18)' : '#e0f2fe',
                color: isDark ? '#38bdf8' : '#0284c7',
                fontSize: '12px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
                boxSizing: 'border-box',
              }}
            >
              <PlusIcon size={14} />
              <span className="header-btn-text">Space</span>
            </button>


            {/* Backup & Restore Button */}
            <button
              type="button"
              className="header-action-btn"
              onClick={() => setIsBackupModalOpen(true)}
              title="Backup & Restore workspace"
              aria-label="Backup & Restore workspace"
              style={{
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                background: isDark ? '#151e2e' : '#ffffff',
                color: isDark ? '#e2e8f0' : '#475569',
                fontSize: '12px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: '13px', display: 'inline-flex' }}>💾</span>
              <span className="header-btn-text">Backup</span>
            </button>

            {authState.isAuthenticated ? (
              <button
                type="button"
                className="header-action-btn"
                onClick={handleLogout}
                disabled={authLoading}
                title={authLoading ? 'Logging out...' : 'Logout'}
                aria-label={authLoading ? 'Logging out...' : 'Logout'}
                style={{
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  background: isDark ? '#151e2e' : '#ffffff',
                  color: isDark ? '#cbd5e1' : '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <LogOutIcon size={14} color={isDark ? '#cbd5e1' : '#475569'} />
                <span className="header-btn-text">{authLoading ? 'Logging out...' : 'Logout'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="header-action-btn"
                onClick={handleLoginWithOAuth}
                disabled={authLoading}
                title={authLoading ? 'Connecting...' : 'Login'}
                aria-label={authLoading ? 'Connecting...' : 'Login'}
                style={{
                  border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                  background: isDark ? 'rgba(56, 189, 248, 0.18)' : '#e0f2fe',
                  color: isDark ? '#38bdf8' : '#0284c7',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <LogInIcon size={14} color={isDark ? '#38bdf8' : '#0284c7'} />
                <span className="header-btn-text">{authLoading ? 'Connecting...' : 'Login'}</span>
              </button>
            )}
          </div>
        }
      />

      <main
        className="main-content"
        style={{
          maxWidth: '1440px',
          width: '100%',
          margin: '20px auto',
          padding: '0 20px',
          boxSizing: 'border-box',
          flex: authLoading || !authState.isAuthenticated ? 1 : undefined,
          display: authLoading || !authState.isAuthenticated ? 'flex' : undefined,
        }}
      >
        {authLoading ? (
          <div
            role="status"
            style={{ margin: 'auto', color: isDark ? '#94a3b8' : '#64748b', fontSize: '14px' }}
          >
            Checking Raindrop login…
          </div>
        ) : !authState.isAuthenticated ? (
          <section
            aria-labelledby="raindrop-login-title"
            style={{
              margin: 'auto',
              maxWidth: '420px',
              width: '100%',
              padding: '32px',
              borderRadius: '16px',
              textAlign: 'center',
              border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
              background: isDark ? '#151e2e' : '#ffffff',
              boxShadow: isDark ? '0 16px 40px rgba(0, 0, 0, 0.2)' : '0 16px 40px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div aria-hidden="true" style={{ fontSize: '34px', marginBottom: '12px' }}>💧</div>
            <h1 id="raindrop-login-title" style={{ margin: '0 0 8px', fontSize: '20px' }}>
              Log in to Raindrop.io
            </h1>
            <p style={{ margin: '0 0 20px', color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.5 }}>
              Connect your Raindrop account to view and sync your Arcable workspace.
            </p>
            <button
              type="button"
              onClick={handleLoginWithOAuth}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                cursor: 'pointer',
                background: isDark ? '#38bdf8' : '#0284c7',
                color: isDark ? '#0b101b' : '#ffffff',
                fontWeight: 700,
              }}
            >
              Log in with Raindrop.io
            </button>
            {authError && (
              <p role="alert" style={{ margin: '16px 0 0', color: isDark ? '#fca5a5' : '#dc2626', fontSize: '13px' }}>
                {authError}
              </p>
            )}
          </section>
        ) : (
          <WorkspaceManager
          ref={workspaceRef}
          hideControlBar={true}
          showOpenTabsVirtualSpace={false}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showJsonInspector={true}
          showWidgets={true}
          defaultViewMode="grid"
          raindropToken={authState.accessToken}
          onOpenTab={(url: string, _tabId?: string, _tmpTab?: any, options?: TabOpenOptions) => {
            if (typeof window !== 'undefined' && url) {
              if (options?.inNewTab) {
                window.open(url, '_blank', 'noopener,noreferrer');
              } else {
                window.location.href = url;
              }
            }
          }}
          onOpenVariant={(url: string, _tab?: any, _variant?: any, options?: TabOpenOptions) => {
            if (typeof window !== 'undefined' && url) {
              if (options?.inNewTab) {
                window.open(url, '_blank', 'noopener,noreferrer');
              } else {
                window.location.href = url;
              }
            }
          }}
          onSyncRaindrop={authState.isAuthenticated ? handleSyncWorkspace : undefined}
          onSearchRaindrop={authState.isAuthenticated ? handleSearchRaindrop : undefined}
          autoSync={Boolean(authState.isAuthenticated && raindropHydrated)}
          onSyncStateChange={setIsWorkspaceSyncing}
        />
        )}
      </main>

      <BackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreComplete={handleRestoreComplete}
      />
    </div>
  );
}
