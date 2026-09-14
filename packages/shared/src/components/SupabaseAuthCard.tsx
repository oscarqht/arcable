'use client';

import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import { SupabaseSessionTokens } from '../types/sync';
import { useSystemTheme } from '../hooks/useSystemTheme';
import { getDefaultServerUrl, DEV_SERVER_URL, PROD_SERVER_URL } from '../utils/supabaseSync';

export interface SupabaseAuthCardProps {
  session: SupabaseSessionTokens | null;
  onLoginWithGoogle: () => void;
  onLogout: () => Promise<void>;
  onRefreshSession?: () => void;
  onImportToken?: (token: string) => Promise<boolean | void>;
  serverUrl?: string;
  onChangeServerUrl?: (url: string) => void;
  onSyncNow?: () => Promise<void>;
  isSyncing?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  serverVersion?: number;
  title?: string;
  subtitle?: string;
}

export const SupabaseAuthCard: React.FC<SupabaseAuthCardProps> = ({
  session,
  onLoginWithGoogle,
  onLogout,
  onRefreshSession,
  onImportToken,
  serverUrl = getDefaultServerUrl(),
  onChangeServerUrl,
  onSyncNow,
  isSyncing = false,
  isLoading = false,
  errorMessage = null,
  serverVersion = 1,
  title = 'Arcable Cloud Sync (Google OAuth)',
  subtitle = 'Synchronize spaces, folders, and tabs via server reconciliation',
}) => {
  const { isDark } = useSystemTheme();
  const [editingUrl, setEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(serverUrl);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [importingToken, setImportingToken] = useState(false);

  const isAuthenticated = Boolean(session?.access_token);
  const userEmail = session?.user?.email;
  const userAvatar = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture;
  const userName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || userEmail;

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (onChangeServerUrl) {
      onChangeServerUrl(tempUrl.trim());
    }
    setEditingUrl(false);
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTokenInput.trim() || !onImportToken) return;
    setImportingToken(true);
    try {
      await onImportToken(manualTokenInput.trim());
      setManualTokenInput('');
      setShowManualToken(false);
    } finally {
      setImportingToken(false);
    }
  };

  return (
    <Card
      title={title}
      subtitle={subtitle}
      extra={
        isAuthenticated ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="default">Not Connected</Badge>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {errorMessage && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
              border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5',
              borderRadius: '8px',
              color: isDark ? '#fca5a5' : '#b91c1c',
              fontSize: '13px',
            }}
          >
            {errorMessage}
          </div>
        )}

        {isAuthenticated ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '16px 20px',
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.8)',
              borderRadius: '12px',
              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName || 'User'}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: isDark ? '2px solid #475569' : '2px solid #cbd5e1',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#3b82f6',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      fontWeight: 600,
                    }}
                  >
                    {(userEmail?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: isDark ? '#f1f5f9' : '#1e293b' }}>
                    {userName || 'Arcable User'}
                  </div>
                  <div style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {userEmail || 'Google Account'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {onSyncNow && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onSyncNow}
                    disabled={isSyncing}
                  >
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLogout}
                  disabled={isLoading}
                >
                  Disconnect
                </Button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                paddingTop: '12px',
                fontSize: '12px',
                color: isDark ? '#94a3b8' : '#64748b',
              }}
            >
              <span>Server Version: <strong>v{serverVersion}</strong></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Server: <code style={{ fontSize: '11px' }}>{serverUrl}</code>
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 20px',
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc',
              borderRadius: '12px',
              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              textAlign: 'center',
              gap: '16px',
            }}
          >
            <div style={{ maxWidth: '380px', width: '100%' }}>
              <p
                style={{
                  fontSize: '13px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  margin: '0 0 16px 0',
                  lineHeight: 1.5,
                }}
              >
                Sign in with Google to enable real-time synchronization across multiple devices with instant conflict resolution.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={onLoginWithGoogle}
                  disabled={isLoading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '10px 18px',
                    backgroundColor: '#ffffff',
                    color: '#1e293b',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'background 0.15s ease',
                    width: '100%',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Sign in with Google
                </button>

                {onRefreshSession && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRefreshSession}
                    style={{ width: '100%' }}
                  >
                    ↻ Check / Refresh Connection
                  </Button>
                )}

                {onImportToken && (
                  <div style={{ marginTop: '8px', width: '100%' }}>
                    {!showManualToken ? (
                      <button
                        type="button"
                        onClick={() => setShowManualToken(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isDark ? '#94a3b8' : '#64748b',
                          fontSize: '12px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        Having trouble? Paste session token manually
                      </button>
                    ) : (
                      <form
                        onSubmit={handleManualTokenSubmit}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          marginTop: '8px',
                        }}
                      >
                        <textarea
                          value={manualTokenInput}
                          onChange={(e) => setManualTokenInput(e.target.value)}
                          placeholder="Paste session JSON from the login tab..."
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: '11px',
                            borderRadius: '6px',
                            border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            color: isDark ? '#f8fafc' : '#0f172a',
                            resize: 'vertical',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="submit"
                            disabled={importingToken || !manualTokenInput.trim()}
                          >
                            {importingToken ? 'Importing...' : 'Save Token'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => setShowManualToken(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Server URL Configuration toggle */}
        {onChangeServerUrl && (
          <div style={{ marginTop: '4px' }}>
            {!editingUrl ? (
              <button
                type="button"
                onClick={() => {
                  setTempUrl(serverUrl);
                  setEditingUrl(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Configure Server Host ({serverUrl})
              </button>
            ) : (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <form
                  onSubmit={handleSaveUrl}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                    placeholder={getDefaultServerUrl()}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                    }}
                  />
                  <Button size="sm" variant="secondary" type="submit">
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => setEditingUrl(false)}
                  >
                    Cancel
                  </Button>
                </form>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: isDark ? '#64748b' : '#94a3b8' }}>Presets:</span>
                  <button
                    type="button"
                    onClick={() => setTempUrl(PROD_SERVER_URL)}
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      background: isDark ? '#1e293b' : '#f1f5f9',
                      color: isDark ? '#93c5fd' : '#2563eb',
                      cursor: 'pointer',
                    }}
                  >
                    Production (Vercel)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempUrl(DEV_SERVER_URL)}
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      background: isDark ? '#1e293b' : '#f1f5f9',
                      color: isDark ? '#93c5fd' : '#2563eb',
                      cursor: 'pointer',
                    }}
                  >
                    Localhost:3000
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
