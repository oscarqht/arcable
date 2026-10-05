'use client';

import React, { useState, useRef, useEffect } from 'react';
import { EmojiPicker as FrimousseEmojiPicker } from 'frimousse';

export interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  presets?: string[];
  label?: string;
  placeholder?: string;
  allowClear?: boolean;
  required?: boolean;

  /** Compact mode for small widget editors and toolbar fields */
  compact?: boolean;
  /** Popover horizontal alignment relative to trigger ('left' | 'right') */
  align?: 'left' | 'right';
  /** Popover vertical placement ('bottom' | 'top' | 'auto') */
  placement?: 'bottom' | 'top' | 'auto';
  /** Dark mode theme switch */
  isDark?: boolean;
  /** Custom popover width (number in px or CSS string) */
  popoverWidth?: number | string;
  /** Custom popover inner height (number in px or CSS string) */
  popoverHeight?: number | string;
  /** Number of emoji columns in viewport */
  columns?: number;
  /** Custom inline styles for trigger button */
  buttonStyle?: React.CSSProperties;
  /** Custom CSS class for trigger button */
  buttonClassName?: string;
  /** Custom inline styles for outer container */
  containerStyle?: React.CSSProperties;
  /** Custom CSS class for outer container */
  containerClassName?: string;
  /** Custom inline styles for field label */
  labelStyle?: React.CSSProperties;
  /** Accessible ARIA label for trigger button */
  ariaLabel?: string;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  value,
  onChange,
  label = 'Emoji Icon',
  placeholder = 'Select emoji',
  allowClear = true,
  required = false,
  compact = false,
  align = 'left',
  placement = 'auto',
  isDark = false,
  popoverWidth,
  popoverHeight = 300,
  columns,
  buttonStyle,
  buttonClassName,
  containerStyle,
  containerClassName,
  labelStyle,
  ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [computedPlacement, setComputedPlacement] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute auto placement based on viewport space
  useEffect(() => {
    if (!isOpen) return;

    if (placement === 'top' || placement === 'bottom') {
      setComputedPlacement(placement);
      return;
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const targetHeight = typeof popoverHeight === 'number' ? popoverHeight + 60 : 360;
      if (spaceBelow < targetHeight && rect.top > spaceBelow) {
        setComputedPlacement('top');
      } else {
        setComputedPlacement('bottom');
      }
    }
  }, [isOpen, placement, popoverHeight]);

  // Close popover on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    // Use capture phase for Escape so that nested parent popovers do not close simultaneously
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  const handleSelect = (emojiChar: string) => {
    onChange(emojiChar);
    setIsOpen(false);
  };

  const defaultWidth = compact ? 260 : 320;
  const numericWidth =
    typeof popoverWidth === 'number'
      ? popoverWidth
      : typeof popoverWidth === 'string'
      ? parseInt(popoverWidth, 10) || defaultWidth
      : defaultWidth;

  const activeColumns = columns ?? (numericWidth < 300 ? 7 : 8);
  const itemSize = activeColumns >= 8 ? '34px' : '31px';
  const itemFontSize = activeColumns >= 8 ? '19px' : '17px';

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{ position: 'relative', ...containerStyle }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: compact ? '11px' : '13px',
            fontWeight: compact ? 500 : 600,
            color: isDark ? '#94a3b8' : '#334155',
            marginBottom: compact ? '3px' : '6px',
            ...labelStyle,
          }}
        >
          {label} {required ? <span style={{ color: '#ef4444' }}>*</span> : null}
        </label>
      )}

      {/* Trigger Button */}
      {compact ? (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            title={value ? `Emoji: ${value} (Click to change)` : placeholder}
            aria-label={ariaLabel || (value ? `Emoji: ${value}` : 'Select emoji')}
            className={buttonClassName}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              width: '100%',
              height: '28px',
              padding: '4px 6px',
              borderRadius: '6px',
              border: isOpen
                ? `1px solid ${isDark ? '#38bdf8' : '#0284c7'}`
                : `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
              backgroundColor: isOpen
                ? isDark
                  ? 'rgba(56, 189, 248, 0.15)'
                  : '#f0f9ff'
                : isDark
                ? 'rgba(0, 0, 0, 0.3)'
                : '#f8fafc',
              fontSize: '13px',
              lineHeight: 1,
              color: isDark ? '#f8fafc' : '#1e293b',
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease',
              ...buttonStyle,
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1 }}>{value || placeholder || '⚙️'}</span>
            <span
              style={{
                fontSize: '8px',
                color: isDark ? '#94a3b8' : '#64748b',
                opacity: 0.8,
              }}
            >
              {isOpen ? '▲' : '▼'}
            </span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            title={value ? 'Change emoji' : 'Select emoji'}
            aria-label={ariaLabel || (value ? `Emoji: ${value}` : 'Select emoji')}
            className={buttonClassName}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: isOpen
                ? `2px solid ${isDark ? '#38bdf8' : '#0284c7'}`
                : `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
              backgroundColor: isOpen
                ? isDark
                  ? 'rgba(56, 189, 248, 0.15)'
                  : '#f0f9ff'
                : isDark
                ? '#1e293b'
                : '#f8fafc',
              fontSize: '13px',
              fontWeight: 500,
              color: isDark ? '#f8fafc' : '#1e293b',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              ...buttonStyle,
            }}
          >
            {value ? (
              <>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#475569' }}>
                  Change
                </span>
              </>
            ) : (
              <span style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
                {placeholder}
              </span>
            )}
            <span
              style={{
                fontSize: '10px',
                color: isDark ? '#64748b' : '#94a3b8',
                marginLeft: '2px',
              }}
            >
              {isOpen ? '▲' : '▼'}
            </span>
          </button>

          {allowClear && value && (
            <button
              type="button"
              onClick={() => onChange('')}
              title="Clear emoji icon"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                fontSize: '12px',
                color: isDark ? '#94a3b8' : '#64748b',
                cursor: 'pointer',
              }}
            >
              ✕ Remove
            </button>
          )}
        </div>
      )}

      {/* Frimousse Emoji Picker Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            zIndex: 100000,
            width: typeof popoverWidth === 'number' ? `${popoverWidth}px` : popoverWidth ?? defaultWidth,
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            ...(computedPlacement === 'top'
              ? { bottom: 'calc(100% + 4px)' }
              : { top: 'calc(100% + 4px)' }),
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            borderRadius: '12px',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            boxShadow: isDark
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
              : '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: isDark ? '#cbd5e1' : '#475569',
                }}
              >
                Select Emoji
              </span>
              {allowClear && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  title="Clear emoji"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11px',
                    color: isDark ? '#38bdf8' : '#0284c7',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    textDecoration: 'underline',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close emoji picker"
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '14px',
                color: isDark ? '#94a3b8' : '#94a3b8',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              ✕
            </button>
          </div>

          <FrimousseEmojiPicker.Root
            columns={activeColumns}
            onEmojiSelect={({ emoji }) => handleSelect(emoji)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: typeof popoverHeight === 'number' ? `${popoverHeight}px` : popoverHeight,
            }}
          >
            {/* Search Input */}
            <div
              style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
              }}
            >
              <FrimousseEmojiPicker.Search
                placeholder="Search all emojis…"
                autoFocus
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#1e293b',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {/* Scrollable Viewport */}
            <FrimousseEmojiPicker.Viewport
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '6px 8px',
              }}
            >
              <FrimousseEmojiPicker.Loading
                style={{
                  display: 'block',
                  padding: '30px 16px',
                  textAlign: 'center',
                  color: isDark ? '#64748b' : '#94a3b8',
                  fontSize: '13px',
                }}
              >
                Loading emojis…
              </FrimousseEmojiPicker.Loading>

              <FrimousseEmojiPicker.Empty
                style={{
                  display: 'block',
                  padding: '30px 16px',
                  textAlign: 'center',
                  color: isDark ? '#64748b' : '#94a3b8',
                  fontSize: '13px',
                }}
              >
                No emoji found.
              </FrimousseEmojiPicker.Empty>

              <FrimousseEmojiPicker.List
                components={{
                  CategoryHeader: ({ category, ...headerProps }) => (
                    <div
                      {...headerProps}
                      style={{
                        padding: '6px 4px 4px 4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: isDark ? '#94a3b8' : '#64748b',
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        zIndex: 1,
                        ...headerProps.style,
                      }}
                    >
                      {category.label}
                    </div>
                  ),
                  Emoji: ({ emoji, ...emojiProps }) => (
                    <button
                      {...emojiProps}
                      title={emoji.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: itemSize,
                        height: itemSize,
                        fontSize: itemFontSize,
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: emoji.isActive
                          ? isDark
                            ? 'rgba(56, 189, 248, 0.25)'
                            : '#e0f2fe'
                          : 'transparent',
                        outline: emoji.isActive
                          ? isDark
                            ? '1px solid #38bdf8'
                            : '1px solid #7dd3fc'
                          : 'none',
                        cursor: 'pointer',
                        userSelect: 'none',
                        padding: 0,
                        transition: 'background-color 0.1s ease',
                        ...emojiProps.style,
                      }}
                    >
                      {emoji.emoji}
                    </button>
                  ),
                  Row: ({ children, ...rowProps }) => (
                    <div
                      {...rowProps}
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '2px',
                        ...rowProps.style,
                      }}
                    >
                      {children}
                    </div>
                  ),
                }}
              />
            </FrimousseEmojiPicker.Viewport>

            {/* Footer with Active Preview & SkinTone Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                borderTop: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                fontSize: '12px',
              }}
            >
              <FrimousseEmojiPicker.ActiveEmoji>
                {({ emoji }) => (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth:
                        typeof numericWidth === 'number'
                          ? `${Math.max(140, numericWidth - 65)}px`
                          : '220px',
                    }}
                  >
                    {emoji ? (
                      <>
                        <span style={{ fontSize: '15px' }}>{emoji.emoji}</span>
                        <span
                          style={{
                            fontWeight: 500,
                            color: isDark ? '#e2e8f0' : '#334155',
                          }}
                        >
                          {emoji.label}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                        Hover or navigate emoji
                      </span>
                    )}
                  </div>
                )}
              </FrimousseEmojiPicker.ActiveEmoji>

              <FrimousseEmojiPicker.SkinToneSelector
                title="Change skin tone"
                style={{
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  borderRadius: '6px',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#1e293b',
                  padding: '2px 6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              />
            </div>
          </FrimousseEmojiPicker.Root>
        </div>
      )}
    </div>
  );
};
