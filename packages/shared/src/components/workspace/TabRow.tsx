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
  StarIcon,
  EditIcon,
  TrashIcon,
  MinusIcon,
  SlashIcon,
} from '../Icons';

export interface TabRowProps {
  tab: Tab;
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  isAssociated?: boolean;
  isDiverted?: boolean;
  isHighlighted?: boolean;
  badge?: string | number | null;
  onOpen?: (url: string, tabId?: string) => void;
  onCloseAssociatedTab?: () => void;

  onResetDivertedUrl?: () => void;
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
  isAssociated = false,
  isDiverted = false,
  isHighlighted = false,
  badge,
  onOpen,
  onCloseAssociatedTab,
  onResetDivertedUrl,
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
        onOpen(tab.url, tab.id);
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
        dividerAfter: Boolean(onToggleFavourite),
      },
    ];

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
  }, [copied, handleCopyUrl, handleOpenLink, tab, onToggleFavourite, onEdit, onDelete]);

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
  const associatedBg = effectiveDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.075)';
  const hoverBg = isAssociated
    ? (effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)')
    : (effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)');
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
        backgroundColor: isHovered ? hoverBg : isAssociated ? associatedBg : 'transparent',
        borderTop: dropIndicator === 'before' ? '2px solid #0284c7' : '2px solid transparent',
        borderBottom: dropIndicator === 'after' ? '2px solid #0284c7' : '2px solid transparent',
        outline: isHighlighted ? '2px solid #38bdf8' : 'none',
        outlineOffset: isHighlighted ? '-2px' : undefined,
        boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.6), 0 0 8px rgba(56, 189, 248, 0.35)' : 'none',
        color: textColor,
        cursor: 'pointer',
        gap: '6px',
        transition: 'background-color 0.12s ease, outline 0.2s ease, box-shadow 0.2s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Left side: Favicon/Emoji, Diverted icon (if any), Title (Full Width) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {/* Favicon or Custom Emoji */}
        <div
          style={{
            width: '18px',
            height: '18px',
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
            size={18}
            emojiSize={18}
            isDarkTheme={isDarkTheme}
            showDomainFallback={true}
            globeIconSize={18}
            badge={badge}
          />
        </div>

        {/* Diverted "/" icon button when tab has navigated away */}
        {isDiverted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onResetDivertedUrl?.();
            }}
            title="Associated browser tab navigated to a different URL. Click to activate and return to original URL"
            aria-label="Restore original URL"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: effectiveDark ? 'rgba(234, 179, 8, 0.25)' : '#fef08a',
              color: effectiveDark ? '#fde047' : '#a16207',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              transition: 'all 0.12s ease',
            }}
          >
            <SlashIcon size={12} />
          </button>
        )}

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

      {/* Right side: ... action button on hover on the left of - button; - button always visible when associated */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Action Dropdown (...) button on hover */}
        <ActionDropdown
          items={tabMenuItems}
          isDarkTheme={effectiveDark}
          visible={showActions}
          hoverBg={activeIconHoverBg}
          buttonTitle="Tab options"
          size="sm"
        />

        {/* "-" button: Always visible when associated */}
        {isAssociated && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onCloseAssociatedTab?.();
            }}
            title="Close associated browser tab"
            aria-label="Close associated browser tab"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: effectiveDark ? '#94a3b8' : textColor,
              opacity: 0.8,
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              transition: 'background-color 0.12s ease, color 0.12s ease, opacity 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
              e.currentTarget.style.opacity = '0.8';
            }}
          >
            <MinusIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );

};

