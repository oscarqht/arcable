'use client';

import React, { useState, useEffect } from 'react';
import { Space } from '../../types/workspace';
import { Button } from '../Button';

interface SpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  space?: Space | null; // null/undefined for create, Space for edit
  onSave: (spaceData: { name: string; emojiIcon?: string; colors?: string }) => void;
}

const PRESET_EMOJIS = ['🏠', '💼', '🚀', '🎨', '🔬', '📚', '⚡', '🌟', '🎮', '💡', '🌐', '🛡️'];
const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#64748b', // Slate
];

export const SpaceModal: React.FC<SpaceModalProps> = ({
  isOpen,
  onClose,
  space,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [emojiIcon, setEmojiIcon] = useState('🏠');
  const [colors, setColors] = useState('#6366f1');

  useEffect(() => {
    if (isOpen) {
      if (space) {
        setName(space.name || '');
        setEmojiIcon(space.emojiIcon || '🏠');
        setColors(space.colors || '#6366f1');
      } else {
        setName('');
        setEmojiIcon('🏠');
        setColors('#6366f1');
      }
    }
  }, [isOpen, space]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      emojiIcon: emojiIcon.trim() || undefined,
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
          maxWidth: '440px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
            {space ? 'Edit Space' : 'Create New Space'}
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
              Space Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Work, Personal, Side Projects"
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

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Emoji Icon (Optional)
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {PRESET_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setEmojiIcon(emoji)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: emojiIcon === emoji ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    backgroundColor: emojiIcon === emoji ? '#f0f9ff' : '#ffffff',
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
              placeholder="Or type custom emoji / text"
              value={emojiIcon}
              onChange={(e) => setEmojiIcon(e.target.value)}
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
              Color Theme (Optional)
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
                value={colors.startsWith('#') ? colors : '#6366f1'}
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
              {space ? 'Save Changes' : 'Create Space'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
