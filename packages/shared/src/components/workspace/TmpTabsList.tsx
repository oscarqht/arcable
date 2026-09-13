'use client';

import React from 'react';
import { TmpTab } from '../../types/workspace';
import { AudibleTab, MediaControlAction } from '../../types/tabTracker';
import { TmpTabRow } from './TmpTabRow';
import { useSystemTheme } from '../../hooks/useSystemTheme';

export interface TmpTabsListProps {
  tabs: TmpTab[];
  currentDeviceId?: string;
  isDarkTheme?: boolean;
  compact?: boolean;
  showEmptyState?: boolean;
  alwaysShowActions?: boolean;
  highlightedTabId?: string | null;
  activeBrowserTabId?: number;
  audibleTabs?: AudibleTab[];
  showDeviceBadge?: boolean;
  onOpen?: (url: string, tabId?: string, tab?: TmpTab) => void;
  onPromote: (tab: TmpTab) => void;
  onClose: (tab: TmpTab) => void;
  onRename?: (tab: TmpTab, newTitle: string) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
  onAddTmpTab?: () => void;
}

export const TmpTabsList: React.FC<TmpTabsListProps> = ({
  tabs,
  currentDeviceId,
  isDarkTheme,
  compact = false,
  showEmptyState = false,
  alwaysShowActions = false,
  highlightedTabId,
  audibleTabs,
  showDeviceBadge = true,
  onOpen,
  onPromote,
  onClose,
  onRename,
  onMediaControl,
  onAddTmpTab,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;

  if (!tabs || tabs.length === 0) {
    if (!showEmptyState || compact) {
      return null;
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '4px' : '10px',
        width: '100%',
        boxSizing: 'border-box',
        padding: compact ? 0 : '18px 20px',
        marginTop: compact ? '6px' : '0px',
        background: compact
          ? 'transparent'
          : effectiveDark
          ? 'linear-gradient(180deg, #161f30 0%, #0f172a 100%)'
          : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        border: compact
          ? 'none'
          : `1px solid ${effectiveDark ? '#1e293b' : '#e2e8f0'}`,
        borderRadius: compact ? '0' : '14px',
        boxShadow: compact
          ? 'none'
          : effectiveDark
          ? '0 4px 16px rgba(0, 0, 0, 0.25)'
          : '0 2px 10px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Section Header */}
      {compact ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 4px 2px 4px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: effectiveDark ? '#94a3b8' : '#64748b',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Open Tabs</span>
            <span
              style={{
                backgroundColor: effectiveDark ? '#1e293b' : '#f1f5f9',
                color: effectiveDark ? '#cbd5e1' : '#475569',
                padding: '1px 6px',
                borderRadius: '5px',
                fontSize: '10.5px',
                fontWeight: 600,
              }}
            >
              {tabs.length}
            </span>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: `1px solid ${effectiveDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)'}`,
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📑</span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: effectiveDark ? '#f1f5f9' : '#0f172a',
                  letterSpacing: '-0.01em',
                }}
              >
                Synced Open Tabs
              </span>
              <span
                style={{
                  backgroundColor: effectiveDark ? '#334155' : '#e2e8f0',
                  color: effectiveDark ? '#cbd5e1' : '#334155',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {tabs ? tabs.length : 0}
              </span>
            </div>
            <span
              style={{
                fontSize: '12px',
                color: effectiveDark ? '#94a3b8' : '#64748b',
                marginLeft: '24px',
              }}
            >
              Open tabs synced across your connected devices. Click to open or save to workspace.
            </span>
          </div>

          {onAddTmpTab && (
            <button
              type="button"
              onClick={onAddTmpTab}
              style={{
                height: '28px',
                padding: '0 12px',
                borderRadius: '8px',
                border: `1px solid ${effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
                backgroundColor: effectiveDark ? '#1e293b' : '#ffffff',
                color: effectiveDark ? '#f1f5f9' : '#0f172a',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
              <span>Open Link</span>
            </button>
          )}
        </div>
      )}

      {/* Tab Rows or Empty State */}
      {tabs && tabs.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? '4px' : '6px',
            width: '100%',
          }}
        >
          {tabs.map((tab) => {
          const audibleInfo =
            tab.browserTabId !== undefined
              ? audibleTabs?.find((a) => a.id === tab.browserTabId)
              : undefined;
          const isAudible = Boolean(audibleInfo);
          const isMuted = audibleInfo?.muted === true;

          return (
            <TmpTabRow
              key={tab.id}
              tab={tab}
              currentDeviceId={currentDeviceId}
              isDarkTheme={effectiveDark}
              compact={compact}
              alwaysShowActions={alwaysShowActions}
              isHighlighted={highlightedTabId === tab.id}
              showDeviceBadge={showDeviceBadge}
              isAudible={isAudible}
              isMuted={isMuted}
              onOpen={onOpen}
              onPromote={onPromote}
              onClose={onClose}
              onRename={onRename}
              onMediaControl={
                onMediaControl && tab.browserTabId !== undefined
                  ? (action) => onMediaControl(tab.browserTabId!, action)
                  : undefined
              }
            />
          );
        })}
      </div>
      ) : (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: effectiveDark ? '#cbd5e1' : '#334155' }}>
            No active synced tabs from connected devices
          </span>
          <span style={{ fontSize: '12px', color: effectiveDark ? '#94a3b8' : '#64748b', maxWidth: '440px', lineHeight: 1.5 }}>
            Tabs you open in the Arcable browser extension sync live across all your devices via Raindrop.
          </span>
        </div>
      )}
    </div>
  );
};

