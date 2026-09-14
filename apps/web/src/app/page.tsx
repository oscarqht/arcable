'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Header,
  WorkspaceManager,
  WorkspaceManagerHandle,
  DropletIcon,
  PlusIcon,
  DevicesIcon,
  CloseIcon,
  DeviceModal,
  BackupRestoreModal,
} from '@arcable/shared/components';
import { useSystemTheme } from '@arcable/shared/hooks';
import {
  getStoredDeviceName,
  setStoredDeviceName,
  getOrCreateDeviceId,
  getSyncProvider,
  setSyncProvider,
  fetchServerWorkspaceState,
  setStoredServerVersion,
  fetchCloudDevices,
  renameCloudDevice,
  deleteCloudDevice,
} from '@arcable/shared/utils';
import { RaindropAuthState, SyncProvider } from '@arcable/shared/types';
import { AuthModal } from '../components/AuthModal';

export default function HomePage() {
  const { isDark } = useSystemTheme();
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active sync provider: 'raindrop' | 'local'
  const [syncProvider, setSyncProviderState] = useState<SyncProvider>('raindrop');

  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Authoritative server state fetcher
  const loadServerWorkspace = useCallback(async (token?: string) => {
    const activeToken = token || authState.accessToken;
    if (!activeToken) return;

    try {
      setIsSyncing(true);
      const res = await fetchServerWorkspaceState({ token: activeToken });
      if (res.success && res.state) {
        if (workspaceRef.current?.applySnapshot) {
          workspaceRef.current.applySnapshot(res.state);
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('arcable_workspace_data', JSON.stringify(res.state));
          window.dispatchEvent(new Event('arcable_workspace_updated'));
        }
        if (res.version) {
          setStoredServerVersion(res.version);
        }
      } else if (res.error) {
        console.warn('Failed to fetch server workspace:', res.error);
      }
    } catch (err) {
      console.error('loadServerWorkspace error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [authState.accessToken]);

  const loadServerWorkspaceRef = useRef(loadServerWorkspace);
  useEffect(() => {
    loadServerWorkspaceRef.current = loadServerWorkspace;
  }, [loadServerWorkspace]);

  // Initialize Raindrop Auth
  useEffect(() => {
    // 1. Check URL parameters and hash for OAuth callbacks
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const authSuccess = urlParams.get('auth') === 'success';

      if (authSuccess) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const hashToken = hashParams.get('access_token');
      if (hashToken) {
        try {
          window.localStorage.setItem('arcable_raindrop_token', hashToken);
          setSyncProvider('raindrop');
          setSyncProviderState('raindrop');
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch {}
      }

      // Check stored provider
      const storedProvider = getSyncProvider();
      if (storedProvider) {
        setSyncProviderState(storedProvider);
      }
    }

    // 2. Load Raindrop session from cookies / token API
    const checkRaindropAuth = async () => {
      try {
        setAuthLoading(true);
        let storedToken: string | null = null;
        if (typeof window !== 'undefined') {
          storedToken = window.localStorage.getItem('arcable_raindrop_token');
        }

        const res = await fetch('/api/auth/me', {
          headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : undefined,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setAuthState({
              isAuthenticated: true,
              user: data.user,
              accessToken: data.accessToken || storedToken || undefined,
            });
            setSyncProvider('raindrop');
            setSyncProviderState('raindrop');

            if (data.accessToken || storedToken) {
              void loadServerWorkspaceRef.current?.(data.accessToken || storedToken);
            }
          } else {
            setAuthState({ isAuthenticated: false });
          }
        } else {
          setAuthState({ isAuthenticated: false });
        }
      } catch (err: any) {
        console.error('Error checking Raindrop auth:', err);
        setAuthState({ isAuthenticated: false });
      } finally {
        setAuthLoading(false);
      }
    };

    void checkRaindropAuth();

    // Listen for provider changes
    const handleProviderChange = (e: CustomEvent) => {
      if (e.detail) {
        setSyncProviderState(e.detail as SyncProvider);
      }
    };

    window.addEventListener('arcable_sync_provider_changed' as any, handleProviderChange);
    return () => {
      window.removeEventListener('arcable_sync_provider_changed' as any, handleProviderChange);
    };
  }, []);

  // Raindrop OAuth Handlers
  const handleLoginWithRaindropOAuth = () => {
    window.location.href = '/api/auth/login';
  };

  const handleLoginWithRaindropToken = async (token: string) => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to authenticate with Raindrop token');
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('arcable_raindrop_token', token);
      }

      setAuthState({
        isAuthenticated: true,
        user: data.user,
        accessToken: token,
      });

      setSyncProvider('raindrop');
      setSyncProviderState('raindrop');
      await loadServerWorkspace(token);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to authenticate with token');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogoutRaindrop = async () => {
    try {
      setAuthLoading(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('arcable_raindrop_token');
      }
      setAuthState({ isAuthenticated: false });
    } catch (e) {
      console.error('Raindrop logout error:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSelectProvider = (provider: SyncProvider) => {
    setSyncProvider(provider);
    setSyncProviderState(provider);
  };

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

  // Device Management Handlers (backed by /api/sync/devices)
  const handleFetchDevices = async () => {
    const devId = getOrCreateDeviceId();
    const devName = getStoredDeviceName(undefined, 'Web App');
    const res = await fetchCloudDevices({
      token: authState.accessToken,
      currentDeviceId: devId,
      currentDeviceName: devName,
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch devices');
    }
    return res.devices;
  };

  const handleRenameDevice = async (deviceId: string, newName: string) => {
    setStoredDeviceName(newName);
    const res = await renameCloudDevice({
      token: authState.accessToken,
      deviceId,
      newName,
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to rename device');
    }
    return res.devices;
  };

  const handleDeleteDevice = async (deviceId: string) => {
    const res = await deleteCloudDevice({
      token: authState.accessToken,
      deviceId,
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete device');
    }
    return res.devices;
  };

  const handleDeleteOtherDevices = async (keepDeviceId: string) => {
    const res = await deleteCloudDevice({
      token: authState.accessToken,
      allOther: true,
      keepDeviceId,
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete other devices');
    }
    return res.devices;
  };

  const handleRestoreComplete = useCallback((restoredSnapshot: any) => {
    if (typeof window !== 'undefined' && restoredSnapshot) {
      window.localStorage.setItem('arcable_workspace_data', JSON.stringify(restoredSnapshot));
      try {
        window.dispatchEvent(new Event('arcable_workspace_updated'));
      } catch {}
    }
  }, []);

  const hasRaindropAuth = Boolean(authState.isAuthenticated && authState.user);
  const isOverallLoading = authLoading;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: isDark ? '#0b0f19' : '#f8fafc',
        color: isDark ? '#f8fafc' : '#0f172a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            <button
              type="button"
              onClick={() => setIsDeviceModalOpen(true)}
              title="Manage Devices"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#f1f5f9',
                border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                borderRadius: '8px',
                color: isDark ? '#f8fafc' : '#0f172a',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <DevicesIcon size={16} />
              <span className="hide-mobile">Devices</span>
            </button>

            {hasRaindropAuth ? (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#f1f5f9',
                  border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                  borderRadius: '8px',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {authState.user?.avatarUrl ? (
                  <img
                    src={authState.user.avatarUrl}
                    alt="Avatar"
                    style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <DropletIcon size={16} color="#0284c7" />
                )}
                <span className="hide-mobile">
                  {authState.user?.name || 'Raindrop User'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                }}
              >
                <DropletIcon size={15} color="#ffffff" />
                <span>Connect Raindrop</span>
              </button>
            )}
          </div>
        }
      />

      {/* Sync Status Banner */}
      {hasRaindropAuth && (
        <div
          style={{
            maxWidth: '1440px',
            width: '100%',
            margin: '12px auto 0',
            padding: '0 20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : '#f0f9ff',
              border: isDark ? '1px solid rgba(56, 189, 248, 0.2)' : '1px solid #bae6fd',
              fontSize: '13px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px' }}>💧</span>
              <span style={{ color: isDark ? '#7dd3fc' : '#0369a1' }}>
                Synced via Raindrop: <strong style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{authState.user?.name || authState.user?.email || 'Active'}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => workspaceRef.current?.triggerSync()}
                disabled={isSyncing}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                }}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main
        className="main-content"
        style={{ maxWidth: '1440px', width: '100%', margin: '20px auto', padding: '0 20px', boxSizing: 'border-box' }}
      >
        <WorkspaceManager
          ref={workspaceRef}
          hideControlBar={true}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showJsonInspector={true}
          showWidgets={true}
          defaultViewMode="grid"
          raindropToken={hasRaindropAuth ? authState.accessToken : undefined}
          hasRaindropAuth={hasRaindropAuth}
          currentDeviceId={typeof window !== 'undefined' ? getOrCreateDeviceId() : undefined}
          onOpenTab={(url: string) => {
            if (typeof window !== 'undefined' && url) {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          }}
          onOpenVariant={(variantUrl: string) => {
            if (typeof window !== 'undefined' && variantUrl) {
              window.open(variantUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          onSearchRaindrop={hasRaindropAuth ? handleSearchRaindrop : undefined}
          onSyncStateChange={setIsSyncing}
        />
      </main>

      {/* Auth & Provider Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        raindropAuthState={authState}
        onLoginWithRaindropOAuth={handleLoginWithRaindropOAuth}
        onLoginWithRaindropToken={handleLoginWithRaindropToken}
        onLogoutRaindrop={handleLogoutRaindrop}
        activeProvider={syncProvider}
        onSelectProvider={handleSelectProvider}
        onSyncNow={async () => {
          if (workspaceRef.current) {
            await workspaceRef.current.triggerSync();
          }
        }}
        isSyncing={isSyncing}
      />

      {/* Devices Modal */}
      <DeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        syncProvider={hasRaindropAuth ? 'raindrop' : undefined}
        raindropToken={hasRaindropAuth ? authState.accessToken : undefined}
        currentDeviceId={typeof window !== 'undefined' ? getOrCreateDeviceId() : undefined}
        onFetchDevices={hasRaindropAuth ? handleFetchDevices : undefined}
        onRenameDevice={hasRaindropAuth ? handleRenameDevice : undefined}
        onDeleteDevice={hasRaindropAuth ? handleDeleteDevice : undefined}
        onDeleteOtherDevices={hasRaindropAuth ? handleDeleteOtherDevices : undefined}
      />

      {/* Backup & Restore Modal */}
      <BackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreComplete={handleRestoreComplete}
      />
    </div>
  );
}
