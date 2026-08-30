'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
import {
  StarIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
} from '../Icons';

export interface FavouriteTabsShelfProps {
  tabs: Tab[];
  onOpenTab?: (url: string) => void;
  onEditTab: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onToggleFavouriteTab: (tabId: string) => void;
  onAddFavouriteTab: () => void;
  onReorderFavouriteTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
}

export const FavouriteTabsShelf: React.FC<FavouriteTabsShelfProps> = ({
  tabs,
  onOpenTab,
  onEditTab,
  onDeleteTab,
  onToggleFavouriteTab,
  onAddFavouriteTab,
  onReorderFavouriteTabs,
}) => {
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
        gap: '10px',
        padding: '14px 16px',
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d4a373',
            }}
          >
            <StarIcon size={16} filled={true} />
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Favourites ({tabs.length})
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
            • Global bookmarks
          </span>
        </div>
        <button
          type="button"
          onClick={onAddFavouriteTab}
          title="Add new global favourite tab"
          style={{
            border: 'none',
            background: 'transparent',
            color: '#0284c7',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '3px 8px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <PlusIcon size={13} />
          <span>Favourite</span>
        </button>
      </div>

      {tabs.length === 0 ? (
        <div
          onClick={onAddFavouriteTab}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '14px',
            borderRadius: '12px',
            border: '1px dashed #cbd5e1',
            backgroundColor: '#f8fafc',
            color: '#64748b',
            fontSize: '13px',
            cursor: 'pointer',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <StarIcon size={14} color="#d4a373" filled={true} />
          <span>No favourite tabs yet. Click to add a favourite accessible across all spaces.</span>
        </div>
      ) : (
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
                      onOpenTab(tab.url);
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
                  backgroundColor: isHovered ? '#f0fdf4' : '#f8fafc',
                  border: isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderLeft: isDragTarget && dropPosition === 'before' ? '3px solid #0284c7' : isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderRight: isDragTarget && dropPosition === 'after' ? '3px solid #0284c7' : isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderRadius: '12px',
                  cursor: 'grab',
                  transition: 'all 0.12s ease',
                  position: 'relative',
                  userSelect: 'none',
                  boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  boxSizing: 'border-box',
                }}
                title={tooltipText}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: isHovered ? '#ffffff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  <TabFavicon
                    url={tab.url}
                    customEmojiIcon={tab.customEmojiIcon}
                    size={32}
                    emojiSize={26}
                    globeIconSize={24}
                    globeIconColor="#64748b"
                    showDomainFallback={true}
                  />
                </div>

                {/* Action buttons on hover */}
                {isHovered && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
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
                        color: '#64748b',
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
                      title="Delete tab"
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
        </div>
      )}
    </div>
  );
};
