'use client';

import React, { useState } from 'react';
import { useSystemTheme } from '@arcable/shared/hooks';
import { RaindropAuthState } from '@arcable/shared/types';
import { SupabaseSessionTokens, SyncProvider } from '@arcable/shared/types';
import { CloseIcon, DropletIcon, LogOutIcon } from '@arcable/shared/components';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  supabaseSession: SupabaseSessionTokens | null;
  onLoginWithGoogle: () => Promise<void>;
  onLogoutSupabase: () => Promise<void>;
  onImportSupabaseToken?: (token: string) => Promise<boolean | void>;
  raindropAuthState: RaindropAuthState;
  onLoginWithRaindropOAuth: () => void;
  onLoginWithRaindropToken: (token: string) => Promise<boolean | void>;
  onLogoutRaindrop: () => Promise<void>;
  activeProvider: SyncProvider;
  onSelectProvider: (provider: SyncProvider) => void;
  onSyncNow?: () => Promise<void>;
  isSyncing?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  supabaseSession,
  onLoginWithGoogle,
  onLogoutSupabase,
  onImportSupabaseToken,
  raindropAuthState,
  onLoginWithRaindropOAuth,
  onLoginWithRaindropToken,
  onLogoutRaindrop,
  activeProvider,
  onSelectProvider,
  onSyncNow,
  isSyncing = false,
}) => {
  const { isDark } = useSystemTheme();
  const [activeTab, setActiveTab] = useState<'supabase' | 'raindrop'>('supabase');

  // Raindrop token input state
  const [raindropTokenInput, setRaindropTokenInput] = useState('');
  const [isSubmittingRaindropToken, setIsSubmittingRaindropToken] = useState(false);
  const [raindropError, setRaindropError] = useState<string | null>(null);

  // Supabase state
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [isImportingToken, setIsImportingToken] = useState(false);

  if (!isOpen) return null;

  const isSupabaseConnected = Boolean(supabaseSession?.access_token);
  const isRaindropConnected = Boolean(raindropAuthState.isAuthenticated && raindropAuthState.user);

  const handleGoogleClick = async () => {
    setIsGoogleLoading(true);
    setSupabaseError(null);
    try {
      await onLoginWithGoogle();
    } catch (err: any) {
      setSupabaseError(err?.message || 'Failed to start Google sign-in.');
      setIsGoogleLoading(false);
    }
  };

  const handleRaindropTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = raindropTokenInput.trim();
    if (!clean) {
      setRaindropError('Please enter a Raindrop API token.');
      return;
    }

    setRaindropError(null);
    setIsSubmittingRaindropToken(true);
    try {
      await onLoginWithRaindropToken(clean);
      setRaindropTokenInput('');
    } catch (err: any) {
      setRaindropError(err?.message || 'Invalid Raindrop token.');
    } finally {
      setIsSubmittingRaindropToken(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTokenInput.trim() || !onImportSupabaseToken) return;
    setIsImportingToken(true);
    setSupabaseError(null);
    try {
      await onImportSupabaseToken(manualTokenInput.trim());
      setManualTokenInput('');
      setShowManualToken(false);
    } catch (err: any) {
      setSupabaseError(err?.message || 'Failed to import session token.');
    } finally {
      setIsImportingToken(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: isDark ? '#111827' : '#ffffff',
          borderRadius: '16px',
          border: isDark ? '1px solid #1f2937' : '1px solid #e5e7eb',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: isDark ? '1px solid #1f2937' : '1px solid #f3f4f6',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: isDark ? '#f9fafb' : '#111827',
                margin: 0,
              }}
            >
              Sign In to Arcable
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: isDark ? '#9ca3af' : '#6b7280',
                margin: '3px 0 0 0',
              }}
            >
              Choose your cloud provider to sync workspaces across devices.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isDark ? '#9ca3af' : '#6b7280',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Provider Tabs */}
        <div
          style={{
            display: 'flex',
            padding: '12px 24px 0 24px',
            gap: '8px',
            borderBottom: isDark ? '1px solid #1f2937' : '1px solid #f3f4f6',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('supabase')}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'supabase' ? '2px solid #38bdf8' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'supabase' ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? '#9ca3af' : '#6b7280'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚡ Arcable Cloud</span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                backgroundColor: isSupabaseConnected
                  ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5')
                  : (isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe'),
                color: isSupabaseConnected
                  ? (isDark ? '#34d399' : '#059669')
                  : (isDark ? '#38bdf8' : '#0284c7'),
                fontWeight: 700,
              }}
            >
              {isSupabaseConnected ? 'Connected' : 'Recommended'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raindrop')}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'raindrop' ? '2px solid #38bdf8' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'raindrop' ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? '#9ca3af' : '#6b7280'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>💧 Raindrop.io</span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                backgroundColor: isRaindropConnected
                  ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5')
                  : (isDark ? '#374151' : '#f3f4f6'),
                color: isRaindropConnected
                  ? (isDark ? '#34d399' : '#059669')
                  : (isDark ? '#9ca3af' : '#6b7280'),
                fontWeight: 700,
              }}
            >
              {isRaindropConnected ? 'Connected' : 'Legacy'}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'supabase' && (
            <>
              {supabaseError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                    border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5',
                    color: isDark ? '#fca5a5' : '#b91c1c',
                    fontSize: '13px',
                  }}
                >
                  {supabaseError}
                </div>
              )}

              {isSupabaseConnected ? (
                <div
                  style={{
                    backgroundColor: isDark ? 'rgba(31, 41, 55, 0.6)' : '#f9fafb',
                    border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          backgroundColor: '#3b82f6',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '18px',
                        }}
                      >
                        {supabaseSession?.user?.email?.charAt(0).toUpperCase() || 'G'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: isDark ? '#f9fafb' : '#111827' }}>
                          {supabaseSession?.user?.email}
                        </div>
                        <div style={{ fontSize: '12px', color: isDark ? '#34d399' : '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ● Active sync provider
                        </div>
                      </div>
                    </div>
                    {activeProvider !== 'supabase' && (
                      <button
                        type="button"
                        onClick={() => onSelectProvider('supabase')}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        Set as Active
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : '#f0f9ff',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: isDark ? '#7dd3fc' : '#0369a1',
                      lineHeight: 1.4,
                    }}
                  >
                    ⚡ Sub-second sync is active. Operations are automatically saved and reconciled across all your devices.
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    {onSyncNow && (
                      <button
                        type="button"
                        onClick={onSyncNow}
                        disabled={isSyncing}
                        style={{
                          flex: 1,
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe',
                          color: isDark ? '#38bdf8' : '#0284c7',
                          cursor: isSyncing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onLogoutSupabase}
                      style={{
                        padding: '8px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: isDark ? '1px solid #4b5563' : '1px solid #d1d5db',
                        backgroundColor: 'transparent',
                        color: isDark ? '#f87171' : '#dc2626',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <LogOutIcon size={14} />
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: isDark ? 'rgba(31, 41, 55, 0.5)' : '#f9fafb',
                      border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                      borderRadius: '12px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f3f4f6' : '#1f2937', marginBottom: '8px' }}>
                      Why choose Arcable Cloud?
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '20px',
                        fontSize: '12px',
                        color: isDark ? '#9ca3af' : '#4b5563',
                        lineHeight: 1.6,
                      }}
                    >
                      <li><strong>Instant Real-time Sync:</strong> Sub-second updates via PostgreSQL & Realtime.</li>
                      <li><strong>Smart Reconciliation:</strong> Automatic merge of tab operations without losing data.</li>
                      <li><strong>Zero Setup:</strong> Simply sign in with your Google account.</li>
                    </ul>
                  </div>

                  {/* Google OAuth Button */}
                  <button
                    type="button"
                    onClick={handleGoogleClick}
                    disabled={isGoogleLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      color: '#1f2937',
                      border: '1px solid #d1d5db',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: isGoogleLoading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                      />
                    </svg>
                    <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                  </button>

                  {/* Manual token fallback trigger */}
                  <div style={{ textAlign: 'center', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowManualToken(!showManualToken)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isDark ? '#9ca3af' : '#6b7280',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {showManualToken ? 'Hide manual token import' : 'Have a session token from extension?'}
                    </button>
                  </div>

                  {showManualToken && (
                    <form onSubmit={handleManualTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <textarea
                        rows={3}
                        value={manualTokenInput}
                        onChange={(e) => setManualTokenInput(e.target.value)}
                        placeholder="Paste session tokens JSON or access_token..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: isDark ? '1px solid #374151' : '1px solid #d1d5db',
                          backgroundColor: isDark ? '#1f2937' : '#f9fafb',
                          color: isDark ? '#f9fafb' : '#111827',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                          fontFamily: 'monospace',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={isImportingToken || !manualTokenInput.trim()}
                        style={{
                          alignSelf: 'flex-end',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#3b82f6',
                          color: '#ffffff',
                          cursor: isImportingToken ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isImportingToken ? 'Importing...' : 'Save Token'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'raindrop' && (
            <>
              {raindropError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                    border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5',
                    color: isDark ? '#fca5a5' : '#b91c1c',
                    fontSize: '13px',
                  }}
                >
                  {raindropError}
                </div>
              )}

              {isRaindropConnected ? (
                <div
                  style={{
                    backgroundColor: isDark ? 'rgba(31, 41, 55, 0.6)' : '#f9fafb',
                    border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {raindropAuthState.user?.avatarUrl ? (
                        <img
                          src={raindropAuthState.user.avatarUrl}
                          alt="Avatar"
                          style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '18px',
                          }}
                        >
                          <DropletIcon size={20} color="#ffffff" />
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: isDark ? '#f9fafb' : '#111827' }}>
                          {raindropAuthState.user?.name || 'Raindrop User'}
                        </div>
                        <div style={{ fontSize: '12px', color: isDark ? '#9ca3af' : '#6b7280' }}>
                          {raindropAuthState.user?.email || 'Connected'}
                        </div>
                      </div>
                    </div>
                    {activeProvider !== 'raindrop' && (
                      <button
                        type="button"
                        onClick={() => onSelectProvider('raindrop')}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        Set as Active
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    {onSyncNow && (
                      <button
                        type="button"
                        onClick={onSyncNow}
                        disabled={isSyncing}
                        style={{
                          flex: 1,
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe',
                          color: isDark ? '#38bdf8' : '#0284c7',
                          cursor: isSyncing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSyncing ? 'Syncing...' : 'Raindrop Sync'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onLogoutRaindrop}
                      style={{
                        padding: '8px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: isDark ? '1px solid #4b5563' : '1px solid #d1d5db',
                        backgroundColor: 'transparent',
                        color: isDark ? '#f87171' : '#dc2626',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <LogOutIcon size={14} />
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: isDark ? '#9ca3af' : '#6b7280', lineHeight: 1.5 }}>
                    Connect to your Raindrop.io account to sync bookmarks and tab workspaces via Raindrop collections.
                  </p>

                  {/* Raindrop OAuth */}
                  <button
                    type="button"
                    onClick={onLoginWithRaindropOAuth}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                      color: isDark ? '#38bdf8' : '#0284c7',
                      border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <DropletIcon size={18} color={isDark ? '#38bdf8' : '#0284c7'} />
                    <span>Connect with Raindrop OAuth</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: isDark ? '#374151' : '#e5e7eb' }} />
                    <span style={{ fontSize: '12px', color: isDark ? '#6b7280' : '#9ca3af' }}>OR ENTER TOKEN</span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: isDark ? '#374151' : '#e5e7eb' }} />
                  </div>

                  {/* Personal Token Input */}
                  <form onSubmit={handleRaindropTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#d1d5db' : '#374151' }}>
                      Raindrop Personal API Token
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="password"
                        value={raindropTokenInput}
                        onChange={(e) => setRaindropTokenInput(e.target.value)}
                        placeholder="Paste your test token..."
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: isDark ? '1px solid #374151' : '1px solid #d1d5db',
                          backgroundColor: isDark ? '#1f2937' : '#f9fafb',
                          color: isDark ? '#f9fafb' : '#111827',
                          fontSize: '13px',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingRaindropToken || !raindropTokenInput.trim()}
                        style={{
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          cursor: isSubmittingRaindropToken ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSubmittingRaindropToken ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: isDark ? '#9ca3af' : '#6b7280' }}>
                      Obtain from Raindrop Settings → Integrations → Create new app → Create test token.
                    </span>
                  </form>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: isDark ? '#0b0f19' : '#f9fafb',
            borderTop: isDark ? '1px solid #1f2937' : '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '12px', color: isDark ? '#6b7280' : '#9ca3af' }}>
            Active Provider: <strong style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{activeProvider}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              border: isDark ? '1px solid #374151' : '1px solid #d1d5db',
              backgroundColor: 'transparent',
              color: isDark ? '#e5e7eb' : '#374151',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
