'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, NoteConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { StickyNoteIcon, TrashIcon } from '../../Icons';

export interface StickyNotePopoverProps {
  widget: WorkspaceWidget;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (config: NoteConfig) => void;
  theme: SpaceThemeTokens;
}

export const NOTE_COLORS: { key: NoteConfig['colorTheme']; bgLight: string; bgDark: string; borderLight: string; borderDark: string }[] = [
  { key: 'yellow', bgLight: '#fef9c3', bgDark: '#422006', borderLight: '#fde047', borderDark: '#713f12' },
  { key: 'green', bgLight: '#dcfce7', bgDark: '#052e16', borderLight: '#86efac', borderDark: '#14532d' },
  { key: 'pink', bgLight: '#fce7f3', bgDark: '#500724', borderLight: '#f472b6', borderDark: '#831843' },
  { key: 'blue', bgLight: '#e0f2fe', bgDark: '#082f49', borderLight: '#7dd3fc', borderDark: '#0369a1' },
  { key: 'purple', bgLight: '#f3e8ff', bgDark: '#3b0764', borderLight: '#d8b4fe', borderDark: '#581c87' },
  { key: 'slate', bgLight: '#f1f5f9', bgDark: '#1e293b', borderLight: '#cbd5e1', borderDark: '#334155' },
];

export const StickyNotePopover: React.FC<StickyNotePopoverProps> = ({
  widget,
  anchorRect,
  isOpen,
  onClose,
  onUpdateConfig,
  theme,
}) => {
  const config = (widget.config as NoteConfig) || {};
  const [text, setText] = useState(config.text || '');
  const [colorTheme, setColorTheme] = useState<NoteConfig['colorTheme']>(config.colorTheme || 'yellow');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync prop changes
  useEffect(() => {
    setText(config.text || '');
    setColorTheme(config.colorTheme || 'yellow');
  }, [config.text, config.colorTheme]);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isOpen]);

  // Click outside to close and save
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const popoverEl = document.getElementById(`stickynote-popover-${widget.id}`);
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, widget.id]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const width = 260;
  const height = 230;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const currentColorConfig = NOTE_COLORS.find((c) => c.key === colorTheme) || NOTE_COLORS[0];
  const popoverBg = theme.isDark ? currentColorConfig.bgDark : currentColorConfig.bgLight;
  const popoverBorder = theme.isDark ? currentColorConfig.borderDark : currentColorConfig.borderLight;

  const handleTextChange = (newText: string) => {
    setText(newText);
    onUpdateConfig({
      ...config,
      text: newText,
      colorTheme,
    });
  };

  const handleColorSelect = (c: NoteConfig['colorTheme']) => {
    setColorTheme(c);
    onUpdateConfig({
      ...config,
      text,
      colorTheme: c,
    });
  };

  const handleClear = () => {
    setText('');
    onUpdateConfig({
      ...config,
      text: '',
      colorTheme,
    });
    textareaRef.current?.focus();
  };

  return createPortal(
    <div
      id={`stickynote-popover-${widget.id}`}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: popoverBg,
        border: `1px solid ${popoverBorder}`,
        borderRadius: '16px',
        boxShadow: theme.isDark
          ? '0 12px 36px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 12px 36px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '12px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: theme.isDark ? '#f8fafc' : '#1e293b',
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Top Header: Title, Clear, and Color Palette */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
          <StickyNoteIcon size={14} />
          <span>Quick Note</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {/* Color Palette Dots */}
          {NOTE_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => handleColorSelect(c.key)}
              title={c.key}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '999px',
                backgroundColor: theme.isDark ? c.borderLight : c.borderLight,
                border: colorTheme === c.key ? '2px solid #000000' : '1px solid rgba(0,0,0,0.2)',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                transform: colorTheme === c.key ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 0.1s ease',
              }}
            />
          ))}

          {text && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear note"
              style={{
                background: 'none',
                border: 'none',
                color: theme.subtextColor,
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                marginLeft: '4px',
              }}
            >
              <TrashIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Note Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Write a quick thought or task..."
        rows={6}
        style={{
          width: '100%',
          resize: 'none',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          color: 'inherit',
          fontSize: '12.5px',
          fontFamily: 'inherit',
          lineHeight: '1.5',
          boxSizing: 'border-box',
          padding: '2px',
        }}
      />

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', opacity: 0.6 }}>
        <span>{text.length} chars</span>
        <span>Auto-saved</span>
      </div>
    </div>,
    document.body
  );
};
