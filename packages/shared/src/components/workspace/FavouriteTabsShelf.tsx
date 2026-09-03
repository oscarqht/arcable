'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Tab } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
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
} from '../Icons';

export interface FavouriteTabsShelfProps {
  tabs: Tab[];
  tabAssociations?: TabAssociationMap;
  highlightedTabId?: string | null;
  onOpenTab?: (url: string, tabId?: string) => void;
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
      // 1-second hover delay before showing the ... menu button
      hoverTimerRef.current = setTimeout(() => {
        setMenuVisibleTabId(tabId);
      }, 1000);
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
            const isAssociated = Boolean(tabAssociations && tabAssociations[tab.id]);
            const badge = tabAssociations?.[tab.id]?.badge;
            const isHighlighted = highlightedTabId === tab.id;
            const domain = getDomain(tab.url);
            const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Untitled';
            const tooltipText = tab.url ? `${displayTitle}\n${tab.url}` : displayTitle;

            const menuItems: ActionDropdownItem[] = [
              ...(tab.url
                ? [
                    {
                      id: 'open-tab',
                      label: 'Open in new tab',
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
                  backgroundColor: isHovered
                    ? shelfTheme.actionHoverBg
                    : isAssociated
                    ? shelfTheme.badgeBg
                    : shelfTheme.inputBg,
                  border: isHovered
                    ? `1px solid ${shelfTheme.primaryColor}`
                    : isAssociated
                    ? `1px solid ${shelfTheme.borderColor}`
                    : `1px solid ${shelfTheme.borderColor}`,
                  borderLeft: isDragTarget && dropPosition === 'before'
                    ? `3px solid ${shelfTheme.primaryColor}`
                    : undefined,
                  borderRight: isDragTarget && dropPosition === 'after'
                    ? `3px solid ${shelfTheme.primaryColor}`
                    : undefined,
                  outline: isHighlighted ? `2px solid ${shelfTheme.primaryColor}` : 'none',
                  outlineOffset: isHighlighted ? '-2px' : undefined,
                  borderRadius: '12px',
                  cursor: 'grab',
                  transition: 'all 0.12s ease',
                  position: 'relative',
                  userSelect: 'none',
                  boxShadow: isHighlighted
                    ? `inset 0 0 0 1px ${shelfTheme.primaryColor}99, 0 0 8px ${shelfTheme.primaryColor}66`
                    : isHovered
                    ? '0 2px 8px rgba(0,0,0,0.15)'
                    : 'none',
                  boxSizing: 'border-box',
                }}
                title={tooltipText}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: isHovered ? (shelfTheme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)') : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
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

                {/* ... menu button on item's top right corner, shown after hover for 1 second */}
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
