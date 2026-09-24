'use client';

import React, { useEffect, useMemo } from 'react';
import { Space, TmpTab } from '../../types/workspace';
import { CloseIcon, ExternalLinkIcon, RotateCcwIcon } from '../Icons';
import { TabFavicon } from './TabFavicon';

export interface AllTmpTabsModalProps {
  isOpen: boolean;
  onClose: () => void;
  remoteTabs: TmpTab[];
  spaces: Space[];
  currentDeviceId?: string;
  remoteUpdatedAt?: Record<string, number>;
  isLoading?: boolean;
  isDarkTheme?: boolean;
  onRefresh?: () => void | Promise<void>;
  onOpenRemote: (tab: TmpTab) => void;
}

function displayTime(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Update time unavailable';
  return `Updated ${new Date(timestamp).toLocaleString()}`;
}

function displayHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export const AllTmpTabsModal: React.FC<AllTmpTabsModalProps> = ({
  isOpen,
  onClose,
  remoteTabs,
  spaces,
  currentDeviceId,
  remoteUpdatedAt,
  isLoading = false,
  isDarkTheme = false,
  onRefresh,
  onOpenRemote,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const groups = useMemo(() => {
    const remote = remoteTabs.filter((tab) => Boolean(tab.url) && Boolean(currentDeviceId) && Boolean(tab.deviceId) && tab.deviceId !== currentDeviceId);
    const bySpace = new Map<string, TmpTab[]>();
    for (const tab of remote) {
      const key = tab.spaceId || '';
      const group = bySpace.get(key) || [];
      group.push(tab);
      bySpace.set(key, group);
    }
    const orderedSpaces = spaces.map((space) => ({
      id: space.id,
      name: space.name,
      entries: bySpace.get(space.id) || [],
    })).filter((group) => group.entries.length > 0);
    const knownIds = new Set(spaces.map((space) => space.id));
    for (const [id, group] of bySpace) {
      if (id && !knownIds.has(id)) orderedSpaces.push({ id, name: 'Unknown space', entries: group });
    }
    if (bySpace.has('')) orderedSpaces.push({ id: '', name: 'Unassigned', entries: bySpace.get('')! });
    return orderedSpaces;
  }, [remoteTabs, spaces, currentDeviceId]);

  if (!isOpen) return null;

  const foreground = isDarkTheme ? '#f1f5f9' : '#0f172a';
  const muted = isDarkTheme ? '#94a3b8' : '#64748b';
  const border = isDarkTheme ? '#334155' : '#e2e8f0';
  const surface = isDarkTheme ? '#151e2e' : '#ffffff';

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: 'rgba(2, 6, 23, 0.62)' }}
    >
      <style>{`@keyframes arcable-tmp-tabs-refresh { to { transform: rotate(360deg); } }`}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-tmp-tabs-title"
        style={{ width: 'min(420px, 100%)', maxHeight: 'calc(100dvh - 20px)', display: 'flex', flexDirection: 'column', background: surface, color: foreground, border: `1px solid ${border}`, borderRadius: '12px', boxShadow: '0 20px 55px rgba(0,0,0,0.28)', overflow: 'hidden' }}
      >
        <div style={{ padding: '11px 12px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h2 id="all-tmp-tabs-title" style={{ margin: 0, fontSize: '15px', lineHeight: 1.2, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>Tmp tabs</h2>
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {onRefresh && <button type="button" onClick={() => { void onRefresh(); }} disabled={isLoading} aria-busy={isLoading} title="Refresh tmp tabs" aria-label={isLoading ? 'Refreshing tmp tabs' : 'Refresh tmp tabs'} style={{ width: '30px', height: '30px', padding: 0, borderRadius: '7px', border: `1px solid ${border}`, background: surface, color: foreground, cursor: isLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ display: 'inline-flex', animation: isLoading ? 'arcable-tmp-tabs-refresh 0.8s linear infinite' : 'none' }}><RotateCcwIcon size={15} /></span></button>}
            <button type="button" onClick={onClose} title="Close" aria-label="Close tmp tabs" style={{ width: '30px', height: '30px', padding: 0, borderRadius: '7px', border: `1px solid ${border}`, background: surface, color: foreground, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><CloseIcon size={16} /></button>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {groups.length === 0 && <p style={{ margin: 0, color: muted, fontSize: '12px' }}>{isLoading ? 'Loading…' : 'No tabs from other devices'}</p>}
          {groups.map((group) => (
            <section key={group.id} aria-label={`${group.name} tmp tabs`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', minWidth: 0 }}>
                <h3 title={group.name} style={{ margin: 0, fontSize: '12px', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</h3>
                <span style={{ color: muted, fontSize: '11px', flexShrink: 0 }}>{group.entries.length}</span>
              </div>
              <div style={{ border: `1px solid ${border}`, borderRadius: '8px', overflow: 'hidden' }}>
                {group.entries.map((tab, index) => (
                  <div key={`${tab.deviceId}-${tab.id}-${index}`} style={{ padding: '8px 9px', borderTop: index ? `1px solid ${border}` : 'none', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <TabFavicon url={tab.url} favIconUrl={tab.favIconUrl} size={16} isDarkTheme={isDarkTheme} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={tab.customTitle || tab.title || tab.url} style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.customTitle || tab.title || displayHost(tab.url)}</div>
                      <div title={`${tab.url} · ${displayTime(tab.deviceId ? remoteUpdatedAt?.[tab.deviceId] : undefined)}`} style={{ color: muted, fontSize: '10px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayHost(tab.url)} · {tab.deviceName || 'Other device'}</div>
                    </div>
                    <button type="button" onClick={() => onOpenRemote(tab)} title="Open a copy here" aria-label={`Open ${tab.customTitle || tab.title || displayHost(tab.url)} here`} style={{ flexShrink: 0, width: '30px', height: '30px', padding: 0, borderRadius: '7px', border: `1px solid ${border}`, background: isDarkTheme ? '#1e293b' : '#f8fafc', color: foreground, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ExternalLinkIcon size={15} /></button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
