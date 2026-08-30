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
  const [authMethod, setAuthMethod] = useState<'oauth' | 'token'>('token');
  const [tokenInput, setTokenInput] = useState('');
  const [submittingToken, setSubmittingToken] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
            padding: '12px',
            backgroundColor: isDark ? '#1e293b' : '#f8fafc',
            borderRadius: '8px',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {authState.user.avatarUrl ? (
              <img
                src={authState.user.avatarUrl}
                alt={authState.user.name}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                }}
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
                  fontSize: '18px',
                  fontWeight: 600,
                }}
              >
                {authState.user.name ? authState.user.name.charAt(0).toUpperCase() : 'R'}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                >
                  {authState.user.name}
                </span>
                {authState.user.isPro && <Badge variant="warning">PRO</Badge>}
                <Badge variant="info">
                  {authState.authType === 'oauth' ? 'OAuth' : 'API Token'}
                </Badge>
              </div>
              {authState.user.email && (
                <div
                  style={{
                    fontSize: '13px',
                    color: isDark ? '#94a3b8' : '#64748b',
                    marginTop: '2px',
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
          marginBottom: '16px',
          gap: '8px',
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
              ? isDark ? '#f8fafc' : '#0f172a'
              : isDark ? '#94a3b8' : '#64748b',
            borderBottom: authMethod === 'token'
              ? isDark ? '2px solid #38bdf8' : '2px solid #0f172a'
              : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          API Token
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
              ? isDark ? '#f8fafc' : '#0f172a'
              : isDark ? '#94a3b8' : '#64748b',
            borderBottom: authMethod === 'oauth'
              ? isDark ? '2px solid #38bdf8' : '2px solid #0f172a'
              : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          OAuth 2.0
        </button>
      </div>

      {activeError && (
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
            border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
            borderRadius: '6px',
            color: isDark ? '#fca5a5' : '#b91c1c',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {activeError}
        </div>
      )}

      {authMethod === 'token' ? (
        <form onSubmit={handleTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label
                htmlFor="raindrop-token-input"
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: isDark ? '#e2e8f0' : '#334155',
                }}
              >
                Personal API Token
              </label>
              <a
                href="https://app.raindrop.io/settings/integrations"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '12px', color: isDark ? '#38bdf8' : '#2563eb', textDecoration: 'none' }}
              >
                Get Token from Raindrop ↗
              </a>
            </div>
            <input
              id="raindrop-token-input"
              type="password"
              placeholder="Paste your Raindrop Test/Access Token here..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                color: isDark ? '#f8fafc' : '#0f172a',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <p
              style={{
                fontSize: '12px',
                color: isDark ? '#94a3b8' : '#64748b',
                marginTop: '6px',
                marginBottom: 0,
              }}
            >
              Go to <strong>Raindrop Settings → Integrations → Create app / Test token</strong> to generate a personal token.
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={submittingToken || isLoading}
            style={{ marginTop: '4px' }}
          >
            Connect with API Token
          </Button>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569', margin: 0 }}>
            Authorize Arcable to access your Raindrop collections and bookmarks using standard Raindrop OAuth.
          </p>
          {onLoginWithOAuth ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onLoginWithOAuth}
              isLoading={isLoading}
            >
              Sign in with Raindrop OAuth
            </Button>
          ) : (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              OAuth login is available when configured on the host platform.
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
