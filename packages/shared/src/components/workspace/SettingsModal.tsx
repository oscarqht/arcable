'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../Button';
import { Badge } from '../Badge';
import {
  SettingsIcon,
  CloseIcon,
  ExternalLinkIcon,
  DropletIcon,
  LogInIcon,
  LogOutIcon,
  CheckIcon,
} from '../Icons';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { RaindropAuthState } from '../../types/raindrop';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  authState: RaindropAuthState;
  onLoginWithToken: (token: string) => Promise<boolean | void>;
  onLoginWithOAuth?: () => void;
  onLogout: () => Promise<void>;
  isLoading?: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
  initialTab?: 'token' | 'oauth';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  authState,
  onLoginWithToken,
  onLoginWithOAuth,
  onLogout,
  isLoading = false,
  errorMessage = null,
  onClearError,
  initialTab = 'token',
}) => {
  const { isDark } = useSystemTheme();
  const [authMethod, setAuthMethod] = useState<'token' | 'oauth'>(initialTab);
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [isEditingToken, setIsEditingToken] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      setLocalSuccess(null);
      setIsEditingToken(false);
      setAuthMethod(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isLoading) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSubmitting, isLoading]);

  // Autofocus input when token form appears
  useEffect(() => {
    if (isOpen && (!authState.isAuthenticated || isEditingToken)) {
      setTimeout(() => {
        tokenInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, authState.isAuthenticated, isEditingToken, authMethod]);

  if (!isOpen) return null;

  const handleTokenSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = tokenInput.trim();
    if (!clean) {
      setLocalError('Please enter a Raindrop API token.');
      return;
    }

    setLocalError(null);
    setLocalSuccess(null);
    if (onClearError) onClearError();
    setIsSubmitting(true);

    try {
      await onLoginWithToken(clean);
      setTokenInput('');
      setIsEditingToken(false);
      setLocalSuccess('Successfully connected to Raindrop.io!');
      setTimeout(() => {
        setLocalSuccess(null);
      }, 2500);
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to authenticate with Raindrop token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeError = localError || errorMessage;
  const isPending = isSubmitting || isLoading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: isDark ? '#151e2e' : '#ffffff',
          borderRadius: '16px',
          border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'arcable-settings-fade 0.18s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes arcable-settings-fade {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: `1px solid ${isDark ? '#243247' : '#f1f5f9'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                color: isDark ? '#38bdf8' : '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SettingsIcon size={17} />
            </div>
            <div>
              <h2
                id="settings-dialog-title"
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: isDark ? '#f8fafc' : '#0f172a',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Settings
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  margin: '3px 0 0 0',
                }}
              >
                Raindrop.io integration & connection preferences
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close settings dialog"
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              color: isDark ? '#94a3b8' : '#64748b',
              cursor: isPending ? 'not-allowed' : 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Feedback messages */}
          {activeError && (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
                border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
                borderRadius: '8px',
                color: isDark ? '#fca5a5' : '#b91c1c',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              {activeError}
            </div>
          )}

          {localSuccess && (
            <div
              role="status"
              style={{
                padding: '12px 14px',
                backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4',
                border: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'}`,
                borderRadius: '8px',
                color: isDark ? '#86efac' : '#15803d',
                fontSize: '13px',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckIcon size={16} />
              <span>{localSuccess}</span>
            </div>
          )}

          {/* Section: Raindrop Integration */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DropletIcon size={16} color={isDark ? '#38bdf8' : '#0284c7'} />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                >
                  Raindrop.io Integration
                </span>
              </div>
              {authState.isAuthenticated && (
                <Badge variant="success">Connected</Badge>
              )}
            </div>

            {/* Authenticated State */}
            {authState.isAuthenticated && authState.user ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* User card */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    padding: '14px 16px',
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.8)',
                    borderRadius: '12px',
                    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    {authState.user.avatarUrl ? (
                      <img
                        src={authState.user.avatarUrl}
                        alt={authState.user.name}
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: isDark ? '2px solid #475569' : '2px solid #cbd5e1',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {authState.user.name ? authState.user.name.charAt(0).toUpperCase() : 'R'}
                      </div>
                    )}

                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: isDark ? '#f8fafc' : '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {authState.user.name}
                        </span>
                        {authState.user.isPro && <Badge variant="warning">PRO</Badge>}
                        <Badge variant="info">
                          {authState.authType === 'oauth' ? 'OAuth 2.0' : 'Test API Token'}
                        </Badge>
                      </div>
                      {authState.user.email && (
                        <div
                          style={{
                            fontSize: '12.5px',
                            color: isDark ? '#94a3b8' : '#64748b',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {authState.user.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onLogout}
                    isLoading={isPending}
                    style={{
                      color: isDark ? '#f87171' : '#ef4444',
                      borderColor: isDark ? '#7f1d1d' : '#fca5a5',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      flexShrink: 0,
                    }}
                  >
                    Disconnect
                  </Button>
                </div>

                {/* Option to change / update token */}
                {!isEditingToken ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingToken(true);
                        setTokenInput('');
                        setLocalError(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isDark ? '#38bdf8' : '#0284c7',
                        fontSize: '13px',
                        cursor: 'pointer',
                        padding: '4px 0',
                        fontWeight: 500,
                        textDecoration: 'underline',
                      }}
                    >
                      Update Raindrop Test API Token
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleTokenSubmit}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label
                        htmlFor="raindrop-update-token-input"
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: isDark ? '#e2e8f0' : '#334155',
                        }}
                      >
                        New Raindrop Test API Token
                      </label>
                      <a
                        href="https://app.raindrop.io/settings/integrations"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '12px',
                          color: isDark ? '#38bdf8' : '#0284c7',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        Raindrop Settings <ExternalLinkIcon size={12} />
                      </a>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <input
                        ref={tokenInputRef}
                        id="raindrop-update-token-input"
                        type={showToken ? 'text' : 'password'}
                        placeholder="Paste new Raindrop Test API Token here..."
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 40px 9px 12px',
                          borderRadius: '8px',
                          backgroundColor: isDark ? '#0f172a' : '#ffffff',
                          border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                          color: isDark ? '#f8fafc' : '#0f172a',
                          fontSize: '13.5px',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: isDark ? '#94a3b8' : '#64748b',
                          fontSize: '13px',
                          padding: '4px',
                        }}
                        title={showToken ? 'Hide token' : 'Show token'}
                      >
                        {showToken ? '🙈' : '👁️'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingToken(false);
                          setTokenInput('');
                          setLocalError(null);
                        }}
                        disabled={isPending}
                        style={{ padding: '6px 12px', borderRadius: '8px' }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isLoading={isPending}
                        style={{ padding: '6px 14px', borderRadius: '8px', fontWeight: 600 }}
                      >
                        Save Token
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* Unauthenticated Configuration */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p
                  style={{
                    fontSize: '13px',
                    color: isDark ? '#cbd5e1' : '#475569',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Connect your Raindrop account to sync spaces, folders, and bookmarks with Arcable.
                </p>

                {/* Method selector tabs */}
                <div
                  style={{
                    display: 'flex',
                    borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                    gap: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMethod('token');
                      setLocalError(null);
                    }}
                    style={{
                      padding: '8px 14px',
                      fontSize: '13px',
                      fontWeight: authMethod === 'token' ? 600 : 500,
                      color: authMethod === 'token'
                        ? (isDark ? '#38bdf8' : '#0284c7')
                        : (isDark ? '#94a3b8' : '#64748b'),
                      borderBottom: authMethod === 'token'
                        ? (isDark ? '2px solid #38bdf8' : '2px solid #0284c7')
                        : '2px solid transparent',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Raindrop Test API Token
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMethod('oauth');
                      setLocalError(null);
                    }}
                    style={{
                      padding: '8px 14px',
                      fontSize: '13px',
                      fontWeight: authMethod === 'oauth' ? 600 : 500,
                      color: authMethod === 'oauth'
                        ? (isDark ? '#38bdf8' : '#0284c7')
                        : (isDark ? '#94a3b8' : '#64748b'),
                      borderBottom: authMethod === 'oauth'
                        ? (isDark ? '2px solid #38bdf8' : '2px solid #0284c7')
                        : '2px solid transparent',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    OAuth 2.0
                  </button>
                </div>

                {authMethod === 'token' ? (
                  <form
                    onSubmit={handleTokenSubmit}
                    style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                  >
                    {/* Instructions banner */}
                    <div
                      style={{
                        padding: '12px 14px',
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
                        borderRadius: '10px',
                        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                        fontSize: '12.5px',
                        color: isDark ? '#94a3b8' : '#64748b',
                        lineHeight: 1.55,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: isDark ? '#e2e8f0' : '#334155', marginBottom: '4px' }}>
                        How to get your Raindrop Test API Token:
                      </div>
                      <ol style={{ margin: '0 0 0 16px', padding: 0 }}>
                        <li>
                          Open{' '}
                          <a
                            href="https://app.raindrop.io/settings/integrations"
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: isDark ? '#38bdf8' : '#0284c7',
                              textDecoration: 'underline',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            Raindrop Settings → Integrations <ExternalLinkIcon size={11} />
                          </a>
                        </li>
                        <li>Under <strong>For Developers</strong>, click <strong>Create app</strong> (or choose your app).</li>
                        <li>Click <strong>Create test token</strong>, copy it, and paste it below.</li>
                      </ol>
                    </div>

                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <label
                          htmlFor="raindrop-dialog-token-input"
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: isDark ? '#e2e8f0' : '#334155',
                          }}
                        >
                          Personal Test API Token
                        </label>
                        <a
                          href="https://app.raindrop.io/settings/integrations"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: isDark ? '#38bdf8' : '#0284c7',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          Get Token <ExternalLinkIcon size={12} />
                        </a>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <input
                          ref={tokenInputRef}
                          id="raindrop-dialog-token-input"
                          type={showToken ? 'text' : 'password'}
                          placeholder="Paste your Raindrop Test API Token here..."
                          value={tokenInput}
                          onChange={(e) => setTokenInput(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 42px 10px 12px',
                            borderRadius: '8px',
                            backgroundColor: isDark ? '#0f172a' : '#ffffff',
                            border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                            color: isDark ? '#f8fafc' : '#0f172a',
                            fontSize: '14px',
                            boxSizing: 'border-box',
                            outline: 'none',
                            transition: 'border-color 0.15s ease',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: isDark ? '#94a3b8' : '#64748b',
                            fontSize: '14px',
                            padding: '4px',
                          }}
                          title={showToken ? 'Hide token' : 'Show token'}
                        >
                          {showToken ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={onClose}
                        disabled={isPending}
                        style={{ padding: '8px 16px', borderRadius: '8px' }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        isLoading={isPending}
                        disabled={!tokenInput.trim() || isPending}
                        style={{
                          padding: '8px 20px',
                          borderRadius: '8px',
                          fontWeight: 600,
                        }}
                      >
                        Connect with API Token
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p
                      style={{
                        fontSize: '13px',
                        color: isDark ? '#cbd5e1' : '#475569',
                        margin: 0,
                        lineHeight: 1.6,
                      }}
                    >
                      Authenticate through Raindrop's standard OAuth 2.0 flow.
                      This requires <code>RAINDROP_CLIENT_ID</code> and <code>RAINDROP_CLIENT_SECRET</code> to be configured in your server environment variables.
                    </p>

                    {onLoginWithOAuth ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            onClick={() => {
                              onClose();
                              onLoginWithOAuth();
                            }}
                            isLoading={isPending}
                            style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}
                          >
                            💧 Sign in with Raindrop OAuth
                          </Button>
                        </div>
                        <p
                          style={{
                            fontSize: '12px',
                            color: isDark ? '#94a3b8' : '#64748b',
                            margin: 0,
                            lineHeight: 1.5,
                          }}
                        >
                          If you see an error about <code>RAINDROP_CLIENT_ID</code> not being configured, switch to the <strong>Raindrop Test API Token</strong> tab.
                        </p>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                        OAuth sign-in is not configured on this host.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '14px 24px',
            borderTop: `1px solid ${isDark ? '#243247' : '#f1f5f9'}`,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : '#f8fafc',
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
            style={{ padding: '6px 16px', borderRadius: '8px' }}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
