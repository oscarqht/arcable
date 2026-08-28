'use client';

import React, { useState, useMemo } from 'react';
import { Space, Folder, Tab } from '../../types/workspace';
import {
  isDarkColor,
  getSpaceColorStyle,
  getAllSpaceTabUrls,
  getDomain,
  getFaviconUrl,
  isValidHttpUrl,
} from '../../utils/treeUtils';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { TabRow } from './TabRow';
import { FolderItem } from './FolderItem';
import { PinnedTabsShelf } from './PinnedTabsShelf';
import {
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  EditIcon,
  TrashIcon,
  FolderIcon,
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
  onOpenTab?: (url: string) => void;
  onEditSpace?: (space: Space) => void;
  onDeleteSpace?: (spaceId: string) => void;
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
  onOpenTab,
  onEditSpace,
  onDeleteSpace,
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
  const [internalSearch, setInternalSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const isControlled = controlledIsCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledIsCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const activeSearch = (externalSearch || internalSearch).trim().toLowerCase();

  // Space contents
  const spaceTabs = useMemo(() => {
    return allTabs.filter((t) => !t.favourite && (t.parentSpaceId === space.id || !t.parentSpaceId));
  }, [allTabs, space.id]);

  const pinnedTabs = useMemo(() => {
    return spaceTabs.filter((t) => t.pinned && !t.parentFolderId);
  }, [spaceTabs]);

  const rootSiblings = useMemo(() => {
    return getSortedSiblings(allFolders, allTabs, space.id, undefined);
  }, [allFolders, allTabs, space.id]);

  // Color Archetype and custom theme determination
  const hasExplicitColor = Boolean(space.colors && space.colors.trim());
  const isDark = hasExplicitColor ? isDarkColor(space.colors) : false;

  // Archetype rotation when no custom color is specified
  const archetype = useMemo<'neutral' | 'primary' | 'secondary' | 'tertiary'>(() => {
    if (hasExplicitColor) return 'neutral';
    const archetypes: Array<'neutral' | 'primary' | 'secondary' | 'tertiary'> = [
      'neutral',
      'primary',
      'secondary',
      'tertiary',
    ];
    const positiveIndex = ((cardIndex % archetypes.length) + archetypes.length) % archetypes.length;
    return archetypes[positiveIndex];
  }, [cardIndex, hasExplicitColor]);

  // Theme styling configuration
  const themeStyles = useMemo(() => {
    if (hasExplicitColor) {
      return {
        containerBg: space.colors,
        isDark,
        textColor: isDark ? '#ffffff' : '#191c1b',
        subtextColor: isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(25, 28, 27, 0.75)',
        badgeBg: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
        badgeText: isDark ? '#ffffff' : '#191c1b',
        inputBg: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.05)',
        inputPlaceholder: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.55)',
        actionHoverBg: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        shelfBg: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
      };
    }

    if (archetype === 'primary') {
      return {
        containerBg: '#7daf9c',
        isDark: false,
        textColor: '#0e4334',
        subtextColor: '#1d4f40',
        badgeBg: 'rgba(255, 255, 255, 0.35)',
        badgeText: '#0e4334',
        inputBg: 'rgba(255, 255, 255, 0.3)',
        inputPlaceholder: 'rgba(14, 67, 52, 0.65)',
        actionHoverBg: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(14, 67, 52, 0.15)',
        shelfBg: 'rgba(255, 255, 255, 0.22)',
      };
    }

    if (archetype === 'secondary') {
      return {
        containerBg: '#ffca98',
        isDark: false,
        textColor: '#7a532a',
        subtextColor: '#623f18',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#7a532a',
        inputBg: 'rgba(255, 255, 255, 0.45)',
        inputPlaceholder: 'rgba(122, 83, 42, 0.7)',
        actionHoverBg: 'rgba(255, 255, 255, 0.45)',
        borderColor: 'rgba(122, 83, 42, 0.15)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
      };
    }

    if (archetype === 'tertiary') {
      return {
        containerBg: '#d4958e',
        isDark: false,
        textColor: '#5b2e29',
        subtextColor: '#693a35',
        badgeBg: 'rgba(255, 255, 255, 0.35)',
        badgeText: '#5b2e29',
        inputBg: 'rgba(255, 255, 255, 0.3)',
        inputPlaceholder: 'rgba(91, 46, 41, 0.65)',
        actionHoverBg: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(91, 46, 41, 0.15)',
        shelfBg: 'rgba(255, 255, 255, 0.22)',
      };
    }

    // Default neutral slate surface
    return {
      containerBg: '#ffffff',
      isDark: false,
      textColor: '#0f172a',
      subtextColor: '#64748b',
      badgeBg: '#f1f5f9',
      badgeText: '#475569',
      inputBg: '#f8fafc',
      inputPlaceholder: '#94a3b8',
      actionHoverBg: '#f1f5f9',
      borderColor: '#e2e8f0',
      shelfBg: '#f8fafc',
    };
  }, [hasExplicitColor, space.colors, isDark, archetype]);

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

  return (
    <div
      style={{
        backgroundColor: themeStyles.containerBg,
        color: themeStyles.textColor,
        borderRadius: '16px',
        border: `1px solid ${themeStyles.borderColor}`,
        padding: isCollapsed ? '12px 16px' : '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: isCollapsed ? '0' : '14px',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          {/* Chevron with smooth rotation */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: !isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: 'inherit',
              opacity: 0.8,
              flexShrink: 0,
            }}
          >
            <ChevronRightIcon size={18} />
          </div>

          {/* Emoji / Icon Container */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              backgroundColor: themeStyles.badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {space.emojiIcon || '📁'}
          </div>

          {/* Space Title */}
          <h3
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
              color: 'inherit',
            }}
            title={space.name}
          >
            {space.name}
          </h3>

          {/* Tab Count Badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: themeStyles.badgeBg,
              color: themeStyles.badgeText,
              flexShrink: 0,
            }}
          >
            {totalTabsCount} {totalTabsCount === 1 ? 'tab' : 'tabs'}
          </span>
        </div>

        {/* Header Action Buttons */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Copy All URLs Button */}
          <button
            type="button"
            onClick={handleCopyAllUrls}
            title="Copy all URLs in space"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '5px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = themeStyles.actionHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {copied ? <CheckIcon size={16} color="#10b981" /> : <CopyIcon size={16} />}
          </button>

          {/* Open All Tabs Button */}
          <button
            type="button"
            onClick={handleOpenAllTabs}
            title="Open all tabs in browser"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '5px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = themeStyles.actionHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ExternalLinkIcon size={16} />
          </button>

          {/* Add Tab Button */}
          {onAddTab && (
            <button
              type="button"
              onClick={() => onAddTab()}
              title="Add tab to this space"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                padding: '5px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.85,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = themeStyles.actionHoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <PlusIcon size={16} />
            </button>
          )}

          {/* Edit Space Button */}
          {onEditSpace && (
            <button
              type="button"
              onClick={() => onEditSpace(space)}
              title="Edit space name, icon and color"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                padding: '5px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.75,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = themeStyles.actionHoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <EditIcon size={14} />
            </button>
          )}

          {/* Delete Space Button */}
          {onDeleteSpace && allSpaces.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete space "${space.name}" and all its folders & tabs?`)) {
                  onDeleteSpace(space.id);
                }
              }}
              title="Delete space"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                padding: '5px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.75,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = themeStyles.actionHoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Card Body */}
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Card Search Bar */}
          {!externalSearch && (
            <div style={{ position: 'relative', width: '100%' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  opacity: 0.6,
                  color: 'inherit',
                }}
              >
                <SearchIcon size={15} />
              </div>
              <input
                type="text"
                placeholder={`Search tabs in ${space.name}...`}
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 32px 7px 34px',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: themeStyles.inputBg,
                  color: themeStyles.textColor,
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'background-color 0.15s ease',
                }}
              />
              {internalSearch && (
                <button
                  type="button"
                  onClick={() => setInternalSearch('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    opacity: 0.65,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
          )}

          {/* Search Results Filter Mode */}
          {filteredTabs !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.75 }}>
                Found {filteredTabs.length} matching tab(s):
              </div>
              {filteredTabs.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', opacity: 0.6 }}>
                  No tabs match &ldquo;{activeSearch}&rdquo;
                </div>
              ) : (
                filteredTabs.map((t) => (
                  <TabRow
                    key={t.id}
                    tab={t}
                    isDarkTheme={themeStyles.isDark}
                    compact={isSingleColumn}
                    alwaysShowActions={alwaysShowActions}
                    onOpen={onOpenTab}
                    onEdit={onEditTab || (() => {})}
                    onDelete={onDeleteTab || (() => {})}
                    onTogglePin={onTogglePinTab}
                    onToggleFavourite={onToggleFavouriteTab}
                  />
                ))
              )}
            </div>
          ) : (
            <>
              {/* Pinned Tabs Shelf */}
              {pinnedTabs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <PinnedTabsShelf
                    tabs={pinnedTabs}
                    isDarkTheme={themeStyles.isDark}
                    shelfBg={themeStyles.shelfBg}
                    onOpenTab={onOpenTab}
                    onEditTab={onEditTab || (() => {})}
                    onDeleteTab={onDeleteTab || (() => {})}
                    onTogglePinTab={onTogglePinTab || (() => {})}
                    onToggleFavouriteTab={onToggleFavouriteTab}
                    onAddPinnedTab={() => onAddTab?.(undefined, true)}
                    onReorderPinnedTabs={onReorderPinnedTabs}
                  />
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: themeStyles.borderColor,
                      margin: '2px 0',
                    }}
                  />
                </div>
              )}

              {/* Folders & Tabs Hierarchy (Interleaved Siblings) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                        onToggleExpand={onToggleFolderExpand || (() => {})}
                        onEditFolder={onEditFolder || (() => {})}
                        onDeleteFolder={onDeleteFolder || (() => {})}
                        onAddSubFolder={onAddFolder || (() => {})}
                        onAddTabInFolder={(pId) => onAddTab?.(pId, false)}
                        onOpenTab={onOpenTab}
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

                  return (
                    <TabRow
                      key={item.id}
                      tab={item.data}
                      isDarkTheme={themeStyles.isDark}
                      compact={isSingleColumn}
                      alwaysShowActions={alwaysShowActions}
                      onOpen={onOpenTab}
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
                {rootSiblings.length === 0 && pinnedTabs.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 12px',
                      color: themeStyles.subtextColor,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: themeStyles.badgeBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                      }}
                    >
                      📁
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'inherit' }}>
                      Space is empty
                    </span>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>
                      Add tabs or folders to organize your browsing.
                    </span>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      {onAddTab && (
                        <button
                          onClick={() => onAddTab()}
                          style={{
                            border: 'none',
                            backgroundColor: themeStyles.badgeBg,
                            color: themeStyles.textColor,
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '8px',
                            cursor: 'pointer',
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
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '8px',
                            cursor: 'pointer',
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
