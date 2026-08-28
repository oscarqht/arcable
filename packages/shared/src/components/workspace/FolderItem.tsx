'use client';

import React, { useState } from 'react';
import { Folder, Tab } from '../../types/workspace';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { TabRow } from './TabRow';

interface FolderItemProps {
  folder: Folder;
  allFolders: Folder[];
  allTabs: Tab[];
  depth?: number;
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
  const [dropIndicator, setDropIndicator] = useState<'before' | 'after' | 'inside' | null>(null);

  const siblings = getSortedSiblings(allFolders, allTabs, folder.parentSpaceId, folder.id);
  const isExpanded = folder.isExpanded !== false;
  const totalItemCount = siblings.length;

  const accentColor = folder.colors || '#3b82f6';

  const handleDragStart = (e: React.DragEvent) => {
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
      if (!parsed || !parsed.id) return;
      if (parsed.id === folder.id) return;

      if (onReorderSiblingItem) {
        onReorderSiblingItem({
          sourceId: parsed.id,
          sourceType: parsed.type,
          targetId: folder.id,
          targetType: 'folder',
          position: currentIndicator,
        });
      }
    } catch {
      // ignore
    }
  };

  const handleChildTabDrop = (e: React.DragEvent, targetTab: Tab) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; type: 'folder' | 'tab' };
      if (!parsed || !parsed.id || parsed.id === targetTab.id) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const pos = e.clientY < midY ? 'before' : 'after';

      if (onReorderSiblingItem) {
        onReorderSiblingItem({
          sourceId: parsed.id,
          sourceType: parsed.type,
          targetId: targetTab.id,
          targetType: 'tab',
          position: pos,
        });
      }
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginLeft: depth > 0 ? `${depth * 14}px` : '0',
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
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          backgroundColor:
            dropIndicator === 'inside'
              ? '#e0f2fe'
              : isHovered
              ? '#f8fafc'
              : 'transparent',
          border: '1px solid transparent',
          borderTop: dropIndicator === 'before' ? '2px solid #0284c7' : '1px solid transparent',
          borderBottom: dropIndicator === 'after' ? '2px solid #0284c7' : '1px solid transparent',
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: '6px',
          cursor: 'grab',
          transition: 'all 0.12s ease',
          userSelect: 'none',
        }}
        onClick={() => onToggleExpand(folder.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          {/* Drag Handle */}
          <span
            style={{
              fontSize: '11px',
              color: isHovered ? '#94a3b8' : 'transparent',
              cursor: 'grab',
              lineHeight: 1,
              userSelect: 'none',
              transition: 'color 0.12s ease',
            }}
            title="Drag to reorder folder"
          >
            ⠿
          </span>

          {/* Chevron */}
          <span
            style={{
              fontSize: '11px',
              color: '#64748b',
              display: 'inline-block',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            ▶
          </span>

          {/* Emoji */}
          <span style={{ fontSize: '15px' }}>{folder.customEmojiIcon || '📁'}</span>

          {/* Name */}
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {folder.name}
          </span>

          {/* Count Badge */}
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              backgroundColor: '#e2e8f0',
              color: '#475569',
              borderRadius: '10px',
              padding: '1px 6px',
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

        {/* Folder Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            opacity: isHovered ? 1 : 0.2,
            transition: 'opacity 0.15s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Move Up/Down */}
          {onMoveUp && (
            <button
              title="Move up"
              onClick={onMoveUp}
              style={{
                border: 'none',
                background: 'transparent',
                borderRadius: '4px',
                padding: '2px 4px',
                fontSize: '10px',
                cursor: 'pointer',
                color: '#64748b',
              }}
            >
              ▲
            </button>
          )}
          {onMoveDown && (
            <button
              title="Move down"
              onClick={onMoveDown}
              style={{
                border: 'none',
                background: 'transparent',
                borderRadius: '4px',
                padding: '2px 4px',
                fontSize: '10px',
                cursor: 'pointer',
                color: '#64748b',
              }}
            >
              ▼
            </button>
          )}

          <button
            title="Add tab in this folder"
            onClick={() => onAddTabInFolder(folder.id)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '3px 5px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              color: '#0284c7',
            }}
          >
            + Tab
          </button>
          <button
            title="Add nested subfolder"
            onClick={() => onAddSubFolder(folder.id)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '3px 5px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              color: '#0284c7',
            }}
          >
            + Subfolder
          </button>
          <button
            title="Edit folder"
            onClick={() => onEditFolder(folder)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '3px 4px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ✏️
          </button>
          <button
            title="Delete folder and contents"
            onClick={() => {
              if (confirm(`Delete folder "${folder.name}" and all contents?`)) {
                onDeleteFolder(folder.id);
              }
            }}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '3px 4px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              color: '#ef4444',
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Expanded Folder Contents */}
      {isExpanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingLeft: '12px',
            borderLeft: '1px dashed #cbd5e1',
            marginLeft: '8px',
          }}
        >
          {/* Interleaved Sibling Items */}
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
                onDropItem={handleChildTabDrop}
              />
            );
          })}

          {/* Empty Folder Placeholder */}
          {totalItemCount === 0 && (
            <div
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                fontStyle: 'italic',
                padding: '6px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Empty folder</span>
              <button
                onClick={() => onAddTabInFolder(folder.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#0284c7',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: 0,
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
