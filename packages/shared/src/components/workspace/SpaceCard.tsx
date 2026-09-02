'use client';

import React, { useState, useMemo } from 'react';
import { Space, Folder, Tab } from '../../types/workspace';
import { TabAssociationMap, AudibleTab, MediaControlAction } from '../../types/tabTracker';
import {
  isDarkColor,
  getSpaceColorStyle,
  getAllSpaceTabUrls,
  getDomain,
  getFaviconUrl,
  isValidHttpUrl,
} from '../../utils/treeUtils';
import { getSpaceThemeStyles } from '../../utils/spaceTheme';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TabRow } from './TabRow';
import { FolderItem } from './FolderItem';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderInputIcon,
} from '../Icons';

export interface SpaceCardProps {
  space: Space;
  allSpaces?: Space[];
  allFolders: Folder[];
  allTabs: Tab[];
  searchQuery?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  cardIndex?: number;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  tabAssociations?: TabAssociationMap;
  audibleTabs?: AudibleTab[];
  highlightedTabId?: string | null;
  onOpenTab?: (url: string, tabId?: string) => void;
  onCloseAssociatedTab?: (tabId: string) => void;
  onResetDivertedUrl?: (tabId: string) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
  onEditSpace?: (space: Space) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onConvertSpace?: (space: Space) => void;
  onAddTab?: (folderId?: string, pinned?: boolean) => void;
  onAddFolder?: (parentFolderId?: string) => void;
  onEditFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folderId: string) => void;
  onToggleFolderExpand?: (folderId: string) => void;
  onEditTab?: (tab: Tab) => void;
  onDeleteTab?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onToggleFavouriteTab?: (tabId: string) => void;
  onMoveSiblingItem?: (itemId: string, itemType: 'folder' | 'tab', direction: 'up' | 'down') => void;
  onReorderSiblingItem?: (params: {
    sourceId: string;
    sourceType: 'folder' | 'tab';
    targetId: string;
    targetType: 'folder' | 'tab';
    position: 'before' | 'after' | 'inside';
  }) => void;
  onReorderPinnedTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
  onMoveSpace?: (spaceId: string, direction: 'left' | 'right') => void;
}

export const SpaceCard: React.FC<SpaceCardProps> = ({
  space,
  allSpaces = [],
  allFolders,
  allTabs,
  searchQuery: externalSearch = '',
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
  cardIndex = 0,
  isSingleColumn = false,
  alwaysShowActions = false,
  tabAssociations,
  audibleTabs,
  highlightedTabId,
  onOpenTab,
  onCloseAssociatedTab,
  onResetDivertedUrl,
  onMediaControl,
  onEditSpace,
  onDeleteSpace,
  onConvertSpace,
  onAddTab,
  onAddFolder,
  onEditFolder,
  onDeleteFolder,
  onToggleFolderExpand,
  onEditTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onMoveSiblingItem,
  onReorderSiblingItem,
  onReorderPinnedTabs,
  onMoveSpace,
}) => {


  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const isControlled = controlledIsCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledIsCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const activeSearch = externalSearch.trim().toLowerCase();

  // Space contents
  const spaceTabs = useMemo(() => {
    return allTabs.filter((t) => !t.favourite && (t.parentSpaceId === space.id || !t.parentSpaceId));
  }, [allTabs, space.id]);

  const rootSiblings = useMemo(() => {
    return getSortedSiblings(allFolders, allTabs, space.id, undefined);
  }, [allFolders, allTabs, space.id]);


  // Color and custom theme determination
  const themeStyles = useMemo(() => {
    return getSpaceThemeStyles(space.colors, isSystemDark);
  }, [space.colors, isSystemDark]);

  // Copy all tab URLs in this space
  const handleCopyAllUrls = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllSpaceTabUrls(space.id, allFolders, allTabs);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  // Open all tabs in browser
  const handleOpenAllTabs = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllSpaceTabUrls(space.id, allFolders, allTabs);
    if (urls.length > 0) {
      if (onOpenTab) {
        urls.forEach((u) => onOpenTab(u));
      } else {
        urls.forEach((u) => window.open(u, '_blank', 'noopener,noreferrer'));
      }
    }
  };

  // Filter items matching active search
  const filteredTabs = useMemo(() => {
    if (!activeSearch) return null;
    return spaceTabs.filter((t) => {
      const matchTitle = t.customTitle && t.customTitle.toLowerCase().includes(activeSearch);
      const matchUrl = t.url && t.url.toLowerCase().includes(activeSearch);
      return matchTitle || matchUrl;
    });
  }, [spaceTabs, activeSearch]);

  const totalTabsCount = spaceTabs.length;

  const spaceMenuItems: ActionDropdownItem[] = useMemo(() => {
    const items: ActionDropdownItem[] = [
      {
        id: 'copy-urls',
        label: copied ? 'Copied all URLs!' : 'Copy all URLs',
        icon: copied ? <CheckIcon size={16} color="#10b981" /> : <CopyIcon size={16} />,
        onClick: handleCopyAllUrls,
      },
      {
        id: 'open-tabs',
        label: 'Open all tabs',
        icon: <ExternalLinkIcon size={16} />,
        onClick: handleOpenAllTabs,
        dividerAfter: Boolean(onAddTab || onAddFolder),
      },
    ];

    if (onAddTab) {
      items.push({
        id: 'add-tab',
        label: 'Add tab',
        icon: <PlusIcon size={16} />,
        onClick: () => onAddTab(),
      });
    }

    if (onAddFolder) {
      items.push({
        id: 'add-folder',
        label: 'Add folder',
        icon: <FolderPlusIcon size={16} />,
        onClick: () => onAddFolder(),
        dividerAfter: Boolean(onConvertSpace || onEditSpace || onDeleteSpace),
      });
    }

    if (onConvertSpace && allSpaces.length > 1) {
      items.push({
        id: 'convert-space',
        label: 'Convert to folder...',
        icon: <FolderInputIcon size={16} />,
        onClick: () => onConvertSpace(space),
      });
    }

    if (onEditSpace) {
      items.push({
        id: 'edit-space',
        label: 'Edit space',
        icon: <EditIcon size={16} />,
        onClick: () => onEditSpace(space),
      });
    }

    if (onDeleteSpace && allSpaces.length > 1) {
      items.push({
        id: 'delete-space',
        label: 'Delete space',
        icon: <TrashIcon size={16} />,
        danger: true,
        onClick: () => onDeleteSpace(space.id),
      });
    }

    return items;
  }, [
    copied,
    handleCopyAllUrls,
    handleOpenAllTabs,
    onAddTab,
    onAddFolder,
    onConvertSpace,
    allSpaces.length,
    space,
    onEditSpace,
    onDeleteSpace,
  ]);

  return (
    <div
      className="space-card"
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
      style={{
        background: themeStyles.containerBg,
        color: themeStyles.textColor,
        borderRadius: '24px',
        border: themeStyles.cardBorder,
        boxShadow: themeStyles.cardBoxShadow,
        padding: isCollapsed ? '14px 18px' : (isSingleColumn ? '14px 12px' : '22px 14px'),
        display: 'flex',
        flexDirection: 'column',
        gap: isCollapsed ? '0' : (isSingleColumn ? '12px' : '16px'),
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={toggleCollapse}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>

          {/* Emoji / Icon Container */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              backgroundColor: themeStyles.badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '19px',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {space.emojiIcon || '📁'}
          </div>

          {/* Space Title */}
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
              color: 'inherit',
              flex: 1,
              minWidth: 0,
            }}
            title={space.name}
          >
            {space.name}
          </h3>
        </div>

        {/* Header Action Dropdown (rendered on hover / alwaysShowActions / mobile) */}
        <ActionDropdown
          items={spaceMenuItems}
          isDarkTheme={themeStyles.isDark}
          visible={isMobile || isCardHovered || alwaysShowActions}
          hoverBg={themeStyles.actionHoverBg}
          buttonTitle="Space options"
          size="md"
        />
      </div>

      {/* Expanded Card Body */}
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Search Results Filter Mode */}
          {filteredTabs !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8 }}>
                Found {filteredTabs.length} matching tab(s):
              </div>
              {filteredTabs.length === 0 ? (
                <div style={{ padding: '18px', textAlign: 'center', fontSize: '13px', opacity: 0.65 }}>
                  No tabs match &ldquo;{activeSearch}&rdquo;
                </div>
              ) : (
                filteredTabs.map((t) => {
                  const assoc = tabAssociations?.[t.id];
                  const audibleInfo = assoc ? audibleTabs?.find((a) => a.id === assoc.browserTabId) : undefined;
                  const isAudible = Boolean(audibleInfo);
                  const isMuted = audibleInfo?.muted === true;

                  return (
                    <TabRow
                      key={t.id}
                      tab={t}
                      isDarkTheme={themeStyles.isDark}
                      compact={isSingleColumn}
                      alwaysShowActions={alwaysShowActions}
                      isAssociated={Boolean(assoc)}
                      isDiverted={Boolean(assoc?.isDiverted)}
                      isAudible={isAudible}
                      isMuted={isMuted}
                      badge={assoc?.badge}
                      isHighlighted={highlightedTabId === t.id}
                      onOpen={onOpenTab}
                      onCloseAssociatedTab={() => onCloseAssociatedTab?.(t.id)}
                      onResetDivertedUrl={() => onResetDivertedUrl?.(t.id)}
                      onMediaControl={
                        onMediaControl && assoc
                          ? (action) => onMediaControl(assoc.browserTabId, action)
                          : undefined
                      }
                      onEdit={onEditTab || (() => {})}
                      onDelete={onDeleteTab || (() => {})}
                      onTogglePin={onTogglePinTab}
                      onToggleFavourite={onToggleFavouriteTab}
                    />
                  );
                })
              )}
            </div>
          ) : (
            <>
              {/* Folders & Tabs Hierarchy (Interleaved Siblings) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {rootSiblings.map((item, index) => {
                  const hasPrev = index > 0;
                  const hasNext = index < rootSiblings.length - 1;

                  if (item.type === 'folder') {
                    return (
                      <FolderItem
                        key={item.id}
                        folder={item.data}
                        allFolders={allFolders}
                        allTabs={allTabs}
                        isDarkTheme={themeStyles.isDark}
                        compact={isSingleColumn}
                        alwaysShowActions={alwaysShowActions}
                        tabAssociations={tabAssociations}
                        audibleTabs={audibleTabs}
                        highlightedTabId={highlightedTabId}
                        onToggleExpand={onToggleFolderExpand || (() => {})}
                        onEditFolder={onEditFolder || (() => {})}
                        onDeleteFolder={onDeleteFolder || (() => {})}
                        onAddSubFolder={onAddFolder || (() => {})}
                        onAddTabInFolder={(pId) => onAddTab?.(pId, false)}
                        onOpenTab={onOpenTab}
                        onCloseAssociatedTab={onCloseAssociatedTab}
                        onResetDivertedUrl={onResetDivertedUrl}
                        onMediaControl={onMediaControl}
                        onEditTab={onEditTab || (() => {})}
                        onDeleteTab={onDeleteTab || (() => {})}
                        onTogglePinTab={onTogglePinTab || (() => {})}
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
                      isDarkTheme={themeStyles.isDark}
                      compact={isSingleColumn}
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
                      onEdit={onEditTab || (() => {})}
                      onDelete={onDeleteTab || (() => {})}
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


                {/* Empty State */}
                {rootSiblings.length === 0 && (

                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px 16px',
                      color: themeStyles.subtextColor,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        backgroundColor: themeStyles.badgeBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      📁
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'inherit' }}>
                      Space is empty
                    </span>
                    <span style={{ fontSize: '12px', opacity: 0.8 }}>
                      Add tabs or folders to organize your browsing.
                    </span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      {onAddTab && (
                        <button
                          onClick={() => onAddTab()}
                          style={{
                            border: 'none',
                            backgroundColor: themeStyles.badgeBg,
                            color: themeStyles.textColor,
                            fontSize: '13px',
                            fontWeight: 600,
                            padding: '6px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          + Tab
                        </button>
                      )}
                      {onAddFolder && (
                        <button
                          onClick={() => onAddFolder()}
                          style={{
                            border: 'none',
                            backgroundColor: themeStyles.badgeBg,
                            color: themeStyles.textColor,
                            fontSize: '13px',
                            fontWeight: 600,
                            padding: '6px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          + Folder
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
