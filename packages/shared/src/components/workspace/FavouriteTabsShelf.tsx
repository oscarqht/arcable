'use client';

import React, { useState, useMemo } from 'react';
import { Tab } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { TabFavicon } from './TabFavicon';
import { SpaceThemeTokens, getSpaceThemeStyles } from '../../utils/spaceTheme';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  StarIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
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
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
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
            const isDragTarget = dragOverTabId === tab.id;
            const isAssociated = Boolean(tabAssociations && tabAssociations[tab.id]);
            const badge = tabAssociations?.[tab.id]?.badge;
            const isHighlighted = highlightedTabId === tab.id;
            const domain = getDomain(tab.url);
            const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Untitled';
            const tooltipText = tab.url ? `${displayTitle}\n${tab.url}` : displayTitle;

            return (
              <div
                key={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => setHoveredTabId(tab.id)}
                onMouseLeave={() => {
                  setHoveredTabId(null);
                  if (dragOverTabId === tab.id) {
                    setDragOverTabId(null);
                    setDropPosition(null);
                  }
                }}
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

                {/* Action buttons on hover (desktop only, hidden on mobile) */}
                {!isMobile && isHovered && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: shelfTheme.isDark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${shelfTheme.borderColor}`,
                      borderRadius: '16px',
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                      zIndex: 10,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Remove from favourites"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavouriteTab(tab.id);
                      }}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#eab308',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                    >
                      <StarIcon size={12} filled={true} />
                    </button>
                    <button
                      type="button"
                      title="Edit tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTab(tab);
                      }}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: shelfTheme.isDark ? '#94a3b8' : '#64748b',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                    >
                      <EditIcon size={11} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTab(tab.id);
                      }}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                    >
                      <TrashIcon size={11} />
                    </button>
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
