'use client';

import React, { useState } from 'react';
import { Folder, Tab } from '../../types/workspace';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { getAllFolderTabUrls } from '../../utils/treeUtils';
import { TabRow } from './TabRow';
import {
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  FolderIcon,
  FolderOpenIcon,
  EditIcon,
  TrashIcon,
  DragHandleIcon,
} from '../Icons';

export interface FolderItemProps {
  folder: Folder;
  allFolders: Folder[];
  allTabs: Tab[];
  depth?: number;
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  onToggleExpand: (folderId: string) => void;
  onEditFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onAddSubFolder: (parentFolderId: string) => void;
  onAddTabInFolder: (parentFolderId: string) => void;
  onOpenTab?: (url: string) => void;
  onEditTab: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onTogglePinTab: (tabId: string) => void;
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
  isDarkTheme = false,
  compact = false,
  alwaysShowActions = false,
  onToggleExpand,
  onEditFolder,
  onDeleteFolder,
  onAddSubFolder,
  onAddTabInFolder,
  onOpenTab,
  onEditTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onMoveUp,
  onMoveDown,
  onMoveSiblingItem,
  onReorderSiblingItem,
}) => {
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

  const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)';
  const activeIconHoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = isDarkTheme ? '#ffffff' : '#191c1b';
  const subtextColor = isDarkTheme ? 'rgba(255, 255, 255, 0.65)' : 'rgba(25, 28, 27, 0.6)';
  const guideLineColor = isDarkTheme ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        marginLeft: depth > 0 ? `${depth * 12}px` : '0',
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
          height: '34px',
          padding: '0 8px 0 10px',
          borderRadius: '8px',
          backgroundColor:
            dropIndicator === 'inside'
              ? isDarkTheme ? 'rgba(255, 255, 255, 0.25)' : '#e0f2fe'
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
        {/* Left section: drag handle, chevron, folder icon, folder title, color badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          {/* Drag Handle on hover */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              opacity: isHovered ? 0.6 : 0,
              cursor: 'grab',
              flexShrink: 0,
              transition: 'opacity 0.12s ease',
              color: 'inherit',
            }}
            title="Drag to reorder folder"
          >
            <DragHandleIcon size={12} />
          </span>

          {/* Rotating Chevron */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
              opacity: 0.7,
              flexShrink: 0,
            }}
          >
            <ChevronRightIcon size={14} />
          </div>

          {/* Folder Icon / Custom Emoji */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {folder.customEmojiIcon ? (
              <span style={{ fontSize: '14px', lineHeight: 1 }}>{folder.customEmojiIcon}</span>
            ) : isExpanded ? (
              <FolderOpenIcon size={16} color={folderColor || (isDarkTheme ? '#9ed1bd' : '#3b82f6')} />
            ) : (
              <FolderIcon size={16} color={folderColor || (isDarkTheme ? '#9ed1bd' : '#3b82f6')} />
            )}
          </div>

          {/* Folder Title */}
          <span
            style={{
              fontSize: '13px',
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
                width: '7px',
                height: '7px',
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
              fontSize: '10px',
              fontWeight: 600,
              backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
              color: 'inherit',
              borderRadius: '10px',
              padding: '1px 6px',
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

        {/* Right Section: Folder Action Buttons on Hover */}
        {(alwaysShowActions || isHovered) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              flexShrink: 0,
              marginLeft: '4px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Copy all folder URLs */}
            <button
            type="button"
            onClick={handleCopyFolder}
            title={`Copy all ${totalItemCount} tab URLs`}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {copied ? <CheckIcon size={14} color="#10b981" /> : <CopyIcon size={14} />}
          </button>

          {/* Open all folder tabs */}
          <button
            type="button"
            onClick={handleOpenFolder}
            title={`Open all ${totalItemCount} tabs in browser`}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ExternalLinkIcon size={14} />
          </button>

          {/* Add tab in folder */}
          <button
            type="button"
            onClick={() => onAddTabInFolder(folder.id)}
            title="Add tab inside this folder"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <PlusIcon size={14} />
          </button>

          {/* Add subfolder */}
          <button
            type="button"
            onClick={() => onAddSubFolder(folder.id)}
            title="Add nested subfolder"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <FolderIcon size={13} />
          </button>

          {/* Edit folder */}
          <button
            type="button"
            onClick={() => onEditFolder(folder)}
            title="Edit folder"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: '3px 4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeIconHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <EditIcon size={13} />
          </button>
        </div>
      )}
      </div>

      {/* Expanded Folder Contents */}
      {isExpanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            paddingLeft: '12px',
            borderLeft: `1.5px solid ${guideLineColor}`,
            marginLeft: '14px',
            marginTop: '2px',
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
                  isDarkTheme={isDarkTheme}
                  compact={compact}
                  alwaysShowActions={alwaysShowActions}
                  onToggleExpand={onToggleExpand}
                  onEditFolder={onEditFolder}
                  onDeleteFolder={onDeleteFolder}
                  onAddSubFolder={onAddSubFolder}
                  onAddTabInFolder={onAddTabInFolder}
                  onOpenTab={onOpenTab}
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
                isDarkTheme={isDarkTheme}
                compact={compact}
                alwaysShowActions={alwaysShowActions}
                onOpen={onOpenTab}
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
                fontSize: '12px',
                color: subtextColor,
                padding: '6px 8px',
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
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px',
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
