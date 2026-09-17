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
import { browser, openWorkspaceSafely } from '../utils/browser';
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

    // 2. Load sync info from storage
    browser.storage.local.get([
      'arcable_last_synced_at',
    ]).then((res: any) => {
      if (res.arcable_last_synced_at) {
        setLastSyncAt(res.arcable_last_synced_at);
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
