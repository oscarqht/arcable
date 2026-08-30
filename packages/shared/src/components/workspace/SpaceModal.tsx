'use client';

import React, { useState, useEffect } from 'react';
import { Space } from '../../types/workspace';
import { Button } from '../Button';
import { EmojiPicker } from '../EmojiPicker';

interface SpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  space?: Space | null; // null/undefined for create, Space for edit
  onSave: (spaceData: { name: string; emojiIcon?: string; colors?: string }) => void;
}

const PRESET_COLORS = [
  '#f4efdf', // Cream Vanilla
  '#f0b8cd', // Blossom Pink
  '#e9c3e3', // Soft Lilac
  '#da7682', // Berry Rose
  '#eb8570', // Warm Melon
  '#dcce7f', // Soft Honey
  '#5becad', // Mint Green
  '#919bb5', // Slate Periwinkle
];

export const SpaceModal: React.FC<SpaceModalProps> = ({
  isOpen,
  onClose,
  space,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [emojiIcon, setEmojiIcon] = useState('');
  const [colors, setColors] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (space) {
        setName(space.name || '');
        setEmojiIcon(space.emojiIcon || '');
        setColors(space.colors || '');
      } else {
        setName('');
        setEmojiIcon('');
        setColors('');
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
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
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
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
            {space ? 'Edit Space' : 'New Space'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
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
              placeholder="e.g. Work, Personal, Research"
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

          <EmojiPicker
            value={emojiIcon}
            onChange={setEmojiIcon}
            label="Emoji Icon"
            allowClear
          />

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Color Theme (Optional)
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setColors('')}
                title="No custom theme (Default)"
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: '#f8fafc',
                  border: !colors ? '2.5px solid #0f172a' : '1.5px solid #cbd5e1',
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
                    border: colors === c ? '2.5px solid #0f172a' : '1.5px solid rgba(0,0,0,0.08)',
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
