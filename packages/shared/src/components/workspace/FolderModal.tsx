'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Folder, Space } from '../../types/workspace';
import { Button } from '../Button';
import { EmojiPicker } from '../EmojiPicker';
import { useSystemTheme } from '../../hooks/useSystemTheme';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder?: Folder | null; // null/undefined for create, Folder for edit
  allFolders: Folder[];
  allSpaces: Space[];
  defaultSpaceId?: string;
  defaultParentFolderId?: string;
  onDelete?: (folderId: string) => void;
  onSave: (folderData: {
    name: string;
    parentSpaceId: string;
    parentFolderId?: string;
    customEmojiIcon?: string;
    colors?: string;
  }) => void;
}

const PRESET_COLORS = [
  '#f29bbb', // Blossom Pink
  '#a6729e', // Purple Mauve
  '#f25e6c', // Coral Red
  '#ff8657', // Warm Orange
  '#f8d558', // Sunny Yellow
  '#33e895', // Mint Green
  '#6dbad9', // Sky Blue
  '#666789', // Slate Indigo
];

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  folder,
  allFolders,
  allSpaces,
  defaultSpaceId,
  defaultParentFolderId,
  onDelete,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [name, setName] = useState('');
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId || allSpaces[0]?.id || '');
  const [parentFolderId, setParentFolderId] = useState(defaultParentFolderId || '');
  const [customEmojiIcon, setCustomEmojiIcon] = useState('');
  const [colors, setColors] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (folder) {
        setName(folder.name || '');
        setParentSpaceId(folder.parentSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(folder.parentFolderId || '');
        setCustomEmojiIcon(folder.customEmojiIcon || '');
        setColors(folder.colors || '');
      } else {
        setName('');
        setParentSpaceId(defaultSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(defaultParentFolderId || '');
        setCustomEmojiIcon('');
        setColors('');
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
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {folder ? 'Edit Folder' : 'Create New Folder'}
          </h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: isDark ? '#94a3b8' : '#94a3b8',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
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
                border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                color: isDark ? '#f8fafc' : '#0f172a',
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
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
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
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  fontSize: '13px',
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#0f172a',
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
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                Parent Folder
              </label>
              <select
                value={parentFolderId}
                onChange={(e) => setParentFolderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  fontSize: '13px',
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#0f172a',
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

          <EmojiPicker
            value={customEmojiIcon}
            onChange={setCustomEmojiIcon}
            label="Emoji Icon"
            allowClear
          />


          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
              Color Accent
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setColors('')}
                title="No color (Default)"
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: isDark ? '#334155' : '#f8fafc',
                  border: !colors ? (isDark ? '2.5px solid #38bdf8' : '2.5px solid #0f172a') : (isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1'),
                  cursor: 'pointer',
                  outline: 'none',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  boxSizing: 'border-box',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  transition: 'transform 0.12s ease',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6" stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" stroke="#ef4444" strokeWidth="1.5" />
                </svg>
              </button>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColors(c)}
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: colors === c ? (isDark ? '2.5px solid #38bdf8' : '2.5px solid #0f172a') : '1.5px solid rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    transform: colors === c ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.12s ease, border-color 0.12s ease',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: folder && onDelete ? 'space-between' : 'flex-end', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
            {folder && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete folder "${name || folder.name}" and all its contents?`)) {
                    onDelete(folder.id);
                    onClose();
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🗑️ Delete Folder
              </button>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                {folder ? 'Save Changes' : 'Create Folder'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
