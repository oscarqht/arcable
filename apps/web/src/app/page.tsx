'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Header,
  WorkspaceManager,
  WorkspaceManagerHandle,
  DropletIcon,
  PlusIcon,
} from '@arcable/shared/components';
import { RaindropAuthState } from '@arcable/shared/types';

export default function HomePage() {
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [isSyncing, setIsSyncing] = useState(false);

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
          deviceName: 'Arcable Web App',
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Header
        title="Arcable"
        leftContent={
          authState.isAuthenticated && authState.user ? (
            <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '6px' }}>
              Signed in as <strong>{authState.user.name}</strong>
            </span>
          ) : null
        }
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => workspaceRef.current?.triggerSync()}
              disabled={isSyncing}
              title="Sync spaces, folders and tabs with Raindrop.io"
              style={{
                border: '1px solid #bae6fd',
                background: isSyncing ? '#f0f9ff' : '#e0f2fe',
                color: '#0284c7',
                fontSize: '12px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
            >
              <DropletIcon size={13} color="#0284c7" />
              <span>{isSyncing ? 'Syncing...' : 'Raindrop Sync'}</span>
            </button>

            <button
              type="button"
              onClick={() => workspaceRef.current?.openNewSpace()}
              style={{
                border: 'none',
                background: '#e0f2fe',
                color: '#0284c7',
                fontSize: '12px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
              }}
            >
              <PlusIcon size={13} />
              <span>Space</span>
            </button>

            <button
              type="button"
              onClick={() => workspaceRef.current?.openJsonModal()}
              title="Inspect raw workspace JSON in localStorage"
              style={{
                border: 'none',
                background: '#f1f5f9',
                color: '#64748b',
                fontSize: '12px',
                padding: '5px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
            >
              {'{ }'} JSON
            </button>

            {authState.isAuthenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={authLoading}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {authLoading ? 'Logging out...' : 'Logout'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoginWithOAuth}
                disabled={authLoading}
                style={{
                  border: '1px solid #bae6fd',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {authLoading ? 'Connecting...' : 'Login'}
              </button>
            )}
          </div>
        }
      />

      <main style={{ maxWidth: '1440px', width: '100%', margin: '20px auto', padding: '0 20px', boxSizing: 'border-box' }}>
        <WorkspaceManager
          ref={workspaceRef}
          hideControlBar={true}
          showJsonInspector={true}
          defaultViewMode="grid"
          raindropToken={authState.accessToken}
          onSyncRaindrop={authState.isAuthenticated ? handleSyncWorkspace : undefined}
          onSyncStateChange={setIsSyncing}
        />
      </main>
    </div>
  );
}
