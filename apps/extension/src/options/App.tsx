import React, { useState, useEffect } from 'react';
import { Header, Card, Button, RaindropAuthCard } from '@arcable/shared/components';
import { ArcableConfig, RaindropAuthState, ExtensionResponse } from '@arcable/shared/types';
import { browser } from '../utils/browser';

export const App: React.FC = () => {
  const [config, setConfig] = useState<ArcableConfig>({
    theme: 'system',
    syncEnabled: true,
    autoCapture: false,
    apiEndpoint: 'http://localhost:3000',
  });
  const [saved, setSaved] = useState(false);

  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Load extension preferences
    browser.storage.local.get('arcable_config').then((res) => {
      if (res.arcable_config) {
        setConfig(res.arcable_config as ArcableConfig);
      }
    });

    // 2. Load Raindrop auth state
    fetchAuthState();

    // 3. Listen to storage changes (e.g. from OAuth bridge or external auth)
    const handleStorageChange = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.arcable_raindrop_auth) {
        const newAuth = changes.arcable_raindrop_auth.newValue as RaindropAuthState | undefined;
        if (newAuth && newAuth.isAuthenticated) {
          setAuthState(newAuth);
          setAuthError(null);
        } else {
          setAuthState({ isAuthenticated: false });
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
    } catch (err: any) {
      console.error('Logout failed:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await browser.storage.local.set({ arcable_config: config });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: '640px', margin: '40px auto', padding: '0 16px' }}>
      <Header title="Arcable" badgeText="Settings" badgeVariant="default" />

      {/* Raindrop Integration Card */}
      <div style={{ marginTop: '24px' }}>
        <RaindropAuthCard
          authState={authState}
          isLoading={authLoading}
          errorMessage={authError}
          onLoginWithToken={handleLoginWithToken}
          onLoginWithOAuth={handleLoginWithOAuth}
          onLogout={handleLogout}
          onClearError={() => setAuthError(null)}
        />
      </div>

      {/* Extension Preferences */}
      <div style={{ marginTop: '24px' }}>
        <Card title="Extension Preferences" subtitle="Configure synchronization and browser behavior">
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#334155' }}>Webapp API Endpoint</label>
              <input
                type="text"
                value={config.apiEndpoint || ''}
                onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="syncEnabled"
                checked={config.syncEnabled}
                onChange={(e) => setConfig({ ...config, syncEnabled: e.target.checked })}
              />
              <label htmlFor="syncEnabled" style={{ fontSize: '14px', color: '#334155' }}>
                Enable cloud sync with Arcable Webapp
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="autoCapture"
                checked={config.autoCapture}
                onChange={(e) => setConfig({ ...config, autoCapture: e.target.checked })}
              />
              <label htmlFor="autoCapture" style={{ fontSize: '14px', color: '#334155' }}>
                Auto-capture visited pages metadata
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <Button type="submit" variant="primary">
                Save Preferences
              </Button>
              {saved && <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: 500 }}>Saved!</span>}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
