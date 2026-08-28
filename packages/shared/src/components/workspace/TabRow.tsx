'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';

interface TabRowProps {
  tab: Tab;
  onOpen?: (url: string) => void;
  onEdit: (tab: Tab) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  compact?: boolean;
}

export const TabRow: React.FC<TabRowProps> = ({
  tab,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
  compact = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpen) {
      onOpen(tab.url);
    } else {
      window.open(tab.url, '_blank', 'noopener,noreferrer');
    }
  };

  const displayTitle = tab.customTitle || cleanUrl(tab.url) || 'Untitled Tab';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: compact ? '6px 8px' : '8px 12px',
        backgroundColor: isHovered ? '#f1f5f9' : '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        transition: 'all 0.12s ease',
        cursor: 'pointer',
        gap: '8px',
      }}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
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
          gap: '4px',
          opacity: isHovered ? 1 : 0.4,
          transition: 'opacity 0.15s ease',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pin toggle */}
        <button
          title={tab.pinned ? 'Unpin tab' : 'Pin to top shelf'}
          onClick={() => onTogglePin(tab.id)}
          style={{
            border: 'none',
            background: tab.pinned ? '#fef3c7' : 'transparent',
            borderRadius: '4px',
            padding: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            color: tab.pinned ? '#d97706' : '#64748b',
          }}
        >
          📌
        </button>

        {/* Edit */}
        <button
          title="Edit tab"
          onClick={() => onEdit(tab)}
          style={{
            border: 'none',
            background: 'transparent',
            borderRadius: '4px',
            padding: '4px',
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
            padding: '4px',
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
