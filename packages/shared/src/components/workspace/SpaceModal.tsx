'use client';

import React, { useState, useEffect } from 'react';
import { Space } from '../../types/workspace';
import { Button } from '../Button';
import { EmojiPicker } from '../EmojiPicker';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { PRESET_GRADIENTS, PRESET_SOLID_COLORS } from '../../utils/spaceTheme';

interface SpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  space?: Space | null; // null/undefined for create, Space for edit
  onSave: (spaceData: { name: string; emojiIcon?: string; colors?: string }) => void;
}

export const SpaceModal: React.FC<SpaceModalProps> = ({
  isOpen,
  onClose,
  space,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [name, setName] = useState('');
  const [emojiIcon, setEmojiIcon] = useState('');
  const [colors, setColors] = useState('');

  const prevIsOpenRef = React.useRef(false);
  const prevSpaceIdRef = React.useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isNewlyOpened = isOpen && !prevIsOpenRef.current;
    const spaceChanged = isOpen && space?.id !== prevSpaceIdRef.current;

    if (isNewlyOpened || spaceChanged) {
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

    prevIsOpenRef.current = isOpen;
    prevSpaceIdRef.current = space?.id;
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
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
              color: isDark ? '#94a3b8' : '#64748b',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
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
                borderRadius: '8px',
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

          <EmojiPicker
            value={emojiIcon}
            onChange={setEmojiIcon}
            label="Emoji Icon"
            allowClear
          />

          {/* Color Palette */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '10px' }}>
              Space Color
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Row 1: Gradients */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {PRESET_GRADIENTS.map((g) => {
                  const isSelected = colors === g.value || colors === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setColors(g.value)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: g.value,
                        border: 'none',
                        outline: 'none',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        padding: 0,
                        boxShadow: isSelected
                          ? (isDark ? '0 0 0 2.5px #1e293b, 0 0 0 4.5px #38bdf8, 0 2px 8px rgba(0,0,0,0.35)' : '0 0 0 2.5px #ffffff, 0 0 0 4.5px #0f172a, 0 2px 8px rgba(0,0,0,0.15)')
                          : (isDark ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 1px 3px rgba(0,0,0,0.2)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0,0,0,0.06)'),
                        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                      title={g.name}
                      aria-label={g.name}
                    />
                  );
                })}
              </div>

              {/* Row 2: Solid Colors */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {PRESET_SOLID_COLORS.map((c) => {
                  const isSelected = colors === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColors(c)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: 'none',
                        outline: 'none',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        padding: 0,
                        boxShadow: isSelected
                          ? (isDark ? '0 0 0 2.5px #1e293b, 0 0 0 4.5px #38bdf8, 0 2px 8px rgba(0,0,0,0.35)' : '0 0 0 2.5px #ffffff, 0 0 0 4.5px #0f172a, 0 2px 8px rgba(0,0,0,0.15)')
                          : (isDark ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 1px 3px rgba(0,0,0,0.2)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0,0,0,0.06)'),
                        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                      title={c}
                      aria-label={`Solid color ${c}`}
                    />
                  );
                })}
              </div>

              {/* Row 3: No theme color option */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={() => setColors('')}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: isDark ? '#334155' : '#f1f5f9',
                    border: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: !colors
                      ? (isDark ? '0 0 0 2.5px #1e293b, 0 0 0 4.5px #38bdf8, 0 2px 8px rgba(0,0,0,0.35)' : '0 0 0 2.5px #ffffff, 0 0 0 4.5px #0f172a, 0 2px 8px rgba(0,0,0,0.15)')
                      : (isDark ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 1px 3px rgba(0,0,0,0.2)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0,0,0,0.06)'),
                    transform: !colors ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  title="No theme color (Default)"
                  aria-label="No theme color (Default)"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="5.5" stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth="1.5" />
                    <line x1="4" y1="12" x2="12" y2="4" stroke="#ef4444" strokeWidth="1.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md">
              {space ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
