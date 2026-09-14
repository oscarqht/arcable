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
  LogInIcon,
  LogOutIcon,
} from '@arcable/shared/components';
import { useSystemTheme } from '@arcable/shared/hooks';
import {
  getStoredDeviceName,
  setStoredDeviceName,
  getOrCreateDeviceId,
  getSyncProvider,
  setSyncProvider,
  getSupabaseSession,
  setSupabaseSession,
  setupSupabaseRealtime,
  fetchServerWorkspaceState,
  setStoredServerVersion,
} from '@arcable/shared/utils';
import { RaindropAuthState, SupabaseSessionTokens, SyncProvider } from '@arcable/shared/types';
import { createClient } from '@supabase/supabase-js';
import { AuthModal } from '../components/AuthModal';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export default function HomePage() {
  const { isDark } = useSystemTheme();
  const workspaceRef = useRef<WorkspaceManagerHandle>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active sync provider: 'supabase' | 'raindrop' | 'local'
  const [syncProvider, setSyncProviderState] = useState<SyncProvider>('supabase');

  // Supabase Auth State
  const [supabaseClient, setSupabaseClient] = useState<any>(null);
  const [supabaseSession, setSupabaseSessionState] = useState<SupabaseSessionTokens | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(true);

  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Authoritative server state fetcher for Supabase
  const loadServerWorkspace = useCallback(async (tokens?: SupabaseSessionTokens | null) => {
    const activeTokens = tokens !== undefined ? tokens : (supabaseSession || getSupabaseSession());
    if (!activeTokens?.access_token) return;

    try {
      setIsSyncing(true);
      const res = await fetchServerWorkspaceState({ session: activeTokens });
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
  }, [supabaseSession]);

  const loadServerWorkspaceRef = useRef(loadServerWorkspace);
  useEffect(() => {
    loadServerWorkspaceRef.current = loadServerWorkspace;
  }, [loadServerWorkspace]);

  // Initialize Auth & Supabase
  useEffect(() => {
    // 1. Check URL parameters and hash
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

      // Initial provider
      setSyncProviderState(getSyncProvider());
    }

    // 2. Initialize Supabase Client
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      setSupabaseClient(client);

      // Check current session or callback hash
      client.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          console.warn('Supabase getSession error:', error.message);
        }

        if (session) {
          const tokens: SupabaseSessionTokens = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: {
              id: session.user.id,
              email: session.user.email,
              user_metadata: session.user.user_metadata,
            },
          };
          setSupabaseSession(tokens);
          setSupabaseSessionState(tokens);
          setSyncProvider('supabase');
          setSyncProviderState('supabase');

          // Pull full authoritative workspace from cloud immediately
          void loadServerWorkspaceRef.current(tokens);

          // Clean hash
          if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } else {
          // Check local stored session
          const stored = getSupabaseSession();
          if (stored) {
            setSupabaseSessionState(stored);
            void loadServerWorkspaceRef.current(stored);
          }
        }
        setSupabaseLoading(false);
      });

      // Listen to auth changes
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          const tokens: SupabaseSessionTokens = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: {
              id: session.user.id,
              email: session.user.email,
              user_metadata: session.user.user_metadata,
            },
          };
          setSupabaseSession(tokens);
          setSupabaseSessionState(tokens);
          setSyncProvider('supabase');
          setSyncProviderState('supabase');

          void loadServerWorkspaceRef.current(tokens);

          if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } else if (event === 'SIGNED_OUT') {
          setSupabaseSession(null);
          setSupabaseSessionState(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setSupabaseLoading(false);
    }

    // 3. Check Raindrop auth status
    fetchAuthState();
  }, []);

  // Supabase Realtime Listener (multi-device instantaneous updates)
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabaseSession?.access_token || !supabaseSession.user?.id) {
      return;
    }

    const unsubscribe = setupSupabaseRealtime({
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      accessToken: supabaseSession.access_token,
      userId: supabaseSession.user.id,
      onRemoteUpdate: () => {
        // Instant trigger remote sync when workspace updated by another client
        void loadServerWorkspaceRef.current();
        if (workspaceRef.current) {
          void workspaceRef.current.triggerSync();
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [supabaseSession]);

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
      console.error('Failed to fetch Raindrop auth state:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  // Google OAuth via Supabase
  const handleLoginWithGoogle = async () => {
    if (!supabaseClient) {
      throw new Error('Supabase is not configured. Please check your environment variables.');
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: origin,
      },
    });
    if (error) {
      throw error;
    }
  };

  const handleLogoutSupabase = async () => {
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (e) {
        console.warn('Signout error:', e);
      }
    }
    setSupabaseSession(null);
    setSupabaseSessionState(null);
  };

  const handleImportSupabaseToken = async (rawInput: string) => {
    let parsedTokens: SupabaseSessionTokens;
    try {
      const obj = JSON.parse(rawInput);
      if (obj.tokens && obj.tokens.access_token) {
        parsedTokens = {
          access_token: obj.tokens.access_token,
          refresh_token: obj.tokens.refresh_token || '',
          expires_at: obj.tokens.expires_at,
          user: obj.tokens.user,
        };
      } else if (obj.access_token) {
        parsedTokens = {
          access_token: obj.access_token,
          refresh_token: obj.refresh_token || '',
          expires_at: obj.expires_at,
          user: obj.user,
        };
      } else {
        throw new Error('Missing access_token');
      }
    } catch {
      parsedTokens = {
        access_token: rawInput.trim(),
        refresh_token: '',
        user: { id: 'imported_user', email: 'Imported Session' },
      };
    }
    setSupabaseSession(parsedTokens);
    setSupabaseSessionState(parsedTokens);
    setSyncProvider('supabase');
    setSyncProviderState('supabase');
    void loadServerWorkspace(parsedTokens);
  };

  // Raindrop OAuth & Token
  const handleLoginWithRaindropOAuth = () => {
    setAuthError(null);
    window.location.href = '/api/auth/login';
  };

  const handleLoginWithRaindropToken = async (token: string) => {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to authenticate with Raindrop token.');
    }
    setAuthState({
      isAuthenticated: true,
      user: data.user,
      accessToken: data.token,
      authType: 'token',
    });
    setSyncProvider('raindrop');
    setSyncProviderState('raindrop');
  };

  const handleLogoutRaindrop = async () => {
    setAuthLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
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

  const handleLogoutActive = async () => {
    if (supabaseSession?.access_token) {
      await handleLogoutSupabase();
    } else if (authState.isAuthenticated) {
      await handleLogoutRaindrop();
    }
  };

  // Workspace Sync & Management Handlers
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

  const handleCreateBackup = useCallback(async () => {
    try {
      let wsData: any = null;
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('arcable_workspace_data');
        if (raw) {
          try {
            wsData = JSON.parse(raw);
          } catch {}
        }
      }
      const res = await fetch('/api/raindrop/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: authState.accessToken,
          workspaceData: wsData || { activeSpaceId: 'space_personal', version: 1, spaces: [], folders: [], tabs: [] },
          deviceName: getStoredDeviceName(undefined, 'Web App'),
          deviceType: 'Web App',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create backup');
      }
      return data;
    } catch (err: any) {
      console.error('Create backup error:', err);
      throw err;
    }
  }, [authState.accessToken]);

  const handleFetchBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/raindrop/backup', {
        headers: authState.accessToken ? { Authorization: `Bearer ${authState.accessToken}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch backups');
      }
      return data.backups || [];
    } catch (err: any) {
      console.error('Fetch backups error:', err);
      throw err;
    }
  }, [authState.accessToken]);

  const handleRestoreBackup = useCallback(async (backupId: number) => {
    try {
      const res = await fetch('/api/raindrop/backup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: authState.accessToken,
          backupId,
          deviceName: getStoredDeviceName(undefined, 'Web App'),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to restore backup');
      }
      return data;
    } catch (err: any) {
      console.error('Restore backup error:', err);
      throw err;
    }
  }, [authState.accessToken]);

  const handleRestoreComplete = useCallback((restoredSnapshot: any) => {
    if (typeof window !== 'undefined' && restoredSnapshot) {
      window.localStorage.setItem('arcable_workspace_data', JSON.stringify(restoredSnapshot));
      window.location.reload();
    }
  }, []);

  const isSupabaseActive = Boolean(supabaseSession?.access_token);
  const isRaindropActive = Boolean(!isSupabaseActive && authState.isAuthenticated && authState.user);
  const isAuthenticated = isSupabaseActive || isRaindropActive;
  const isOverallLoading = authLoading || supabaseLoading;

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
          isSupabaseActive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
              <span
                className="header-user-info"
                style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}
              >
                Signed in as <strong style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{supabaseSession?.user?.email || 'Cloud User'}</strong>
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5',
                  color: isDark ? '#34d399' : '#059669',
                  border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #a7f3d0',
                }}
              >
                Cloud
              </span>
            </div>
          ) : isRaindropActive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
              <span
                className="header-user-info"
                style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}
              >
                Signed in as <strong style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{authState.user?.name}</strong>
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe',
                  color: isDark ? '#38bdf8' : '#0284c7',
                  border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                }}
              >
                Raindrop
              </span>
            </div>
          ) : (
            <span
              className="header-user-info"
              style={{ fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8', marginLeft: '6px' }}
            >
              Offline / Local Mode
            </span>
          )
        }
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Sync Action Button */}
            <button
              type="button"
              className="header-action-btn"
              onClick={async () => {
                if (isSupabaseActive) {
                  await loadServerWorkspace();
                  if (workspaceRef.current) {
                    await workspaceRef.current.triggerSync();
                  }
                  return;
                }
                if (isRaindropActive) {
                  if (workspaceRef.current) {
                    await workspaceRef.current.triggerSync();
                  }
                  return;
                }
                setIsAuthModalOpen(true);
              }}
              disabled={isSyncing}
              title={
                isSyncing
                  ? 'Syncing...'
                  : isSupabaseActive
                  ? 'Sync with Arcable Cloud'
                  : 'Sync with Raindrop'
              }
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
                {isSupabaseActive ? (
                  <span style={{ fontSize: '13px' }}>⚡</span>
                ) : (
                  <DropletIcon size={14} color={isDark ? '#38bdf8' : '#0284c7'} />
                )}
              </span>
              <span className="header-btn-text">
                {isSyncing ? 'Syncing...' : isSupabaseActive ? 'Cloud Sync' : 'Raindrop Sync'}
              </span>
            </button>

            {/* New Space Button */}
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

            {/* Backup & Restore Button */}
            <button
              type="button"
              className="header-action-btn"
              onClick={() => setIsBackupModalOpen(true)}
              title="Backup & Restore workspace"
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

            {/* Account / Provider Switcher Button */}
            <button
              type="button"
              className="header-action-btn"
              onClick={() => setIsAuthModalOpen(true)}
              title="Account & Sync Settings"
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
              <span style={{ fontSize: '13px', display: 'inline-flex' }}>⚙️</span>
              <span className="header-btn-text">Sync Settings</span>
            </button>

            {/* Login / Logout Button */}
            {isAuthenticated ? (
              <button
                type="button"
                className="header-action-btn"
                onClick={handleLogoutActive}
                disabled={isOverallLoading}
                title="Log Out"
                style={{
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  background: isDark ? '#151e2e' : '#ffffff',
                  color: isDark ? '#f87171' : '#dc2626',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: isOverallLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <LogOutIcon size={14} color={isDark ? '#f87171' : '#dc2626'} />
                <span className="header-btn-text">Logout</span>
              </button>
            ) : (
              <button
                type="button"
                className="header-action-btn"
                onClick={() => setIsAuthModalOpen(true)}
                disabled={isOverallLoading}
                title="Sign In"
                style={{
                  border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                  background: isDark ? 'rgba(56, 189, 248, 0.18)' : '#e0f2fe',
                  color: isDark ? '#38bdf8' : '#0284c7',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: isOverallLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <LogInIcon size={14} color={isDark ? '#38bdf8' : '#0284c7'} />
                <span className="header-btn-text">Login</span>
              </button>
            )}
          </div>
        }
      />

      {/* Error Banner */}
      {authError && (
        <div
          style={{
            maxWidth: '1440px',
            width: '100%',
            margin: '12px auto 0 auto',
            padding: '10px 20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
              border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5',
              color: isDark ? '#fca5a5' : '#b91c1c',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '4px',
              }}
            >
              <CloseIcon size={14} />
            </button>
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
          raindropToken={isRaindropActive ? authState.accessToken : undefined}
          currentDeviceId={typeof window !== 'undefined' ? getOrCreateDeviceId() : undefined}
          onOpenTab={(url: string) => {
            if (typeof window !== 'undefined' && url) {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          }}
          onSyncRaindrop={isRaindropActive ? handleSyncWorkspace : undefined}
          onSearchRaindrop={isRaindropActive ? handleSearchRaindrop : undefined}
          onSyncStateChange={setIsSyncing}
        />
      </main>

      {/* Auth & Provider Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        supabaseSession={supabaseSession}
        onLoginWithGoogle={handleLoginWithGoogle}
        onLogoutSupabase={handleLogoutSupabase}
        onImportSupabaseToken={handleImportSupabaseToken}
        raindropAuthState={authState}
        onLoginWithRaindropOAuth={handleLoginWithRaindropOAuth}
        onLoginWithRaindropToken={handleLoginWithRaindropToken}
        onLogoutRaindrop={handleLogoutRaindrop}
        activeProvider={syncProvider}
        onSelectProvider={handleSelectProvider}
        onSyncNow={async () => {
          if (isSupabaseActive) {
            await loadServerWorkspace();
            if (workspaceRef.current) {
              await workspaceRef.current.triggerSync();
            }
            return;
          }
          if (isRaindropActive) {
            if (workspaceRef.current) {
              await workspaceRef.current.triggerSync();
            }
            return;
          }
        }}
        isSyncing={isSyncing}
      />

      {/* Devices Modal */}
      <DeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        raindropToken={authState.accessToken}
        onFetchDevices={authState.isAuthenticated ? handleFetchDevices : undefined}
        onRenameDevice={authState.isAuthenticated ? handleRenameDevice : undefined}
        onDeleteDevice={authState.isAuthenticated ? handleDeleteDevice : undefined}
        onDeleteOtherDevices={authState.isAuthenticated ? handleDeleteOtherDevices : undefined}
      />

      {/* Backup & Restore Modal */}
      <BackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        raindropToken={authState.accessToken}
        onBackup={authState.isAuthenticated ? handleCreateBackup : undefined}
        onFetchBackups={authState.isAuthenticated ? handleFetchBackups : undefined}
        onRestoreBackup={authState.isAuthenticated ? handleRestoreBackup : undefined}
        onRestoreComplete={handleRestoreComplete}
      />
    </div>
  );
}
