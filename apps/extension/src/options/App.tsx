import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Badge,
  Card,
  RaindropAuthCard,
  ExternalLinkIcon,
  RefreshIcon,
} from '@arcable/shared/components';
import { RaindropAuthState, ExtensionResponse, SyncResult } from '@arcable/shared/types';
import { useSystemTheme } from '@arcable/shared/hooks';
import {
  formatDate,
  extractRulesFromNenyaExport,
  mergeCustomCodeRules,
  mergeRunCodeRules,
  createWorkspaceOperation,
  clearStoredPendingOperations,
} from '@arcable/shared/utils';
import { WorkspaceOperation } from '@arcable/shared/types';
import { browser, openWorkspaceSafely, UpdateCheckResult } from '../utils/browser';
import { CustomCodeTab } from './components/CustomCodeTab';
import { RunCodeTab } from './components/RunCodeTab';
import packageJson from '../../package.json';

const extensionVersion = browser.runtime?.getManifest?.()?.version || packageJson.version;

type OptionsTab = 'sync' | 'custom-code' | 'run-code' | 'about';

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

  // Update check and reload state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; timestamp?: number } | null>(null);
  const [autoReloadOnUpdate, setAutoReloadOnUpdate] = useState(false);
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState<number | null>(null);
  const [updateFeedback, setUpdateFeedback] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
  } | null>(null);

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

    // Check for requested tab (e.g. from "Run Code in Page..." action)
    browser.storage.local.get('optionsInitialTab').then((res: any) => {
      if (res.optionsInitialTab) {
        setActiveTab(res.optionsInitialTab);
        void browser.storage.local.remove('optionsInitialTab');
      }
    });

    // 1. Load Raindrop auth state
    fetchAuthState();

    // 2. Load sync & update info from storage
    browser.storage.local.get([
      'arcable_last_synced_at',
      'arcable_update_available',
      'arcable_auto_reload_on_update',
      'arcable_last_update_check_at',
    ]).then((res: any) => {
      if (res.arcable_last_synced_at) {
        setLastSyncAt(res.arcable_last_synced_at);
      }
      if (res.arcable_update_available) {
        setAvailableUpdate(res.arcable_update_available);
      }
      if (res.arcable_auto_reload_on_update !== undefined) {
        setAutoReloadOnUpdate(Boolean(res.arcable_auto_reload_on_update));
      }
      if (res.arcable_last_update_check_at) {
        setLastUpdateCheckAt(res.arcable_last_update_check_at);
      }
    });

    // 3. Listen to storage changes
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
        if (changes.arcable_update_available) {
          setAvailableUpdate((changes.arcable_update_available.newValue as any) || null);
        }
        if (changes.arcable_auto_reload_on_update) {
          setAutoReloadOnUpdate(Boolean(changes.arcable_auto_reload_on_update.newValue));
        }
        if (changes.arcable_last_update_check_at) {
          setLastUpdateCheckAt(changes.arcable_last_update_check_at.newValue as number);
        }
        if (changes.arcable_workspace_snapshot?.newValue && typeof window !== 'undefined') {
          clearStoredPendingOperations();
          window.localStorage.setItem('arcable_workspace_data', JSON.stringify(changes.arcable_workspace_snapshot.newValue));
          window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: changes.arcable_workspace_snapshot.newValue }));
        }
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
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
        void browser.runtime.sendMessage({ type: 'RAINDROP_FETCH_WORKSPACE' }).then((fetchRes: any) => {
          if (fetchRes?.success && fetchRes.data && typeof window !== 'undefined') {
            clearStoredPendingOperations();
            window.localStorage.setItem('arcable_workspace_data', JSON.stringify(fetchRes.data));
            window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: fetchRes.data }));
          }
        });
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
      await browser.runtime.sendMessage({
        type: 'RAINDROP_START_OAUTH',
      });
      showToast('Opening Raindrop authentication...', 'info');
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
          localState,
        },
      })) as ExtensionResponse<SyncResult>;

      if (res && res.success) {
        if (res.data?.latestSnapshot && typeof window !== 'undefined') {
          clearStoredPendingOperations();
          window.localStorage.setItem('arcable_workspace_data', JSON.stringify(res.data.latestSnapshot));
          window.dispatchEvent(new CustomEvent('arcable_workspace_updated', { detail: res.data.latestSnapshot }));
        }
        const now = res.data?.syncedAt || Date.now();
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
            void browser.runtime.sendMessage({ type: 'RAINDROP_SYNC_WORKSPACE' });
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

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'CHECK_FOR_UPDATES',
      })) as ExtensionResponse<UpdateCheckResult>;

      const now = Date.now();
      setLastUpdateCheckAt(now);
      await browser.storage.local.set({ arcable_last_update_check_at: now });

      if (res && res.success && res.data) {
        const { status, version, error } = res.data;
        if (status === 'update_available') {
          const updateInfo = { version: version || 'new', timestamp: now };
          setAvailableUpdate(updateInfo);
          setUpdateFeedback({
            type: 'success',
            message: `Version ${version || 'new'} is available and downloaded! Reload Arcable to apply.`,
          });
          showToast(`Update available: v${version || 'new'}!`, 'success');
        } else if (status === 'no_update') {
          setAvailableUpdate(null);
          setUpdateFeedback({
            type: 'info',
            message: `You are up to date! Arcable v${extensionVersion} is the latest version.`,
          });
          showToast(`Arcable is up to date (v${extensionVersion})`, 'success');
        } else if (status === 'throttled') {
          setUpdateFeedback({
            type: 'warning',
            message: 'Update check was throttled by the browser. Please try again in a few minutes.',
          });
          showToast('Update check throttled by browser', 'warning');
        } else if (status === 'error') {
          setUpdateFeedback({
            type: 'warning',
            message: error || 'Browser extension update service is unavailable or extension is running unpacked in developer mode.',
          });
          showToast('Update check could not complete', 'warning');
        }
      } else {
        const errMsg = res?.error || 'Unable to check for updates.';
        setUpdateFeedback({
          type: 'error',
          message: errMsg,
        });
        showToast(errMsg, 'warning');
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to check for updates.';
      setUpdateFeedback({
        type: 'error',
        message: errMsg,
      });
      showToast(errMsg, 'warning');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleReloadExtension = async () => {
    setIsReloading(true);
    showToast('Reloading extension to apply update...', 'info');
    try {
      await browser.runtime.sendMessage({ type: 'RELOAD_EXTENSION' });
    } catch (e) {
      console.warn('Reload extension message failed, trying direct reload:', e);
      if (typeof chrome !== 'undefined' && chrome.runtime?.reload) {
        chrome.runtime.reload();
      }
    }
  };

  const handleToggleAutoReload = async (enabled: boolean) => {
    setAutoReloadOnUpdate(enabled);
    await browser.storage.local.set({ arcable_auto_reload_on_update: enabled });
    showToast(
      enabled
        ? 'Automatic reload upon update enabled'
        : 'Automatic reload upon update disabled',
      'info'
    );
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

                {availableUpdate ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('about')}
                    title="Update ready! Click to view in About tab"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '9999px',
                      padding: '3px 10px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <span>✨</span>
                    <span>Update v{availableUpdate.version} Ready</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCheckForUpdates}
                    disabled={isCheckingUpdate}
                    title="Check for extension updates"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: isDark ? '#1e293b' : '#f1f5f9',
                      color: isDark ? '#94a3b8' : '#64748b',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: isCheckingUpdate ? 'default' : 'pointer',
                      opacity: isCheckingUpdate ? 0.7 : 1,
                    }}
                  >
                    <RefreshIcon size={11} />
                    <span>{isCheckingUpdate ? 'Checking...' : 'Check Updates'}</span>
                  </button>
                )}
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
            { id: 'sync', label: 'Sync & Raindrop', icon: '💧' },
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
        {/* TAB 1: SYNC & RAINDROP */}
        {activeTab === 'sync' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            {/* Version & Updates Card */}
            <Card
              title="Version & Updates"
              subtitle="Keep Arcable up to date with the latest features and security improvements."
              style={{ borderRadius: '16px', padding: '24px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Header row: Current Version, Last Checked, and Check Button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '16px 20px',
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc',
                    borderRadius: '12px',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                        Arcable v{extensionVersion}
                      </span>
                      {availableUpdate ? (
                        <Badge variant="success">Update Ready</Badge>
                      ) : (
                        <Badge variant="info">Current</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
                      Last checked:{' '}
                      {lastUpdateCheckAt ? formatDate(lastUpdateCheckAt) : 'Never checked in this session'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleCheckForUpdates}
                      isLoading={isCheckingUpdate}
                      style={{
                        borderRadius: '8px',
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                      }}
                    >
                      <RefreshIcon size={14} />
                      <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                    </Button>
                  </div>
                </div>

                {/* Available update banner with Reload button */}
                {availableUpdate && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                      padding: '16px 20px',
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                      border: isDark ? '1px solid #059669' : '1px solid #a7f3d0',
                      borderRadius: '12px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '14.5px',
                          fontWeight: 700,
                          color: isDark ? '#34d399' : '#065f46',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>🎉</span>
                        <span>Arcable v{availableUpdate.version} is ready to install!</span>
                      </div>
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: '13px',
                          color: isDark ? '#a7f3d0' : '#047857',
                        }}
                      >
                        The update has been downloaded by your browser. Reload Arcable to apply it now.
                      </p>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleReloadExtension}
                      isLoading={isReloading}
                      style={{
                        borderRadius: '8px',
                        padding: '8px 18px',
                        backgroundColor: '#059669',
                        borderColor: '#059669',
                        color: '#ffffff',
                        fontWeight: 700,
                        boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                      }}
                    >
                      🔄 Reload Extension Now
                    </Button>
                  </div>
                )}

                {/* Status / feedback message */}
                {updateFeedback && !availableUpdate && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor:
                        updateFeedback.type === 'success' || updateFeedback.type === 'info'
                          ? isDark ? 'rgba(56, 189, 248, 0.12)' : '#f0f9ff'
                          : updateFeedback.type === 'warning'
                          ? isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb'
                          : isDark ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
                      color:
                        updateFeedback.type === 'success' || updateFeedback.type === 'info'
                          ? isDark ? '#7dd3fc' : '#0369a1'
                          : updateFeedback.type === 'warning'
                          ? isDark ? '#fcd34d' : '#b45309'
                          : isDark ? '#fca5a5' : '#b91c1c',
                      border:
                        updateFeedback.type === 'success' || updateFeedback.type === 'info'
                          ? isDark ? '1px solid #0284c7' : '1px solid #bae6fd'
                          : updateFeedback.type === 'warning'
                          ? isDark ? '1px solid #d97706' : '1px solid #fde68a'
                          : isDark ? '1px solid #dc2626' : '1px solid #fecaca',
                    }}
                  >
                    <span>
                      {updateFeedback.type === 'success' || updateFeedback.type === 'info'
                        ? 'ℹ️'
                        : updateFeedback.type === 'warning'
                        ? '⚠️'
                        : '❌'}
                    </span>
                    <span>{updateFeedback.message}</span>
                  </div>
                )}

                {/* Auto reload setting toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc',
                    border: isDark ? '1px solid #243247' : '1px solid #f1f5f9',
                  }}
                >
                  <div>
                    <label
                      htmlFor="auto-reload-toggle"
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: isDark ? '#f8fafc' : '#0f172a',
                        cursor: 'pointer',
                        display: 'block',
                      }}
                    >
                      Automatically reload extension when updated
                    </label>
                    <div
                      style={{
                        fontSize: '12.5px',
                        color: isDark ? '#94a3b8' : '#64748b',
                        marginTop: '2px',
                      }}
                    >
                      Immediately reloads Arcable in the background when a new version is installed.
                    </div>
                  </div>

                  <input
                    id="auto-reload-toggle"
                    type="checkbox"
                    checked={autoReloadOnUpdate}
                    onChange={(e) => void handleToggleAutoReload(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      accentColor: '#38bdf8',
                    }}
                  />
                </div>
              </div>
            </Card>

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

    </div>
  );
};
