'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';

interface PinnedTabsShelfProps {
  tabs: Tab[];
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
  onOpenTab,
  onEditTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onAddPinnedTab,
  onReorderPinnedTabs,
}) => {
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

      if (onReorderPinnedTabs) {
        onReorderPinnedTabs(parsed.id, targetTabId, pos);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px',
        backgroundColor: '#f8fafc',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>📌</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pinned ({tabs.length})
          </span>
        </div>
        <button
          onClick={onAddPinnedTab}
          title="Add new pinned tab"
          style={{
            border: 'none',
            background: 'none',
            color: '#0284c7',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          + Pin Tab
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '6px',
        }}
      >
        {tabs.map((tab) => {
          const isHovered = hoveredTabId === tab.id;
          const isDragTarget = dragOverTabId === tab.id;
          const displayTitle = tab.customTitle || cleanUrl(tab.url);

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
                if (onOpenTab) {
                  onOpenTab(tab.url);
                } else {
                  window.open(tab.url, '_blank', 'noopener,noreferrer');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                backgroundColor: isHovered ? '#e2e8f0' : '#ffffff',
                border: '1px solid #cbd5e1',
                borderLeft: isDragTarget && dropPosition === 'before' ? '3px solid #0284c7' : '1px solid #cbd5e1',
                borderRight: isDragTarget && dropPosition === 'after' ? '3px solid #0284c7' : '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'grab',
                transition: 'all 0.12s ease',
                position: 'relative',
                overflow: 'hidden',
                userSelect: 'none',
              }}
              title={`${displayTitle}\n${tab.url} (Drag to reorder)`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{tab.customEmojiIcon || '🌐'}</span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#0f172a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
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
                    backgroundColor: '#e2e8f0',
                    paddingLeft: '4px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onToggleFavouriteTab && (
                    <button
                      title="Add to favourites (global)"
                      onClick={() => onToggleFavouriteTab(tab.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '1px 2px',
                      }}
                    >
                      ⭐
                    </button>
                  )}
                  <button
                    title="Unpin"
                    onClick={() => onTogglePinTab(tab.id)}
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '1px 2px',
                    }}
                  >
                    📍
                  </button>
                  <button
                    title="Edit"
                    onClick={() => onEditTab(tab)}
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '1px 2px',
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    title="Delete"
                    onClick={() => onDeleteTab(tab.id)}
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '1px 2px',
                    }}
                  >
                    🗑️
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
