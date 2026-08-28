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
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  value,
  onChange,
  presets = [],
  label = 'Emoji Icon',
  placeholder = 'Or type custom emoji',
  allowClear = false,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (emojiChar: string) => {
    onChange(emojiChar);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: '#334155',
            marginBottom: '6px',
          }}
        >
          {label} {required ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional)</span>}
        </label>
      )}

      {/* Preset and Trigger Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {/* Main Trigger / Current Preview Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title="Open full emoji picker"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '6px',
            border: isOpen ? '2px solid #0284c7' : '1px solid #cbd5e1',
            backgroundColor: isOpen ? '#f0f9ff' : '#f8fafc',
            fontSize: '14px',
            fontWeight: 500,
            color: '#1e293b',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>{value || '😀'}</span>
          <span style={{ fontSize: '12px', color: '#475569' }}>Browse All</span>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
        </button>

        {/* Quick Presets */}
        {presets.map((emoji) => {
          const isSelected = value === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                fontSize: '16px',
                lineHeight: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {emoji}
            </button>
          );
        })}

        {/* Optional Clear Button */}
        {allowClear && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear emoji icon"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              fontSize: '12px',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Frimousse Emoji Picker Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% - 2px)',
            left: 0,
            zIndex: 10000,
            width: '320px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
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
              padding: '10px 12px 8px 12px',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
              Select Emoji
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '14px',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              ✕
            </button>
          </div>

          <FrimousseEmojiPicker.Root
            columns={8}
            onEmojiSelect={({ emoji }) => handleSelect(emoji)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '320px',
            }}
          >
            {/* Search Input */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
              <FrimousseEmojiPicker.Search
                placeholder="Search all emojis…"
                autoFocus
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
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
                  color: '#94a3b8',
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
                  color: '#94a3b8',
                  fontSize: '13px',
                }}
              >
                No emoji found.
              </FrimousseEmojiPicker.Empty>

              <FrimousseEmojiPicker.List
                components={{
                  CategoryHeader: ({ category, ...props }) => (
                    <div
                      {...props}
                      style={{
                        padding: '6px 4px 4px 4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: '#64748b',
                        backgroundColor: '#ffffff',
                        zIndex: 1,
                        ...props.style,
                      }}
                    >
                      {category.label}
                    </div>
                  ),
                  Emoji: ({ emoji, ...props }) => (
                    <button
                      {...props}
                      title={emoji.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '34px',
                        height: '34px',
                        fontSize: '19px',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: emoji.isActive ? '#e0f2fe' : 'transparent',
                        outline: emoji.isActive ? '1px solid #7dd3fc' : 'none',
                        cursor: 'pointer',
                        userSelect: 'none',
                        padding: 0,
                        transition: 'background-color 0.1s ease',
                        ...props.style,
                      }}
                    >
                      {emoji.emoji}
                    </button>
                  ),
                  Row: ({ children, ...props }) => (
                    <div
                      {...props}
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '2px',
                        ...props.style,
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
                borderTop: '1px solid #f1f5f9',
                backgroundColor: '#f8fafc',
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
                      maxWidth: '220px',
                    }}
                  >
                    {emoji ? (
                      <>
                        <span style={{ fontSize: '15px' }}>{emoji.emoji}</span>
                        <span style={{ fontWeight: 500, color: '#334155' }}>{emoji.label}</span>
                      </>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Hover or navigate emoji</span>
                    )}
                  </div>
                )}
              </FrimousseEmojiPicker.ActiveEmoji>

              <FrimousseEmojiPicker.SkinToneSelector
                title="Change skin tone"
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  padding: '2px 6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              />
            </div>
          </FrimousseEmojiPicker.Root>
        </div>
      )}

      {/* Direct text input for typing or pasting custom emojis/characters */}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
};
