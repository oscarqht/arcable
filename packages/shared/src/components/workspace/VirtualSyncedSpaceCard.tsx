'use client';

import React, { useState, useMemo } from 'react';
import { TmpTab, TabOpenOptions } from '../../types/workspace';
import { AudibleTab, MediaControlAction } from '../../types/tabTracker';
import { getSpaceThemeStyles } from '../../utils/spaceTheme';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TmpTabRow } from './TmpTabRow';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
} from '../Icons';

export interface VirtualSyncedSpaceCardProps {
  tabs: TmpTab[];
  currentDeviceId?: string;
  searchQuery?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  cardIndex?: number;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  highlightedTabId?: string | null;
  audibleTabs?: AudibleTab[];
  showDeviceBadge?: boolean;
  onOpenTab?: (url: string, tabId?: string, tab?: TmpTab, options?: TabOpenOptions) => void;
  onPromoteTab: (tab: TmpTab) => void;
  onCloseTab: (tab: TmpTab) => void;
  onRenameTab?: (tab: TmpTab, newTitle: string) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
  onAddTmpTab?: () => void;
}

export const VirtualSyncedSpaceCard: React.FC<VirtualSyncedSpaceCardProps> = ({
  tabs,
  currentDeviceId,
  searchQuery: externalSearch = '',
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
  cardIndex = 0,
  isSingleColumn = false,
  alwaysShowActions = false,
  highlightedTabId,
  audibleTabs,
  showDeviceBadge = false,
  onOpenTab,
  onPromoteTab,
  onCloseTab,
  onRenameTab,
  onMediaControl,
  onAddTmpTab,
}) => {
  const { isDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const isControlled = controlledIsCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledIsCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  // Render in the same style as spaces but with NO theme color
  const themeStyles = useMemo(() => {
    return getSpaceThemeStyles(undefined, isDark);
  }, [isDark]);

  const activeSearch = externalSearch.trim().toLowerCase();

  // Filter items matching active search
  const filteredTabs = useMemo(() => {
    if (!activeSearch) return null;
    return tabs.filter((t) => {
      const matchTitle = t.title && t.title.toLowerCase().includes(activeSearch);
      const matchCustom = t.customTitle && t.customTitle.toLowerCase().includes(activeSearch);
      const matchUrl = t.url && t.url.toLowerCase().includes(activeSearch);
      const matchDevice = t.deviceName && t.deviceName.toLowerCase().includes(activeSearch);
      return matchTitle || matchCustom || matchUrl || matchDevice;
    });
  }, [tabs, activeSearch]);

  const displayedTabs = filteredTabs !== null ? filteredTabs : tabs;

  // Copy all tab URLs in this virtual space
  const handleCopyAllUrls = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = tabs.map((t) => t.url).filter(Boolean);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  // Open all tabs in browser
  const handleOpenAllTabs = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = tabs.map((t) => t.url).filter(Boolean);
    if (urls.length > 0) {
      if (onOpenTab) {
        tabs.forEach((t) => onOpenTab(t.url, t.id, t));
      } else {
        urls.forEach((u) => window.open(u, '_blank', 'noopener,noreferrer'));
      }
    }
  };

  const spaceMenuItems: ActionDropdownItem[] = useMemo(() => {
    const items: ActionDropdownItem[] = [
      {
        id: 'copy-urls',
        label: copied ? 'Copied all URLs!' : 'Copy all URLs',
        icon: copied ? <CheckIcon size={16} color="#10b981" /> : <CopyIcon size={16} />,
        onClick: handleCopyAllUrls,
      },
      {
        id: 'open-tabs',
        label: 'Open all tabs',
        icon: <ExternalLinkIcon size={16} />,
        onClick: handleOpenAllTabs,
        dividerAfter: Boolean(onAddTmpTab),
      },
    ];

    if (onAddTmpTab) {
      items.push({
        id: 'add-tab',
        label: 'Open Link...',
        icon: <PlusIcon size={16} />,
        onClick: () => onAddTmpTab(),
      });
    }

    return items;
  }, [copied, handleCopyAllUrls, handleOpenAllTabs, onAddTmpTab]);

  return (
    <div
      className="space-card virtual-space-card"
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
      style={{
        background: isSingleColumn ? 'transparent' : themeStyles.containerBg,
        color: themeStyles.textColor,
        borderRadius: '24px',
        border: isSingleColumn ? 'none' : themeStyles.cardBorder,
        boxShadow: isSingleColumn ? 'none' : themeStyles.cardBoxShadow,
        padding: isCollapsed ? '14px 18px' : (isSingleColumn ? '8px 4px' : '22px 14px'),
        display: 'flex',
        flexDirection: 'column',
        gap: isCollapsed ? '0' : (isSingleColumn ? '12px' : '16px'),
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={toggleCollapse}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          {/* Emoji / Icon Container */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              backgroundColor: themeStyles.badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '19px',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            📑
          </div>

          {/* Space Title & Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
                color: 'inherit',
              }}
              title="Open Tabs (local browser tabs)"
            >
              Open Tabs
            </h3>

            {/* Tab Count Pill */}
            <span
              style={{
                backgroundColor: themeStyles.badgeBg,
                color: themeStyles.badgeText,
                padding: '1px 7px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {tabs.length}
            </span>
          </div>
        </div>

        {/* Header Actions */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionDropdown
            items={spaceMenuItems}
            isDarkTheme={themeStyles.isDark}
            visible={isMobile || isCardHovered || alwaysShowActions}
            hoverBg={themeStyles.actionHoverBg}
            buttonTitle="Open tabs options"
            size="md"
          />
        </div>
      </div>

      {/* Expanded Card Body */}
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Search Results Filter Mode */}
          {filteredTabs !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8 }}>
                Found {filteredTabs.length} matching tab(s):
              </div>
              {filteredTabs.length === 0 ? (
                <div
                  style={{
                    padding: '18px',
                    textAlign: 'center',
                    fontSize: '13px',
                    opacity: 0.65,
                  }}
                >
                  No tabs match &ldquo;{activeSearch}&rdquo;
                </div>
              ) : (
                filteredTabs.map((tab) => (
                  <TmpTabRow
                    key={tab.id}
                    tab={tab}
                    themeStyles={themeStyles}
                    currentDeviceId={currentDeviceId}
                    isDarkTheme={themeStyles.isDark}
                    compact={isSingleColumn}
                    alwaysShowActions={alwaysShowActions}
                    isHighlighted={highlightedTabId === tab.id}
                    showDeviceBadge={showDeviceBadge}
                    isAudible={
                      tab.browserTabId !== undefined
                        ? audibleTabs?.some((a) => a.id === tab.browserTabId)
                        : false
                    }
                    isMuted={
                      tab.browserTabId !== undefined
                        ? audibleTabs?.find((a) => a.id === tab.browserTabId)?.muted === true
                        : false
                    }
                    onOpen={onOpenTab}
                    onPromote={onPromoteTab}
                    onClose={onCloseTab}
                    onRename={onRenameTab}
                    onMediaControl={
                      onMediaControl && tab.browserTabId !== undefined
                        ? (action) => onMediaControl(tab.browserTabId!, action)
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          ) : displayedTabs.length > 0 ? (
            /* Tab Rows */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {displayedTabs.map((tab) => (
                <TmpTabRow
                  key={tab.id}
                  tab={tab}
                  themeStyles={themeStyles}
                  currentDeviceId={currentDeviceId}
                  isDarkTheme={themeStyles.isDark}
                  compact={isSingleColumn}
                  alwaysShowActions={alwaysShowActions}
                  isHighlighted={highlightedTabId === tab.id}
                  showDeviceBadge={showDeviceBadge}
                  isAudible={
                    tab.browserTabId !== undefined
                      ? audibleTabs?.some((a) => a.id === tab.browserTabId)
                      : false
                  }
                  isMuted={
                    tab.browserTabId !== undefined
                      ? audibleTabs?.find((a) => a.id === tab.browserTabId)?.muted === true
                      : false
                  }
                  onOpen={onOpenTab}
                  onPromote={onPromoteTab}
                  onClose={onCloseTab}
                  onRename={onRenameTab}
                  onMediaControl={
                    onMediaControl && tab.browserTabId !== undefined
                      ? (action) => onMediaControl(tab.browserTabId!, action)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            /* Space-styled Clean Empty State */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 16px',
                textAlign: 'center',
                gap: '8px',
                borderRadius: '16px',
                backgroundColor: themeStyles.badgeBg,
                border: `1px dashed ${themeStyles.borderColor}`,
              }}
            >
              <span style={{ fontSize: '20px' }}>📲</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: themeStyles.textColor }}>
                No open tabs to show
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: themeStyles.subtextColor,
                  maxWidth: '320px',
                  lineHeight: 1.45,
                }}
              >
                Open browser tabs stay on this device until you save them to your workspace.
              </span>
              {onAddTmpTab && (
                <button
                  type="button"
                  onClick={onAddTmpTab}
                  style={{
                    marginTop: '6px',
                    padding: '5px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.3)' : '#bae6fd'}`,
                    backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#ffffff',
                    color: isDark ? '#38bdf8' : '#0284c7',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PlusIcon size={12} />
                  <span>Open & Sync Link</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
