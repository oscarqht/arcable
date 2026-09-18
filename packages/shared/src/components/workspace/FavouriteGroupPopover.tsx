'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tab, TabUrlVariant, TabOpenOptions } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import { SpaceThemeTokens } from '../../utils/spaceTheme';
import { TabFavicon } from './TabFavicon';
import { PlusIcon, EditIcon, ExternalLinkIcon, GridViewIcon } from '../Icons';
import { areUrlsMatching } from '../../utils/format';

export interface FavouriteGroupPopoverProps {
  groupTab: Tab;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenItem: (variant: TabUrlVariant, options?: TabOpenOptions) => void;
  onEditGroup?: (tab: Tab) => void;
  onAddItem?: (groupTab: Tab) => void;
  onOpenAll?: (groupTab: Tab) => void;
  onUngroup?: (tabId: string) => void;
  tabAssociations?: TabAssociationMap;
  theme: SpaceThemeTokens;
}

export const FavouriteGroupPopover: React.FC<FavouriteGroupPopoverProps> = ({
  groupTab,
  anchorRect,
  isOpen,
  onClose,
  onOpenItem,
  onEditGroup,
  onAddItem,
  onOpenAll,
  onUngroup,
  tabAssociations,
  theme,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside and Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const variants = (groupTab.urlVariants || []).filter((v) => Boolean(v.url));
  const groupTitle = groupTab.customTitle || 'Group';

  // Popover dimensions & positioning
  const width = 236;
  const estimatedHeight = Math.min(320, 48 + Math.ceil(variants.length / 4) * 52 + 16);
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= estimatedHeight + 10;
  const top = fitsBelow
    ? anchorRect.bottom + 6
    : Math.max(10, anchorRect.top - estimatedHeight - 6);
  const left = Math.min(
    Math.max(10, anchorRect.left + (anchorRect.width - width) / 2),
    Math.max(10, window.innerWidth - width - 10)
  );

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: '340px',
        backgroundColor: theme.isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${theme.borderColor}`,
        borderRadius: '14px',
        boxShadow: theme.isDark
          ? '0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)'
          : '0 12px 32px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
        animation: 'fadeIn 0.12s ease',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${theme.borderColor}`,
          backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        }}
      >
        <span
          title={groupTitle}
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: theme.textColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: '8px',
          }}
        >
          {groupTitle}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onOpenAll && variants.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onOpenAll(groupTab);
                onClose();
              }}
              title="Open all tabs"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: theme.subtextColor,
                cursor: 'pointer',
                transition: 'background-color 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.color = theme.textColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = theme.subtextColor;
              }}
            >
              <ExternalLinkIcon size={13} />
            </button>
          )}

          {onAddItem && (
            <button
              type="button"
              onClick={() => {
                onAddItem(groupTab);
                onClose();
              }}
              title="Add item to group"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: theme.subtextColor,
                cursor: 'pointer',
                transition: 'background-color 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.color = theme.textColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = theme.subtextColor;
              }}
            >
              <PlusIcon size={14} />
            </button>
          )}

          {onEditGroup && (
            <button
              type="button"
              onClick={() => {
                onEditGroup(groupTab);
                onClose();
              }}
              title="Edit group"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: theme.subtextColor,
                cursor: 'pointer',
                transition: 'background-color 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.color = theme.textColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = theme.subtextColor;
              }}
            >
              <EditIcon size={13} />
            </button>
          )}

          {onUngroup && (
            <button
              type="button"
              onClick={() => {
                onUngroup(groupTab.id);
                onClose();
              }}
              title="Ungroup items"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: theme.subtextColor,
                cursor: 'pointer',
                transition: 'background-color 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.color = theme.textColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = theme.subtextColor;
              }}
            >
              <GridViewIcon size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Grid of items */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          padding: '10px',
          overflowY: 'auto',
          maxHeight: '280px',
        }}
      >
        {variants.map((v, idx) => {
          // Check if open in browser via tabAssociations
          let isAssociated = false;
          if (tabAssociations) {
            for (const assoc of Object.values(tabAssociations)) {
              const assocUrl = assoc.currentUrl || assoc.originalUrl;
              if (assocUrl && areUrlsMatching(assocUrl, v.url)) {
                isAssociated = true;
                break;
              }
            }
          }

          const itemTitle = v.name || 'Tab';
          const tooltip = `${itemTitle}\n${v.url}${isAssociated ? ' • Open in browser' : ''}`;

          return (
            <button
              key={v.id || idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
                onOpenItem(v, { inNewTab, event: e });
                onClose();
              }}
              title={tooltip}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                border: `1px solid ${
                  isAssociated
                    ? theme.isDark
                      ? 'rgba(255, 255, 255, 0.18)'
                      : 'rgba(0, 0, 0, 0.12)'
                    : theme.isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.05)'
                }`,
                backgroundColor: isAssociated
                  ? theme.isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(255, 255, 255, 0.85)'
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(0, 0, 0, 0.03)',
                cursor: 'pointer',
                position: 'relative',
                padding: 0,
                transition: 'transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark
                  ? 'rgba(255, 255, 255, 0.14)'
                  : 'rgba(0, 0, 0, 0.08)';
                e.currentTarget.style.borderColor = theme.primaryColor;
                e.currentTarget.style.transform = 'scale(1.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isAssociated
                  ? theme.isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(255, 255, 255, 0.85)'
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(0, 0, 0, 0.03)';
                e.currentTarget.style.borderColor = isAssociated
                  ? theme.isDark
                    ? 'rgba(255, 255, 255, 0.18)'
                    : 'rgba(0, 0, 0, 0.12)'
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <TabFavicon
                url={v.url}
                size={22}
                emojiSize={22}
                globeIconSize={20}
                globeIconColor={theme.subtextColor}
                showDomainFallback={true}
              />

              {/* Active running indicator pill */}
              {isAssociated && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '3px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '12px',
                    height: '2.5px',
                    borderRadius: '9999px',
                    backgroundColor: theme.primaryColor,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
