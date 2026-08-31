'use client';

import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import { RaindropAuthState } from '../types/raindrop';
import { useSystemTheme } from '../hooks/useSystemTheme';

export interface RaindropAuthCardProps {
  authState: RaindropAuthState;
  onLoginWithToken: (token: string) => Promise<boolean | void>;
  onLoginWithOAuth?: () => void;
  onLogout: () => Promise<void>;
  isLoading?: boolean;
  errorMessage?: string | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onClearError?: () => void;
}

export const RaindropAuthCard: React.FC<RaindropAuthCardProps> = ({
  authState,
  onLoginWithToken,
  onLoginWithOAuth,
  onLogout,
  isLoading = false,
  errorMessage = null,
  title = 'Raindrop.io Integration',
  subtitle = 'Connect via OAuth 2.0 or API Token to sync bookmarks',
  compact = false,
  onClearError,
}) => {
  const { isDark } = useSystemTheme();
  const [authMethod, setAuthMethod] = useState<'oauth' | 'token'>('oauth');
  const [tokenInput, setTokenInput] = useState('');
  const [submittingToken, setSubmittingToken] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [showToken, setShowToken] = useState(false);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tokenInput.trim();
    if (!clean) {
      setLocalError('Please enter a Raindrop API token.');
      return;
    }

    setLocalError(null);
    if (onClearError) onClearError();
    setSubmittingToken(true);

    try {
      await onLoginWithToken(clean);
      setTokenInput('');
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to authenticate with token.');
    } finally {
      setSubmittingToken(false);
    }
  };

  const activeError = localError || errorMessage;

  // Authenticated state UI
  if (authState.isAuthenticated && authState.user) {
    return (
      <Card
        title={title}
        subtitle={subtitle}
        extra={
          <Badge variant="success">Connected</Badge>
        }
      >
        <div
          style={{
            display: 'flex',
            flexDirection: compact ? 'column' : 'row',
            alignItems: compact ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '16px 20px',
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.8)',
            borderRadius: '12px',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {authState.user.avatarUrl ? (
              <img
                src={authState.user.avatarUrl}
                alt={authState.user.name}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: isDark ? '2px solid #475569' : '2px solid #cbd5e1',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
                }}
              >
                {authState.user.name ? authState.user.name.charAt(0).toUpperCase() : 'R'}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                >
                  {authState.user.name}
                </span>
                {authState.user.isPro && <Badge variant="warning">PRO</Badge>}
                <Badge variant="info">
                  {authState.authType === 'oauth' ? 'OAuth 2.0' : 'API Token'}
                </Badge>
              </div>
              {authState.user.email && (
                <div
                  style={{
                    fontSize: '13px',
                    color: isDark ? '#94a3b8' : '#64748b',
                    marginTop: '3px',
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
            isLoading={isLoading}
            style={{
              color: isDark ? '#f87171' : '#ef4444',
              borderColor: isDark ? '#7f1d1d' : '#fca5a5',
              padding: '6px 14px',
              borderRadius: '8px',
            }}
          >
            Disconnect
          </Button>
        </div>
      </Card>
    );
  }

  // Unauthenticated login UI
  return (
    <Card title={title} subtitle={subtitle}>
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          marginBottom: '20px',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setAuthMethod('oauth');
            setLocalError(null);
          }}
          style={{
            padding: '10px 16px',
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
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
        >
          OAuth 2.0 (Recommended)
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMethod('token');
            setLocalError(null);
          }}
          style={{
            padding: '10px 16px',
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
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
        >
          Personal API Token
        </button>
      </div>

      {activeError && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
            border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
            borderRadius: '8px',
            color: isDark ? '#fca5a5' : '#b91c1c',
            fontSize: '13px',
            marginBottom: '16px',
            lineHeight: 1.5,
          }}
        >
          {activeError}
        </div>
      )}

      {authMethod === 'oauth' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13.5px', color: isDark ? '#cbd5e1' : '#475569', margin: 0, lineHeight: 1.6 }}>
            Seamlessly synchronize your Arcable spaces, folders, and tabs across browsers and devices using Raindrop's secure OAuth 2.0 authorization.
          </p>
          {onLoginWithOAuth ? (
            <div>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onLoginWithOAuth}
                isLoading={isLoading}
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}
              >
                💧 Sign in with Raindrop OAuth
              </Button>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              OAuth login is available when configured on the host platform.
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label
                htmlFor="raindrop-token-input"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isDark ? '#e2e8f0' : '#334155',
                }}
              >
                Personal API Token
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
                  gap: '4px',
                }}
              >
                Get Token from Raindrop ↗
              </a>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="raindrop-token-input"
                type={showToken ? 'text' : 'password'}
                placeholder="Paste your Raindrop Test/Access Token here..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 42px 10px 14px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
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
                  fontSize: '13px',
                  padding: '4px',
                }}
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? '🙈' : '👁️'}
              </button>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: isDark ? '#94a3b8' : '#64748b',
                marginTop: '8px',
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Go to <strong>Raindrop Settings → Integrations → Create app / Test token</strong> to generate a personal token.
            </p>
          </div>

          <div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={submittingToken || isLoading}
              style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}
            >
              Connect with API Token
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
};
