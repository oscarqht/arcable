'use client';

import React from 'react';
import { TmpTab } from '../../types/workspace';
import { TmpTabRow } from './TmpTabRow';
import { useSystemTheme } from '../../hooks/useSystemTheme';

export interface TmpTabsListProps {
  tabs: TmpTab[];
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  highlightedTabId?: string | null;
  activeBrowserTabId?: number;
  onOpen?: (url: string, tabId?: string) => void;
  onPromote: (tab: TmpTab) => void;
  onClose: (tab: TmpTab) => void;
}

export const TmpTabsList: React.FC<TmpTabsListProps> = ({
  tabs,
  isDarkTheme,
  compact = false,
  alwaysShowActions = false,
  highlightedTabId,
  onOpen,
  onPromote,
  onClose,
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
        gap: '2px',
        width: '100%',
        boxSizing: 'border-box',
        padding: 0,
      }}
    >
      {tabs.map((tab) => (
        <TmpTabRow
          key={tab.id}
          tab={tab}
          isDarkTheme={effectiveDark}
          compact={compact}
          alwaysShowActions={alwaysShowActions}
          isHighlighted={highlightedTabId === tab.id}
          onOpen={onOpen}
          onPromote={onPromote}
          onClose={onClose}
        />
      ))}
    </div>
  );
};
