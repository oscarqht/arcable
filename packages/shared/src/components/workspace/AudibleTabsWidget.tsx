'use client';

import React, { useState } from 'react';
import { AudibleTab } from '../../types/tabTracker';
import { TabFavicon } from './TabFavicon';

export interface AudibleTabsWidgetProps {
  tabs: AudibleTab[];
  isDarkTheme?: boolean;
  onActivateTab?: (tabId: number, windowId?: number) => void;
  onToggleMute?: (tabId: number, muted?: boolean) => void;
  style?: React.CSSProperties;
}

export const AudibleTabsWidget: React.FC<AudibleTabsWidgetProps> = ({
  tabs,
  isDarkTheme = false,
  onActivateTab,
  onToggleMute,
  style,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredTabId, setHoveredTabId] = useState<number | null>(null);

  if (!tabs || tabs.length === 0) {
    return null;
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredTabId(null);
      }}
      style={{
        position: 'fixed',
        bottom: '56px',
        left: '16px',
        zIndex: 35,
        display: 'flex',
        alignItems: 'center',
        gap: isHovered ? '6px' : '0px',
        backgroundColor: isDarkTheme ? 'rgba(21, 30, 46, 0.92)' : 'rgba(255, 255, 255, 0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: isDarkTheme ? '1px solid rgba(51, 65, 85, 0.85)' : '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '9999px',
        padding: isHovered && tabs.length > 1 ? '4px 8px 4px 6px' : '4px 8px 4px 6px',
        boxShadow: isDarkTheme
          ? '0 4px 20px -2px rgba(0, 0, 0, 0.55), 0 2px 8px -1px rgba(0, 0, 0, 0.35)'
          : '0 4px 20px -2px rgba(0, 0, 0, 0.12), 0 2px 8px -1px rgba(0, 0, 0, 0.06)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        maxWidth: 'calc(100vw - 32px)',
        userSelect: 'none',
        pointerEvents: 'auto',
        ...style,
      }}
    >
      <style>{`
        @keyframes arcable-soundbar-1 {
          0%, 100% { height: 3px; }
          50% { height: 10px; }
        }
        @keyframes arcable-soundbar-2 {
          0%, 100% { height: 10px; }
          50% { height: 4px; }
        }
        @keyframes arcable-soundbar-3 {
          0%, 100% { height: 5px; }
          50% { height: 11px; }
        }
        .arcable-audible-item:hover {
          transform: scale(1.1);
        }
      `}</style>

      {/* Stack of audible tab icons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.25s ease',
        }}
      >
        {tabs.map((tab, index) => {
          const isItemHovered = hoveredTabId === tab.id;
          const isMuted = tab.muted === true;

          return (
            <div
              key={tab.id}
              className="arcable-audible-item"
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: index > 0 ? (isHovered ? '4px' : '-10px') : '0',
                zIndex: tabs.length - index,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer',
              }}
              title={`${tab.title || tab.url || 'Playing Audio'} ${isMuted ? '(Muted)' : '(Playing)'}\n• Click to switch tab\n• Click speaker to ${isMuted ? 'unmute' : 'mute'}`}
            >
              {/* Tab Favicon Button */}
              <button
                type="button"
                onClick={() => onActivateTab?.(tab.id, tab.windowId)}
                aria-label={tab.title || 'Audible tab'}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: isDarkTheme ? '#1e293b' : '#f1f5f9',
                  borderRadius: '9999px',
                  width: '28px',
                  height: '28px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: isDarkTheme
                    ? '0 0 0 1.5px rgba(255,255,255,0.12), 0 2px 4px rgba(0,0,0,0.3)'
                    : '0 0 0 1.5px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.08)',
                  transition: 'all 0.2s ease',
                }}
              >
                <TabFavicon
                  url={tab.url}
                  size={16}
                  isDarkTheme={isDarkTheme}
                  showDomainFallback={true}
                />
              </button>

              {/* Mute/Sound Equalizer overlay badge */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMute?.(tab.id, !isMuted);
                }}
                aria-label={isMuted ? 'Unmute tab' : 'Mute tab'}
                title={isMuted ? 'Click to unmute' : 'Click to mute'}
                style={{
                  position: 'absolute',
                  bottom: '-2px',
                  right: '-3px',
                  outline: 'none',
                  backgroundColor: isMuted ? '#ef4444' : '#10b981',
                  color: '#ffffff',
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  border: `1.5px solid ${isDarkTheme ? '#151e2e' : '#ffffff'}`,
                  zIndex: 3,
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {isMuted ? (
                  <span style={{ fontSize: '7.5px', lineHeight: 1, fontWeight: 700 }}>✕</span>
                ) : (
                  <span style={{ fontSize: '7.5px', lineHeight: 1 }}>♪</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Mini sound wave visualizer bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '2px',
          height: '12px',
          marginLeft: '6px',
          paddingRight: '2px',
        }}
      >
        <span
          style={{
            width: '2px',
            backgroundColor: '#10b981',
            borderRadius: '1px',
            animation: tabs.some((t) => !t.muted) ? 'arcable-soundbar-1 0.8s ease-in-out infinite' : 'none',
            height: tabs.some((t) => !t.muted) ? '8px' : '2px',
            opacity: tabs.some((t) => !t.muted) ? 1 : 0.4,
          }}
        />
        <span
          style={{
            width: '2px',
            backgroundColor: '#10b981',
            borderRadius: '1px',
            animation: tabs.some((t) => !t.muted) ? 'arcable-soundbar-2 0.7s ease-in-out infinite' : 'none',
            height: tabs.some((t) => !t.muted) ? '12px' : '2px',
            opacity: tabs.some((t) => !t.muted) ? 1 : 0.4,
          }}
        />
        <span
          style={{
            width: '2px',
            backgroundColor: '#10b981',
            borderRadius: '1px',
            animation: tabs.some((t) => !t.muted) ? 'arcable-soundbar-3 0.9s ease-in-out infinite' : 'none',
            height: tabs.some((t) => !t.muted) ? '6px' : '2px',
            opacity: tabs.some((t) => !t.muted) ? 1 : 0.4,
          }}
        />
      </div>
    </div>
  );
};
