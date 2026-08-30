'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import {
  PinIcon,
  PlusIcon,
  StarIcon,
  EditIcon,
  TrashIcon,
} from '../Icons';

export interface PinnedTabsShelfProps {
  tabs: Tab[];
  isDarkTheme?: boolean;
  shelfBg?: string;
  onOpenTab?: (url: string) => void;
  onEditTab: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onTogglePinTab: (tabId: string) => void;
  onToggleFavouriteTab?: (tabId: string) => void;
  onAddPinnedTab: () => void;
  onReorderPinnedTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
}

export const PinnedTabsShelf: React.FC<PinnedTabsShelfProps> = ({
  tabs,
  isDarkTheme,
  shelfBg,
  onOpenTab,
  onEditTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onAddPinnedTab,
  onReorderPinnedTabs,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  if (tabs.length === 0) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: tabId, type: 'pinnedTab' }));
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

      onReorderPinnedTabs?.(parsed.id, targetTabId, pos);
    } catch {}
  };

  const resolvedBg = shelfBg || (effectiveDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.03)');
  const itemBg = effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.85)';
  const itemHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.25)' : '#ffffff';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '10px 12px',
        backgroundColor: resolvedBg,
        borderRadius: '16px',
        border: `1px solid ${effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85 }}>
          <PinIcon size={14} filled={true} />
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Pinned ({tabs.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onAddPinnedTab}
          title="Add pinned tab"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '3px 7px',
            borderRadius: '6px',
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <PlusIcon size={13} />
          <span>Pin Tab</span>
        </button>
      </div>

      {/* Grid of Pinned Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))',
          gap: '7px',
        }}
      >
        {tabs.map((tab) => {
          const isHovered = hoveredTabId === tab.id;
          const isDragTarget = dragOverTabId === tab.id;
          const domain = getDomain(tab.url);
          const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Pinned Tab';

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
                    onOpenTab(tab.url);
                  } else {
                    window.open(tab.url, '_blank', 'noopener,noreferrer');
                  }
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 9px',
                backgroundColor: isHovered ? itemHoverBg : itemBg,
                color: textColor,
                border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
                borderLeft: isDragTarget && dropPosition === 'before' ? '3px solid #0284c7' : undefined,
                borderRight: isDragTarget && dropPosition === 'after' ? '3px solid #0284c7' : undefined,
                borderRadius: '11px',
                cursor: 'grab',
                transition: 'all 0.12s ease',
                position: 'relative',
                overflow: 'hidden',
                userSelect: 'none',
                boxShadow: isHovered ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
              title={`${displayTitle}\n${tab.url}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
                <TabFavicon
                  url={tab.url}
                  customEmojiIcon={tab.customEmojiIcon}
                  size={20}
                  emojiSize={18}
                  globeIconSize={18}
                />

                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'inherit',
                  }}
                >
                  {displayTitle}
                </span>
              </div>

              {/* Action buttons on hover */}
              {isHovered && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    paddingLeft: '4px',
                    flexShrink: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onToggleFavouriteTab && (
                    <button
                      type="button"
                      title={tab.favourite ? 'Remove favourite' : 'Add to global favourites'}
                      onClick={() => onToggleFavouriteTab(tab.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: tab.favourite ? '#eab308' : 'inherit',
                        cursor: 'pointer',
                        padding: '1px 2px',
                        display: 'flex',
                      }}
                    >
                      <StarIcon size={13} filled={Boolean(tab.favourite)} />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Unpin"
                    onClick={() => onTogglePinTab(tab.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: '1px 2px',
                      display: 'flex',
                    }}
                  >
                    <PinIcon size={13} />
                  </button>
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => onEditTab(tab)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: '1px 2px',
                      display: 'flex',
                    }}
                  >
                    <EditIcon size={12} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => onDeleteTab(tab.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '1px 2px',
                      display: 'flex',
                    }}
                  >
                    <TrashIcon size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
