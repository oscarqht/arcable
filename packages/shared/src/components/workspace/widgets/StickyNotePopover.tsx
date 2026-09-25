'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, NoteConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { StickyNoteIcon, TrashIcon } from '../../Icons';
import {
  renderMarkdownSyntaxHighlight,
  toggleMarkdownCheckbox,
  findMarkdownLinkAtPosition,
  isSafeUrl,
} from '../../../utils/markdown';

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
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 360
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
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

  // Focus textarea when popover opens
  useEffect(() => {
    if (isOpen) {
      setShowColorDropdown(false);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isOpen]);

  // Keep scroll synchronized between textarea and backdrop
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [text]);

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
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleToggleCheckbox = (lineIndex: number, explicitChecked?: boolean) => {
    const currentText = textareaRef.current ? textareaRef.current.value : text;
    const isFocused = typeof document !== 'undefined' && document.activeElement === textareaRef.current;
    const selStart = textareaRef.current?.selectionStart;
    const selEnd = textareaRef.current?.selectionEnd;

    const newText = toggleMarkdownCheckbox(currentText, lineIndex, explicitChecked);
    handleTextChange(newText);

    if (isFocused && textareaRef.current && selStart !== undefined && selEnd !== undefined) {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(selStart, selEnd);
        }
      });
    }
  };

  const handleTextareaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    // 1. Cmd/Ctrl + Click on link to open
    if (e.metaKey || e.ctrlKey) {
      const sel = textareaRef.current?.selectionStart ?? -1;
      if (sel >= 0) {
        const link = findMarkdownLinkAtPosition(text, sel);
        if (link && isSafeUrl(link.url)) {
          window.open(link.url, '_blank', 'noopener,noreferrer');
          return;
        }
      }
    }

    // 2. Click on task checkbox bracket [ ] or [x] to toggle
    if (textareaRef.current) {
      const sel = textareaRef.current.selectionStart;
      const lineStart = text.lastIndexOf('\n', sel - 1) + 1;
      const lineEnd = text.indexOf('\n', sel);
      const lineStr = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
      const col = sel - lineStart;
      const cbMatch = lineStr.match(/^(\s*(?:[-*]|\d+\.)\s+\[)([ xX])(\])/);
      if (cbMatch) {
        const cbStart = cbMatch[1].length - 1; // index of '['
        const cbEnd = cbStart + 2; // index of ']'
        const hasTextAfter = lineStr.length > cbEnd + 1;
        const maxCol = hasTextAfter ? cbEnd : cbEnd + 1;
        if (col >= cbStart && col <= maxCol) {
          const lineIndex = text.slice(0, sel).split('\n').length - 1;
          const isChecked = cbMatch[2].toLowerCase() === 'x';
          handleToggleCheckbox(lineIndex, !isChecked);
        }
      }
    }
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
      <style>{`
        #stickynote-popover-${widget.id} textarea::selection {
          background: rgba(59, 130, 246, 0.35) !important;
          color: transparent !important;
        }
        #stickynote-popover-${widget.id} textarea::-moz-selection {
          background: rgba(59, 130, 246, 0.35) !important;
          color: transparent !important;
        }
        #stickynote-popover-${widget.id} textarea::placeholder {
          color: ${theme.isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.42)'} !important;
          -webkit-text-fill-color: ${theme.isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.42)'} !important;
        }
      `}</style>

      {/* Top Header: Title, Color Palette, and Clear */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
          <StickyNoteIcon size={14} />
          <span>Note</span>
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

      {/* Main Content Area: Unified Editable Markdown Surface with Live Syntax Preview */}
      <div
        style={{
          position: 'relative',
          height: '198px',
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
          borderRadius: '8px',
        }}
      >
        {/* Backdrop: Live syntax-highlighted / formatted markdown */}
        <div
          ref={backdropRef}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflowY: 'auto',
            overflowX: 'hidden',
            fontSize: '12px',
            lineHeight: '1.5',
            fontFamily: 'inherit',
            letterSpacing: 'normal',
            tabSize: 2,
            boxSizing: 'border-box',
            padding: '4px',
            color: theme.isDark ? '#f8fafc' : '#1e293b',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            scrollbarWidth: 'none',
          }}
        >
          {renderMarkdownSyntaxHighlight(text, {
            isDark: theme.isDark,
            textColor: theme.isDark ? '#f8fafc' : '#1e293b',
            onToggleCheckbox: handleToggleCheckbox,
          })}
        </div>

        {/* Foreground: Editable transparent textarea with visible caret */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onScroll={handleScroll}
          onClick={handleTextareaClick}
          placeholder="Write in markdown... (# Heading, **bold**, - [ ] task, `code`)"
          spellCheck={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: 'transparent',
            caretColor: theme.isDark ? '#f8fafc' : '#1e293b',
            fontSize: '12px',
            fontFamily: 'inherit',
            lineHeight: '1.5',
            letterSpacing: 'normal',
            tabSize: 2,
            boxSizing: 'border-box',
            padding: '4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            overflowY: 'auto',
            zIndex: 1,
          }}
        />
      </div>
    </div>,
    document.body
  );
};
