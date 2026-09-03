'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Tab } from '../../types/workspace';
import { TabAssociationMap, AudibleTab } from '../../types/tabTracker';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { TabFavicon } from './TabFavicon';
import { SpaceThemeTokens, getSpaceThemeStyles } from '../../utils/spaceTheme';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  StarIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  MinusIcon,
  SlashIcon,
} from '../Icons';

export interface FavouriteTabsShelfProps {
  tabs: Tab[];
  tabAssociations?: TabAssociationMap;
  highlightedTabId?: string | null;
  onOpenTab?: (url: string, tabId?: string) => void;
  onCloseAssociatedTab?: (tabId: string) => void;
  onResetDivertedUrl?: (tabId: string) => void;
  audibleTabs?: AudibleTab[];
  onToggleTabMute?: (tabId: number, muted?: boolean) => void;
  onEditTab: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onToggleFavouriteTab: (tabId: string) => void;
  onAddFavouriteTab: () => void;
  onReorderFavouriteTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
  themeStyles?: SpaceThemeTokens;
}

export const FavouriteTabsShelf: React.FC<FavouriteTabsShelfProps> = ({
  tabs,
  tabAssociations,
  highlightedTabId,
  onOpenTab,
  onCloseAssociatedTab,
  onResetDivertedUrl,
  audibleTabs,
  onToggleTabMute,
  onEditTab,
  onDeleteTab,
  onToggleFavouriteTab,
  onAddFavouriteTab,
  onReorderFavouriteTabs,
  themeStyles,
}) => {

  const { isDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const shelfTheme = useMemo(() => {
    return themeStyles || getSpaceThemeStyles(undefined, isDark);
  }, [themeStyles, isDark]);

  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [menuVisibleTabId, setMenuVisibleTabId] = useState<string | null>(null);
  const [openMenuTabId, setOpenMenuTabId] = useState<string | null>(null);
  const [copiedTabId, setCopiedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setMenuVisibleTabId(null);
    setOpenMenuTabId(null);
    startDrag(e, { id: tabId, type: 'favTab' });
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    if (!isDragAcceptable(e, ['favTab'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === tabId) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const pos = e.clientX < midX ? 'before' : 'after';
    setDragOverTabId(tabId);
    setDropPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    if (!isDragAcceptable(e, ['favTab'])) {
      setDragOverTabId(null);
      setDropPosition(null);
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const pos = dropPosition || 'after';
    setDragOverTabId(null);
    setDropPosition(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      const activeDrag = getActiveDrag();
      const sourceId = activeDrag?.id || (raw ? (JSON.parse(raw) as { id: string }).id : null);
      if (!sourceId || sourceId === targetTabId) return;

      onReorderFavouriteTabs?.(sourceId, targetTabId, pos);
    } catch {} finally {
      endDrag();
    }
  };

  const handleDragEnd = () => {
    setDragOverTabId(null);
    setDropPosition(null);
    endDrag();
  };

  const handleItemMouseEnter = (tabId: string) => {
    setHoveredTabId(tabId);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // If menu is already open for this tab, keep it visible
    if (openMenuTabId === tabId) {
      setMenuVisibleTabId(tabId);
    } else {
      // 250ms hover delay before showing the ... menu button
      hoverTimerRef.current = setTimeout(() => {
        setMenuVisibleTabId(tabId);
      }, 250);
    }
  };

  const handleItemMouseLeave = (tabId: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredTabId(null);
    if (dragOverTabId === tabId) {
      setDragOverTabId(null);
      setDropPosition(null);
    }
    // Only hide button if menu is not currently open
    if (openMenuTabId !== tabId) {
      setMenuVisibleTabId(null);
    }
  };

  return (
    <div
      className="favourite-tabs-shelf"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '2px 0 6px 0',
        background: 'transparent',
        color: shelfTheme.textColor,
        borderRadius: '24px',
        border: 'none',
        boxShadow: 'none',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
          gap: '8px',
          width: '100%',
        }}
      >
        {tabs.map((tab) => {
            const isHovered = hoveredTabId === tab.id;
            const isMenuVisible = !isMobile && (menuVisibleTabId === tab.id || openMenuTabId === tab.id);
            const isDragTarget = dragOverTabId === tab.id;
            const assoc = tabAssociations ? tabAssociations[tab.id] : undefined;
            const isAssociated = Boolean(assoc);
            const isDiverted = Boolean(assoc?.isDiverted);
            const audibleInfo = assoc ? audibleTabs?.find((a) => a.id === assoc.browserTabId) : undefined;
            const isAudible = Boolean(audibleInfo);
            const isMuted = audibleInfo?.muted === true;
            const badge = assoc?.badge;
            const isHighlighted = highlightedTabId === tab.id;
            const domain = getDomain(tab.url);
            const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Untitled';

            const statusSuffix = isAssociated
              ? isHighlighted
                ? ' • Open in browser (Active)'
                : ' • Open in browser'
              : ' • Closed (Click to open)';
            const divertedSuffix = isDiverted ? ' (Navigated away from original URL)' : '';
            const tooltipText = tab.url ? `${displayTitle}\n${tab.url}${statusSuffix}${divertedSuffix}` : displayTitle;

            const menuItems: ActionDropdownItem[] = [
              ...(isAssociated && onCloseAssociatedTab
                ? [
                    {
                      id: 'close-browser-tab',
                      label: 'Close browser tab',
                      icon: <MinusIcon size={14} />,
                      danger: true,
                      onClick: () => onCloseAssociatedTab(tab.id),
                      dividerAfter: !isDiverted && !tab.url,
                    },
                  ]
                : []),
              ...(isDiverted && onResetDivertedUrl
                ? [
                    {
                      id: 'restore-diverted-url',
                      label: 'Restore original URL',
                      icon: <SlashIcon size={14} />,
                      onClick: () => onResetDivertedUrl(tab.id),
                      dividerAfter: true,
                    },
                  ]
                : []),
              ...(tab.url
                ? [
                    {
                      id: 'open-tab',
                      label: isAssociated ? 'Switch to tab' : 'Open in new tab',
                      icon: <ExternalLinkIcon size={14} />,
                      onClick: () => {
                        if (onOpenTab) {
                          onOpenTab(tab.url, tab.id);
                        } else {
                          window.open(tab.url, '_blank', 'noopener,noreferrer');
                        }
                      },
                    },
                    {
                      id: 'copy-url',
                      label: copiedTabId === tab.id ? 'Copied URL!' : 'Copy URL',
                      icon: copiedTabId === tab.id ? <CheckIcon size={14} color="#10b981" /> : <CopyIcon size={14} />,
                      onClick: () => {
                        if (tab.url && typeof navigator !== 'undefined') {
                          navigator.clipboard.writeText(tab.url);
                          setCopiedTabId(tab.id);
                          setTimeout(() => {
                            setCopiedTabId((prev) => (prev === tab.id ? null : prev));
                          }, 1500);
                        }
                      },
                      dividerAfter: true,
                    },
                  ]
                : []),
              {
                id: 'remove-favourite',
                label: 'Remove from favourites',
                icon: <StarIcon size={14} filled={true} color="#eab308" />,
                onClick: () => onToggleFavouriteTab(tab.id),
                dividerAfter: Boolean(onEditTab || onDeleteTab),
              },
              {
                id: 'edit-tab',
                label: 'Edit tab',
                icon: <EditIcon size={14} />,
                onClick: () => onEditTab(tab),
              },
              {
                id: 'delete-tab',
                label: 'Delete tab',
                icon: <TrashIcon size={14} />,
                danger: true,
                onClick: () => onDeleteTab(tab.id),
              },
            ];

            const cardBg = isHovered
              ? (isAssociated
                  ? (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.85)')
                  : shelfTheme.actionHoverBg)
              : isAssociated
              ? (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.70)')
              : (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.035)');

            const cardBorder = isHovered
              ? `1px solid ${shelfTheme.primaryColor}`
              : isAssociated
              ? (shelfTheme.isDark ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid rgba(0, 0, 0, 0.1)')
              : (shelfTheme.isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid rgba(0, 0, 0, 0.06)');

            const cardShadow = isHighlighted
              ? `inset 0 0 0 1px ${shelfTheme.primaryColor}99, 0 0 10px ${shelfTheme.primaryColor}55`
              : isHovered
              ? (isAssociated
                  ? (shelfTheme.isDark ? '0 3px 10px rgba(0, 0, 0, 0.35)' : '0 3px 10px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06)')
                  : '0 2px 8px rgba(0, 0, 0, 0.12)')
              : isAssociated
              ? (shelfTheme.isDark
                  ? '0 1px 4px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                  : '0 1.5px 4px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.70)')
              : 'none';

            return (
              <div
                key={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => handleItemMouseEnter(tab.id)}
                onMouseLeave={() => handleItemMouseLeave(tab.id)}
                onClick={() => {
                  if (tab.url) {
                    if (onOpenTab) {
                      onOpenTab(tab.url, tab.id);
                    } else {
                      window.open(tab.url, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  minWidth: 0,
                  height: '48px',
                  backgroundColor: cardBg,
                  border: cardBorder,
                  borderLeft: isDragTarget && dropPosition === 'before'
                    ? `3px solid ${shelfTheme.primaryColor}`
                    : undefined,
                  borderRight: isDragTarget && dropPosition === 'after'
                    ? `3px solid ${shelfTheme.primaryColor}`
                    : undefined,
                  outline: isHighlighted ? `2px solid ${shelfTheme.primaryColor}` : 'none',
                  outlineOffset: isHighlighted ? '-1.5px' : undefined,
                  borderRadius: '12px',
                  cursor: 'grab',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, outline 0.15s ease',
                  position: 'relative',
                  userSelect: 'none',
                  boxShadow: cardShadow,
                  boxSizing: 'border-box',
                }}
                title={tooltipText}
              >
                {/* Favicon or Custom Emoji */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: isHovered
                      ? (shelfTheme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)')
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
                    opacity: isAssociated || isHovered ? 1 : 0.72,
                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                    transition: 'opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  <TabFavicon
                    url={tab.url}
                    customEmojiIcon={tab.customEmojiIcon}
                    size={24}
                    emojiSize={24}
                    globeIconSize={24}
                    globeIconColor={shelfTheme.subtextColor}
                    showDomainFallback={true}
                    badge={badge}
                  />
                </div>

                {/* Arc-style active running indicator pill at bottom center */}
                {isAssociated && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isHighlighted ? '18px' : isHovered ? '14px' : '10px',
                      height: '3px',
                      borderRadius: '9999px',
                      backgroundColor: isHighlighted
                        ? shelfTheme.primaryColor
                        : isHovered
                        ? (shelfTheme.isDark ? '#ffffff' : 'rgba(0, 0, 0, 0.85)')
                        : (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)'),
                      boxShadow: isHighlighted ? `0 0 6px ${shelfTheme.primaryColor}` : 'none',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Audio playing / mute badge */}
                {isAudible && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (assoc?.browserTabId) {
                        onToggleTabMute?.(assoc.browserTabId, !isMuted);
                      }
                    }}
                    title={isMuted ? 'Muted (Click to unmute)' : 'Playing audio (Click to mute)'}
                    aria-label={isMuted ? 'Unmute tab' : 'Mute tab'}
                    style={{
                      position: 'absolute',
                      bottom: '3px',
                      left: '3px',
                      outline: 'none',
                      backgroundColor: isMuted ? '#ef4444' : '#10b981',
                      color: '#ffffff',
                      width: '13px',
                      height: '13px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                      border: `1.5px solid ${shelfTheme.isDark ? '#1e293b' : '#ffffff'}`,
                      zIndex: 4,
                      transition: 'transform 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {isMuted ? (
                      <span style={{ fontSize: '7px', lineHeight: 1, fontWeight: 700 }}>✕</span>
                    ) : (
                      <span style={{ fontSize: '7.5px', lineHeight: 1 }}>♪</span>
                    )}
                  </button>
                )}

                {/* Diverted URL badge */}
                {isDiverted && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onResetDivertedUrl?.(tab.id);
                    }}
                    title="Tab navigated away from original URL. Click to restore original URL"
                    aria-label="Restore original URL"
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: '2px',
                      width: '13px',
                      height: '13px',
                      borderRadius: '3.5px',
                      border: `1px solid ${shelfTheme.isDark ? 'rgba(234, 179, 8, 0.45)' : '#fde047'}`,
                      backgroundColor: shelfTheme.isDark ? 'rgba(234, 179, 8, 0.25)' : '#fef08a',
                      color: shelfTheme.isDark ? '#fde047' : '#a16207',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      zIndex: 4,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      transition: 'transform 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <SlashIcon size={8} />
                  </button>
                )}

                {/* ... menu button on item's top right corner */}
                {isMenuVisible && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      zIndex: 10,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionDropdown
                      items={menuItems}
                      isDarkTheme={shelfTheme.isDark}
                      visible={true}
                      buttonTitle="Tab options"
                      align="right"
                      size="sm"
                      triggerIcon={<MoreHorizontalIcon size={14} />}
                      hoverBg={shelfTheme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'}
                      buttonStyle={{
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        borderRadius: '6px',
                        backgroundColor: shelfTheme.isDark ? '#1e293b' : '#ffffff',
                        border: `1px solid ${shelfTheme.borderColor}`,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                        color: shelfTheme.textColor,
                      }}
                      onOpenChange={(isOpen) => {
                        if (isOpen) {
                          setOpenMenuTabId(tab.id);
                          setMenuVisibleTabId(tab.id);
                        } else {
                          setOpenMenuTabId(null);
                          if (hoveredTabId !== tab.id) {
                            setMenuVisibleTabId(null);
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAddFavouriteTab}
            title="Add favourite tab"
            aria-label="Add favourite tab"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minWidth: 0,
              height: '48px',
              backgroundColor: shelfTheme.inputBg,
              border: `1px dashed ${shelfTheme.borderColor}`,
              borderRadius: '12px',
              cursor: 'pointer',
              color: shelfTheme.subtextColor,
              transition: 'all 0.15s ease',
              outline: 'none',
              padding: 0,
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.actionHoverBg;
              e.currentTarget.style.borderColor = shelfTheme.primaryColor;
              e.currentTarget.style.color = shelfTheme.textColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.inputBg;
              e.currentTarget.style.borderColor = shelfTheme.borderColor;
              e.currentTarget.style.color = shelfTheme.subtextColor;
            }}
          >
            <PlusIcon size={18} />
          </button>
        </div>
    </div>
  );
};
