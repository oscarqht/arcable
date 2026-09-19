import React, { useState, useMemo, useRef, useEffect, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Folder, Tab, TmpTab, TabUrlVariant, TabOpenOptions } from '../../types/workspace';
import { TabAssociationMap, AudibleTab, MediaControlAction } from '../../types/tabTracker';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { getAllFolderTabUrls, isTabInFolder, hasAnyTabInFolder } from '../../utils/treeUtils';
import { areUrlsMatching } from '../../utils/format';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TabRow } from './TabRow';
import { TabFavicon } from './TabFavicon';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  EditIcon,
  TrashIcon,
} from '../Icons';

export interface FolderItemProps {
  folder: Folder;
  allFolders: Folder[];
  allTabs: Tab[];
  depth?: number;
  isDarkTheme?: boolean;
  compact?: boolean;
  /** Use single-letter variant labels when the containing space is narrow. */
  compactVariantLabels?: boolean;
  alwaysShowActions?: boolean;
  tabAssociations?: TabAssociationMap;
  audibleTabs?: AudibleTab[];
  highlightedTabId?: string | null;
  onToggleExpand: (folderId: string) => void;
  onEditFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onAddSubFolder: (parentFolderId: string) => void;
  onAddTabInFolder: (parentFolderId: string) => void;
  onOpenTab?: (url: string, tabId?: string, options?: TabOpenOptions) => void;
  onOpenTmpTab?: (url: string, title?: string) => void;
  onOpenVariant?: (url: string, tab: Tab, variant: TabUrlVariant, options?: TabOpenOptions) => void;
  onCloseAssociatedTab?: (tabId: string) => void;
  onResetDivertedUrl?: (tabId: string) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
  onEditTab: (tab: Tab) => void;
  onDuplicateTab?: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onToggleFavouriteTab?: (tabId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveSiblingItem?: (itemId: string, itemType: 'folder' | 'tab', direction: 'up' | 'down') => void;
  onReorderSiblingItem?: (params: {
    sourceId: string;
    sourceType: 'folder' | 'tab';
    targetId: string;
    targetType: 'folder' | 'tab';
    position: 'before' | 'after' | 'inside';
  }) => void;
  onDropTmpTab?: (
    tmpTab: TmpTab,
    folderId: string,
    position?: 'before' | 'after' | 'inside',
    targetTabId?: string
  ) => void;
}


export const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  allFolders,
  allTabs,
  depth = 0,
  isDarkTheme,
  compact = false,
  compactVariantLabels = false,
  alwaysShowActions = false,
  tabAssociations,
  audibleTabs,
  highlightedTabId,
  onToggleExpand,
  onEditFolder,
  onDeleteFolder,
  onAddSubFolder,
  onAddTabInFolder,
  onOpenTab,
  onOpenTmpTab,
  onOpenVariant,
  onCloseAssociatedTab,
  onResetDivertedUrl,
  onMediaControl,
  onEditTab,
  onDuplicateTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onMoveUp,
  onMoveDown,
  onMoveSiblingItem,
  onReorderSiblingItem,
  onDropTmpTab,
}) => {


  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<'before' | 'after' | 'inside' | null>(null);

  const [showHoverPopup, setShowHoverPopup] = useState(false);
  const [popupCoords, setPopupCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    width?: number;
    maxHeight?: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const siblings = getSortedSiblings(allFolders, allTabs, folder.parentSpaceId, folder.id);
  const isExpanded = folder.isExpanded !== false;

  const openTabIds = useMemo(() => {
    const ids = new Set<string>();
    if (tabAssociations) {
      for (const id of Object.keys(tabAssociations)) {
        if (tabAssociations[id]) {
          ids.add(id);
        }
      }
    }
    if (highlightedTabId) {
      ids.add(highlightedTabId);
    }
    return ids;
  }, [tabAssociations, highlightedTabId]);

  const hasOpenChild = useMemo(() => {
    if (openTabIds.size === 0) return false;
    return hasAnyTabInFolder(openTabIds, folder.id, allFolders, allTabs);
  }, [openTabIds, folder.id, allFolders, allTabs]);

  const hasActiveChild = useMemo(() => {
    if (!highlightedTabId) return false;
    return isTabInFolder(highlightedTabId, folder.id, allFolders, allTabs);
  }, [highlightedTabId, folder.id, allFolders, allTabs]);

  const isSemiExpanded = !isExpanded && hasOpenChild;
  const totalItemCount = siblings.length;

  const updatePopupPosition = useCallback(() => {
    if (!headerRef.current) return;
    const rect = headerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const popupEl = popupRef.current;
    const estimatedHeight = popupEl ? popupEl.offsetHeight : Math.min(300, siblings.length * 36 + 40);

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const fitsBelow = spaceBelow >= estimatedHeight + 8;
    const fitsAbove = spaceAbove >= estimatedHeight + 8;

    let placement: 'top' | 'bottom' = 'bottom';
    if (!fitsBelow && (fitsAbove || spaceAbove > spaceBelow)) {
      placement = 'top';
    } else {
      placement = 'bottom';
    }

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;

    if (placement === 'bottom') {
      top = rect.bottom + 4;
      maxHeight = Math.max(120, viewportHeight - top - 12);
    } else {
      bottom = viewportHeight - rect.top + 4;
      maxHeight = Math.max(120, rect.top - 12);
    }

    const popupWidth = Math.min(Math.max(rect.width, 220), viewportWidth - 16);
    let left = rect.left;
    if (left + popupWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - popupWidth - 8);
    } else if (left < 8) {
      left = 8;
    }

    setPopupCoords({
      top,
      bottom,
      left,
      width: popupWidth,
      maxHeight,
      placement,
    });
  }, [siblings.length]);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleMouseEnterHeader = () => {
    if (isMobile) return;
    setIsHovered(true);
    clearCloseTimer();
    if (!isExpanded && siblings.length > 0) {
      clearHoverTimer();
      hoverTimerRef.current = setTimeout(() => {
        updatePopupPosition();
        setShowHoverPopup(true);
      }, 1000);
    }
  };

  const handleMouseLeaveHeader = () => {
    setIsHovered(false);
    clearHoverTimer();
    setDropIndicator(null);
    if (showHoverPopup) {
      closeTimerRef.current = setTimeout(() => {
        setShowHoverPopup(false);
      }, 200);
    }
  };

  const handleMouseEnterPopup = () => {
    clearCloseTimer();
  };

  const handleMouseLeavePopup = () => {
    closeTimerRef.current = setTimeout(() => {
      setShowHoverPopup(false);
    }, 200);
  };

  useEffect(() => {
    if (!showHoverPopup) return;

    updatePopupPosition();
    const rafId = requestAnimationFrame(() => {
      updatePopupPosition();
    });

    const handleScrollOrResize = () => {
      updatePopupPosition();
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        headerRef.current &&
        !headerRef.current.contains(target) &&
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        setShowHoverPopup(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHoverPopup(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showHoverPopup, updatePopupPosition]);

  useEffect(() => {
    return () => {
      clearHoverTimer();
      clearCloseTimer();
    };
  }, [clearHoverTimer, clearCloseTimer]);

  useEffect(() => {
    if (isExpanded) {
      clearHoverTimer();
      clearCloseTimer();
      setShowHoverPopup(false);
    }
  }, [isExpanded, clearHoverTimer, clearCloseTimer]);

  const visibleSiblings = useMemo(() => {
    if (isExpanded) return siblings;
    if (isSemiExpanded) {
      return siblings.filter((item) => {
        if (item.type === 'tab') {
          return openTabIds.has(item.id);
        }
        if (item.type === 'folder') {
          return hasAnyTabInFolder(openTabIds, item.id, allFolders, allTabs);
        }
        return false;
      });
    }
    return [];
  }, [isExpanded, isSemiExpanded, siblings, openTabIds, allFolders, allTabs]);

  const handleCopyFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllFolderTabUrls(folder.id, allFolders, allTabs);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllFolderTabUrls(folder.id, allFolders, allTabs);
    if (urls.length > 0) {
      if (onOpenTab) {
        urls.forEach((url) => onOpenTab(url));
      } else {
        urls.forEach((url) => window.open(url, '_blank', 'noopener,noreferrer'));
      }
    }
  };

  const handleEditInRaindrop = () => {
    if (Number.isSafeInteger(folder.raindropId) && (folder.raindropId ?? 0) > 0) {
      window.open(`https://app.raindrop.io/my/${folder.raindropId}`, '_blank', 'noopener,noreferrer');
    }
  };

  const folderMenuItems: ActionDropdownItem[] = useMemo(() => {
    const items: ActionDropdownItem[] = [
      {
        id: 'copy-folder',
        label: copied ? 'Copied URLs!' : `Copy all URLs (${totalItemCount})`,
        icon: copied ? <CheckIcon size={15} color="#10b981" /> : <CopyIcon size={15} />,
        onClick: handleCopyFolder,
      },
      {
        id: 'open-folder',
        label: `Open all tabs (${totalItemCount})`,
        icon: <ExternalLinkIcon size={15} />,
        onClick: handleOpenFolder,
        dividerAfter: true,
      },
      {
        id: 'add-tab',
        label: 'Add tab',
        icon: <PlusIcon size={15} />,
        onClick: () => onAddTabInFolder(folder.id),
      },
      {
        id: 'add-subfolder',
        label: 'Add subfolder',
        icon: <FolderPlusIcon size={15} />,
        onClick: () => onAddSubFolder(folder.id),
        dividerAfter: true,
      },
      {
        id: 'edit-folder',
        label: 'Edit folder',
        icon: <EditIcon size={14} />,
        onClick: () => onEditFolder(folder),
      },
    ];

    if (Number.isSafeInteger(folder.raindropId) && (folder.raindropId ?? 0) > 0) {
      items.push({
        id: 'edit-in-raindrop',
        label: 'Edit in Raindrop',
        icon: <ExternalLinkIcon size={14} />,
        onClick: handleEditInRaindrop,
        dividerAfter: Boolean(onDeleteFolder),
      });
    }

    if (onDeleteFolder) {
      items.push({
        id: 'delete-folder',
        label: 'Delete folder',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => onDeleteFolder(folder.id),
      });
    }

    return items;
  }, [
    copied,
    totalItemCount,
    handleCopyFolder,
    handleOpenFolder,
    onAddTabInFolder,
    folder,
    folder.raindropId,
    handleEditInRaindrop,
    onAddSubFolder,
    onEditFolder,
    onDeleteFolder,
  ]);

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    clearHoverTimer();
    clearCloseTimer();
    setShowHoverPopup(false);
    startDrag(e, {
      id: folder.id,
      type: 'folder',
      parentFolderId: folder.parentFolderId,
      parentSpaceId: folder.parentSpaceId,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Only accept folder, tab, or tmpTab items! Spaces or shelf tabs MUST NOT light up folders
    if (!isDragAcceptable(e, ['folder', 'tab', 'tmpTab'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === folder.id) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    // Folders are always sorted on top of tabs in the same level.
    // When dragging a tab or tmpTab item over a folder, only allow dropping inside the folder.
    // Dragging tabs to above or below a folder as a sibling is prohibited.
    const isTabDrag =
      activeDrag?.type === 'tab' ||
      activeDrag?.type === 'tmpTab' ||
      ((isDragAcceptable(e, ['tab']) || isDragAcceptable(e, ['tmpTab'])) && !isDragAcceptable(e, ['folder']));

    if (isTabDrag) {
      setDropIndicator('inside');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const height = rect.height;

    if (relativeY < height * 0.25) {
      setDropIndicator('before');
    } else if (relativeY > height * 0.75) {
      setDropIndicator('after');
    } else {
      setDropIndicator('inside');
    }
  };

  const handleDragLeave = () => {
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isDragAcceptable(e, ['folder', 'tab', 'tmpTab'])) {
      setDropIndicator(null);
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const activeDrag = getActiveDrag();
    const isTabDrag =
      activeDrag?.type === 'tab' ||
      activeDrag?.type === 'tmpTab' ||
      ((isDragAcceptable(e, ['tab']) || isDragAcceptable(e, ['tmpTab'])) && !isDragAcceptable(e, ['folder']));
    const currentIndicator = isTabDrag ? 'inside' : (dropIndicator || 'inside');
    setDropIndicator(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      const parsed = activeDrag || (raw ? (JSON.parse(raw) as { id: string; type: 'folder' | 'tab' | 'tmpTab'; [key: string]: any }) : null);
      if (!parsed || !parsed.id || parsed.id === folder.id) return;

      if (parsed.type === 'tmpTab') {
        const tmpTab = (parsed.tmpTab || parsed) as TmpTab;
        onDropTmpTab?.(tmpTab, folder.id);
        return;
      }

      const effectivePosition = parsed.type === 'tab' ? 'inside' : currentIndicator;

      onReorderSiblingItem?.({
        sourceId: parsed.id,
        sourceType: parsed.type as 'folder' | 'tab',
        targetId: folder.id,
        targetType: 'folder',
        position: effectivePosition,
      });
    } catch {} finally {
      endDrag();
    }
  };

  const handleDragEnd = () => {
    setDropIndicator(null);
    endDrag();
  };

  const hoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)';
  const activeIconHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';
  const subtextColor = effectiveDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(25, 28, 27, 0.6)';
  const guideLineColor = effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)';
  const popupBg = effectiveDark ? '#1e293b' : '#ffffff';
  const popupBorder = effectiveDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)';
  const itemHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

  const hoverMenuContent =
    showHoverPopup && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popupRef}
            onMouseEnter={handleMouseEnterPopup}
            onMouseLeave={handleMouseLeavePopup}
            style={{
              position: 'fixed',
              top: popupCoords?.top !== undefined ? `${popupCoords.top}px` : 'auto',
              bottom: popupCoords?.bottom !== undefined ? `${popupCoords.bottom}px` : 'auto',
              left: popupCoords?.left !== undefined ? `${popupCoords.left}px` : 'auto',
              width: popupCoords?.width !== undefined ? `${popupCoords.width}px` : 'auto',
              maxHeight: popupCoords?.maxHeight !== undefined ? `${popupCoords.maxHeight}px` : 'calc(100vh - 40px)',
              backgroundColor: popupBg,
              borderRadius: '12px',
              border: `1px solid ${popupBorder}`,
              boxShadow: effectiveDark
                ? popupCoords?.placement === 'top'
                  ? '0 -12px 32px rgba(0, 0, 0, 0.6), 0 -2px 8px rgba(0, 0, 0, 0.4)'
                  : '0 12px 32px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4)'
                : popupCoords?.placement === 'top'
                  ? '0 -12px 32px rgba(0, 0, 0, 0.15), 0 -2px 8px rgba(0, 0, 0, 0.08)'
                  : '0 12px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08)',
              padding: '5px',
              overflowY: 'auto',
              zIndex: 99999,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              userSelect: 'none',
              animation: 'dropdownFadeIn 0.15s ease-out',
              transformOrigin: popupCoords?.placement === 'top' ? 'bottom center' : 'top center',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with folder name and total items */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px 6px',
                fontSize: '11px',
                fontWeight: 600,
                color: subtextColor,
                borderBottom: `1px solid ${effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                marginBottom: '2px',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: '12px' }}>📂</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
                title={folder.name}
              >
                {folder.name}
              </span>
              <span>
                {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Sibling Items */}
            {siblings.map((item) => {
              if (item.type === 'folder') {
                const subfolder = item.data;
                const subSiblings = getSortedSiblings(allFolders, allTabs, subfolder.parentSpaceId, subfolder.id);
                return (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowHoverPopup(false);
                      if (!isMobile) {
                        onToggleExpand(subfolder.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '28px',
                      minHeight: '28px',
                      padding: '0 8px',
                      boxSizing: 'border-box',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      color: textColor,
                      fontSize: '13px',
                      fontWeight: 500,
                      transition: 'background-color 0.12s ease',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = itemHoverBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title={`Folder: ${subfolder.name}`}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {subfolder.coverUrl ? (
                        <img src={subfolder.coverUrl} alt="" width="16" height="16" referrerPolicy="no-referrer" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                      ) : subfolder.customEmojiIcon ? (
                        <span style={{ fontSize: '15px', lineHeight: 1 }}>{subfolder.customEmojiIcon}</span>
                      ) : (
                        <FolderIcon size={16} color={effectiveDark ? '#a5c4b5' : '#4b7593'} />
                      )}
                    </div>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        lineHeight: '16px',
                      }}
                    >
                      {subfolder.name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: effectiveDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
                        color: 'inherit',
                        borderRadius: '8px',
                        padding: '1px 6px',
                        flexShrink: 0,
                      }}
                    >
                      {subSiblings.length}
                    </span>
                  </div>
                );
              }

              const tab = item.data;
              const assoc = tabAssociations?.[tab.id];
              const isHighlighted = highlightedTabId === tab.id;
              const secondaryVariants = tab.urlVariants && tab.urlVariants.length > 1 ? tab.urlVariants.slice(1) : [];
              const hasVariants = secondaryVariants.length > 0;

              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowHoverPopup(false);
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
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    height: '28px',
                    minHeight: '28px',
                    padding: '0 8px',
                    boxSizing: 'border-box',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: isHighlighted
                      ? effectiveDark
                        ? 'rgba(255, 255, 255, 0.18)'
                        : 'rgba(0, 0, 0, 0.08)'
                      : 'transparent',
                    color: textColor,
                    fontSize: '13px',
                    fontWeight: isHighlighted ? 600 : 500,
                    transition: 'background-color 0.12s ease',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = itemHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isHighlighted
                      ? effectiveDark
                        ? 'rgba(255, 255, 255, 0.18)'
                        : 'rgba(0, 0, 0, 0.08)'
                      : 'transparent';
                  }}
                  title={tab.customTitle || tab.url}
                >
                  <TabFavicon
                    url={tab.url}
                    favIconUrl={tab.favIconUrl}
                    customEmojiIcon={tab.customEmojiIcon}
                    size={16}
                    isDarkTheme={effectiveDark}
                    showDomainFallback={true}
                    badge={assoc?.badge}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: hasVariants ? '0 1 auto' : 1,
                      minWidth: hasVariants ? '40px' : 0,
                      lineHeight: '16px',
                    }}
                  >
                    {tab.customTitle || tab.url}
                  </span>
                  {hasVariants && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: '5px',
                        border: `1px solid ${effectiveDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.14)'}`,
                        overflow: 'hidden',
                        flexShrink: 1,
                        minWidth: 0,
                        backgroundColor: effectiveDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.04)',
                        height: '18px',
                        boxSizing: 'border-box',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {secondaryVariants.map((variant, index) => {
                        const isMatch = Boolean(assoc?.currentUrl && areUrlsMatching(assoc.currentUrl, variant.url));
                        return (
                          <button
                            key={variant.id || index}
                            type="button"
                            title={`${variant.name}: ${variant.url}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setShowHoverPopup(false);
                              const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
                              if (onOpenVariant) {
                                onOpenVariant(variant.url, tab, variant, { inNewTab, event: e });
                              } else if (onOpenTab) {
                                onOpenTab(variant.url, tab.id, { inNewTab, event: e });
                              } else {
                                if (inNewTab) {
                                  window.open(variant.url, '_blank', 'noopener,noreferrer');
                                } else {
                                  window.location.href = variant.url;
                                }
                              }
                            }}
                            style={{
                              border: 'none',
                              borderRight: index < secondaryVariants.length - 1
                                ? `1px solid ${effectiveDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}`
                                : 'none',
                              background: isMatch ? (effectiveDark ? '#0284c7' : '#0ea5e9') : 'transparent',
                              color: isMatch ? '#ffffff' : (effectiveDark ? '#cbd5e1' : '#475569'),
                              fontWeight: isMatch ? 700 : 500,
                              fontSize: '10.5px',
                              padding: '0 6px',
                              cursor: 'pointer',
                              maxWidth: '80px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.12s ease',
                              height: '100%',
                              lineHeight: '16px',
                              flexShrink: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => {
                              if (!isMatch) {
                                e.currentTarget.style.backgroundColor = effectiveDark
                                  ? 'rgba(255, 255, 255, 0.15)'
                                  : 'rgba(0, 0, 0, 0.08)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isMatch) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            {compactVariantLabels
                              ? (variant.name || 'Variant').trim().charAt(0).toLocaleUpperCase()
                              : variant.name || 'Variant'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {Boolean(assoc) && (
                    <span
                      title="Open tab in browser"
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      {/* Folder Header Row */}
      <div
        ref={headerRef}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onMouseEnter={handleMouseEnterHeader}
        onMouseLeave={handleMouseLeaveHeader}
        onClick={() => {
          clearHoverTimer();
          clearCloseTimer();
          setShowHoverPopup(false);
          onToggleExpand(folder.id);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '38px',
          padding: '0 8px',
          borderRadius: '10px',
          backgroundColor:
            dropIndicator === 'inside'
              ? effectiveDark ? 'rgba(255, 255, 255, 0.25)' : '#e0f2fe'
              : !isMobile && isHovered
              ? hoverBg
              : 'transparent',
          borderTop: dropIndicator === 'before' ? '2px solid #0284c7' : '2px solid transparent',
          borderBottom: dropIndicator === 'after' ? '2px solid #0284c7' : '2px solid transparent',
          color: textColor,
          cursor: 'pointer',
          transition: 'background-color 0.12s ease',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        {/* Left section: expand state / drag handle, folder icon, folder title, color badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          {/* Folder Icon / Custom Emoji — with tiny folder badge bottom-right */}
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
            {folder.coverUrl ? (
              <img src={folder.coverUrl} alt="" width="18" height="18" referrerPolicy="no-referrer" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
            ) : folder.customEmojiIcon ? (
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{folder.customEmojiIcon}</span>
            ) : isExpanded || isSemiExpanded ? (
              <FolderOpenIcon size={18} color={isDarkTheme ? '#a5c4b5' : '#4b7593'} />
            ) : (
              <FolderIcon size={18} color={isDarkTheme ? '#a5c4b5' : '#4b7593'} />
            )}
            {!folder.coverUrl && folder.customEmojiIcon && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '-3px',
                  right: '-4px',
                  fontSize: '9px',
                  lineHeight: 1,
                }}
              >
                📂
              </span>
            )}
          </div>

          {/* Folder Title */}
          <span
            style={{
              fontSize: '14.5px',
              fontWeight: 600,
              color: 'inherit',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={folder.name}
          >
            {folder.name}
          </span>

          {/* Item Count Badge */}
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 600,
              backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
              color: 'inherit',
              borderRadius: '10px',
              padding: '1px 7px',
              flexShrink: 0,
            }}
          >
            {totalItemCount}
          </span>

          {dropIndicator === 'inside' && (
            <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
              (drop into folder)
            </span>
          )}
        </div>

        {/* Right Section: Folder Action Dropdown on Hover / Mobile & Semi-expanded indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isSemiExpanded && (
            <div
              title={hasActiveChild ? 'Active tab inside' : 'Open tabs inside'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
                  display: 'inline-block',
                  ...(hasActiveChild ? { animation: 'arcable-pulse 2s infinite' } : {}),
                }}
              />
            </div>
          )}

          <ActionDropdown
            items={folderMenuItems}
            isDarkTheme={effectiveDark}
            visible={isMobile || alwaysShowActions || isHovered}
            hoverBg={activeIconHoverBg}
            buttonTitle="Folder options"
            size="sm"
          />
        </div>
      </div>

      <style>{`
        @keyframes arcable-pulse {
          0% { transform: scale(0.95); opacity: 0.85; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
          70% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); opacity: 0.85; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>

      {/* Collapsed Folder Hover Popup Portal */}
      {hoverMenuContent}

      {/* Expanded / Semi-expanded Folder Contents */}
      {(isExpanded || isSemiExpanded) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingLeft: '6px',
            borderLeft: `1.5px solid ${guideLineColor}`,
            marginLeft: '10px',
            marginTop: '4px',
          }}
        >
          {visibleSiblings.map((item, index) => {
            const hasPrev = isExpanded && index > 0;
            const hasNext = isExpanded && index < visibleSiblings.length - 1;

            if (item.type === 'folder') {
              return (
                <FolderItem
                  key={item.id}
                  folder={item.data}
                  allFolders={allFolders}
                  allTabs={allTabs}
                  depth={depth + 1}
                  isDarkTheme={effectiveDark}
                  compact={compact}
                  compactVariantLabels={compactVariantLabels}
                  alwaysShowActions={alwaysShowActions}
                  tabAssociations={tabAssociations}
                  audibleTabs={audibleTabs}
                  highlightedTabId={highlightedTabId}
                  onToggleExpand={onToggleExpand}
                  onEditFolder={onEditFolder}
                  onDeleteFolder={onDeleteFolder}
                  onAddSubFolder={onAddSubFolder}
                  onAddTabInFolder={onAddTabInFolder}
                  onOpenTab={onOpenTab}
                  onOpenTmpTab={onOpenTmpTab}
                  onCloseAssociatedTab={onCloseAssociatedTab}
                  onResetDivertedUrl={onResetDivertedUrl}
                  onMediaControl={onMediaControl}
                  onEditTab={onEditTab}
                  onDeleteTab={onDeleteTab}
                  onTogglePinTab={onTogglePinTab}
                  onToggleFavouriteTab={onToggleFavouriteTab}
                  onMoveUp={
                    hasPrev && onMoveSiblingItem
                      ? () => onMoveSiblingItem(item.id, 'folder', 'up')
                      : undefined
                  }
                  onMoveDown={
                    hasNext && onMoveSiblingItem
                      ? () => onMoveSiblingItem(item.id, 'folder', 'down')
                      : undefined
                  }
                  onMoveSiblingItem={onMoveSiblingItem}
                  onReorderSiblingItem={onReorderSiblingItem}
                  onDropTmpTab={onDropTmpTab}
                  onDuplicateTab={onDuplicateTab}
                  onOpenVariant={onOpenVariant}
                />
              );
            }

            const assoc = tabAssociations?.[item.id];
            const audibleInfo = assoc ? audibleTabs?.find((a) => a.id === assoc.browserTabId) : undefined;
            const isAudible = Boolean(audibleInfo);
            const isMuted = audibleInfo?.muted === true;

            return (
              <TabRow
                key={item.id}
                tab={item.data}
                raindropCollectionId={folder.raindropId}
                isDarkTheme={effectiveDark}
                compact={compact}
                compactVariantLabels={compactVariantLabels}
                alwaysShowActions={alwaysShowActions}
                isAssociated={Boolean(assoc)}
                isDiverted={Boolean(assoc?.isDiverted)}
                isAudible={isAudible}
                isMuted={isMuted}
                badge={assoc?.badge}
                currentUrl={assoc?.currentUrl}
                isHighlighted={highlightedTabId === item.id}
                onOpen={onOpenTab}
                onOpenTmpTab={onOpenTmpTab}
                onOpenVariant={onOpenVariant}
                onCloseAssociatedTab={() => onCloseAssociatedTab?.(item.id)}
                onResetDivertedUrl={() => onResetDivertedUrl?.(item.id)}
                onMediaControl={
                  onMediaControl && assoc
                    ? (action) => onMediaControl(assoc.browserTabId, action)
                    : undefined
                }
                onEdit={onEditTab}
                onDuplicate={onDuplicateTab}
                onDelete={onDeleteTab}
                onTogglePin={onTogglePinTab}
                onToggleFavourite={onToggleFavouriteTab}
                onMoveUp={
                  hasPrev && onMoveSiblingItem
                    ? () => onMoveSiblingItem(item.id, 'tab', 'up')
                    : undefined
                }
                onMoveDown={
                  hasNext && onMoveSiblingItem
                    ? () => onMoveSiblingItem(item.id, 'tab', 'down')
                    : undefined
                }
                onDropItem={(e, targetTab) => {
                  try {
                    const raw = e.dataTransfer.getData('application/json');
                    const activeDrag = getActiveDrag();
                    const parsed = activeDrag || (raw ? (JSON.parse(raw) as { id: string; type: 'folder' | 'tab' | 'tmpTab'; [key: string]: any }) : null);
                    if (!parsed || !parsed.id || parsed.id === targetTab.id) return;
                    // Folders must never be dropped onto or below tab items
                    if (parsed.type === 'folder') return;

                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const pos = e.clientY < midY ? 'before' : 'after';

                    if (parsed.type === 'tmpTab') {
                      const tmpTab = (parsed.tmpTab || parsed) as TmpTab;
                      onDropTmpTab?.(tmpTab, folder.id, pos, targetTab.id);
                      return;
                    }

                    onReorderSiblingItem?.({
                      sourceId: parsed.id,
                      sourceType: 'tab',
                      targetId: targetTab.id,
                      targetType: 'tab',
                      position: pos,
                    });
                  } catch {}
                }}
              />
            );
          })}

          {/* Empty Folder State */}
          {isExpanded && totalItemCount === 0 && (
            <div
              onDragOver={(e) => {
                if (isDragAcceptable(e, ['tab', 'tmpTab'])) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropIndicator('inside');
                }
              }}
              onDragLeave={() => {
                setDropIndicator(null);
              }}
              onDrop={(e) => {
                if (!isDragAcceptable(e, ['tab', 'tmpTab'])) return;
                e.preventDefault();
                e.stopPropagation();
                setDropIndicator(null);
                try {
                  const raw = e.dataTransfer.getData('application/json');
                  const activeDrag = getActiveDrag();
                  const parsed = activeDrag || (raw ? (JSON.parse(raw) as { id: string; type: 'folder' | 'tab' | 'tmpTab'; [key: string]: any }) : null);
                  if (!parsed || !parsed.id) return;
                  if (parsed.type === 'tmpTab') {
                    const tmpTab = (parsed.tmpTab || parsed) as TmpTab;
                    onDropTmpTab?.(tmpTab, folder.id);
                  } else if (parsed.type === 'tab') {
                    onReorderSiblingItem?.({
                      sourceId: parsed.id,
                      sourceType: 'tab',
                      targetId: folder.id,
                      targetType: 'folder',
                      position: 'inside',
                    });
                  }
                } catch {} finally {
                  endDrag();
                }
              }}
              style={{
                fontSize: '12.5px',
                color: subtextColor,
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: '8px',
                backgroundColor: dropIndicator === 'inside' ? (effectiveDark ? 'rgba(255, 255, 255, 0.15)' : '#e0f2fe') : 'transparent',
                transition: 'background-color 0.12s ease',
              }}
            >
              <span style={{ fontStyle: 'italic', opacity: 0.8 }}>Empty folder</span>
              <button
                type="button"
                onClick={() => onAddTabInFolder(folder.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  opacity: 0.9,
                }}
              >
                + Add tab
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
