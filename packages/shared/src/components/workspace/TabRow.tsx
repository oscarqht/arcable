'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';

interface TabRowProps {
  tab: Tab;
  onOpen?: (url: string) => void;
  onEdit: (tab: Tab) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleFavourite?: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  draggable?: boolean;
  onDragStartItem?: (e: React.DragEvent, tab: Tab) => void;
  onDragOverItem?: (e: React.DragEvent, tab: Tab) => void;
  onDropItem?: (e: React.DragEvent, tab: Tab) => void;
  onDragEndItem?: (e: React.DragEvent) => void;
  compact?: boolean;
}

export const TabRow: React.FC<TabRowProps> = ({
  tab,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleFavourite,
  onMoveUp,
  onMoveDown,
  draggable = true,
  onDragStartItem,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
  compact = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<'before' | 'after' | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpen) {
      onOpen(tab.url);
    } else {
      window.open(tab.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        id: tab.id,
        type: 'tab',
        parentFolderId: tab.parentFolderId,
        parentSpaceId: tab.parentSpaceId,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
    if (onDragStartItem) {
      onDragStartItem(e, tab);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'before' : 'after';
    setDropIndicator(pos);

    if (onDragOverItem) {
      onDragOverItem(e, tab);
    }
  };

  const handleDragLeave = () => {
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropIndicator(null);
    if (onDropItem) {
      onDropItem(e, tab);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDropIndicator(null);
    if (onDragEndItem) {
      onDragEndItem(e);
    }
  };

  const displayTitle = tab.customTitle || cleanUrl(tab.url) || 'Untitled Tab';

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setDropIndicator(null);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: compact ? '6px 8px' : '8px 12px',
        backgroundColor: isHovered ? '#f1f5f9' : '#ffffff',
        border: '1px solid #e2e8f0',
        borderTop: dropIndicator === 'before' ? '2px solid #0284c7' : '1px solid #e2e8f0',
        borderBottom: dropIndicator === 'after' ? '2px solid #0284c7' : '1px solid #e2e8f0',
        borderRadius: '8px',
        transition: 'all 0.12s ease',
        cursor: 'grab',
        gap: '8px',
        position: 'relative',
        userSelect: 'none',
      }}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
        {/* Drag handle */}
        <span
          style={{
            fontSize: '12px',
            color: isHovered ? '#94a3b8' : 'transparent',
            cursor: 'grab',
            lineHeight: 1,
            userSelect: 'none',
            transition: 'color 0.12s ease',
          }}
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Emoji or Icon */}
        <span
          style={{
            fontSize: compact ? '14px' : '16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            backgroundColor: '#f8fafc',
            flexShrink: 0,
          }}
        >
          {tab.customEmojiIcon || '🌐'}
        </span>

        {/* Title and URL */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: compact ? '12px' : '13px',
              fontWeight: 500,
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={displayTitle}
          >
            {displayTitle}
          </div>
          {!compact && (
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={tab.url}
            >
              {tab.url}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          opacity: isHovered ? 1 : 0.3,
          transition: 'opacity 0.15s ease',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Reorder Up/Down buttons */}
        {onMoveUp && (
          <button
            title="Move up"
            onClick={onMoveUp}
            style={{
              border: 'none',
              background: 'transparent',
              borderRadius: '4px',
              padding: '2px 4px',
              fontSize: '10px',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ▲
          </button>
        )}
        {onMoveDown && (
          <button
            title="Move down"
            onClick={onMoveDown}
            style={{
              border: 'none',
              background: 'transparent',
              borderRadius: '4px',
              padding: '2px 4px',
              fontSize: '10px',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ▼
          </button>
        )}

        {/* Favourite toggle */}
        {onToggleFavourite && (
          <button
            title={tab.favourite ? 'Remove from favourites' : 'Add to favourites (global)'}
            onClick={() => onToggleFavourite(tab.id)}
            style={{
              border: 'none',
              background: tab.favourite ? '#fef3c7' : 'transparent',
              borderRadius: '4px',
              padding: '3px 4px',
              fontSize: '12px',
              cursor: 'pointer',
              color: tab.favourite ? '#eab308' : '#64748b',
            }}
          >
            ⭐
          </button>
        )}

        {/* Pin toggle */}
        {onTogglePin && !tab.favourite && (
          <button
            title={tab.pinned ? 'Unpin tab' : 'Pin to top shelf'}
            onClick={() => onTogglePin(tab.id)}
            style={{
              border: 'none',
              background: tab.pinned ? '#fef3c7' : 'transparent',
              borderRadius: '4px',
              padding: '3px 4px',
              fontSize: '12px',
              cursor: 'pointer',
              color: tab.pinned ? '#d97706' : '#64748b',
            }}
          >
            📌
          </button>
        )}

        {/* Edit */}
        <button
          title="Edit tab"
          onClick={() => onEdit(tab)}
          style={{
            border: 'none',
            background: 'transparent',
            borderRadius: '4px',
            padding: '3px 4px',
            fontSize: '12px',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          ✏️
        </button>

        {/* Delete */}
        <button
          title="Delete tab"
          onClick={() => onDelete(tab.id)}
          style={{
            border: 'none',
            background: 'transparent',
            borderRadius: '4px',
            padding: '3px 4px',
            fontSize: '12px',
            cursor: 'pointer',
            color: '#ef4444',
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
};
