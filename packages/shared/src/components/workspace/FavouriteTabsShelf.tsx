'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
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
}) => {

  const { isDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: tabId, type: 'favTab' }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
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
    e.preventDefault();
    e.stopPropagation();
    const pos = dropPosition || 'after';
    setDragOverTabId(null);
    setDropPosition(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; type: string };
      if (!parsed || !parsed.id || parsed.id === targetTabId) return;

      onReorderFavouriteTabs?.(parsed.id, targetTabId, pos);
    } catch {}
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderRadius: '20px',
        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
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
                    ? isDark ? 'rgba(255,255,255,0.15)' : '#f0fdf4'
                    : isAssociated
                    ? isDark ? 'rgba(255,255,255,0.08)' : '#e0f2fe'
                    : isDark ? '#0f172a' : '#f8fafc',
                  border: isHovered
                    ? isDark ? '1px solid #38bdf8' : '1px solid #86efac'
                    : isAssociated
                    ? isDark ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #bae6fd'
                    : isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                  borderLeft: isDragTarget && dropPosition === 'before'
                    ? `3px solid ${isDark ? '#38bdf8' : '#0284c7'}`
                    : undefined,
                  borderRight: isDragTarget && dropPosition === 'after'
                    ? `3px solid ${isDark ? '#38bdf8' : '#0284c7'}`
                    : undefined,
                  outline: isHighlighted ? '2px solid #38bdf8' : 'none',
                  outlineOffset: isHighlighted ? '-2px' : undefined,
                  borderRadius: '12px',
                  cursor: 'grab',
                  transition: 'all 0.12s ease',
                  position: 'relative',
                  userSelect: 'none',
                  boxShadow: isHighlighted
                    ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.6), 0 0 8px rgba(56, 189, 248, 0.4)'
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
                    backgroundColor: isHovered ? (isDark ? 'rgba(255,255,255,0.08)' : '#ffffff') : 'transparent',
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
                    globeIconColor={isDark ? '#94a3b8' : '#64748b'}
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
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
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
                        color: isDark ? '#94a3b8' : '#64748b',
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
              backgroundColor: isDark ? '#0f172a' : '#f8fafc',
              border: `1px dashed ${isDark ? '#334155' : '#cbd5e1'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              color: isDark ? '#94a3b8' : '#64748b',
              transition: 'all 0.15s ease',
              outline: 'none',
              padding: 0,
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : '#f0fdf4';
              e.currentTarget.style.borderColor = isDark ? '#38bdf8' : '#86efac';
              e.currentTarget.style.color = isDark ? '#38bdf8' : '#16a34a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#0f172a' : '#f8fafc';
              e.currentTarget.style.borderColor = isDark ? '#334155' : '#cbd5e1';
              e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b';
            }}
          >
            <PlusIcon size={18} />
          </button>
        </div>
    </div>
  );
};
