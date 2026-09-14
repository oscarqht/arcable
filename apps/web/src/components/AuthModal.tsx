'use client';

import React, { useState } from 'react';
import { useSystemTheme } from '@arcable/shared/hooks';
import { RaindropAuthState, SyncProvider } from '@arcable/shared/types';
import { CloseIcon, DropletIcon, LogOutIcon } from '@arcable/shared/components';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
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

  // Raindrop token input state
  const [raindropTokenInput, setRaindropTokenInput] = useState('');
  const [isSubmittingRaindropToken, setIsSubmittingRaindropToken] = useState(false);
  const [raindropError, setRaindropError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isRaindropConnected = Boolean(raindropAuthState.isAuthenticated && raindropAuthState.user);

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
          maxWidth: '500px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DropletIcon size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: isDark ? '#f9fafb' : '#111827',
                  margin: 0,
                }}
              >
                Raindrop Sync
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  color: isDark ? '#9ca3af' : '#6b7280',
                  margin: '2px 0 0 0',
                }}
              >
                Sync your Arcable workspaces via Raindrop.io
              </p>
            </div>
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
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    <div style={{ fontSize: '12px', color: isDark ? '#34d399' : '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ● Connected ({raindropAuthState.user?.email || 'Active'})
                    </div>
                  </div>
                </div>
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
                💧 Workspace state is reconciled through your Next.js server route and stored securely in Raindrop (<code>data-v3.json.txt</code>).
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
                Connect your Raindrop.io account to sync spaces, folders, and tabs across all your browsers and devices.
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
            Sync Provider: <strong style={{ color: isDark ? '#38bdf8' : '#0284c7' }}>{activeProvider}</strong>
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
