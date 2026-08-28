'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
import {
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PinIcon,
  StarIcon,
  EditIcon,
  TrashIcon,
  DragHandleIcon,
} from '../Icons';

export interface TabRowProps {
  tab: Tab;
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
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
}

export const TabRow: React.FC<TabRowProps> = ({
  tab,
  isDarkTheme = false,
  compact = false,
  alwaysShowActions = false,
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
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<'before' | 'after' | null>(null);

  const domain = getDomain(tab.url);
  const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Untitled Tab';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tab.url) {
      if (onOpen) {
        onOpen(tab.url);
      } else {
        window.open(tab.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab.url) {
      navigator.clipboard.writeText(tab.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab.url) {
      if (onOpen) {
        onOpen(tab.url);
      } else {
        window.open(tab.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
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

  // Color tokens
  const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)';
  const activeIconHoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = isDarkTheme ? '#ffffff' : '#191c1b';
  const showActions = alwaysShowActions || isHovered;

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
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '36px',
        padding: '0 8px 0 10px',
        borderRadius: '8px',
        backgroundColor: isHovered ? hoverBg : 'transparent',
        borderTop: dropIndicator === 'before' ? '2px solid #0284c7' : '2px solid transparent',
        borderBottom: dropIndicator === 'after' ? '2px solid #0284c7' : '2px solid transparent',
        color: textColor,
        cursor: 'pointer',
        gap: '8px',
        transition: 'background-color 0.12s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Left side: Favicon/Emoji or Drag handle on hover, Title (Full Width) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {/* Favicon or Custom Emoji normally, Drag Handle on hover */}
        <div
          style={{
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {isHovered ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.6,
                cursor: 'grab',
                color: 'inherit',
              }}
              title="Drag to reorder"
            >
              <DragHandleIcon size={14} />
            </span>
          ) : (
            <TabFavicon
              url={tab.url}
              customEmojiIcon={tab.customEmojiIcon}
              size={16}
              emojiSize={14}
              isDarkTheme={isDarkTheme}
              showDomainFallback={true}
              globeIconSize={14}
            />
          )}
        </div>

        {/* Title taking 100% available width */}
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={displayTitle}
        >
          {displayTitle}
        </span>
      </div>

      {/* Right side: Action Buttons (Only takes width when hovered or alwaysShowActions) */}
      {showActions && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            flexShrink: 0,
            marginLeft: '4px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Copy URL */}
          <button
            type="button"
            onClick={handleCopyUrl}
            title="Copy URL"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {copied ? <CheckIcon size={14} color="#10b981" /> : <CopyIcon size={14} />}
          </button>

          {/* Open in new tab */}
          <button
            type="button"
            onClick={handleOpenLink}
            title="Open in new tab"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ExternalLinkIcon size={14} />
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => onEdit(tab)}
            title="Edit tab"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <EditIcon size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
