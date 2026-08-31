'use client';

import React, { useState, useMemo } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PinIcon,
  StarIcon,
  EditIcon,
  TrashIcon,
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
  isDarkTheme,
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
  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
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

  const tabMenuItems: ActionDropdownItem[] = useMemo(() => {
    const items: ActionDropdownItem[] = [
      {
        id: 'copy-url',
        label: copied ? 'Copied URL!' : 'Copy URL',
        icon: copied ? <CheckIcon size={15} color="#10b981" /> : <CopyIcon size={15} />,
        onClick: handleCopyUrl,
      },
      {
        id: 'open-tab',
        label: 'Open in new tab',
        icon: <ExternalLinkIcon size={15} />,
        onClick: handleOpenLink,
        dividerAfter: Boolean(onTogglePin || onToggleFavourite),
      },
    ];

    if (onTogglePin) {
      items.push({
        id: 'toggle-pin',
        label: tab.pinned ? 'Unpin tab' : 'Pin tab',
        icon: <PinIcon size={14} filled={Boolean(tab.pinned)} />,
        onClick: () => onTogglePin(tab.id),
      });
    }

    if (onToggleFavourite) {
      items.push({
        id: 'toggle-fav',
        label: tab.favourite ? 'Remove favourite' : 'Add to favourites',
        icon: <StarIcon size={14} filled={Boolean(tab.favourite)} color={tab.favourite ? '#eab308' : 'currentColor'} />,
        onClick: () => onToggleFavourite(tab.id),
        dividerAfter: Boolean(onEdit || onDelete),
      });
    }

    if (onEdit) {
      items.push({
        id: 'edit-tab',
        label: 'Edit tab',
        icon: <EditIcon size={14} />,
        onClick: () => onEdit(tab),
      });
    }

    if (onDelete) {
      items.push({
        id: 'delete-tab',
        label: 'Delete tab',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => onDelete(tab.id),
      });
    }

    return items;
  }, [copied, handleCopyUrl, handleOpenLink, onTogglePin, tab, onToggleFavourite, onEdit, onDelete]);

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
  const hoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)';
  const activeIconHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';
  const showActions = isMobile || alwaysShowActions || isHovered;

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
        height: '38px',
        minHeight: '38px',
        padding: '0 8px',
        borderRadius: '10px',
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
      {/* Left side: Drag handle on hover / spacer, Favicon/Emoji, Title (Full Width) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {/* Favicon or Custom Emoji (Always visible, matching FolderIcon position) */}
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
          <TabFavicon
            url={tab.url}
            customEmojiIcon={tab.customEmojiIcon}
            size={20}
            emojiSize={18}
            isDarkTheme={isDarkTheme}
            showDomainFallback={true}
            globeIconSize={18}
          />
        </div>

        {/* Title taking 100% available width */}
        <span
          style={{
            fontSize: '14px',
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

      {/* Right side: Action Dropdown (Only takes width when hovered or alwaysShowActions) */}
      <ActionDropdown
        items={tabMenuItems}
        isDarkTheme={effectiveDark}
        visible={showActions}
        hoverBg={activeIconHoverBg}
        buttonTitle="Tab options"
        size="sm"
      />
    </div>
  );
};
