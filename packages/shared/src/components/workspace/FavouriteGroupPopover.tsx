'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Tab,
  TabUrlVariant,
  TabOpenOptions,
  WorkspaceWidget,
  WidgetStyle,
  WidgetSize,
} from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import { SpaceThemeTokens } from '../../utils/spaceTheme';
import { TabFavicon } from './TabFavicon';
import {
  PlusIcon,
  EditIcon,
  ExternalLinkIcon,
  GridViewIcon,
  MinusIcon,
  TrashIcon,
} from '../Icons';
import { startDrag, endDrag } from '../../utils/dragState';
import { WidgetTileContent, buildClockInfo, NOTE_COLORS } from './widgets';

export interface FavouriteGroupPopoverProps {
  groupTab: Tab;
  childWidgets?: WorkspaceWidget[];
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenItem: (variant: TabUrlVariant, options?: TabOpenOptions) => void;
  onEditGroup?: (tab: Tab) => void;
  onAddItem?: (groupTab: Tab) => void;
  onAddWidget?: (widget: { style: WidgetStyle; size: WidgetSize; config?: Record<string, any> }) => void;
  onExtractWidget?: (widgetId: string) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onOpenWidget?: (widget: WorkspaceWidget, anchorRect: DOMRect) => void;
  onOpenAll?: (groupTab: Tab) => void;
  onUngroup?: (tabId: string) => void;
  tabAssociations?: TabAssociationMap;
  highlightedTabId?: string | null;
  onCloseAssociatedTab?: (tabId: string) => void;
  onReorderVariant?: (
    groupTabId: string,
    sourceItemId: string,
    targetItemId: string,
    position: 'before' | 'after'
  ) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  theme: SpaceThemeTokens;
}

export function renderMiniWidgetIcon(style: WidgetStyle, size: number = 22) {
  switch (style) {
    case 'digital':
    case 'analog':
    case 'combo':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>🕒</span>;
    case 'calendar':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>📅</span>;
    case 'weather':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>🌤️</span>;
    case 'pomodoro':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>🍅</span>;
    case 'note':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>📝</span>;
    case 'countdown':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>⏳</span>;
    case 'search':
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>🔍</span>;
    default:
      return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>🧩</span>;
  }
}

export const FavouriteGroupPopover: React.FC<FavouriteGroupPopoverProps> = ({
  groupTab,
  childWidgets = [],
  anchorRect,
  isOpen,
  onClose,
  onOpenItem,
  onEditGroup,
  onAddItem,
  onAddWidget,
  onExtractWidget,
  onRemoveWidget,
  onOpenWidget,
  onOpenAll,
  onUngroup,
  tabAssociations,
  highlightedTabId,
  onCloseAssociatedTab,
  onReorderVariant,
  onMouseEnter,
  onMouseLeave,
  theme,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('after');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);
  const clockInfo = useMemo(() => buildClockInfo(now), [now]);

  const variants = useMemo(
    () => (groupTab.urlVariants || []).filter((v) => Boolean(v.url)),
    [groupTab.urlVariants]
  );

  const items = useMemo(() => {
    const list: Array<
      | { type: 'tab'; id: string; variant: TabUrlVariant }
      | { type: 'widget'; id: string; widget: WorkspaceWidget }
    > = [];
    const knownIds = new Set<string>();

    if (groupTab.groupItemOrder && groupTab.groupItemOrder.length > 0) {
      for (const entry of groupTab.groupItemOrder) {
        if (entry.type === 'tab') {
          const v = variants.find((variant) => variant.id === entry.id);
          if (v) {
            list.push({ type: 'tab', id: v.id, variant: v });
            knownIds.add(v.id);
          }
        } else if (entry.type === 'widget') {
          const w = childWidgets.find((widget) => widget.id === entry.id);
          if (w) {
            list.push({ type: 'widget', id: w.id, widget: w });
            knownIds.add(w.id);
          }
        }
      }
    }

    // Append any variants not yet in list
    for (const v of variants) {
      if (!knownIds.has(v.id)) {
        list.push({ type: 'tab', id: v.id, variant: v });
        knownIds.add(v.id);
      }
    }
    // Append any child widgets not yet in list
    for (const w of childWidgets) {
      if (!knownIds.has(w.id)) {
        list.push({ type: 'widget', id: w.id, widget: w });
        knownIds.add(w.id);
      }
    }

    return list;
  }, [groupTab.groupItemOrder, variants, childWidgets]);

  const handleDragStart = (e: React.DragEvent, id: string, type: 'tab' | 'widget') => {
    e.stopPropagation();
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Allow dragging out of popover onto the root Favourite Shelf
    startDrag(e, { id, type: type === 'widget' ? 'widget' : 'favTab' });
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedItemId || draggedItemId === targetId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const pos = relX < rect.width / 2 ? 'before' : 'after';

    if (dragOverItemId !== targetId || dropPosition !== pos) {
      setDragOverItemId(targetId);
      setDropPosition(pos);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      setDragOverItemId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggedItemId;
    const pos = dropPosition;
    setDraggedItemId(null);
    setDragOverItemId(null);
    endDrag();

    if (sourceId && sourceId !== targetId && onReorderVariant) {
      onReorderVariant(groupTab.id, sourceId, targetId, pos);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
    endDrag();
  };

  // Click outside and Escape key to close popover or add menu
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddMenuOpen) {
          setIsAddMenuOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isAddMenuOpen]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const groupTitle = groupTab.customTitle || 'Group';

  // Popover dimensions & positioning
  const width = 236;
  const estimatedHeight = Math.min(320, 48 + Math.ceil(items.length / 4) * 52 + 16);
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
          position: 'relative',
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

          {/* Add Button with Menu */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsAddMenuOpen((prev) => !prev)}
              title="Add to group"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: isAddMenuOpen
                  ? (theme.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                  : 'transparent',
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
                if (!isAddMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = theme.subtextColor;
                }
              }}
            >
              <PlusIcon size={14} />
            </button>

            {/* Add Dropdown Menu */}
            {isAddMenuOpen && (
              <div
                ref={addMenuRef}
                style={{
                  position: 'absolute',
                  top: '28px',
                  right: 0,
                  width: '145px',
                  backgroundColor: theme.isDark ? '#0f172a' : '#ffffff',
                  border: `1px solid ${theme.borderColor}`,
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
                  padding: '4px',
                  zIndex: 100001,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {onAddItem && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      onAddItem(groupTab);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: theme.textColor,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span>🌐</span>
                    <span>Add Tab</span>
                  </button>
                )}

                {onAddWidget && (
                  <>
                    <div
                      style={{
                        height: '1px',
                        backgroundColor: theme.borderColor,
                        margin: '2px 0',
                      }}
                    />
                    {[
                      { style: 'digital' as const, label: 'Digital Clock', icon: '🕒' },
                      { style: 'analog' as const, label: 'Analog Clock', icon: '🕰️' },
                      { style: 'calendar' as const, label: 'Calendar', icon: '📅' },
                      { style: 'weather' as const, label: 'Weather', icon: '🌤️' },
                      { style: 'pomodoro' as const, label: 'Pomodoro', icon: '🍅' },
                      { style: 'note' as const, label: 'Sticky Note', icon: '📝' },
                      { style: 'countdown' as const, label: 'Countdown', icon: '⏳' },
                      { style: 'search' as const, label: 'Quick Search', icon: '🔍' },
                    ].map((wItem) => (
                      <button
                        key={wItem.style}
                        type="button"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          onAddWidget({ style: wItem.style, size: 'small' });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'transparent',
                          color: theme.textColor,
                          fontSize: '12px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span>{wItem.icon}</span>
                        <span>{wItem.label}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

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
        {items.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '24px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              color: theme.subtextColor,
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            <span>No items in this group</span>
            {onUngroup && (
              <button
                type="button"
                onClick={() => {
                  onUngroup(groupTab.id);
                  onClose();
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: `1px solid ${theme.isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)'}`,
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background-color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)';
                }}
              >
                Delete Empty Group
              </button>
            )}
          </div>
        ) : (
          items.map((item) => {
            const isDragged = draggedItemId === item.id;
            const isDragOver = dragOverItemId === item.id;
            const isHovered = hoveredItemId === item.id;

            if (item.type === 'tab') {
            const v = item.variant;
            const itemAssoc = v.id && tabAssociations ? tabAssociations[v.id] : undefined;
            const isAssociated = Boolean(itemAssoc);
            const isItemHighlighted = Boolean(
              highlightedTabId && (
                v.id === highlightedTabId ||
                (itemAssoc && tabAssociations && tabAssociations[highlightedTabId]?.browserTabId === itemAssoc.browserTabId)
              )
            );

            const itemTitle = v.name || 'Tab';
            const tooltip = `${itemTitle}\n${v.url}${isAssociated ? ' • Open in browser' : ''}`;

            return (
              <button
                key={item.id}
                type="button"
                draggable={Boolean(onReorderVariant)}
                onDragStart={(e) => handleDragStart(e, item.id, 'tab')}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  e.stopPropagation();
                  const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
                  onOpenItem(v, { inNewTab, event: e });
                  if (!e.ctrlKey && !e.metaKey) {
                    onClose();
                  }
                }}
                title={tooltip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  opacity: isDragged ? 0.35 : 1,
                  border: isItemHighlighted
                    ? `1.5px solid ${theme.primaryColor}`
                    : `1px solid ${
                        isAssociated
                          ? theme.isDark
                            ? 'rgba(255, 255, 255, 0.18)'
                            : 'rgba(0, 0, 0, 0.12)'
                          : theme.isDark
                          ? 'rgba(255, 255, 255, 0.06)'
                          : 'rgba(0, 0, 0, 0.05)'
                      }`,
                  backgroundColor: isItemHighlighted
                    ? theme.isDark
                      ? 'rgba(255, 255, 255, 0.16)'
                      : 'rgba(255, 255, 255, 0.95)'
                    : isAssociated
                    ? theme.isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(255, 255, 255, 0.85)'
                    : theme.isDark
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'rgba(0, 0, 0, 0.03)',
                  boxShadow: isItemHighlighted
                    ? `0 0 8px ${theme.primaryColor}55`
                    : 'none',
                  cursor: onReorderVariant ? 'grab' : 'pointer',
                  position: 'relative',
                  padding: 0,
                  transition: 'transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  setHoveredItemId(item.id);
                  e.currentTarget.style.backgroundColor = theme.isDark
                    ? 'rgba(255, 255, 255, 0.14)'
                    : 'rgba(0, 0, 0, 0.08)';
                  e.currentTarget.style.borderColor = theme.primaryColor;
                  e.currentTarget.style.transform = 'scale(1.06)';
                }}
                onMouseLeave={(e) => {
                  setHoveredItemId(null);
                  e.currentTarget.style.backgroundColor = isItemHighlighted
                    ? theme.isDark
                      ? 'rgba(255, 255, 255, 0.16)'
                      : 'rgba(255, 255, 255, 0.95)'
                    : isAssociated
                    ? theme.isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(255, 255, 255, 0.85)'
                    : theme.isDark
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'rgba(0, 0, 0, 0.03)';
                  e.currentTarget.style.borderColor = isItemHighlighted
                    ? theme.primaryColor
                    : isAssociated
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
                  favIconUrl={v.favIconUrl || tabAssociations?.[item.id]?.favIconUrl || tabAssociations?.[v.id]?.favIconUrl}
                  customEmojiIcon={v.customEmojiIcon}
                  size={22}
                  emojiSize={22}
                  globeIconSize={20}
                  globeIconColor={theme.subtextColor}
                  showDomainFallback={true}
                />

                {/* Drop indicator bar */}
                {isDragOver && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      bottom: '3px',
                      left: dropPosition === 'before' ? '-4px' : 'auto',
                      right: dropPosition === 'after' ? '-4px' : 'auto',
                      width: '3px',
                      backgroundColor: theme.primaryColor,
                      borderRadius: '2px',
                      boxShadow: `0 0 4px ${theme.primaryColor}`,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Minus (-) button on hover if associated */}
                {isAssociated && onCloseAssociatedTab && isHovered && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const targetId = v.id || itemAssoc?.tabItemId;
                      if (targetId) {
                        onCloseAssociatedTab(targetId);
                      }
                    }}
                    title="Close associated browser tab"
                    aria-label="Close associated browser tab"
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: theme.isDark ? '#334155' : '#e2e8f0',
                      color: theme.isDark ? '#f1f5f9' : '#0f172a',
                      border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 10,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                      transition: 'transform 0.1s ease, background-color 0.1s ease, color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      e.currentTarget.style.backgroundColor = '#ef4444';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.backgroundColor = theme.isDark ? '#334155' : '#e2e8f0';
                      e.currentTarget.style.color = theme.isDark ? '#f1f5f9' : '#0f172a';
                    }}
                  >
                    <MinusIcon size={11} strokeWidth={2.8} />
                  </span>
                )}

                {/* Active running indicator pill */}
                {isAssociated && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '3px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isItemHighlighted ? '16px' : '12px',
                      height: '2.5px',
                      borderRadius: '9999px',
                      backgroundColor: isItemHighlighted
                        ? theme.activeIndicatorColor
                        : (theme.isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)'),
                      boxShadow: isItemHighlighted ? theme.activeIndicatorGlow : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  />
                )}
              </button>
            );
          }

          // Widget Item
          const w = item.widget;
          const noteColorConfig = w.style === 'note'
            ? NOTE_COLORS.find((c) => c.key === (w.config as any)?.colorTheme) || NOTE_COLORS[0]
            : null;
          const widgetTitle =
            (w.config as any)?.title ||
            w.style.charAt(0).toUpperCase() + w.style.slice(1);
          const tooltip = `${widgetTitle} (Widget)\nClick to open • Drag to reorder or move to shelf`;

          return (
            <button
              key={item.id}
              type="button"
              draggable={Boolean(onReorderVariant)}
              onDragStart={(e) => handleDragStart(e, item.id, 'widget')}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                if (onOpenWidget) {
                  onOpenWidget(w, rect);
                  onClose();
                }
              }}
              title={tooltip}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                opacity: isDragged ? 0.35 : 1,
                border: `1px solid ${
                  noteColorConfig
                    ? theme.isDark ? noteColorConfig.borderDark : noteColorConfig.borderLight
                    : theme.isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.07)'
                }`,
                backgroundColor: noteColorConfig
                  ? theme.isDark ? noteColorConfig.bgDark : noteColorConfig.bgLight
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(0, 0, 0, 0.03)',
                cursor: onReorderVariant ? 'grab' : 'pointer',
                position: 'relative',
                padding: 0,
                transition: 'transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                setHoveredItemId(item.id);
                e.currentTarget.style.backgroundColor = noteColorConfig
                  ? theme.isDark ? noteColorConfig.bgDark : noteColorConfig.bgLight
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.14)'
                  : 'rgba(0, 0, 0, 0.08)';
                e.currentTarget.style.borderColor = theme.primaryColor;
                e.currentTarget.style.transform = 'scale(1.06)';
              }}
              onMouseLeave={(e) => {
                setHoveredItemId(null);
                e.currentTarget.style.backgroundColor = noteColorConfig
                  ? theme.isDark ? noteColorConfig.bgDark : noteColorConfig.bgLight
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(0, 0, 0, 0.03)';
                e.currentTarget.style.borderColor = noteColorConfig
                  ? theme.isDark ? noteColorConfig.borderDark : noteColorConfig.borderLight
                  : theme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.07)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <WidgetTileContent
                widget={w}
                theme={theme}
                clockInfo={clockInfo}
                now={now}
                mode="full"
                compact={true}
              />

              {/* Drop indicator bar */}
              {isDragOver && (
                <span
                  style={{
                    position: 'absolute',
                    top: '3px',
                    bottom: '3px',
                    left: dropPosition === 'before' ? '-4px' : 'auto',
                    right: dropPosition === 'after' ? '-4px' : 'auto',
                    width: '3px',
                    backgroundColor: theme.primaryColor,
                    borderRadius: '2px',
                    boxShadow: `0 0 4px ${theme.primaryColor}`,
                    zIndex: 20,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Actions on hover: Extract to shelf and Delete */}
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    zIndex: 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onExtractWidget && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onExtractWidget(w.id);
                      }}
                      title="Move to shelf"
                      aria-label="Move to shelf"
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: theme.isDark ? '#334155' : '#e2e8f0',
                        color: theme.isDark ? '#f1f5f9' : '#0f172a',
                        border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                        fontSize: '10px',
                        transition: 'transform 0.1s ease, background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.backgroundColor = theme.primaryColor;
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = theme.isDark ? '#334155' : '#e2e8f0';
                        e.currentTarget.style.color = theme.isDark ? '#f1f5f9' : '#0f172a';
                      }}
                    >
                      ↗
                    </span>
                  )}

                  {onRemoveWidget && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onRemoveWidget(w.id);
                      }}
                      title="Delete widget"
                      aria-label="Delete widget"
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: theme.isDark ? '#334155' : '#e2e8f0',
                        color: theme.isDark ? '#f1f5f9' : '#0f172a',
                        border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                        transition: 'transform 0.1s ease, background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.backgroundColor = '#ef4444';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = theme.isDark ? '#334155' : '#e2e8f0';
                        e.currentTarget.style.color = theme.isDark ? '#f1f5f9' : '#0f172a';
                      }}
                    >
                      <TrashIcon size={10} />
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })
      )}
      </div>
    </div>,
    document.body
  );
};
