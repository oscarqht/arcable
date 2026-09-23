'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, NoteConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { StickyNoteIcon, TrashIcon } from '../../Icons';
import { renderMarkdown, toggleMarkdownCheckbox } from '../../../utils/markdown';

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
  const [mode, setMode] = useState<'preview' | 'edit'>((config.text || '').trim().length > 0 ? 'preview' : 'edit');
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 360
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const colorDropdownRef = useRef<HTMLDivElement>(null);

  // Track window/sidepanel width
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isNarrow = windowWidth < 320;

  // Sync prop changes
  useEffect(() => {
    setText(config.text || '');
    setColorTheme(config.colorTheme || 'yellow');
  }, [config.text, config.colorTheme]);

  // Close color dropdown when clicking outside
  useEffect(() => {
    if (!showColorDropdown) return;
    const handleDropdownClickOutside = (e: MouseEvent | TouchEvent) => {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target as Node)) {
        setShowColorDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleDropdownClickOutside);
    window.addEventListener('touchstart', handleDropdownClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleDropdownClickOutside);
      window.removeEventListener('touchstart', handleDropdownClickOutside);
    };
  }, [showColorDropdown]);

  // Smart default mode on open: Preview if has content, Edit if empty
  useEffect(() => {
    if (isOpen) {
      const hasContent = Boolean(config.text && config.text.trim().length > 0);
      setMode(hasContent ? 'preview' : 'edit');
      setShowColorDropdown(false);
      if (!hasContent) {
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const len = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(len, len);
          }
        }, 50);
      }
    }
  }, [isOpen]);

  // Focus textarea when switching to edit mode
  useEffect(() => {
    if (isOpen && mode === 'edit') {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isOpen, mode]);

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
      if (e.key === 'Escape') {
        if (showColorDropdown) {
          setShowColorDropdown(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, widget.id, showColorDropdown]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const width = Math.min(320, Math.max(240, windowWidth - 20));
  const height = 250;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, windowWidth - width - 10));

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
    setMode('edit');
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleToggleCheckbox = (lineIndex: number) => {
    const newText = toggleMarkdownCheckbox(text, lineIndex);
    handleTextChange(newText);
  };

  return createPortal(
    <div
      id={`stickynote-popover-${widget.id}`}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        maxWidth: 'calc(100vw - 20px)',
        backgroundColor: popoverBg,
        border: `1px solid ${popoverBorder}`,
        borderRadius: '16px',
        boxShadow: theme.isDark
          ? '0 12px 36px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 12px 36px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '12px 14px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: theme.isDark ? '#f8fafc' : '#1e293b',
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Top Header: Title, Segmented [Edit | Preview] Toggle, Color Palette, and Clear */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
          <StickyNoteIcon size={14} />
          <span>Note</span>
        </div>

        {/* Segmented Mode Control [Edit | Preview] */}
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
            borderRadius: '6px',
            padding: '1.5px',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('edit')}
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: mode === 'edit' ? 700 : 500,
              backgroundColor: mode === 'edit' ? (theme.isDark ? '#334155' : '#ffffff') : 'transparent',
              color: mode === 'edit' ? (theme.isDark ? '#f8fafc' : '#0f172a') : (theme.isDark ? '#cbd5e1' : '#64748b'),
              borderRadius: '4.5px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: mode === 'edit' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.12s ease',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: mode === 'preview' ? 700 : 500,
              backgroundColor: mode === 'preview' ? (theme.isDark ? '#334155' : '#ffffff') : 'transparent',
              color: mode === 'preview' ? (theme.isDark ? '#f8fafc' : '#0f172a') : (theme.isDark ? '#cbd5e1' : '#64748b'),
              borderRadius: '4.5px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: mode === 'preview' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.12s ease',
            }}
          >
            Preview
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {isNarrow ? (
            /* Dropdown Color Selector */
            <div ref={colorDropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowColorDropdown((prev) => !prev)}
                title="Change note color"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                  border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'}`,
                  borderRadius: '12px',
                  padding: '2px 5px 2px 4px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '999px',
                    backgroundColor: currentColorConfig.borderLight,
                    border: '1px solid rgba(0,0,0,0.25)',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '8px', opacity: 0.7, lineHeight: 1 }}>▾</span>
              </button>

              {showColorDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 5px)',
                    right: 0,
                    backgroundColor: popoverBg,
                    border: `1px solid ${popoverBorder}`,
                    borderRadius: '10px',
                    boxShadow: theme.isDark
                      ? '0 8px 24px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.4)'
                      : '0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
                    padding: '6px',
                    display: 'flex',
                    gap: '6px',
                    zIndex: 100000,
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        handleColorSelect(c.key);
                        setShowColorDropdown(false);
                      }}
                      title={c.key}
                      style={{
                        width: '15px',
                        height: '15px',
                        borderRadius: '999px',
                        backgroundColor: c.borderLight,
                        border: colorTheme === c.key ? '2px solid #000000' : '1px solid rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                        padding: 0,
                        outline: 'none',
                        transform: colorTheme === c.key ? 'scale(1.18)' : 'scale(1)',
                        transition: 'transform 0.1s ease',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Inline Color Palette Dots */
            NOTE_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => handleColorSelect(c.key)}
                title={c.key}
                style={{
                  width: '13px',
                  height: '13px',
                  borderRadius: '999px',
                  backgroundColor: c.borderLight,
                  border: colorTheme === c.key ? '2px solid #000000' : '1px solid rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                  transform: colorTheme === c.key ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.1s ease',
                }}
              />
            ))
          )}

          {text && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear note"
              style={{
                background: 'none',
                border: 'none',
                color: theme.subtextColor || 'inherit',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '4px',
                opacity: 0.7,
                flexShrink: 0,
              }}
            >
              <TrashIcon size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area: Edit (Textarea) or Preview (Rendered Markdown) */}
      <div
        style={{
          height: '165px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                setMode('preview');
              }
            }}
            placeholder="Write in markdown... (# H1, **bold**, - [ ] task, `code`)"
            rows={7}
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              color: 'inherit',
              fontSize: '12px',
              fontFamily: 'inherit',
              lineHeight: '1.45',
              boxSizing: 'border-box',
              padding: '2px',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              overflowY: 'auto',
              fontSize: '12px',
              lineHeight: '1.45',
              boxSizing: 'border-box',
              padding: '2px',
            }}
          >
            {text.trim() ? (
              renderMarkdown(text, {
                isDark: theme.isDark,
                themeTextColor: theme.isDark ? '#f8fafc' : '#1e293b',
                onToggleCheckbox: handleToggleCheckbox,
              })
            ) : (
              <div
                onClick={() => setMode('edit')}
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: 0.5,
                  fontSize: '11px',
                  gap: '4px',
                }}
              >
                <span>No content yet.</span>
                <span style={{ textDecoration: 'underline' }}>Click to edit</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', opacity: 0.6 }}>
        <span>{text.length} chars</span>
        <span>
          {mode === 'edit' ? 'Auto-saved • ⌘⏎ to preview' : 'Interactive Markdown'}
        </span>
      </div>
    </div>,
    document.body
  );
};
