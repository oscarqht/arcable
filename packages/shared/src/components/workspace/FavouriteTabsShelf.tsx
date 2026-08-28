'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';
import { getDomain, getFaviconUrl } from '../../utils/treeUtils';
import {
  StarIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  GlobeIcon,
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
        gap: '8px',
        padding: '12px 14px',
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#eab308',
            }}
          >
            <StarIcon size={15} filled={true} />
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
            padding: '2px 8px',
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
            padding: '12px',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            backgroundColor: '#f8fafc',
            color: '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <StarIcon size={14} color="#eab308" filled={true} />
          <span>No favourite tabs yet. Click to add a favourite accessible across all spaces.</span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '8px',
          }}
        >
          {tabs.map((tab) => {
            const isHovered = hoveredTabId === tab.id;
            const isDragTarget = dragOverTabId === tab.id;
            const domain = getDomain(tab.url);
            const favicon = getFaviconUrl(tab.url);
            const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Untitled';

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
                  padding: '6px 8px',
                  backgroundColor: isHovered ? '#f0fdf4' : '#f8fafc',
                  border: isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderLeft: isDragTarget && dropPosition === 'before' ? '3px solid #0284c7' : isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderRight: isDragTarget && dropPosition === 'after' ? '3px solid #0284c7' : isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'grab',
                  transition: 'all 0.12s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  userSelect: 'none',
                  boxShadow: isHovered ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                }}
                title={`${displayTitle}\n${tab.url} (Favourite - Drag to reorder)`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      backgroundColor: isHovered ? '#ffffff' : '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {tab.customEmojiIcon ? (
                      <span style={{ fontSize: '13px', lineHeight: 1 }}>{tab.customEmojiIcon}</span>
                    ) : favicon ? (
                      <img
                        src={favicon}
                        alt=""
                        style={{ width: '14px', height: '14px', objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <GlobeIcon size={12} color="#64748b" />
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#0f172a',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
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
                    <button
                      type="button"
                      title="Remove from favourites"
                      onClick={() => onToggleFavouriteTab(tab.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#eab308',
                        cursor: 'pointer',
                        padding: '1px 2px',
                        display: 'flex',
                      }}
                    >
                      <StarIcon size={12} filled={true} />
                    </button>
                    <button
                      type="button"
                      title="Edit tab"
                      onClick={() => onEditTab(tab)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '1px 2px',
                        display: 'flex',
                      }}
                    >
                      <EditIcon size={11} />
                    </button>
                    <button
                      type="button"
                      title="Delete tab"
                      onClick={() => onDeleteTab(tab.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '1px 2px',
                        display: 'flex',
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
