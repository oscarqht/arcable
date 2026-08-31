import React, { useState, useEffect } from 'react';
import { Header, RaindropAuthCard } from '@arcable/shared/components';
import { RaindropAuthState, ExtensionResponse } from '@arcable/shared/types';
import { browser } from '../utils/browser';

export const App: React.FC = () => {
  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Load Raindrop auth state
    fetchAuthState();

    // 2. Listen to storage changes (e.g. from OAuth bridge or external auth)
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

  return (
    <div style={{ maxWidth: '640px', margin: '40px auto', padding: '0 16px' }}>
      <Header
        title="Arcable"
        logoSrc={browser.runtime.getURL('icons/icon32.png')}
        badgeText="Settings"
        badgeVariant="default"
      />

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
    </div>
  );
};
