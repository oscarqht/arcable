'use client';

import React, { useState } from 'react';
import { TmpTab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { PlusIcon, CloseIcon } from '../Icons';

export interface TmpTabRowProps {
  tab: TmpTab;
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  isAssociated?: boolean;
  isHighlighted?: boolean;
  onOpen?: (url: string, tabId?: string) => void;
  onPromote: (tab: TmpTab) => void;
  onClose: (tab: TmpTab) => void;
}

export const TmpTabRow: React.FC<TmpTabRowProps> = ({
  tab,
  isDarkTheme,
  compact = false,
  alwaysShowActions = false,
  isAssociated = true,
  isHighlighted = false,
  onOpen,
  onPromote,
  onClose,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [isHovered, setIsHovered] = useState(false);

  const domain = getDomain(tab.url);
  const displayTitle = tab.title || domain || cleanUrl(tab.url) || 'Untitled Tab';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tab.url) {
      if (onOpen) {
        onOpen(tab.url, tab.id);
      } else {
        window.open(tab.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Color tokens
  const associatedBg = effectiveDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
  const hoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';
  const showActions = isMobile || alwaysShowActions || isHovered;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '38px',
        minHeight: '38px',
        padding: '0 8px',
        borderRadius: '10px',
        backgroundColor: isHovered ? hoverBg : isAssociated ? associatedBg : 'transparent',
        outline: isHighlighted ? '2px solid #38bdf8' : 'none',
        boxShadow: isHighlighted ? '0 0 12px rgba(56, 189, 248, 0.45)' : 'none',
        color: textColor,
        cursor: 'pointer',
        gap: '6px',
        transition: 'background-color 0.12s ease, outline 0.2s ease, box-shadow 0.2s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Left side: Favicon, Title (Full Width) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <TabFavicon
            url={tab.url}
            size={18}
            emojiSize={18}
            isDarkTheme={isDarkTheme}
            showDomainFallback={true}
            globeIconSize={18}
          />
        </div>

        {/* Title taking 100% available width */}
        <span
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={displayTitle}
        >
          {displayTitle}
        </span>
      </div>

      {/* Right side: Only "+" and "x" buttons (NO "/", NO "-", NO "...") */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          flexShrink: 0,
          opacity: showActions ? 1 : 0,
          transition: 'opacity 0.12s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* "+" Button: Open Add Tab Modal prefilled */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onPromote(tab);
          }}
          title="Save to workspace"
          aria-label="Save to workspace"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: effectiveDark ? '#94a3b8' : textColor,
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            transition: 'background-color 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe';
            e.currentTarget.style.color = '#0284c7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
          }}
        >
          <PlusIcon size={14} />
        </button>

        {/* "x" Button: Close browser tab */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose(tab);
          }}
          title="Close tab"
          aria-label="Close tab"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: effectiveDark ? '#94a3b8' : textColor,
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            transition: 'background-color 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
          }}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
};
