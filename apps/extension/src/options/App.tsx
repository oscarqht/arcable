import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Badge,
  Card,
  DeviceModal,
  RaindropAuthCard,
  CopyIcon,
  ExternalLinkIcon,
  RefreshIcon,
  LaptopIcon,
} from '@arcable/shared/components';
import { RaindropAuthState, ExtensionResponse, SyncResult, DeviceSyncRecord } from '@arcable/shared/types';
import { useSystemTheme } from '@arcable/shared/hooks';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  setStoredDeviceName,
  formatDate,
} from '@arcable/shared/utils';
import { browser, openWorkspaceSafely } from '../utils/browser';

type OptionsTab = 'sync' | 'device' | 'about';

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

  // Device state
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  useEffect(() => {
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
    ]).then((res: any) => {
      if (res.arcable_last_synced_at) {
        setLastSyncAt(res.arcable_last_synced_at);
      }
      if (res.arcable_device_name) {
        setDeviceName(res.arcable_device_name);
        setDeviceNameInput(res.arcable_device_name);
      }
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
                <Badge variant="info">v0.1.0</Badge>
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
            { id: 'device', label: 'Device & Identity', icon: '💻' },
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

        {/* TAB 3: ABOUT */}
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
                    <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>0.1.0 (Beta)</div>
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
      {isDeviceModalOpen && (
        <DeviceModal
          isOpen={isDeviceModalOpen}
          onClose={() => setIsDeviceModalOpen(false)}
          currentDeviceId={deviceId}
          onFetchDevices={async () => {
            const res = (await browser.runtime.sendMessage({
              type: 'RAINDROP_GET_DEVICES',
              payload: { currentDeviceId: deviceId },
            })) as ExtensionResponse<DeviceSyncRecord[]>;
            return res?.data || [];
          }}
          onRenameDevice={async (devId, newName) => {
            const res = (await browser.runtime.sendMessage({
              type: 'RAINDROP_RENAME_DEVICE',
              payload: { deviceId: devId, newName },
            })) as ExtensionResponse<DeviceSyncRecord[]>;
            if (devId === deviceId) {
              setDeviceName(newName);
              setDeviceNameInput(newName);
            }
            return res?.data;
          }}
          onDeleteDevice={async (devId) => {
            const res = (await browser.runtime.sendMessage({
              type: 'RAINDROP_DELETE_DEVICE',
              payload: { deviceId: devId },
            })) as ExtensionResponse<DeviceSyncRecord[]>;
            return res?.data;
          }}
          onDeleteOtherDevices={async (keepId) => {
            const res = (await browser.runtime.sendMessage({
              type: 'RAINDROP_DELETE_OTHER_DEVICES',
              payload: { keepDeviceId: keepId },
            })) as ExtensionResponse<DeviceSyncRecord[]>;
            return res?.data;
          }}
        />
      )}
    </div>
  );
};
