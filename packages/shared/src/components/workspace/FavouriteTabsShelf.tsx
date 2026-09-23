'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Tab,
  TabUrlVariant,
  TabOpenOptions,
  WorkspaceWidget,
  WidgetStyle,
  WidgetSize,
  PomodoroConfig,
  CountdownConfig,
  NoteConfig,
  WeatherConfig,
  SearchConfig,
} from '../../types/workspace';
import { TabAssociationMap, AudibleTab } from '../../types/tabTracker';
import { cleanUrl } from '../../utils/format';
import { buildReplaceWithCurrentUrlMenuItem } from '../../utils/tabUtils';
import { getDomain } from '../../utils/treeUtils';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { TabFavicon } from './TabFavicon';
import { SpaceThemeTokens, getSpaceThemeStyles } from '../../utils/spaceTheme';
import { CLEAR_HOVER_EVENT } from '../../utils/mouseTracker';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useWeatherAutoFetch } from '../../hooks/useWeatherAutoFetch';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import { FavouriteGroupPopover, renderMiniWidgetIcon } from './FavouriteGroupPopover';
import {
  StarIcon,
  PlusIcon,
  EditIcon,
  DuplicateIcon,
  TrashIcon,
  ArchiveIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  MinusIcon,
  SlashIcon,
  GlobeIcon,
  GridViewIcon,
} from '../Icons';
import {
  PomodoroPopover,
  CountdownPopover,
  StickyNotePopover,
  WeatherPopover,
  QuickSearchPopover,
  NOTE_COLORS,
  WidgetTileContent,
  ClockInfo,
  buildClockInfo,
} from './widgets';
import { getWeatherInterpretation } from '../../utils/weatherService';
import { calculateCountdownStatus, createDefaultCountdownConfig } from '../../utils/countdown';

export interface FavouriteTabsShelfProps {
  tabs: Tab[];
  widgets?: WorkspaceWidget[];
  tabAssociations?: TabAssociationMap;
  highlightedTabId?: string | null;
  onOpenTab?: (url: string, tabId?: string, options?: TabOpenOptions) => void;
  onOpenTmpTab?: (url: string, title?: string) => void;
  onCloseAssociatedTab?: (tabId: string) => void;
  onResetDivertedUrl?: (tabId: string) => void;
  audibleTabs?: AudibleTab[];
  onToggleTabMute?: (tabId: number, muted?: boolean) => void;
  onEditTab: (tab: Tab) => void;
  onDuplicateTab?: (tab: Tab) => void;
  onArchiveTab?: (tabId: string) => void;
  onDeleteTab: (tabId: string) => void;
  onToggleFavouriteTab: (tabId: string) => void;
  onAddFavouriteTab: () => void;
  onAddFavouriteGroup?: () => void;
  onMergeFavouriteTabs?: (sourceTabId: string, targetTabId: string) => void;
  onUngroupTab?: (tabId: string) => void;
  onOpenVariant?: (url: string, tab: Tab, variant: TabUrlVariant, options?: TabOpenOptions) => void;
  onReplaceTabUrl?: (tab: Tab, targetVariantId?: string) => void | Promise<void>;
  onAddWidget?: (widget: { style: WidgetStyle; size: WidgetSize; config?: Record<string, any>; parentGroupId?: string }) => WorkspaceWidget | void;
  onUpdateWidget?: (id: string, updates: Partial<WorkspaceWidget>) => void;
  onRemoveWidget?: (id: string) => void;
  onMoveWidgetToGroup?: (widgetId: string, targetGroupId: string) => void;
  onExtractWidgetFromGroup?: (widgetId: string, targetOrder?: number) => void;
  onReorderFavouriteItem?: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  onReorderFavouriteTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
  onReorderGroupVariants?: (groupTabId: string, sourceVariantId: string, targetVariantId: string, position: 'before' | 'after') => void;
  onActivateGroup?: (groupTab: Tab) => boolean | Promise<boolean>;
  /** Raindrop collection that contains global favourites. */
  raindropRootCollectionId?: number;
  themeStyles?: SpaceThemeTokens;
}

export type ShelfItem =
  | { type: 'tab'; id: string; tab: Tab; order?: number; createdAt?: number }
  | { type: 'widget'; id: string; widget: WorkspaceWidget; order?: number; createdAt?: number };
export const FavouriteTabsShelf: React.FC<FavouriteTabsShelfProps> = ({

  tabs,
  widgets = [],
  tabAssociations,
  highlightedTabId,
  onOpenTab,
  onOpenTmpTab,
  onCloseAssociatedTab,
  onResetDivertedUrl,
  audibleTabs,
  onToggleTabMute,
  onEditTab,
  onDuplicateTab,
  onArchiveTab,
  onDeleteTab,
  onToggleFavouriteTab,
  onAddFavouriteTab,
  onAddFavouriteGroup,
  onMergeFavouriteTabs,
  onUngroupTab,
  onOpenVariant,
  onReplaceTabUrl,
  onAddWidget,
  onUpdateWidget,
  onRemoveWidget,
  onMoveWidgetToGroup,
  onExtractWidgetFromGroup,
  onReorderFavouriteItem,
  onReorderFavouriteTabs,
  onReorderGroupVariants,
  onActivateGroup,
  raindropRootCollectionId,
  themeStyles,
}) => {
  const { isDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const shelfTheme = useMemo(() => {
    return themeStyles || getSpaceThemeStyles(undefined, isDark);
  }, [themeStyles, isDark]);

  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Auto-fetch weather widget updates: every hour when visible, and when page becomes visible if last fetch was >= 1 hour ago
  useWeatherAutoFetch({
    widgets,
    onUpdateWidget,
  });
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [hoveredWidgetId, setHoveredWidgetId] = useState<string | null>(null);

  const groupLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMouseOverGroupRef = useRef<string | null>(null);
  const isMouseOverGroupPopoverRef = useRef(false);

  const clearGroupLeaveTimer = () => {
    if (groupLeaveTimerRef.current) {
      clearTimeout(groupLeaveTimerRef.current);
      groupLeaveTimerRef.current = null;
    }
  };

  const scheduleGroupPopoverClose = (delay = 80) => {
    clearGroupLeaveTimer();
    groupLeaveTimerRef.current = setTimeout(() => {
      if (!isMouseOverGroupRef.current && !isMouseOverGroupPopoverRef.current) {
        setGroupPopoverTab(null);
      }
    }, delay);
  };

  useEffect(() => {
    const handleClear = () => {
      setHoveredTabId(null);
      setHoveredWidgetId(null);
      clearGroupLeaveTimer();
      isMouseOverGroupRef.current = null;
      isMouseOverGroupPopoverRef.current = false;
    };

    window.addEventListener(CLEAR_HOVER_EVENT, handleClear);
    window.addEventListener('blur', handleClear);
    if (typeof document !== 'undefined') {
      document.addEventListener('mouseleave', handleClear);
    }

    return () => {
      clearGroupLeaveTimer();
      window.removeEventListener(CLEAR_HOVER_EVENT, handleClear);
      window.removeEventListener('blur', handleClear);
      if (typeof document !== 'undefined') {
        document.removeEventListener('mouseleave', handleClear);
      }
    };
  }, []);
  const [menuVisibleTabId, setMenuVisibleTabId] = useState<string | null>(null);
  const [openMenuTabId, setOpenMenuTabId] = useState<string | null>(null);
  const [copiedTabId, setCopiedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [groupPopoverTab, setGroupPopoverTab] = useState<{ tab: Tab; anchorRect: DOMRect } | null>(null);

  const activePopoverGroupTab = useMemo(() => {
    if (!groupPopoverTab) return null;
    return tabs.find((t) => t.id === groupPopoverTab.tab.id) || groupPopoverTab.tab;
  }, [groupPopoverTab, tabs]);

  // Active Widget Popover State (for interactive widgets)
  const [activeWidgetPopover, setActiveWidgetPopover] = useState<{
    id: string;
    anchorRect: DOMRect;
  } | null>(null);

  // Auto-open popover for newly created note widget
  const [pendingAutoOpenWidgetId, setPendingAutoOpenWidgetId] = useState<string | null>(null);
  const pendingAutoOpenNoteRef = useRef(false);

  useEffect(() => {
    let targetId = pendingAutoOpenWidgetId;
    if (!targetId && pendingAutoOpenNoteRef.current) {
      const newestNote = [...widgets]
        .filter((w) => w.style === 'note')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      if (newestNote) {
        targetId = newestNote.id;
      }
    }

    if (targetId) {
      const openPopover = () => {
        const el = document.getElementById(`shelf-widget-${targetId}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          setActiveWidgetPopover({
            id: targetId!,
            anchorRect: rect,
          });
          setPendingAutoOpenWidgetId(null);
          pendingAutoOpenNoteRef.current = false;
          return true;
        }
        return false;
      };

      if (!openPopover()) {
        const raf = requestAnimationFrame(() => {
          if (!openPopover() && addButtonRef.current) {
            setActiveWidgetPopover({
              id: targetId!,
              anchorRect: addButtonRef.current.getBoundingClientRect(),
            });
            setPendingAutoOpenWidgetId(null);
            pendingAutoOpenNoteRef.current = false;
          }
        });
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [widgets, pendingAutoOpenWidgetId]);

  // Add Button Popover State
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [addMenuCoords, setAddMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 1-second live clock update for widgets
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Close add menu on outside click or scroll
  useEffect(() => {
    if (!isAddMenuOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (addButtonRef.current?.contains(target)) return;
      if (addMenuRef.current?.contains(target)) return;
      setIsAddMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddMenuOpen]);

  const clockInfo = useMemo(() => buildClockInfo(now), [now]);

  // Only show widgets that are not inside a group on the root shelf
  const shelfWidgets = useMemo(() => widgets.filter((w) => !w.parentGroupId), [widgets]);

  // Combined sorted list of tabs and root widgets
  const shelfItems = useMemo<ShelfItem[]>(() => {
    const tabItems: ShelfItem[] = tabs.map((t) => ({
      type: 'tab',
      id: t.id,
      tab: t,
      order: t.order,
      createdAt: t.createdAt,
    }));
    const widgetItems: ShelfItem[] = shelfWidgets.map((w) => ({
      type: 'widget',
      id: w.id,
      widget: w,
      order: w.order,
      createdAt: w.createdAt,
    }));

    return [...tabItems, ...widgetItems].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        if (a.order !== b.order) return a.order - b.order;
        return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
      }
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
    });
  }, [tabs, shelfWidgets]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setMenuVisibleTabId(null);
    setOpenMenuTabId(null);
    setIsAddMenuOpen(false);
    const isWidget = widgets.some((w) => w.id === id);
    startDrag(e, { id, type: isWidget ? 'widget' : 'favTab' });
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!isDragAcceptable(e, ['favTab', 'widget', 'favItem'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === id) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const width = rect.width;

    const isTargetTab = tabs.some((t) => t.id === id);
    const isTargetWidget = shelfWidgets.some((w) => w.id === id);
    const isSourceTab = activeDrag
      ? activeDrag.type === 'favTab' || activeDrag.type === 'tab'
      : tabs.some((t) => t.id === (activeDrag as any)?.id);
    const isSourceWidget = activeDrag
      ? activeDrag.type === 'widget'
      : widgets.some((w) => w.id === (activeDrag as any)?.id);

    let pos: 'before' | 'after' | 'inside' = 'after';
    if ((isTargetTab || isTargetWidget) && (isSourceTab || isSourceWidget) && onMergeFavouriteTabs) {
      if (relX < width * 0.35) {
        pos = 'before';
      } else if (relX > width * 0.65) {
        pos = 'after';
      } else {
        pos = 'inside';
      }
    } else {
      pos = relX < width / 2 ? 'before' : 'after';
    }

    setDragOverTabId(id);
    setDropPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    if (!isDragAcceptable(e, ['favTab', 'widget', 'favItem'])) {
      setDragOverTabId(null);
      setDropPosition(null);
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const pos = dropPosition || 'after';
    setDragOverTabId(null);
    setDropPosition(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      const activeDrag = getActiveDrag();
      const sourceId = activeDrag?.id || (raw ? (JSON.parse(raw) as { id: string }).id : null);
      if (!sourceId || sourceId === targetId) return;

      if (pos === 'inside') {
        const isTarget = tabs.some((t) => t.id === targetId) || shelfWidgets.some((w) => w.id === targetId);
        const isSource = tabs.some((t) => t.id === sourceId) || widgets.some((w) => w.id === sourceId);
        if (isTarget && isSource && onMergeFavouriteTabs) {
          onMergeFavouriteTabs(sourceId, targetId);
          return;
        }
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const effectivePos: 'before' | 'after' =
        pos === 'inside'
          ? (e.clientX - rect.left < rect.width / 2 ? 'before' : 'after')
          : pos;

      if (onReorderFavouriteItem) {
        onReorderFavouriteItem(sourceId, targetId, effectivePos);
      } else if (onReorderFavouriteTabs) {
        onReorderFavouriteTabs(sourceId, targetId, effectivePos);
      }
    } catch {} finally {
      endDrag();
    }
  };

  const handleDragEnd = () => {
    setDragOverTabId(null);
    setDropPosition(null);
    endDrag();
  };

  const handleItemMouseEnter = (tabId: string) => {
    setHoveredTabId(tabId);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (openMenuTabId === tabId) {
      setMenuVisibleTabId(tabId);
    } else {
      hoverTimerRef.current = setTimeout(() => {
        setMenuVisibleTabId(tabId);
      }, 250);
    }
  };

  const handleItemMouseLeave = (tabId: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredTabId(null);
    if (dragOverTabId === tabId) {
      setDragOverTabId(null);
      setDropPosition(null);
    }
    if (openMenuTabId !== tabId) {
      setMenuVisibleTabId(null);
    }
  };

  const handleToggleAddMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAddMenuOpen) {
      setIsAddMenuOpen(false);
      return;
    }
    if (addButtonRef.current) {
      const rect = addButtonRef.current.getBoundingClientRect();
      const menuHeight = 360;
      const menuWidth = 192;
      const spaceBelow = window.innerHeight - rect.bottom;
      const fitsBelow = spaceBelow >= menuHeight + 10;
      const top = fitsBelow ? rect.bottom + 6 : Math.max(10, rect.top - menuHeight - 6);
      const left = Math.min(Math.max(10, rect.left), Math.max(10, window.innerWidth - menuWidth - 10));
      setAddMenuCoords({ top, left });
      setIsAddMenuOpen(true);
    }
  };

  const handleSelectAddTab = () => {
    setIsAddMenuOpen(false);
    onAddFavouriteTab();
  };

  const handleSelectAddWidget = (style: WidgetStyle, initialConfig?: Record<string, any>) => {
    setIsAddMenuOpen(false);
    const createdWidget = onAddWidget?.({ style, size: 'small', config: initialConfig });
    if (style === 'note') {
      if (createdWidget && (createdWidget as WorkspaceWidget).id) {
        setPendingAutoOpenWidgetId((createdWidget as WorkspaceWidget).id);
      } else {
        pendingAutoOpenNoteRef.current = true;
      }
    }
  };

  return (
    <div
      className="favourite-tabs-shelf"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '2px 0 6px 0',
        background: 'transparent',
        color: shelfTheme.textColor,
        borderRadius: '24px',
        border: 'none',
        boxShadow: 'none',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
          gap: '8px',
          width: '100%',
        }}
      >
        {shelfItems.map((item) => {
          const isDragTarget = dragOverTabId === item.id;

          if (item.type === 'tab') {
            const tab = item.tab;
            const validVariants = (tab.urlVariants || []).filter((v) => Boolean(v.url));
            const groupWidgets = widgets.filter((w) => w.parentGroupId === tab.id);
            const isGroup = Boolean(tab.isGroup || validVariants.length > 1 || groupWidgets.length > 0);

            // Check if group is associated with any open browser tab (strictly by item ID)
            let isGroupAssociated = false;
            let groupAudibleInfo: AudibleTab | undefined = undefined;
            if (isGroup && tabAssociations) {
              if (tabAssociations[tab.id]) {
                isGroupAssociated = true;
                if (!groupAudibleInfo && audibleTabs) {
                  groupAudibleInfo = audibleTabs.find((a) => a.id === tabAssociations[tab.id]?.browserTabId);
                }
              }
              for (const v of validVariants) {
                if (v.id && tabAssociations[v.id]) {
                  isGroupAssociated = true;
                  if (!groupAudibleInfo && audibleTabs) {
                    groupAudibleInfo = audibleTabs.find((a) => a.id === tabAssociations[v.id]?.browserTabId);
                  }
                }
                if (isGroupAssociated && groupAudibleInfo) break;
              }
            }

            const isHovered = hoveredTabId === tab.id;
            const isMenuVisible = !isMobile && (menuVisibleTabId === tab.id || openMenuTabId === tab.id);
            const assoc = tabAssociations ? tabAssociations[tab.id] : undefined;
            const isAssociated = isGroup ? isGroupAssociated : Boolean(assoc);
            const isDiverted = !isGroup && Boolean(assoc?.isDiverted);
            const audibleInfo = isGroup ? groupAudibleInfo : (assoc ? audibleTabs?.find((a) => a.id === assoc.browserTabId) : undefined);
            const isAudible = Boolean(audibleInfo);
            const isMuted = audibleInfo?.muted === true;
            const badge = !isGroup ? assoc?.badge : undefined;
            const isGroupHighlighted = isGroup && Boolean(
              highlightedTabId && (
                highlightedTabId === tab.id ||
                validVariants.some((v) => v.id === highlightedTabId)
              )
            );
            const isHighlighted = isGroup ? isGroupHighlighted : highlightedTabId === tab.id;
            const domain = getDomain(tab.url);
            const displayTitle = tab.customTitle || (isGroup ? 'Group' : (domain || cleanUrl(tab.url) || 'Untitled'));
            const canEditInRaindrop =
              Number.isSafeInteger(raindropRootCollectionId) &&
              (raindropRootCollectionId ?? 0) > 0 &&
              Number.isSafeInteger(tab.raindropId) &&
              (tab.raindropId ?? 0) > 0;

            const statusSuffix = isAssociated
              ? isHighlighted
                ? ' • Open in browser (Active)'
                : ' • Open in browser'
              : ' • Closed (Click to open)';
            const divertedSuffix = isDiverted ? ' (Navigated away from original URL)' : '';
            const totalGroupItems = validVariants.length + groupWidgets.length;
            const tooltipText = isGroup
              ? `${displayTitle} (${totalGroupItems} items)${isAssociated ? ' • Has open tab(s)' : ''}`
              : tab.url
              ? `${displayTitle}\n${tab.url}${statusSuffix}${divertedSuffix}`
              : displayTitle;

            const standardMenuItems: ActionDropdownItem[] = [
              ...(isAssociated && onCloseAssociatedTab
                ? [
                    {
                      id: 'close-browser-tab',
                      label: 'Close browser tab',
                      icon: <MinusIcon size={14} />,
                      danger: true,
                      onClick: () => onCloseAssociatedTab(tab.id),
                      dividerAfter: !isDiverted && !tab.url,
                    },
                  ]
                : []),
              ...(isDiverted && onResetDivertedUrl
                ? [
                    {
                      id: 'restore-diverted-url',
                      label: 'Restore original URL',
                      icon: <SlashIcon size={14} />,
                      onClick: () => onResetDivertedUrl(tab.id),
                      dividerAfter: true,
                    },
                  ]
                : []),
              ...(tab.url
                ? [
                    ...(isAssociated
                      ? [
                          {
                            id: 'switch-tab',
                            label: 'Switch to tab',
                            icon: <ExternalLinkIcon size={14} />,
                            onClick: (e?: any) => {
                              if (onOpenTab) {
                                onOpenTab(tab.url, tab.id, { inNewTab: false, event: e });
                              } else {
                                window.open(tab.url, '_blank', 'noopener,noreferrer');
                              }
                            },
                          },
                        ]
                      : []),
                    (() => {
                      const hasMultipleVariants = validVariants.length > 1;
                      const handleOpenTmpTab = (urlToOpen: string, titleToUse?: string) => {
                        if (onOpenTmpTab) {
                          onOpenTmpTab(urlToOpen, titleToUse);
                        } else if (onOpenTab) {
                          onOpenTab(urlToOpen, undefined, { inNewTab: true, asTmpTab: true });
                        } else {
                          window.open(urlToOpen, '_blank', 'noopener,noreferrer');
                        }
                      };

                      return {
                        id: 'open-tmp-tab',
                        label: 'Open in new tab',
                        icon: <ExternalLinkIcon size={14} />,
                        ...(hasMultipleVariants
                          ? {
                              children: validVariants.map((v, idx) => ({
                                id: `open-tmp-var-${v.id || idx}`,
                                label: v.name || cleanUrl(v.url) || 'Variant',
                                icon: <GlobeIcon size={13} />,
                                onClick: (e: any) => {
                                  e?.stopPropagation?.();
                                  handleOpenTmpTab(v.url, v.name || displayTitle);
                                },
                              })),
                            }
                          : {
                              onClick: (e: any) => {
                                e?.stopPropagation?.();
                                if (tab.url) {
                                  handleOpenTmpTab(tab.url, displayTitle);
                                }
                              },
                            }),
                      };
                    })(),
                    {
                      id: 'copy-url',
                      label: copiedTabId === tab.id ? 'Copied URL!' : 'Copy URL',
                      icon: copiedTabId === tab.id ? <CheckIcon size={14} color="#10b981" /> : <CopyIcon size={14} />,
                      onClick: () => {
                        if (tab.url && typeof navigator !== 'undefined') {
                          navigator.clipboard.writeText(tab.url);
                          setCopiedTabId(tab.id);
                          setTimeout(() => {
                            setCopiedTabId((prev) => (prev === tab.id ? null : prev));
                          }, 1500);
                        }
                      },
                    },
                    buildReplaceWithCurrentUrlMenuItem({
                      tab,
                      onReplaceWithCurrentUrl: (variantId) => onReplaceTabUrl?.(tab, variantId),
                      iconSize: 14,
                      childIconSize: 13,
                      dividerAfter: true,
                    }),
                  ]
                : []),
              {
                id: 'remove-favourite',
                label: 'Remove from favourites',
                icon: <StarIcon size={14} filled={true} color="#eab308" />,
                onClick: () => onToggleFavouriteTab(tab.id),
                dividerAfter: !canEditInRaindrop && Boolean(onEditTab || onDuplicateTab || onDeleteTab),
              },
              ...(canEditInRaindrop
                ? [
                    {
                      id: 'edit-in-raindrop',
                      label: 'Edit in Raindrop',
                      icon: <ExternalLinkIcon size={14} />,
                      onClick: () => {
                        window.open(
                          `https://app.raindrop.io/my/${raindropRootCollectionId}/item/${tab.raindropId}/edit`,
                          '_blank',
                          'noopener,noreferrer'
                        );
                      },
                      dividerAfter: Boolean(onEditTab || onDuplicateTab || onDeleteTab),
                    },
                  ]
                : []),
              {
                id: 'edit-tab',
                label: 'Edit tab',
                icon: <EditIcon size={14} />,
                onClick: () => onEditTab(tab),
              },
              ...(onDuplicateTab
                ? [
                    {
                      id: 'duplicate-tab',
                      label: 'Duplicate',
                      icon: <DuplicateIcon size={14} />,
                      onClick: () => onDuplicateTab(tab),
                    },
                  ]
                : []),
              ...(onArchiveTab
                ? [
                    {
                      id: 'archive-tab',
                      label: 'Archive tab',
                      icon: <ArchiveIcon size={14} />,
                      onClick: () => onArchiveTab(tab.id),
                    },
                  ]
                : []),
              {
                id: 'delete-tab',
                label: 'Delete tab',
                icon: <TrashIcon size={14} />,
                danger: true,
                onClick: () => onDeleteTab(tab.id),
              },
            ];

            const groupMenuItems: ActionDropdownItem[] = [
              {
                id: 'open-all',
                label: 'Open all tabs',
                icon: <ExternalLinkIcon size={14} />,
                onClick: () => {
                  validVariants.forEach((v) => {
                    if (v.url && onOpenTab) {
                      onOpenTab(v.url, v.id, { inNewTab: true });
                    }
                  });
                },
                dividerAfter: true,
              },
              {
                id: 'edit-group',
                label: 'Edit group',
                icon: <EditIcon size={14} />,
                onClick: () => onEditTab(tab),
              },
              ...(onUngroupTab
                ? [
                    {
                      id: 'ungroup-tab',
                      label: 'Ungroup',
                      icon: <GridViewIcon size={14} />,
                      onClick: () => onUngroupTab(tab.id),
                    },
                  ]
                : []),
              {
                id: 'remove-favourite',
                label: 'Remove from favourites',
                icon: <StarIcon size={14} filled={true} color="#eab308" />,
                onClick: () => onToggleFavouriteTab(tab.id),
                dividerAfter: Boolean(onArchiveTab || onDeleteTab),
              },
              ...(onArchiveTab
                ? [
                    {
                      id: 'archive-group',
                      label: 'Archive group',
                      icon: <ArchiveIcon size={14} />,
                      onClick: () => onArchiveTab(tab.id),
                    },
                  ]
                : []),
              ...(onDeleteTab
                ? [
                    {
                      id: 'delete-group',
                      label: 'Delete group',
                      icon: <TrashIcon size={14} />,
                      danger: true,
                      onClick: () => onDeleteTab(tab.id),
                    },
                  ]
                : []),
            ];

            const menuItems = isGroup ? groupMenuItems : standardMenuItems;

            const isDroppingInside = isDragTarget && dropPosition === 'inside';

            const cardBg = isDroppingInside
              ? (shelfTheme.isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.15)')
              : isHovered
              ? (isAssociated
                  ? (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.85)')
                  : shelfTheme.actionHoverBg)
              : isAssociated
              ? (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.70)')
              : (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.035)');

            const cardBorder = isDroppingInside
              ? `1.5px dashed ${shelfTheme.primaryColor}`
              : isHovered
              ? `1px solid ${shelfTheme.primaryColor}`
              : isAssociated
              ? (shelfTheme.isDark ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid rgba(0, 0, 0, 0.1)')
              : (shelfTheme.isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid rgba(0, 0, 0, 0.06)');

            const cardShadow = isHighlighted
              ? shelfTheme.activeIndicatorGlow
              : isHovered
              ? (isAssociated
                  ? (shelfTheme.isDark ? '0 3px 10px rgba(0, 0, 0, 0.35)' : '0 3px 10px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06)')
                  : '0 2px 8px rgba(0, 0, 0, 0.12)')
              : isAssociated
              ? (shelfTheme.isDark
                  ? '0 1px 4px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                  : '0 1.5px 4px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.70)')
              : 'none';

            return (
              <div
                key={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                onMouseEnter={(e) => {
                  handleItemMouseEnter(tab.id);
                  if (isGroup) {
                    clearGroupLeaveTimer();
                    isMouseOverGroupRef.current = tab.id;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setGroupPopoverTab({ tab, anchorRect: rect });
                  }
                }}
                onMouseLeave={() => {
                  handleItemMouseLeave(tab.id);
                  if (isGroup) {
                    if (isMouseOverGroupRef.current === tab.id) {
                      isMouseOverGroupRef.current = null;
                    }
                    scheduleGroupPopoverClose(80);
                  }
                }}
                onClick={async (e) => {
                  if (isGroup) {
                    if (onActivateGroup) {
                      const activated = await onActivateGroup(tab);
                      if (activated) {
                        clearGroupLeaveTimer();
                        isMouseOverGroupRef.current = null;
                        isMouseOverGroupPopoverRef.current = false;
                        setGroupPopoverTab(null);
                      }
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    setGroupPopoverTab((prev) => {
                      if (prev?.tab.id === tab.id) {
                        return null;
                      }
                      return { tab, anchorRect: rect };
                    });
                    return;
                  }
                  if (tab.url) {
                    const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
                    if (onOpenTab) {
                      onOpenTab(tab.url, tab.id, { inNewTab, event: e });
                    } else {
                      if (inNewTab) {
                        window.open(tab.url, '_blank', 'noopener,noreferrer');
                      } else {
                        window.location.href = tab.url;
                      }
                    }
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  minWidth: 0,
                  height: '56px',
                  backgroundColor: cardBg,
                  border: cardBorder,
                  borderLeft: isDragTarget && dropPosition === 'before'
                    ? `3px solid ${shelfTheme.primaryColor}`
                    : undefined,
                  borderRight: isDragTarget && dropPosition === 'after'
                    ? `3px solid ${shelfTheme.primaryColor}`
                    : undefined,
                  outline: isHighlighted ? shelfTheme.activeIndicatorOutline : 'none',
                  outlineOffset: isHighlighted ? '-1.5px' : undefined,
                  borderRadius: '14px',
                  cursor: 'grab',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, outline 0.15s ease',
                  position: 'relative',
                  userSelect: 'none',
                  boxShadow: cardShadow,
                  boxSizing: 'border-box',
                }}
                title={tooltipText}
              >
                {/* Favicon or Custom Emoji or 2x2 Mini Grid for Groups */}
                <div
                  style={{
                    width: isGroup ? '42px' : '32px',
                    height: isGroup ? '42px' : '32px',
                    borderRadius: isGroup ? '10px' : '8px',
                    backgroundColor: isHovered
                      ? (shelfTheme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)')
                      : isGroup
                      ? (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)')
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
                    opacity: isAssociated || isHovered ? 1 : 0.8,
                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                    transition: 'opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  {isGroup && !tab.customEmojiIcon ? (() => {
                    const groupPreviewItems: Array<
                      | { type: 'tab'; variant: TabUrlVariant }
                      | { type: 'widget'; widget: WorkspaceWidget }
                    > = [];
                    const previewKnownIds = new Set<string>();

                    if (tab.groupItemOrder && tab.groupItemOrder.length > 0) {
                      for (const entry of tab.groupItemOrder) {
                        if (groupPreviewItems.length >= 4) break;
                        if (entry.type === 'tab') {
                          const v = validVariants.find((varItem) => varItem.id === entry.id);
                          if (v) {
                            groupPreviewItems.push({ type: 'tab', variant: v });
                            previewKnownIds.add(v.id);
                          }
                        } else if (entry.type === 'widget') {
                          const w = groupWidgets.find((wItem) => wItem.id === entry.id);
                          if (w) {
                            groupPreviewItems.push({ type: 'widget', widget: w });
                            previewKnownIds.add(w.id);
                          }
                        }
                      }
                    }

                    for (const v of validVariants) {
                      if (groupPreviewItems.length >= 4) break;
                      if (!previewKnownIds.has(v.id)) {
                        groupPreviewItems.push({ type: 'tab', variant: v });
                        previewKnownIds.add(v.id);
                      }
                    }

                    for (const w of groupWidgets) {
                      if (groupPreviewItems.length >= 4) break;
                      if (!previewKnownIds.has(w.id)) {
                        groupPreviewItems.push({ type: 'widget', widget: w });
                        previewKnownIds.add(w.id);
                      }
                    }

                    if (groupPreviewItems.length === 0) {
                      return (
                        <GridViewIcon
                          size={20}
                          color={shelfTheme.subtextColor}
                        />
                      );
                    }

                    return (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '3px',
                          alignItems: 'center',
                          justifyItems: 'center',
                          width: '36px',
                          height: '36px',
                        }}
                      >
                        {groupPreviewItems.map((pItem, pIdx) => {
                          if (pItem.type === 'tab') {
                            const variant = pItem.variant;
                            return (
                              <TabFavicon
                                key={variant.id || pIdx}
                                url={variant.url}
                                favIconUrl={variant.favIconUrl || tabAssociations?.[variant.id]?.favIconUrl}
                                customEmojiIcon={variant.customEmojiIcon}
                                size={16}
                                emojiSize={15}
                                globeIconSize={14}
                                globeIconColor={shelfTheme.subtextColor}
                                showDomainFallback={false}
                              />
                            );
                          }
                          return (
                            <div
                              key={pItem.widget.id || pIdx}
                              style={{
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <WidgetTileContent
                                widget={pItem.widget}
                                theme={shelfTheme}
                                clockInfo={clockInfo}
                                now={now}
                                mode="mini"
                              />
                            </div>


                          );
                        })}
                      </div>
                    );
                  })() : (
                    <TabFavicon
                      url={tab.url}
                      favIconUrl={tab.favIconUrl}
                      customEmojiIcon={tab.customEmojiIcon}
                      size={26}
                      emojiSize={26}
                      globeIconSize={26}
                      globeIconColor={shelfTheme.subtextColor}
                      showDomainFallback={true}
                      badge={badge}
                    />
                  )}
                </div>

                {/* Arc-style active running indicator pill at bottom center */}
                {isAssociated && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isHighlighted ? '20px' : isHovered ? '16px' : '12px',
                      height: '3px',
                      borderRadius: '9999px',
                      backgroundColor: isHighlighted
                        ? shelfTheme.activeIndicatorColor
                        : isHovered
                        ? (shelfTheme.isDark ? '#ffffff' : 'rgba(0, 0, 0, 0.85)')
                        : (shelfTheme.isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)'),
                      boxShadow: isHighlighted ? shelfTheme.activeIndicatorGlow : 'none',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Audio playing / mute badge */}
                {isAudible && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const tabIdToMute = isGroup ? audibleInfo?.id : assoc?.browserTabId;
                      if (tabIdToMute) {
                        onToggleTabMute?.(tabIdToMute, !isMuted);
                      }
                    }}
                    title={isMuted ? 'Muted (Click to unmute)' : 'Playing audio (Click to mute)'}
                    aria-label={isMuted ? 'Unmute tab' : 'Mute tab'}
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '4px',
                      outline: 'none',
                      backgroundColor: isMuted ? '#ef4444' : '#10b981',
                      color: '#ffffff',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                      border: `1.5px solid ${shelfTheme.isDark ? '#1e293b' : '#ffffff'}`,
                      zIndex: 4,
                      transition: 'transform 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {isMuted ? (
                      <span style={{ fontSize: '7.5px', lineHeight: 1, fontWeight: 700 }}>✕</span>
                    ) : (
                      <span style={{ fontSize: '8px', lineHeight: 1 }}>♪</span>
                    )}
                  </button>
                )}

                {/* Diverted URL badge */}
                {isDiverted && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onResetDivertedUrl?.(tab.id);
                    }}
                    title="Tab navigated away from original URL. Click to restore original URL"
                    aria-label="Restore original URL"
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: '3px',
                      width: '14px',
                      height: '14px',
                      borderRadius: '4px',
                      border: `1px solid ${shelfTheme.isDark ? 'rgba(234, 179, 8, 0.45)' : '#fde047'}`,
                      backgroundColor: shelfTheme.isDark ? 'rgba(234, 179, 8, 0.25)' : '#fef08a',
                      color: shelfTheme.isDark ? '#fde047' : '#a16207',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      zIndex: 4,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      transition: 'transform 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <SlashIcon size={8} />
                  </button>
                )}

                {/* ... menu button on item's top right corner */}
                {isMenuVisible && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      right: '3px',
                      zIndex: 10,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionDropdown
                      items={menuItems}
                      isDarkTheme={shelfTheme.isDark}
                      visible={true}
                      buttonTitle="Tab options"
                      align="right"
                      size="sm"
                      triggerIcon={<MoreHorizontalIcon size={14} />}
                      hoverBg={shelfTheme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'}
                      buttonStyle={{
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        borderRadius: '6px',
                        backgroundColor: shelfTheme.isDark ? '#1e293b' : '#ffffff',
                        border: `1px solid ${shelfTheme.borderColor}`,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                        color: shelfTheme.textColor,
                      }}
                      onOpenChange={(isOpen) => {
                        if (isOpen) {
                          setOpenMenuTabId(tab.id);
                          setMenuVisibleTabId(tab.id);
                        } else {
                          setOpenMenuTabId(null);
                          if (hoveredTabId !== tab.id) {
                            setMenuVisibleTabId(null);
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          }

          // Render Widget Item
          const widget = item.widget;
          const isWidgetHovered = hoveredWidgetId === widget.id;

          const noteColorConfig = widget.style === 'note'
            ? NOTE_COLORS.find((c) => c.key === (widget.config as NoteConfig)?.colorTheme) || NOTE_COLORS[0]
            : null;

          const widgetBg = noteColorConfig
            ? (shelfTheme.isDark ? noteColorConfig.bgDark : noteColorConfig.bgLight)
            : isWidgetHovered
            ? shelfTheme.actionHoverBg
            : shelfTheme.isDark
            ? 'rgba(0, 0, 0, 0.22)'
            : 'rgba(255, 255, 255, 0.48)';

          const widgetBorder = noteColorConfig
            ? (shelfTheme.isDark ? `1px solid ${noteColorConfig.borderDark}` : `1px solid ${noteColorConfig.borderLight}`)
            : isWidgetHovered
            ? (shelfTheme.isDark ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid rgba(0, 0, 0, 0.25)')
            : shelfTheme.isDark
            ? '1px solid rgba(255, 255, 255, 0.10)'
            : '1px solid rgba(0, 0, 0, 0.08)';

          const widgetShadow = isWidgetHovered ? '0 2px 8px rgba(0, 0, 0, 0.12)' : 'none';

          const widgetTooltip =
            widget.style === 'calendar'
              ? 'Calendar Widget'
              : widget.style === 'digital'
              ? 'Digital Clock Widget'
              : widget.style === 'analog'
              ? 'Analog Clock Widget'
              : widget.style === 'combo'
              ? 'Date & Time Widget'
              : widget.style === 'pomodoro'
              ? 'Pomodoro Timer (Click to open)'
              : widget.style === 'countdown'
              ? 'Countdown Timer (Click to open)'
              : widget.style === 'note'
              ? 'Sticky Note (Click to edit)'
              : widget.style === 'weather'
              ? 'Weather & Temperature (Click to open)'
              : widget.style === 'search'
              ? 'Quick Search (Click to search)'
              : 'Widget';

          const isInteractiveWidget = ['pomodoro', 'countdown', 'note', 'weather', 'search'].includes(widget.style);

          return (
            <div
              key={widget.id}
              id={`shelf-widget-${widget.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, widget.id)}
              onDragOver={(e) => handleDragOver(e, widget.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, widget.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoveredWidgetId(widget.id)}
              onMouseLeave={() => setHoveredWidgetId(null)}
              onClick={(e) => {
                if (isInteractiveWidget) {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveWidgetPopover({
                    id: widget.id,
                    anchorRect: rect,
                  });
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minWidth: 0,
                height: '56px',
                backgroundColor: widgetBg,
                border: widgetBorder,
                borderLeft: isDragTarget && dropPosition === 'before'
                  ? `3px solid ${shelfTheme.primaryColor}`
                  : undefined,
                borderRight: isDragTarget && dropPosition === 'after'
                  ? `3px solid ${shelfTheme.primaryColor}`
                  : undefined,
                borderRadius: '14px',
                cursor: isInteractiveWidget ? 'pointer' : 'grab',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                position: 'relative',
                userSelect: 'none',
                boxShadow: widgetShadow,
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
              title={widgetTooltip}
            >
              {/* Delete button on hover */}
              {isWidgetHovered && onRemoveWidget && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRemoveWidget(widget.id);
                  }}
                  title="Remove widget"
                  aria-label="Remove widget"
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '5px',
                    backgroundColor: shelfTheme.isDark ? '#1e293b' : '#ffffff',
                    border: `1px solid ${shelfTheme.borderColor}`,
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    zIndex: 10,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    outline: 'none',
                  }}
                >
                  <TrashIcon size={11} />
                </button>
              )}

              {/* Widget Visual Content */}
              <WidgetTileContent
                widget={widget}
                theme={shelfTheme}
                clockInfo={clockInfo}
                now={now}
                mode="full"
                compact={false}
              />

            </div>
          );
        })}

        {/* Plus Button: Add Tab or Add Widget */}
        <button
          ref={addButtonRef}
          type="button"
          onClick={handleToggleAddMenu}
          title="Add favourite tab or widget"
          aria-label="Add favourite tab or widget"
          aria-haspopup="menu"
          aria-expanded={isAddMenuOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minWidth: 0,
            height: '56px',
            backgroundColor: isAddMenuOpen ? shelfTheme.actionHoverBg : shelfTheme.inputBg,
            border: isAddMenuOpen ? `1px solid ${shelfTheme.primaryColor}` : `1px dashed ${shelfTheme.borderColor}`,
            borderRadius: '14px',
            cursor: 'pointer',
            color: isAddMenuOpen ? shelfTheme.textColor : shelfTheme.subtextColor,
            transition: 'all 0.15s ease',
            outline: 'none',
            padding: 0,
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = shelfTheme.actionHoverBg;
            e.currentTarget.style.borderColor = shelfTheme.primaryColor;
            e.currentTarget.style.color = shelfTheme.textColor;
          }}
          onMouseLeave={(e) => {
            if (!isAddMenuOpen) {
              e.currentTarget.style.backgroundColor = shelfTheme.inputBg;
              e.currentTarget.style.borderColor = shelfTheme.borderColor;
              e.currentTarget.style.color = shelfTheme.subtextColor;
            }
          }}
        >
          <PlusIcon size={20} />
        </button>
      </div>

      {/* Floating Add Menu Portal */}
      {mounted && isAddMenuOpen && addMenuCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={addMenuRef}
          style={{
            position: 'fixed',
            top: `${addMenuCoords.top}px`,
            left: `${addMenuCoords.left}px`,
            width: '192px',
            backgroundColor: shelfTheme.isDark ? '#1e293b' : '#ffffff',
            border: `1px solid ${shelfTheme.borderColor}`,
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
            padding: '5px',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.12s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Add Tab */}
          <button
            type="button"
            onClick={handleSelectAddTab}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '7px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <StarIcon size={15} filled={false} color={shelfTheme.primaryColor} />
            <span>Add Tab</span>
          </button>

          {/* 1b. Add Tab Group */}
          {onAddFavouriteGroup && (
            <button
              type="button"
              onClick={() => {
                setIsAddMenuOpen(false);
                onAddFavouriteGroup();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 10px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: shelfTheme.textColor,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = shelfTheme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <GridViewIcon size={15} color={shelfTheme.primaryColor} />
              <span>Add Tab Group</span>
            </button>
          )}

          {/* Section Divider */}
          <div
            style={{
              height: '1px',
              backgroundColor: shelfTheme.borderColor,
              margin: '3px 0',
              opacity: 0.8,
            }}
          />

          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: shelfTheme.subtextColor || shelfTheme.textColor,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '3px 8px 2px 8px',
              opacity: 0.65,
            }}
          >
            Add Widget
          </div>

          {/* 2. Calendar Widget */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('calendar')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📅</span>
            <span>Calendar</span>
          </button>

          {/* 3. Digital Clock Widget */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('digital')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>⏰</span>
            <span>Digital Clock</span>
          </button>

          {/* 4. Analog Clock Widget */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('analog')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🕒</span>
            <span>Analog Clock</span>
          </button>

          {/* 5. Date & Time Widget */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('combo')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📆</span>
            <span>Date & Time</span>
          </button>

          {/* 6. Pomodoro Timer */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('pomodoro', { workMinutes: 25, breakMinutes: 5, mode: 'work' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🍅</span>
            <span>Pomodoro Timer</span>
          </button>

          {/* 7. Countdown Timer */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('countdown', createDefaultCountdownConfig())}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>⏳</span>
            <span>Countdown</span>
          </button>

          {/* 8. Sticky Note */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('note', { colorTheme: 'yellow', text: '' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📝</span>
            <span>Sticky Note</span>
          </button>

          {/* 9. Weather & Temperature */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('weather', { city: 'London', tempUnit: 'c' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🌤️</span>
            <span>Weather & Temp</span>
          </button>

          {/* 10. Quick Search */}
          <button
            type="button"
            onClick={() => handleSelectAddWidget('search', { engine: 'google' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: shelfTheme.textColor,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = shelfTheme.isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🔍</span>
            <span>Quick Search</span>
          </button>
        </div>,
        document.body
      )}

      {/* Active Widget Popover */}
      {activeWidgetPopover && (() => {
        const targetWidget = widgets.find((w) => w.id === activeWidgetPopover.id);
        if (!targetWidget) return null;

        const handleClose = () => setActiveWidgetPopover(null);
        const handleUpdate = (cfg: Record<string, any>) => {
          onUpdateWidget?.(targetWidget.id, { config: cfg });
        };

        switch (targetWidget.style) {
          case 'pomodoro':
            return (
              <PomodoroPopover
                widget={targetWidget}
                anchorRect={activeWidgetPopover.anchorRect}
                isOpen={true}
                onClose={handleClose}
                onUpdateConfig={handleUpdate}
                theme={shelfTheme}
              />
            );
          case 'countdown':
            return (
              <CountdownPopover
                widget={targetWidget}
                anchorRect={activeWidgetPopover.anchorRect}
                isOpen={true}
                onClose={handleClose}
                onUpdateConfig={handleUpdate}
                theme={shelfTheme}
              />
            );
          case 'note':
            return (
              <StickyNotePopover
                widget={targetWidget}
                anchorRect={activeWidgetPopover.anchorRect}
                isOpen={true}
                onClose={handleClose}
                onUpdateConfig={handleUpdate}
                theme={shelfTheme}
              />
            );
          case 'weather':
            return (
              <WeatherPopover
                widget={targetWidget}
                anchorRect={activeWidgetPopover.anchorRect}
                isOpen={true}
                onClose={handleClose}
                onUpdateConfig={handleUpdate}
                theme={shelfTheme}
              />
            );
          case 'search':
            return (
              <QuickSearchPopover
                widget={targetWidget}
                anchorRect={activeWidgetPopover.anchorRect}
                isOpen={true}
                onClose={handleClose}
                onUpdateConfig={handleUpdate}
                onOpenTab={onOpenTab}
                theme={shelfTheme}
              />
            );
          default:
            return null;
        }
      })()}

      {/* Favourite Group Popover */}
      {groupPopoverTab && activePopoverGroupTab && (
        <FavouriteGroupPopover
          groupTab={activePopoverGroupTab}
          childWidgets={widgets.filter((w) => w.parentGroupId === activePopoverGroupTab.id)}
          anchorRect={groupPopoverTab.anchorRect}
          isOpen={Boolean(groupPopoverTab)}
          onClose={() => setGroupPopoverTab(null)}
          onOpenItem={(variant, options) => {
            if (onOpenTab) {
              onOpenTab(variant.url, variant.id, options);
            } else if (onOpenVariant) {
              onOpenVariant(variant.url, activePopoverGroupTab, variant, options);
            } else if (typeof window !== 'undefined' && variant.url) {
              window.open(variant.url, '_blank', 'noopener,noreferrer');
            }
          }}
          onEditGroup={(gTab) => onEditTab(gTab)}
          onAddItem={(gTab) => onEditTab(gTab)}
          onAddWidget={(w) =>
            onAddWidget?.({
              ...w,
              parentGroupId: activePopoverGroupTab.id,
            })
          }
          onExtractWidget={(widgetId) => onExtractWidgetFromGroup?.(widgetId)}
          onRemoveWidget={(widgetId) => onRemoveWidget?.(widgetId)}
          onOpenWidget={(widget, anchorRect) => setActiveWidgetPopover({ id: widget.id, anchorRect })}
          onOpenAll={(gTab) => {
            (gTab.urlVariants || []).forEach((v) => {
              if (v.url && onOpenTab) {
                onOpenTab(v.url, v.id, { inNewTab: true });
              }
            });
          }}
          tabAssociations={tabAssociations}
          highlightedTabId={highlightedTabId}
          onCloseAssociatedTab={onCloseAssociatedTab}
          onReorderVariant={onReorderGroupVariants}
          onUngroup={onUngroupTab}
          onMouseEnter={() => {
            clearGroupLeaveTimer();
            isMouseOverGroupPopoverRef.current = true;
          }}
          onMouseLeave={() => {
            isMouseOverGroupPopoverRef.current = false;
            scheduleGroupPopoverClose(80);
          }}
          theme={shelfTheme}
        />
      )}
    </div>
  );
};
