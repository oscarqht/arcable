'use client';

import React, { useState } from 'react';
import { Folder, Tab } from '../../types/workspace';
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
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const childFolders = allFolders.filter((f) => f.parentFolderId === folder.id);
  const childTabs = allTabs.filter((t) => t.parentFolderId === folder.id && !t.pinned);
  const isExpanded = folder.isExpanded !== false;
  const totalItemCount = childFolders.length + childTabs.length;

  const accentColor = folder.colors || '#3b82f6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: depth > 0 ? `${depth * 14}px` : '0' }}>
      {/* Folder Header Row */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          backgroundColor: isHovered ? '#f8fafc' : 'transparent',
          border: '1px solid transparent',
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.12s ease',
          userSelect: 'none',
        }}
        onClick={() => onToggleExpand(folder.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
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
          {/* Child Subfolders */}
          {childFolders.map((subFolder) => (
            <FolderItem
              key={subFolder.id}
              folder={subFolder}
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
            />
          ))}

          {/* Child Tabs */}
          {childTabs.map((tab) => (
            <TabRow
              key={tab.id}
              tab={tab}
              onOpen={onOpenTab}
              onEdit={onEditTab}
              onDelete={onDeleteTab}
              onTogglePin={onTogglePinTab}
              onToggleFavourite={onToggleFavouriteTab}
            />
          ))}

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
