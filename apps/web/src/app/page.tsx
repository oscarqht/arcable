'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Header,
  WorkspaceManager,
  WorkspaceManagerHandle,
  DropletIcon,
  PlusIcon,
  DevicesIcon,
  SearchIcon,
  CloseIcon,
  DeviceModal,
  LogInIcon,
  LogOutIcon,
} from '@arcable/shared/components';
import { useSystemTheme } from '@arcable/shared/hooks';
import { getStoredDeviceName, setStoredDeviceName } from '@arcable/shared/utils';
import { RaindropAuthState } from '@arcable/shared/types';

export default function HomePage() {
  const { isDark } = useSystemTheme();
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleSyncWorkspace = async (syncParams?: {
    localState: any;
    deviceId: string;
    pendingOps: any[];
  }) => {
    try {
      const res = await fetch('/api/raindrop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: authState.accessToken,
          deviceName: getStoredDeviceName(undefined, 'Web App'),
          localState: syncParams?.localState,
          deviceId: syncParams?.deviceId,
          pendingOps: syncParams?.pendingOps,
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
  };

  const handleFetchDevices = async () => {
    try {
      const res = await fetch('/api/raindrop/devices');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch devices');
      }
      return data.devices || [];
    } catch (err: any) {
      console.error('Fetch devices error:', err);
      throw err;
    }
  };

  const handleRenameDevice = async (deviceId: string, newName: string) => {
    setStoredDeviceName(newName);
    try {
      const res = await fetch('/api/raindrop/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          newName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to rename device');
      }
      return data.devices || [];
    } catch (err: any) {
      console.error('Rename device error:', err);
      throw err;
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      const res = await fetch('/api/raindrop/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete device');
      }
      return data.devices || [];
    } catch (err: any) {
      console.error('Delete device error:', err);
      throw err;
    }
  };

  const handleDeleteOtherDevices = async (keepDeviceId: string) => {
    try {
      const res = await fetch('/api/raindrop/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: keepDeviceId,
          allOther: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete other devices');
      }
      return data.devices || [];
    } catch (err: any) {
      console.error('Delete other devices error:', err);
      throw err;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#0b0f19' : '#f8fafc',
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Header Global Search (Hidden when window width < 1200px) */}
            <div
              className="header-search-container"
              style={{
                position: 'relative',
                width: '280px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  color: isDark ? '#64748b' : '#94a3b8',
                }}
              >
                <SearchIcon size={14} />
              </div>
              <input
                id="header-global-search"
                type="text"
                placeholder="Search across all spaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '5px 28px 5px 32px',
                  borderRadius: '20px',
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  backgroundColor: isDark ? '#151e2e' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#0284c7';
                  e.currentTarget.style.boxShadow = isDark
                    ? '0 0 0 2px rgba(56, 189, 248, 0.25)'
                    : '0 0 0 2px rgba(2, 132, 199, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = isDark ? '#334155' : '#cbd5e1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {searchQuery && (
                <button
                  id="header-clear-search-btn"
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: isDark ? '#94a3b8' : '#94a3b8',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={13} />
                </button>
              )}
            </div>

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

            {/* Devices Management Button */}
            <button
              type="button"
              className="header-action-btn"
              onClick={() => setIsDeviceModalOpen(true)}
              title="Manage connected sync devices"
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
              <DevicesIcon size={14} color={isDark ? '#94a3b8' : '#64748b'} />
              <span className="header-btn-text">Devices</span>
            </button>

            {authState.isAuthenticated ? (
              <button
                type="button"
                className="header-action-btn"
                onClick={handleLogout}
                disabled={authLoading}
                title={authLoading ? 'Logging out...' : 'Logout'}
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
        style={{ maxWidth: '1440px', width: '100%', margin: '20px auto', padding: '0 20px', boxSizing: 'border-box' }}
      >
        <WorkspaceManager
          ref={workspaceRef}
          hideControlBar={true}
          hideSearchBar={true}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showJsonInspector={true}
          defaultViewMode="grid"
          raindropToken={authState.accessToken}
          onSyncRaindrop={authState.isAuthenticated ? handleSyncWorkspace : undefined}
          onSyncStateChange={setIsSyncing}
        />
      </main>

      <DeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        raindropToken={authState.accessToken}
        onFetchDevices={authState.isAuthenticated ? handleFetchDevices : undefined}
        onRenameDevice={authState.isAuthenticated ? handleRenameDevice : undefined}
        onDeleteDevice={authState.isAuthenticated ? handleDeleteDevice : undefined}
        onDeleteOtherDevices={authState.isAuthenticated ? handleDeleteOtherDevices : undefined}
      />
    </div>
  );
}
