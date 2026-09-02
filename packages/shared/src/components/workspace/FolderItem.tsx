import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Folder, Tab } from '../../types/workspace';
import { TabAssociationMap, AudibleTab, MediaControlAction } from '../../types/tabTracker';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { getAllFolderTabUrls, isTabInFolder, findDirectChildForTab } from '../../utils/treeUtils';
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
  alwaysShowActions?: boolean;
  tabAssociations?: TabAssociationMap;
  audibleTabs?: AudibleTab[];
  highlightedTabId?: string | null;
  onToggleExpand: (folderId: string) => void;
  onEditFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onAddSubFolder: (parentFolderId: string) => void;
  onAddTabInFolder: (parentFolderId: string) => void;
  onOpenTab?: (url: string, tabId?: string) => void;
  onCloseAssociatedTab?: (tabId: string) => void;
  onResetDivertedUrl?: (tabId: string) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
  onEditTab: (tab: Tab) => void;
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
}


export const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  allFolders,
  allTabs,
  depth = 0,
  isDarkTheme,
  compact = false,
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
  onCloseAssociatedTab,
  onResetDivertedUrl,
  onMediaControl,
  onEditTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onMoveUp,
  onMoveDown,
  onMoveSiblingItem,
  onReorderSiblingItem,
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
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const siblings = getSortedSiblings(allFolders, allTabs, folder.parentSpaceId, folder.id);
  const isExpanded = folder.isExpanded !== false;
  const isSemiExpanded =
    !isExpanded &&
    Boolean(highlightedTabId) &&
    isTabInFolder(highlightedTabId!, folder.id, allFolders, allTabs);
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

  const activeDirectChild = useMemo(() => {
    if (!isSemiExpanded || !highlightedTabId) return null;
    return findDirectChildForTab(highlightedTabId, folder.id, allFolders, allTabs);
  }, [isSemiExpanded, highlightedTabId, folder.id, allFolders, allTabs]);

  const visibleSiblings = useMemo(() => {
    if (isExpanded) return siblings;
    if (isSemiExpanded && activeDirectChild) {
      return siblings.filter(
        (s) => s.type === activeDirectChild.type && s.id === activeDirectChild.id
      );
    }
    return [];
  }, [isExpanded, isSemiExpanded, activeDirectChild, siblings]);

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
    // Only accept folder or tab items! Spaces or shelf tabs MUST NOT light up folders
    if (!isDragAcceptable(e, ['folder', 'tab'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === folder.id) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
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
    if (!isDragAcceptable(e, ['folder', 'tab'])) {
      setDropIndicator(null);
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const currentIndicator = dropIndicator || 'inside';
    setDropIndicator(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      const activeDrag = getActiveDrag();
      const parsed = activeDrag || (raw ? (JSON.parse(raw) as { id: string; type: 'folder' | 'tab' }) : null);
      if (!parsed || !parsed.id || parsed.id === folder.id) return;

      onReorderSiblingItem?.({
        sourceId: parsed.id,
        sourceType: parsed.type as 'folder' | 'tab',
        targetId: folder.id,
        targetType: 'folder',
        position: currentIndicator,
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
                      onToggleExpand(subfolder.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
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
                      {subfolder.customEmojiIcon ? (
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

              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowHoverPopup(false);
                    if (onOpenTab) {
                      onOpenTab(tab.url, tab.id);
                    } else {
                      window.open(tab.url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
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
                      flex: 1,
                    }}
                  >
                    {tab.customTitle || tab.url}
                  </span>
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
              : isHovered
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
            {folder.customEmojiIcon ? (
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{folder.customEmojiIcon}</span>
            ) : isExpanded || isSemiExpanded ? (
              <FolderOpenIcon size={18} color={isDarkTheme ? '#a5c4b5' : '#4b7593'} />
            ) : (
              <FolderIcon size={18} color={isDarkTheme ? '#a5c4b5' : '#4b7593'} />
            )}
            {folder.customEmojiIcon && (
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
              title="Active tab inside"
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
                  animation: 'arcable-pulse 2s infinite',
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
                isDarkTheme={effectiveDark}
                compact={compact}
                alwaysShowActions={alwaysShowActions}
                isAssociated={Boolean(assoc)}
                isDiverted={Boolean(assoc?.isDiverted)}
                isAudible={isAudible}
                isMuted={isMuted}
                badge={assoc?.badge}
                isHighlighted={highlightedTabId === item.id}
                onOpen={onOpenTab}
                onCloseAssociatedTab={() => onCloseAssociatedTab?.(item.id)}
                onResetDivertedUrl={() => onResetDivertedUrl?.(item.id)}
                onMediaControl={
                  onMediaControl && assoc
                    ? (action) => onMediaControl(assoc.browserTabId, action)
                    : undefined
                }
                onEdit={onEditTab}
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
                    if (!raw) return;
                    const parsed = JSON.parse(raw) as { id: string; type: 'folder' | 'tab' };
                    if (!parsed || !parsed.id || parsed.id === targetTab.id) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const pos = e.clientY < midY ? 'before' : 'after';

                    onReorderSiblingItem?.({
                      sourceId: parsed.id,
                      sourceType: parsed.type,
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
              style={{
                fontSize: '12.5px',
                color: subtextColor,
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
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
