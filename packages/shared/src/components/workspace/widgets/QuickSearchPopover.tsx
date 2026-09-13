'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, SearchConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { SearchIcon, SettingsIcon } from '../../Icons';

export interface QuickSearchPopoverProps {
  widget: WorkspaceWidget;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (config: SearchConfig) => void;
  onOpenTab?: (url: string) => void;
  theme: SpaceThemeTokens;
}

const ENGINES: { id: NonNullable<SearchConfig['engine']>; name: string; url: string; icon: string }[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', icon: '🔍' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s', icon: '⚡' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', icon: '🦆' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', icon: '🌐' },
  { id: 'custom', name: 'Custom', url: '', icon: '⚙️' },
];

export const QuickSearchPopover: React.FC<QuickSearchPopoverProps> = ({
  widget,
  anchorRect,
  isOpen,
  onClose,
  onUpdateConfig,
  onOpenTab,
  theme,
}) => {
  const config = (widget.config as SearchConfig) || {};
  const activeEngine = config.engine || 'google';
  const customUrl = config.customUrl || '';

  const [query, setQuery] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tempCustomUrl, setTempCustomUrl] = useState(customUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const popoverEl = document.getElementById(`search-popover-${widget.id}`);
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, widget.id]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const width = 280;
  const height = showConfig ? 230 : 160;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const handleSelectEngine = (engineId: SearchConfig['engine']) => {
    onUpdateConfig({
      ...config,
      engine: engineId,
    });
    if (engineId === 'custom' && !customUrl) {
      setShowConfig(true);
    }
  };

  const handleSaveCustomUrl = () => {
    setShowConfig(false);
    onUpdateConfig({
      ...config,
      engine: 'custom',
      customUrl: tempCustomUrl.trim(),
    });
  };

  const handleExecuteSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    let targetTemplate = ENGINES.find((e) => e.id === activeEngine)?.url;
    if (activeEngine === 'custom') {
      targetTemplate = customUrl || 'https://www.google.com/search?q=%s';
    }

    const finalUrl = (targetTemplate || 'https://www.google.com/search?q=%s').replace(
      '%s',
      encodeURIComponent(cleanQuery)
    );

    if (onOpenTab) {
      onOpenTab(finalUrl);
    } else {
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }

    setQuery('');
    onClose();
  };

  return createPortal(
    <div
      id={`search-popover-${widget.id}`}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: theme.isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${theme.borderColor}`,
        borderRadius: '16px',
        boxShadow: theme.isDark
          ? '0 12px 36px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 12px 36px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '12px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: theme.textColor,
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Search Input Form */}
      <form onSubmit={handleExecuteSearch} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
            border: `1px solid ${theme.borderColor}`,
            borderRadius: '10px',
            padding: '6px 10px',
          }}
        >
          <SearchIcon size={14} color={theme.subtextColor} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search on ${ENGINES.find((e) => e.id === activeEngine)?.name || 'Web'}...`}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: theme.textColor,
              fontSize: '12.5px',
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '7px 12px',
            borderRadius: '10px',
            border: 'none',
            background: theme.primaryColor,
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go
        </button>
      </form>

      {/* Engine Selector Pills & Settings Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {ENGINES.map((item) => {
            const isSelected = activeEngine === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectEngine(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: isSelected ? 700 : 500,
                  border: isSelected ? `1px solid ${theme.primaryColor}` : `1px solid ${theme.borderColor}`,
                  background: isSelected
                    ? (theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)')
                    : 'transparent',
                  color: isSelected ? theme.primaryColor : theme.textColor,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          title="Configure custom search URL"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: showConfig ? theme.primaryColor : theme.subtextColor,
            padding: '3px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <SettingsIcon size={13} />
        </button>
      </div>

      {showConfig && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            paddingTop: '6px',
            borderTop: `1px solid ${theme.borderColor}`,
          }}
        >
          <label style={{ fontSize: '10.5px', color: theme.subtextColor }}>
            Custom Search URL (use <code>%s</code> as query placeholder):
          </label>
          <input
            type="text"
            value={tempCustomUrl}
            onChange={(e) => setTempCustomUrl(e.target.value)}
            placeholder="https://example.com/search?q=%s"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: `1px solid ${theme.borderColor}`,
              background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
              color: theme.textColor,
              fontSize: '11.5px',
            }}
          />
          <button
            type="button"
            onClick={handleSaveCustomUrl}
            style={{
              alignSelf: 'flex-end',
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: theme.primaryColor,
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save URL
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};
