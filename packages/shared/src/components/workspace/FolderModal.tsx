'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Folder, Space } from '../../types/workspace';
import { Button } from '../Button';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder?: Folder | null; // null/undefined for create, Folder for edit
  allFolders: Folder[];
  allSpaces: Space[];
  defaultSpaceId?: string;
  defaultParentFolderId?: string;
  onSave: (folderData: {
    name: string;
    parentSpaceId: string;
    parentFolderId?: string;
    customEmojiIcon?: string;
    colors?: string;
  }) => void;
}

const PRESET_EMOJIS = ['📁', '📂', '💻', '📚', '🚀', '🎨', '💼', '📰', '🛠️', '✨', '🔥', '📌'];
const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#64748b'];

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  folder,
  allFolders,
  allSpaces,
  defaultSpaceId,
  defaultParentFolderId,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId || allSpaces[0]?.id || '');
  const [parentFolderId, setParentFolderId] = useState(defaultParentFolderId || '');
  const [customEmojiIcon, setCustomEmojiIcon] = useState('📁');
  const [colors, setColors] = useState('#3b82f6');

  useEffect(() => {
    if (isOpen) {
      if (folder) {
        setName(folder.name || '');
        setParentSpaceId(folder.parentSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(folder.parentFolderId || '');
        setCustomEmojiIcon(folder.customEmojiIcon || '📁');
        setColors(folder.colors || '#3b82f6');
      } else {
        setName('');
        setParentSpaceId(defaultSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(defaultParentFolderId || '');
        setCustomEmojiIcon('📁');
        setColors('#3b82f6');
      }
    }
  }, [isOpen, folder, defaultSpaceId, defaultParentFolderId, allSpaces]);

  // Compute invalid parent folder IDs (self and all descendants to prevent cycles)
  const invalidParentFolderIds = useMemo(() => {
    if (!folder) return new Set<string>();
    const set = new Set<string>([folder.id]);
    let added = true;
    while (added) {
      added = false;
      for (const f of allFolders) {
        if (f.parentFolderId && set.has(f.parentFolderId) && !set.has(f.id)) {
          set.add(f.id);
          added = true;
        }
      }
    }
    return set;
  }, [folder, allFolders]);

  // Folders available in the selected parent space
  const availableParentFolders = useMemo(() => {
    return allFolders.filter(
      (f) => f.parentSpaceId === parentSpaceId && !invalidParentFolderIds.has(f.id)
    );
  }, [allFolders, parentSpaceId, invalidParentFolderIds]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !parentSpaceId) return;
    onSave({
      name: name.trim(),
      parentSpaceId,
      parentFolderId: parentFolderId || undefined,
      customEmojiIcon: customEmojiIcon.trim() || undefined,
      colors: colors.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
            {folder ? 'Edit Folder' : 'Create New Folder'}
          </h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#94a3b8',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Folder Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Research, Web Tools, Project Alpha"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Parent Space <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={parentSpaceId}
                onChange={(e) => {
                  setParentSpaceId(e.target.value);
                  setParentFolderId(''); // Reset parent folder when space changes
                }}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                {allSpaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emojiIcon ? `${s.emojiIcon} ` : ''}{s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Parent Folder (Optional)
              </label>
              <select
                value={parentFolderId}
                onChange={(e) => setParentFolderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">(None - Root of Space)</option>
                {availableParentFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Emoji Icon (Optional)
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {PRESET_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setCustomEmojiIcon(emoji)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: customEmojiIcon === emoji ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    backgroundColor: customEmojiIcon === emoji ? '#f0f9ff' : '#ffffff',
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Or type custom emoji"
              value={customEmojiIcon}
              onChange={(e) => setCustomEmojiIcon(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Color Accent (Optional)
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColors(c)}
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: colors === c ? '3px solid #0f172a' : '2px solid transparent',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={colors.startsWith('#') ? colors : '#3b82f6'}
                onChange={(e) => setColors(e.target.value)}
                style={{
                  width: '28px',
                  height: '28px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: 0,
                  backgroundColor: 'transparent',
                }}
                title="Custom color picker"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md">
              {folder ? 'Save Changes' : 'Create Folder'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
