'use client';

import React, { useState, useMemo } from 'react';
import { Folder, Tab } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { getAllFolderTabUrls } from '../../utils/treeUtils';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TabRow } from './TabRow';
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
  highlightedTabId?: string | null;
  onToggleExpand: (folderId: string) => void;
  onEditFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onAddSubFolder: (parentFolderId: string) => void;
  onAddTabInFolder: (parentFolderId: string) => void;
  onOpenTab?: (url: string, tabId?: string) => void;
  onCloseAssociatedTab?: (tabId: string) => void;

  onResetDivertedUrl?: (tabId: string) => void;
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
  highlightedTabId,
  onToggleExpand,
  onEditFolder,
  onDeleteFolder,
  onAddSubFolder,
  onAddTabInFolder,
  onOpenTab,
  onCloseAssociatedTab,
  onResetDivertedUrl,
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

  const siblings = getSortedSiblings(allFolders, allTabs, folder.parentSpaceId, folder.id);
  const isExpanded = folder.isExpanded !== false;
  const totalItemCount = siblings.length;
  const folderColor = folder.colors || null;

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
        onClick: () => {
          if (confirm(`Delete folder "${folder.name}" and all its contents?`)) {
            onDeleteFolder(folder.id);
          }
        },
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
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        id: folder.id,
        type: 'folder',
        parentFolderId: folder.parentFolderId,
        parentSpaceId: folder.parentSpaceId,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
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
    e.preventDefault();
    e.stopPropagation();
    const currentIndicator = dropIndicator || 'inside';
    setDropIndicator(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; type: 'folder' | 'tab' };
      if (!parsed || !parsed.id || parsed.id === folder.id) return;

      onReorderSiblingItem?.({
        sourceId: parsed.id,
        sourceType: parsed.type,
        targetId: folder.id,
        targetType: 'folder',
        position: currentIndicator,
      });
    } catch {}
  };

  const hoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)';
  const activeIconHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';
  const subtextColor = effectiveDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(25, 28, 27, 0.6)';
  const guideLineColor = effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)';

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
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setDropIndicator(null);
        }}
        onClick={() => onToggleExpand(folder.id)}
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
            ) : isExpanded ? (
              <FolderOpenIcon size={18} color={folderColor || (isDarkTheme ? '#a5c4b5' : '#4b7593')} />
            ) : (
              <FolderIcon size={18} color={folderColor || (isDarkTheme ? '#a5c4b5' : '#4b7593')} />
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

          {/* Color Dot if custom color exists */}
          {folderColor && (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: folderColor,
                flexShrink: 0,
                boxShadow: '0 0 2px rgba(0,0,0,0.2)',
              }}
              title={`Color: ${folderColor}`}
            />
          )}

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

        {/* Right Section: Folder Action Dropdown on Hover / Mobile */}
        <ActionDropdown
          items={folderMenuItems}
          isDarkTheme={effectiveDark}
          visible={isMobile || alwaysShowActions || isHovered}
          hoverBg={activeIconHoverBg}
          buttonTitle="Folder options"
          size="sm"
        />
      </div>

      {/* Expanded Folder Contents */}
      {isExpanded && (
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
          {siblings.map((item, index) => {
            const hasPrev = index > 0;
            const hasNext = index < siblings.length - 1;

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
                  highlightedTabId={highlightedTabId}
                  onToggleExpand={onToggleExpand}
                  onEditFolder={onEditFolder}
                  onDeleteFolder={onDeleteFolder}
                  onAddSubFolder={onAddSubFolder}
                  onAddTabInFolder={onAddTabInFolder}
                  onOpenTab={onOpenTab}
                  onCloseAssociatedTab={onCloseAssociatedTab}
                  onResetDivertedUrl={onResetDivertedUrl}
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

            return (
              <TabRow
                key={item.id}
                tab={item.data}
                isDarkTheme={effectiveDark}
                compact={compact}
                alwaysShowActions={alwaysShowActions}
                isAssociated={Boolean(tabAssociations && tabAssociations[item.id])}
                isDiverted={Boolean(tabAssociations && tabAssociations[item.id]?.isDiverted)}
                badge={tabAssociations?.[item.id]?.badge}
                isHighlighted={highlightedTabId === item.id}
                onOpen={onOpenTab}
                onCloseAssociatedTab={() => onCloseAssociatedTab?.(item.id)}
                onResetDivertedUrl={() => onResetDivertedUrl?.(item.id)}
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
          {totalItemCount === 0 && (
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
