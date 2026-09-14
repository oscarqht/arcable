import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Badge,
  Card,
  DeviceModal,
  RaindropAuthCard,
  SupabaseAuthCard,
  CopyIcon,
  ExternalLinkIcon,
  RefreshIcon,
  LaptopIcon,
} from '@arcable/shared/components';
import {
  RaindropAuthState,
  ExtensionResponse,
  SyncResult,
  DeviceSyncRecord,
  SupabaseSessionTokens,
  SyncProvider,
  WorkspaceOperation,
} from '@arcable/shared/types';
import { useSystemTheme } from '@arcable/shared/hooks';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  setStoredDeviceName,
  formatDate,
  extractRulesFromNenyaExport,
  mergeCustomCodeRules,
  mergeRunCodeRules,
  createWorkspaceOperation,
  getSyncProvider,
  setSyncProvider,
  getSupabaseSession,
  setSupabaseSession,
  getSyncServerUrl,
  setSyncServerUrl,
  getStoredServerVersion,
  performSupabaseSync,
  refreshSupabaseSession,
  getDefaultServerUrl,
} from '@arcable/shared/utils';

import { browser, openWorkspaceSafely } from '../utils/browser';
import { CustomCodeTab } from './components/CustomCodeTab';
import { RunCodeTab } from './components/RunCodeTab';
import packageJson from '../../package.json';

const extensionVersion = browser.runtime?.getManifest?.()?.version || packageJson.version;

type OptionsTab = 'sync' | 'device' | 'custom-code' | 'run-code' | 'about';

interface ToastInfo {
  message: string;
  type?: 'info' | 'success' | 'warning';
}

export const App: React.FC = () => {
  const { isDark } = useSystemTheme();
  const [activeTab, setActiveTab] = useState<OptionsTab>('sync');

  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sync state
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Supabase / Arcable Cloud state
  const [syncProvider, setSyncProviderState] = useState<SyncProvider>('supabase');
  const [supabaseSession, setSupabaseSessionState] = useState<SupabaseSessionTokens | null>(null);
  const [supabaseServerUrl, setSupabaseServerUrlState] = useState<string>(getDefaultServerUrl());
  const [supabaseVersion, setSupabaseVersionState] = useState<number>(1);
  const [isSupabaseSyncing, setIsSupabaseSyncing] = useState(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  // Device state
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<ToastInfo | null>(null);

  // Custom code prefill pattern (from popup/sidepanel quick trigger)
  const [initialCustomCodePattern, setInitialCustomCodePattern] = useState<string | undefined>(undefined);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  useEffect(() => {
    // Check for prefill URL (e.g. from "Customize this site" action)
    browser.storage.local.get('customCodePrefillUrl').then((res: any) => {
      if (res.customCodePrefillUrl) {
        setActiveTab('custom-code');
        setInitialCustomCodePattern(res.customCodePrefillUrl);
        void browser.storage.local.remove('customCodePrefillUrl');
      }
    });

    // 1. Load Raindrop auth state
    fetchAuthState();

    // 2. Load device info
    const curDevId = getOrCreateDeviceId();
    setDeviceId(curDevId);
    const curDevName = getStoredDeviceName(undefined, 'Ext');
    setDeviceName(curDevName);
    setDeviceNameInput(curDevName);

    // 3. Load sync & config info from storage
    browser.storage.local.get([
      'arcable_last_synced_at',
      'arcable_device_name',
      'arcable_sync_provider',
      'arcable_supabase_session',
      'arcable_supabase_server_url',
    ]).then((res: any) => {
      if (res.arcable_last_synced_at) {
        setLastSyncAt(res.arcable_last_synced_at);
      }
      if (res.arcable_device_name) {
        setDeviceName(res.arcable_device_name);
        setDeviceNameInput(res.arcable_device_name);
      }
      if (res.arcable_sync_provider) {
        setSyncProviderState(res.arcable_sync_provider);
      } else {
        setSyncProviderState(getSyncProvider());
      }
      const storedSupabaseSession = res.arcable_supabase_session || getSupabaseSession();
      setSupabaseSessionState(storedSupabaseSession);
      // Sessions saved by the older Firefox identity callback contain valid
      // tokens but no user profile. Refresh once to hydrate the existing
      // connection without forcing the user to disconnect and sign in again.
      if (
        storedSupabaseSession?.access_token &&
        storedSupabaseSession?.refresh_token &&
        !storedSupabaseSession?.user?.id
      ) {
        void browser.runtime.sendMessage({ type: 'SUPABASE_REFRESH_SESSION' }).then((refreshResult: any) => {
          if (refreshResult?.success && refreshResult.data?.user) {
            setSupabaseSessionState(refreshResult.data);
          }
        }).catch(() => {});
      }
      if (res.arcable_supabase_server_url) {
        setSupabaseServerUrlState(res.arcable_supabase_server_url);
      } else {
        setSupabaseServerUrlState(getSyncServerUrl());
      }
      setSupabaseVersionState(getStoredServerVersion());
    });

    // 4. Listen to storage changes
    const handleStorageChange = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      if (area === 'local') {
        if (changes.arcable_raindrop_auth) {
          const newAuth = changes.arcable_raindrop_auth.newValue as RaindropAuthState | undefined;
          if (newAuth && newAuth.isAuthenticated) {
            setAuthState(newAuth);
            setAuthError(null);
          } else {
            setAuthState({ isAuthenticated: false });
          }
        }
        if (changes.arcable_last_synced_at) {
          setLastSyncAt(changes.arcable_last_synced_at.newValue as number);
        }
        if (changes.arcable_sync_provider) {
          setSyncProviderState(changes.arcable_sync_provider.newValue as SyncProvider);
        }
        if (changes.arcable_supabase_session) {
          setSupabaseSessionState(changes.arcable_supabase_session.newValue as SupabaseSessionTokens | null);
        }
        if (changes.arcable_supabase_server_url) {
          setSupabaseServerUrlState(changes.arcable_supabase_server_url.newValue as string);
        }
      }
    };

    // 5. Listen to runtime messages for auth bridge completion
    const handleRuntimeMessage = (msg: any) => {
      if (msg && msg.type === 'SUPABASE_SESSION_CHANGED') {
        setSupabaseSessionState(msg.session || null);
        if (msg.session) {
          showToast('Connected to Arcable Cloud!', 'success');
        }
      }
    };

    // 6. Automatically re-check session when user returns/focuses Options tab
    const handleTabFocus = () => {
      browser.storage.local.get(['arcable_supabase_session', 'arcable_sync_provider']).then((res: any) => {
        if (res.arcable_supabase_session) {
          setSupabaseSessionState(res.arcable_supabase_session);
        }
        if (res.arcable_sync_provider) {
          setSyncProviderState(res.arcable_sync_provider);
        }
      });
    };

    const handleSessionEvent = (e: any) => {
      const detail = e?.detail as SupabaseSessionTokens | null;
      setSupabaseSessionState(detail || null);
    };

    window.addEventListener('focus', handleTabFocus);
    window.addEventListener('visibilitychange', handleTabFocus);
    window.addEventListener('arcable_supabase_session_changed', handleSessionEvent);

    browser.storage.onChanged.addListener(handleStorageChange);
    browser.runtime.onMessage.addListener(handleRuntimeMessage);

    return () => {
      window.removeEventListener('focus', handleTabFocus);
      window.removeEventListener('visibilitychange', handleTabFocus);
      window.removeEventListener('arcable_supabase_session_changed', handleSessionEvent);
      browser.storage.onChanged.removeListener(handleStorageChange);
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  const fetchAuthState = async () => {
    setAuthLoading(true);
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'RAINDROP_GET_AUTH_STATE',
      })) as ExtensionResponse<RaindropAuthState>;
      if (res && res.success && res.data) {
        setAuthState(res.data);
      } else {
        setAuthState({ isAuthenticated: false });
      }
    } catch (e) {
      console.warn('Error fetching Raindrop auth state in options:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginWithToken = async (token: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'RAINDROP_LOGIN_TOKEN',
        payload: { token },
      })) as ExtensionResponse<RaindropAuthState>;
      if (res && res.success && res.data) {
        setAuthState(res.data);
        showToast('Connected to Raindrop.io successfully!', 'success');
      } else {
        throw new Error(res?.error || 'Failed to authenticate token with Raindrop.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Token authentication failed');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginWithOAuth = async () => {
    setAuthError(null);
    try {
      const res: any = await browser.runtime.sendMessage({
        type: 'RAINDROP_START_OAUTH',
      });
      if (!res?.success || !res.data?.isAuthenticated) {
        throw new Error(res?.error || 'Raindrop OAuth did not return an authenticated session.');
      }
      setAuthState(res.data);
      showToast('Connected to Raindrop.io successfully!', 'success');
    } catch (err: any) {
      setAuthError(err.message || 'Failed to start OAuth');
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await browser.runtime.sendMessage({
        type: 'RAINDROP_LOGOUT',
      });
      setAuthState({ isAuthenticated: false });
      showToast('Disconnected from Raindrop', 'info');
    } catch (err: any) {
      console.error('Logout failed:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginWithGoogle = async () => {
    setSupabaseError(null);
    try {
      const res: any = await browser.runtime.sendMessage({ type: 'SUPABASE_START_OAUTH' });
      if (!res?.success || !res.data?.access_token) {
        throw new Error(res?.error || 'Google OAuth did not return a Supabase session.');
      }
      setSupabaseSession(res.data);
      setSupabaseSessionState(res.data);
      setSyncProvider('supabase');
      setSyncProviderState('supabase');
      showToast('Connected to Arcable Cloud!', 'success');
    } catch (err: any) {
      setSupabaseError(err?.message || 'Failed to start Google OAuth');
    }
  };

  const handleSupabaseLogout = async () => {
    try {
      await browser.runtime.sendMessage({ type: 'SUPABASE_LOGOUT' });
      setSupabaseSession(null);
      setSupabaseSessionState(null);
      showToast('Disconnected from Arcable Cloud', 'info');
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  const handleChangeServerUrl = (url: string) => {
    setSyncServerUrl(url);
    setSupabaseServerUrlState(url);
    void browser.storage.local.set({ arcable_supabase_server_url: url });
    showToast(`Server URL updated to ${url}`, 'success');
  };

  const handleSupabaseSyncNow = async () => {
    if (!supabaseSession) {
      showToast('Please sign in first', 'warning');
      return;
    }
    setIsSupabaseSyncing(true);
    setSupabaseError(null);
    try {
      let localState: any = undefined;
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('arcable_workspace_data');
        if (stored) {
          try {
            localState = JSON.parse(stored);
          } catch {}
        }
      }

      if (!localState) {
        showToast('No workspace data found locally', 'warning');
        return;
      }

      const res = await performSupabaseSync({
        currentState: localState,
        serverUrl: supabaseServerUrl,
        session: supabaseSession,
        onApplySnapshot: (snap) => {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('arcable_workspace_data', JSON.stringify(snap));
          }
        },
      });

      if (res.success) {
        if (res.serverVersion) setSupabaseVersionState(res.serverVersion);
        setSupabaseError(null);
        showToast('Cloud sync complete!', 'success');
      } else {
        setSupabaseError(res.error || 'Sync failed');
        showToast(res.error || 'Sync failed', 'warning');
      }
    } catch (err: any) {
      setSupabaseError(err?.message || 'Sync failed');
      showToast(err?.message || 'Sync failed', 'warning');
    } finally {
      setIsSupabaseSyncing(false);
    }
  };

  const handleProviderToggle = (provider: SyncProvider) => {
    setSyncProvider(provider);
    setSyncProviderState(provider);
    void browser.storage.local.set({ arcable_sync_provider: provider });
    showToast(
      `Sync provider switched to ${provider === 'supabase' ? 'Arcable Cloud' : 'Raindrop.io'}`,
      'info'
    );
  };

  const handleRefreshSession = async () => {
    try {
      const res: any = await browser.storage.local.get(['arcable_supabase_session', 'arcable_sync_provider']);
      const session = res.arcable_supabase_session || supabaseSession || getSupabaseSession();
      if (!session) {
        showToast('No active session found. Please complete sign-in in the login tab.', 'info');
        return;
      }

      if (session.refresh_token) {
        const refreshed = await refreshSupabaseSession(session, supabaseServerUrl);
        if (refreshed) {
          setSupabaseSessionState(refreshed);
          setSupabaseError(null);
          showToast('Connection refreshed successfully!', 'success');
          return;
        }
      }

      if (session.access_token) {
        setSupabaseSessionState(session);
        setSupabaseError(null);
        showToast('Connected to Arcable Cloud!', 'success');
      }
    } catch (err: any) {
      showToast('Refresh failed: ' + (err?.message || 'Unknown error'), 'warning');
    }
  };

  const handleManualTokenImport = async (tokenInput: string) => {
    try {
      let session: any = null;
      const clean = tokenInput.trim();
      if (clean.startsWith('{')) {
        session = JSON.parse(clean);
      } else {
        session = { access_token: clean, refresh_token: '' };
      }

      if (session && session.access_token) {
        await browser.storage.local.set({
          arcable_supabase_session: session,
          arcable_sync_provider: 'supabase',
        });
        setSupabaseSession(session);
        setSyncProvider('supabase');
        setSupabaseSessionState(session);
        setSyncProviderState('supabase');
        showToast('Connected to Arcable Cloud successfully!', 'success');
        return true;
      }
      throw new Error('Invalid token structure');
    } catch (err: any) {
      showToast('Import failed: ' + (err.message || 'Invalid format'), 'warning');
      return false;
    }
  };



  const handleManualSync = async () => {
    if (!authState.isAuthenticated) {
      showToast('Please connect to Raindrop first.', 'warning');
      return;
    }
    setIsSyncing(true);
    try {
      let localState: any = undefined;
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('arcable_workspace_data');
        if (stored) {
          try {
            localState = JSON.parse(stored);
          } catch {}
        }
      }

      const res = (await browser.runtime.sendMessage({
        type: 'RAINDROP_SYNC_WORKSPACE',
        payload: {
          deviceName,
          deviceId,
          localState,
        },
      })) as ExtensionResponse<SyncResult>;

      if (res && res.success) {
        const now = Date.now();
        setLastSyncAt(now);
        await browser.storage.local.set({ arcable_last_synced_at: now });
        showToast('Workspace synced with Raindrop.io cloud!', 'success');
      } else {
        showToast(`Sync issue: ${res?.error || 'Unknown'}`, 'warning');
      }
    } catch (err: any) {
      showToast(`Sync failed: ${err.message}`, 'warning');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveDeviceName = async () => {
    const clean = deviceNameInput.trim();
    if (!clean) return;
    setDeviceName(clean);
    setStoredDeviceName(clean);
    await browser.storage.local.set({ arcable_device_name: clean });

    if (authState.isAuthenticated) {
      try {
        await browser.runtime.sendMessage({
          type: 'RAINDROP_RENAME_DEVICE',
          payload: { deviceId, newName: clean },
        });
      } catch {}
    }
    showToast('Device name saved', 'success');
  };

  const handleCopyDeviceId = () => {
    if (deviceId) {
      navigator.clipboard.writeText(deviceId);
      showToast('Device ID copied to clipboard', 'info');
    }
  };

  const fileInputNenyaRef = React.useRef<HTMLInputElement>(null);

  const handleGlobalNenyaImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || '');
        const parsed = JSON.parse(text);
        const { customCodeRules: extractedCustom, runCodeRules: extractedRun } =
          extractRulesFromNenyaExport(parsed);

        if (extractedCustom.length === 0 && extractedRun.length === 0) {
          showToast('No valid Custom JS/CSS or Run Code rules found in Nenya file.', 'warning');
          return;
        }

        let customAdded = 0;
        let runAdded = 0;
        const opsToQueue: WorkspaceOperation[] = [];

        if (extractedCustom.length > 0) {
          const stored = await browser.storage.local.get('customCodeRules');
          const existing = (stored.customCodeRules as any[]) || [];
          const { merged, addedCount, addedRules } = mergeCustomCodeRules(existing, extractedCustom);
          await browser.storage.local.set({ customCodeRules: merged });
          customAdded = addedCount;
          for (const r of addedRules) {
            opsToQueue.push(createWorkspaceOperation('CUSTOM_CODE_CREATE', r.id, r));
          }
        }

        if (extractedRun.length > 0) {
          const storedRun = await browser.storage.local.get('runCodeInPageRules');
          const existingRun = (storedRun.runCodeInPageRules as any[]) || [];
          const { merged: mergedRun, addedCount, addedRules } = mergeRunCodeRules(existingRun, extractedRun);
          await browser.storage.local.set({ runCodeInPageRules: mergedRun });
          runAdded = addedCount;
          for (const r of addedRules) {
            opsToQueue.push(createWorkspaceOperation('RUN_CODE_CREATE', r.id, r));
          }
        }

        if (opsToQueue.length > 0) {
          try {
            const curStored = await browser.storage.local.get('arcable_pending_ops');
            const curOps = (curStored.arcable_pending_ops as WorkspaceOperation[]) || [];
            curOps.push(...opsToQueue);
            await browser.storage.local.set({ arcable_pending_ops: curOps });
          } catch (e) {
            console.warn('Failed to queue Nenya import operations:', e);
          }
        }

        showToast(
          `Imported from Nenya: ${customAdded} Custom JS/CSS rule(s), ${runAdded} Run Code snippet(s)!`,
          'success'
        );
      } catch (err: any) {
        showToast(`Nenya import failed: ${err.message}`, 'warning');
      } finally {
        if (fileInputNenyaRef.current) fileInputNenyaRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearCache = async () => {
    if (window.confirm('Are you sure you want to clear extension cache? Your cloud bookmarks in Raindrop will remain safe.')) {
      await browser.storage.local.remove(['arcable_items', 'arcable_workspace_snapshot', 'arcable_pending_ops']);
      showToast('Extension local cache cleared', 'info');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '36px 20px 80px',
        maxWidth: '880px',
        margin: '0 auto',
        boxSizing: 'border-box',
        color: isDark ? '#f8fafc' : '#0f172a',
      }}
    >
      {/* Floating Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '12px',
            backgroundColor: isDark ? '#1e293b' : '#0f172a',
            color: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            fontSize: '13.5px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-out',
            border: isDark ? '1px solid #334155' : '1px solid #1e293b',
          }}
        >
          <span>{toast.type === 'success' ? '✓' : toast.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Cozy Header Banner */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src={browser.runtime.getURL('icons/icon48.png')}
              alt="Arcable Logo"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(56, 189, 248, 0.25)',
                display: 'block',
              }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: '24px',
                    fontWeight: 700,
                    letterSpacing: '-0.025em',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                >
                  Arcable Settings
                </h1>
                <Badge variant="info">v{extensionVersion}</Badge>
              </div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '14px',
                  color: isDark ? '#94a3b8' : '#64748b',
                }}
              >
                Customize your workspace, cloud sync, and device preferences.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputNenyaRef}
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleGlobalNenyaImport}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputNenyaRef.current?.click()}
              title="Import custom code rules and snippets from a full Nenya export JSON file"
              style={{
                borderRadius: '8px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📥 Import from Nenya JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openWorkspaceSafely()}
              style={{
                borderRadius: '8px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📑 Open Workspace
            </Button>
          </div>
        </div>

        {/* Segmented Navigation Tabs */}
        <nav
          style={{
            display: 'flex',
            gap: '6px',
            backgroundColor: isDark ? '#151e2e' : '#f1f5f9',
            padding: '6px',
            borderRadius: '12px',
            border: isDark ? '1px solid #243247' : '1px solid #e2e8f0',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'sync', label: 'Sync & Cloud', icon: '🔄' },
            { id: 'device', label: 'Device & Identity', icon: '💻' },
            { id: 'custom-code', label: 'Custom JS & CSS', icon: '🎨' },
            { id: 'run-code', label: 'Run Code', icon: '⚡' },
            { id: 'about', label: 'About', icon: 'ℹ️' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as OptionsTab)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive
                    ? (isDark ? '#f8fafc' : '#0f172a')
                    : (isDark ? '#94a3b8' : '#64748b'),
                  backgroundColor: isActive
                    ? (isDark ? '#1e293b' : '#ffffff')
                    : 'transparent',
                  boxShadow: isActive
                    ? (isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.06)')
                    : 'none',
                  border: isActive
                    ? (isDark ? '1px solid #334155' : '1px solid #e2e8f0')
                    : '1px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Sections */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* TAB 1: SYNC & CLOUD */}
        {activeTab === 'sync' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Sync Provider Selector */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '4px',
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : '#e2e8f0',
                borderRadius: '12px',
                width: 'fit-content',
              }}
            >
              <button
                type="button"
                onClick={() => handleProviderToggle('supabase')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: syncProvider === 'supabase' ? (isDark ? '#3b82f6' : '#ffffff') : 'transparent',
                  color: syncProvider === 'supabase' ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                  boxShadow: syncProvider === 'supabase' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                🌌 Arcable Cloud (Google OAuth)
              </button>
              <button
                type="button"
                onClick={() => handleProviderToggle('raindrop')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: syncProvider === 'raindrop' ? (isDark ? '#3b82f6' : '#ffffff') : 'transparent',
                  color: syncProvider === 'raindrop' ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                  boxShadow: syncProvider === 'raindrop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                💧 Raindrop.io
              </button>
            </div>

            {syncProvider === 'supabase' ? (
              <SupabaseAuthCard
                session={supabaseSession}
                onLoginWithGoogle={handleLoginWithGoogle}
                onLogout={handleSupabaseLogout}
                onRefreshSession={handleRefreshSession}
                onImportToken={handleManualTokenImport}
                serverUrl={supabaseServerUrl}
                onChangeServerUrl={handleChangeServerUrl}
                onSyncNow={handleSupabaseSyncNow}
                isSyncing={isSupabaseSyncing}
                errorMessage={supabaseError}
                serverVersion={supabaseVersion}
              />
            ) : (
              <>
                <RaindropAuthCard
                  authState={authState}
                  isLoading={authLoading}
                  errorMessage={authError}
                  onLoginWithToken={handleLoginWithToken}
                  onLoginWithOAuth={handleLoginWithOAuth}
                  onLogout={handleLogout}
                  onClearError={() => setAuthError(null)}
                  title="Raindrop.io Cloud Sync"
                  subtitle="Connect your Raindrop account to sync spaces, folders, and tabs seamlessly across browsers."
                />

                {authState.isAuthenticated && (
                  <Card
                    title="Sync Status"
                    subtitle="Manage your cloud synchronization with Raindrop"
                    style={{ borderRadius: '16px', padding: '24px' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        padding: '14px 18px',
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
                        borderRadius: '12px',
                        border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                          Last Cloud Sync
                        </div>
                        <div style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                          {lastSyncAt ? formatDate(lastSyncAt) : 'Not synced yet in this session'}
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleManualSync}
                        isLoading={isSyncing}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontWeight: 600,
                        }}
                      >
                        <RefreshIcon size={14} />
                        <span>Sync Now</span>
                      </Button>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 2: DEVICE & IDENTITY */}
        {activeTab === 'device' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="This Device"
              subtitle="Identify this browser extension in your synced device list."
              style={{ borderRadius: '16px', padding: '24px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label
                    htmlFor="device-name-input"
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isDark ? '#e2e8f0' : '#334155',
                      display: 'block',
                      marginBottom: '8px',
                    }}
                  >
                    Custom Device Name
                  </label>
                  <div style={{ display: 'flex', gap: '10px', maxWidth: '480px' }}>
                    <input
                      id="device-name-input"
                      type="text"
                      value={deviceNameInput}
                      onChange={(e) => setDeviceNameInput(e.target.value)}
                      placeholder="e.g. Work MacBook, Home Chrome"
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                        color: isDark ? '#f8fafc' : '#0f172a',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveDeviceName}
                      disabled={!deviceNameInput.trim() || deviceNameInput.trim() === deviceName}
                      style={{ borderRadius: '8px', padding: '0 16px', fontWeight: 600 }}
                    >
                      Save Name
                    </Button>
                  </div>
                </div>

                <div
                  style={{
                    padding: '14px 18px',
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
                    borderRadius: '12px',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                      Unique Device ID
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                      {deviceId || 'Generating...'}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyDeviceId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <CopyIcon size={13} />
                    <span>Copy ID</span>
                  </Button>
                </div>

                {authState.isAuthenticated && (
                  <div style={{ paddingTop: '8px' }}>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setIsDeviceModalOpen(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: '8px',
                        fontWeight: 600,
                      }}
                    >
                      <LaptopIcon size={16} />
                      <span>Manage All Linked Devices...</span>
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: CUSTOM JS & CSS */}
        {activeTab === 'custom-code' && (
          <CustomCodeTab
            isDark={isDark}
            showToast={showToast}
            initialPattern={initialCustomCodePattern}
            onClearInitialPattern={() => setInitialCustomCodePattern(undefined)}
          />
        )}

        {/* TAB 4: RUN CODE IN PAGE */}
        {activeTab === 'run-code' && (
          <RunCodeTab
            isDark={isDark}
            showToast={showToast}
          />
        )}

        {/* TAB 5: ABOUT */}
        {activeTab === 'about' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="About Arcable"
              subtitle="Arc-like workspaces and tab management with Raindrop.io sync."
              style={{ borderRadius: '16px', padding: '24px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: isDark ? '#cbd5e1' : '#475569', margin: 0 }}>
                  Arcable brings the modern sidebar experience to all browsers with spaces, folders, pinned tabs, and seamless multi-device synchronization powered by Raindrop.io.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc',
                    borderRadius: '12px',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Version</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>{extensionVersion} (Beta)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Platform</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>WebExtension (Manifest V3)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Cloud Provider</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>Raindrop.io REST API</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <a
                    href="https://raindrop.io"
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <Button variant="outline" size="sm" style={{ borderRadius: '8px', display: 'flex', gap: '6px' }}>
                      <span>Raindrop.io Website</span>
                      <ExternalLinkIcon size={12} />
                    </Button>
                  </a>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <Button variant="outline" size="sm" style={{ borderRadius: '8px', display: 'flex', gap: '6px' }}>
                      <span>GitHub Repository</span>
                      <ExternalLinkIcon size={12} />
                    </Button>
                  </a>
                </div>

                <div style={{ paddingTop: '16px', borderTop: isDark ? '1px solid #243247' : '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#f87171' : '#dc2626' }}>
                    Troubleshooting & Diagnostics
                  </div>
                  <p style={{ fontSize: '12.5px', color: isDark ? '#94a3b8' : '#64748b', margin: '0 0 12px' }}>
                    If you experience local state issues or tab cache conflicts, you can safely clear extension storage.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearCache}
                    style={{
                      color: isDark ? '#f87171' : '#dc2626',
                      borderColor: isDark ? '#7f1d1d' : '#fecaca',
                      borderRadius: '8px',
                    }}
                  >
                    Clear Extension Local Cache
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Device Management Modal */}
      {isDeviceModalOpen && (() => {
        const isGoogleLoggedIn = Boolean(supabaseSession?.access_token);
        const isRaindropLoggedIn = Boolean(!isGoogleLoggedIn && authState.isAuthenticated);

        return (
          <DeviceModal
            isOpen={isDeviceModalOpen}
            onClose={() => setIsDeviceModalOpen(false)}
            syncProvider={isGoogleLoggedIn ? 'supabase' : isRaindropLoggedIn ? 'raindrop' : undefined}
            currentDeviceId={deviceId}
            onFetchDevices={async () => {
              if (isGoogleLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'SUPABASE_GET_DEVICES',
                  payload: { currentDeviceId: deviceId, currentDeviceName: deviceName },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                return res?.data || [];
              }
              if (isRaindropLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'RAINDROP_GET_DEVICES',
                  payload: { currentDeviceId: deviceId },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                return res?.data || [];
              }
              return [];
            }}
            onRenameDevice={async (devId, newName) => {
              if (isGoogleLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'SUPABASE_RENAME_DEVICE',
                  payload: { deviceId: devId, newName },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                if (devId === deviceId) {
                  setDeviceName(newName);
                  setDeviceNameInput(newName);
                }
                return res?.data;
              }
              if (isRaindropLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'RAINDROP_RENAME_DEVICE',
                  payload: { deviceId: devId, newName },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                if (devId === deviceId) {
                  setDeviceName(newName);
                  setDeviceNameInput(newName);
                }
                return res?.data;
              }
            }}
            onDeleteDevice={async (devId) => {
              if (isGoogleLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'SUPABASE_DELETE_DEVICE',
                  payload: { deviceId: devId },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                return res?.data;
              }
              if (isRaindropLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'RAINDROP_DELETE_DEVICE',
                  payload: { deviceId: devId },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                return res?.data;
              }
            }}
            onDeleteOtherDevices={async (keepId) => {
              if (isGoogleLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'SUPABASE_DELETE_OTHER_DEVICES',
                  payload: { keepDeviceId: keepId },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                return res?.data;
              }
              if (isRaindropLoggedIn) {
                const res = (await browser.runtime.sendMessage({
                  type: 'RAINDROP_DELETE_OTHER_DEVICES',
                  payload: { keepDeviceId: keepId },
                })) as ExtensionResponse<DeviceSyncRecord[]>;
                return res?.data;
              }
            }}
          />
        );
      })()}
    </div>
  );
};
