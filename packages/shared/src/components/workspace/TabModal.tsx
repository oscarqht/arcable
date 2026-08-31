'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Folder, Space } from '../../types/workspace';
import { Button } from '../Button';
import { EmojiPicker } from '../EmojiPicker';
import { useSystemTheme } from '../../hooks/useSystemTheme';

interface TabModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab?: Tab | null; // null/undefined for create, Tab for edit
  allFolders: Folder[];
  allSpaces: Space[];
  defaultSpaceId?: string;
  defaultFolderId?: string;
  initialUrl?: string;
  initialTitle?: string;
  initialPinned?: boolean;
  initialFavourite?: boolean;
  onDelete?: (tabId: string) => void;
  onSave: (tabData: {
    url: string;
    parentSpaceId?: string;
    parentFolderId?: string;
    customTitle?: string;
    customEmojiIcon?: string;
    pinned?: boolean;
    favourite?: boolean;
  }) => void;
}

export const TabModal: React.FC<TabModalProps> = ({
  isOpen,
  onClose,
  tab,
  allFolders,
  allSpaces,
  defaultSpaceId,
  defaultFolderId,
  initialUrl,
  initialTitle,
  initialPinned,
  initialFavourite,
  onDelete,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [url, setUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customEmojiIcon, setCustomEmojiIcon] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId || allSpaces[0]?.id || '');
  const [parentFolderId, setParentFolderId] = useState(defaultFolderId || '');

  useEffect(() => {
    if (isOpen) {
      if (tab) {
        setUrl(tab.url || '');
        setCustomTitle(tab.customTitle || '');
        setCustomEmojiIcon(tab.customEmojiIcon || '');
        setFavourite(Boolean(tab.favourite));
        setParentSpaceId(tab.parentSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(tab.parentFolderId || '');
      } else {
        setUrl(initialUrl || '');
        setCustomTitle(initialTitle || '');
        setCustomEmojiIcon('');
        setFavourite(Boolean(initialFavourite));
        setParentSpaceId(defaultSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(defaultFolderId || '');
      }
    }
  }, [isOpen, tab, defaultSpaceId, defaultFolderId, initialUrl, initialTitle, initialFavourite, allSpaces]);

  // Available folders in selected space
  const spaceFolders = useMemo(() => {
    return allFolders.filter((f) => f.parentSpaceId === parentSpaceId);
  }, [allFolders, parentSpaceId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (!favourite && !parentSpaceId) return;

    onSave({
      url: url.trim(),
      parentSpaceId: favourite ? undefined : parentSpaceId,
      parentFolderId: favourite ? undefined : (parentFolderId || undefined),
      customTitle: customTitle.trim() || undefined,
      customEmojiIcon: customEmojiIcon.trim() || undefined,
      pinned: false,
      favourite,
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
          maxWidth: '480px',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {tab ? 'Edit Tab' : 'Add New Tab'}
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
              URL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
              Custom Title
            </label>
            <input
              type="text"
              placeholder="e.g. Arcable Documentation (leave blank to use URL)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
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
            />
          </div>

          {/* Favourite checkbox */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: favourite ? (isDark ? 'rgba(22, 101, 52, 0.25)' : '#f0fdf4') : (isDark ? '#0f172a' : '#f8fafc'),
              borderRadius: '6px',
              border: favourite ? `1px solid ${isDark ? '#15803d' : '#86efac'}` : `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              id="favouriteTabCheckbox"
              checked={favourite}
              onChange={(e) => setFavourite(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />

            <label htmlFor="favouriteTabCheckbox" style={{ fontSize: '13px', fontWeight: 600, color: favourite ? (isDark ? '#86efac' : '#166534') : (isDark ? '#cbd5e1' : '#334155'), cursor: 'pointer' }}>
              ⭐ Mark as Favourite
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', opacity: favourite ? 0.5 : 1 }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                Space {favourite ? '(N/A for Favourite)' : <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <select
                value={parentSpaceId}
                disabled={favourite}
                onChange={(e) => {
                  setParentSpaceId(e.target.value);
                  setParentFolderId('');
                }}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  fontSize: '13px',
                  backgroundColor: favourite ? (isDark ? '#334155' : '#f1f5f9') : (isDark ? '#0f172a' : '#ffffff'),
                  color: isDark ? '#f8fafc' : '#0f172a',
                  cursor: favourite ? 'not-allowed' : 'default',
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
                Folder
              </label>
              <select
                value={parentFolderId}
                disabled={favourite}
                onChange={(e) => setParentFolderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  fontSize: '13px',
                  backgroundColor: favourite ? (isDark ? '#334155' : '#f1f5f9') : (isDark ? '#0f172a' : '#ffffff'),
                  color: isDark ? '#f8fafc' : '#0f172a',
                  cursor: favourite ? 'not-allowed' : 'default',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">(None - Root of Space)</option>
                {spaceFolders.map((f) => (
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
            label="Custom Emoji Icon"
            allowClear
          />


          <div style={{ display: 'flex', justifyContent: tab && onDelete ? 'space-between' : 'flex-end', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
            {tab && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete tab "${customTitle || url}"?`)) {
                    onDelete(tab.id);
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
                🗑️ Delete Tab
              </button>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                {tab ? 'Save Changes' : 'Add Tab'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
