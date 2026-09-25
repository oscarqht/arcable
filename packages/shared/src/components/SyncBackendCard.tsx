'use client';

import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import type { GoogleAuthState } from '../types/google';
import type { SyncProviderId } from '../types/syncProvider';
import { SYNC_PROVIDER_LABELS } from '../utils/syncProviders';
import { useSystemTheme } from '../hooks/useSystemTheme';

export interface SyncBackendCardProps {
  activeProvider: SyncProviderId;
  raindropConnected: boolean;
  googleAuth: GoogleAuthState;
  onConnectGoogle: () => void | Promise<void>;
  onDisconnectGoogle: () => void | Promise<void>;
  /** Copies the workspace from the active backend to `to` and makes `to` active. */
  onMigrate: (to: SyncProviderId) => Promise<void>;
  /** Switches backend without copying; only offered when the active backend is signed out. */
  onUseProvider: (id: SyncProviderId) => void | Promise<void>;
  /** When set, the Raindrop row offers its own connect button (surfaces without a Raindrop card). */
  onConnectRaindrop?: () => void | Promise<void>;
  isBusy?: boolean;
  errorMessage?: string | null;
}

const PROVIDER_ICONS: Record<SyncProviderId, string> = { raindrop: '💧', drive: '☁️' };

export const SyncBackendCard: React.FC<SyncBackendCardProps> = ({
  activeProvider,
  raindropConnected,
  googleAuth,
  onConnectGoogle,
  onDisconnectGoogle,
  onMigrate,
  onUseProvider,
  onConnectRaindrop,
  isBusy = false,
  errorMessage = null,
}) => {
  const { isDark } = useSystemTheme();
  const [migratingTo, setMigratingTo] = useState<SyncProviderId | null>(null);
  const connected: Record<SyncProviderId, boolean> = {
    raindrop: raindropConnected,
    drive: googleAuth.isAuthenticated,
  };
  const activeConnected = connected[activeProvider];

  const handleMigrate = async (to: SyncProviderId) => {
    const from = SYNC_PROVIDER_LABELS[activeProvider];
    const target = SYNC_PROVIDER_LABELS[to];
    const confirmed = typeof window === 'undefined' || window.confirm(
      `Move your Arcable workspace from ${from} to ${target}?\n\n` +
      `• Your workspace is copied to ${target}, which becomes the sync backend on all your devices.\n` +
      `• Nothing is deleted: ${from} keeps a backup and its current copy, but stops being updated.\n` +
      `• Any existing Arcable workspace in ${target} is backed up, then replaced.`
    );
    if (!confirmed) return;
    setMigratingTo(to);
    try {
      await onMigrate(to);
    } finally {
      setMigratingTo(null);
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '14px 18px',
    borderRadius: '12px',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
  };
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const renderRow = (id: SyncProviderId) => {
    const isActive = id === activeProvider;
    const detail = id === 'drive'
      ? (googleAuth.isAuthenticated ? googleAuth.user?.email || googleAuth.user?.name || 'Connected' : 'Stores the workspace in an "Arcable" folder in your Drive.')
      : (raindropConnected ? 'Connected' : onConnectRaindrop ? 'Not connected' : 'Connect Raindrop.io in the card above.');

    let action: React.ReactNode = null;
    if (!isActive && connected[id] && activeConnected) {
      action = (
        <Button size="sm" variant="primary" disabled={isBusy || migratingTo !== null} onClick={() => void handleMigrate(id)}>
          {migratingTo === id ? 'Moving workspace…' : `Move workspace to ${SYNC_PROVIDER_LABELS[id]}`}
        </Button>
      );
    } else if (!isActive && connected[id]) {
      action = (
        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void onUseProvider(id)}>
          Use {SYNC_PROVIDER_LABELS[id]}
        </Button>
      );
    }

    return (
      <div key={id} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: '20px' }}>{PROVIDER_ICONS[id]}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                {SYNC_PROVIDER_LABELS[id]}
              </span>
              {isActive && <Badge variant="success">Active</Badge>}
              {!isActive && connected[id] && <Badge variant="info">Connected</Badge>}
            </div>
            <div style={{ fontSize: '12.5px', color: mutedColor, marginTop: '2px', overflowWrap: 'anywhere' }}>{detail}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {action}
          {id === 'raindrop' && !raindropConnected && onConnectRaindrop && (
            <Button size="sm" variant={isActive ? 'primary' : 'outline'} disabled={isBusy} onClick={() => void onConnectRaindrop()}>
              Connect Raindrop.io
            </Button>
          )}
          {id === 'drive' && (
            googleAuth.isAuthenticated ? (
              <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => void onDisconnectGoogle()}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" variant={isActive ? 'primary' : 'outline'} disabled={isBusy} onClick={() => void onConnectGoogle()}>
                Connect Google Drive
              </Button>
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <Card
      title="Sync Backend"
      subtitle="Choose where your spaces, folders and tabs are stored. One backend is active at a time."
      style={{ borderRadius: '16px', padding: '24px' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {renderRow('raindrop')}
        {renderRow('drive')}
        {activeProvider === 'drive' && (
          <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: mutedColor, lineHeight: 1.5 }}>
            With Google Drive, search covers your workspace only, and Raindrop features (bookmark search,
            collection cover icons, saving pages to Raindrop) are unavailable.
          </p>
        )}
        {errorMessage && (
          <p role="alert" style={{ margin: '4px 0 0', fontSize: '13px', color: isDark ? '#fca5a5' : '#dc2626' }}>
            {errorMessage}
          </p>
        )}
      </div>
    </Card>
  );
};
