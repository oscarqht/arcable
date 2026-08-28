'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Folder, Space } from '../../types/workspace';
import { Button } from '../Button';

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
  onSave: (tabData: {
    url: string;
    parentSpaceId: string;
    parentFolderId?: string;
    customTitle?: string;
    customEmojiIcon?: string;
    pinned?: boolean;
  }) => void;
}

const PRESET_EMOJIS = ['🌐', '🔗', '✨', '⚡', '🐙', '📖', '📝', '📐', '📰', '🔍', '💬', '🎥'];

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
  onSave,
}) => {
  const [url, setUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customEmojiIcon, setCustomEmojiIcon] = useState('');
  const [pinned, setPinned] = useState(false);
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId || allSpaces[0]?.id || '');
  const [parentFolderId, setParentFolderId] = useState(defaultFolderId || '');

  useEffect(() => {
    if (isOpen) {
      if (tab) {
        setUrl(tab.url || '');
        setCustomTitle(tab.customTitle || '');
        setCustomEmojiIcon(tab.customEmojiIcon || '');
        setPinned(Boolean(tab.pinned));
        setParentSpaceId(tab.parentSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(tab.parentFolderId || '');
      } else {
        setUrl(initialUrl || '');
        setCustomTitle(initialTitle || '');
        setCustomEmojiIcon('');
        setPinned(Boolean(initialPinned));
        setParentSpaceId(defaultSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(defaultFolderId || '');
      }
    }
  }, [isOpen, tab, defaultSpaceId, defaultFolderId, initialUrl, initialTitle, initialPinned, allSpaces]);

  // Available folders in selected space
  const spaceFolders = useMemo(() => {
    return allFolders.filter((f) => f.parentSpaceId === parentSpaceId);
  }, [allFolders, parentSpaceId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !parentSpaceId) return;
    onSave({
      url: url.trim(),
      parentSpaceId,
      parentFolderId: pinned ? undefined : (parentFolderId || undefined),
      customTitle: customTitle.trim() || undefined,
      customEmojiIcon: customEmojiIcon.trim() || undefined,
      pinned,
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
          maxWidth: '480px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
            {tab ? 'Edit Tab' : 'Add New Tab'}
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
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Custom Title (Optional)
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
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Space <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={parentSpaceId}
                onChange={(e) => {
                  setParentSpaceId(e.target.value);
                  setParentFolderId('');
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
                Folder (Optional)
              </label>
              <select
                value={parentFolderId}
                disabled={pinned}
                onChange={(e) => setParentFolderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: pinned ? '#f1f5f9' : '#ffffff',
                  cursor: pinned ? 'not-allowed' : 'default',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <input
              type="checkbox"
              id="pinnedTabCheckbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="pinnedTabCheckbox" style={{ fontSize: '13px', fontWeight: 500, color: '#334155', cursor: 'pointer' }}>
              📌 Pin this tab to the top shelf of the space
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Custom Emoji Icon (Optional)
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md">
              {tab ? 'Save Changes' : 'Add Tab'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
