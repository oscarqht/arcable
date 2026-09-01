'use client';

import React from 'react';
import { TmpTab } from '../../types/workspace';
import { AudibleTab, MediaControlAction } from '../../types/tabTracker';
import { TmpTabRow } from './TmpTabRow';
import { useSystemTheme } from '../../hooks/useSystemTheme';

export interface TmpTabsListProps {
  tabs: TmpTab[];
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  highlightedTabId?: string | null;
  activeBrowserTabId?: number;
  audibleTabs?: AudibleTab[];
  onOpen?: (url: string, tabId?: string) => void;
  onPromote: (tab: TmpTab) => void;
  onClose: (tab: TmpTab) => void;
  onRename?: (tab: TmpTab, newTitle: string) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
}

export const TmpTabsList: React.FC<TmpTabsListProps> = ({
  tabs,
  isDarkTheme,
  compact = false,
  alwaysShowActions = false,
  highlightedTabId,
  audibleTabs,
  onOpen,
  onPromote,
  onClose,
  onRename,
  onMediaControl,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;

  if (!tabs || tabs.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: '100%',
        boxSizing: 'border-box',
        padding: 0,
        marginTop: compact ? '6px' : '10px',
      }}
    >
      {/* Section Header */}
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
            isDarkTheme={effectiveDark}
            compact={compact}
            alwaysShowActions={alwaysShowActions}
            isHighlighted={highlightedTabId === tab.id}
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
  );
};

