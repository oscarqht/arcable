'use client';

import React, { useState, useRef, useEffect } from 'react';
import { TmpTab } from '../../types/workspace';
import { MediaControlAction } from '../../types/tabTracker';
import { cleanUrl } from '../../utils/format';
import { getDomain, isValidHttpUrl } from '../../utils/treeUtils';
import { TabFavicon } from './TabFavicon';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  PlusIcon,
  CloseIcon,
  EditIcon,
  CheckIcon,
  PrevTrackIcon,
  NextTrackIcon,
  PlayIcon,
  PauseIcon,
} from '../Icons';

export interface TmpTabRowProps {
  tab: TmpTab;
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  isAssociated?: boolean;
  isHighlighted?: boolean;
  isAudible?: boolean;
  isMuted?: boolean;
  badge?: string | number | null;
  onOpen?: (url: string, tabId?: string) => void;
  onPromote: (tab: TmpTab) => void;
  onClose: (tab: TmpTab) => void;
  onRename?: (tab: TmpTab, newTitle: string) => void;
  onMediaControl?: (action: MediaControlAction) => void;
}

export const TmpTabRow: React.FC<TmpTabRowProps> = ({
  tab,
  isDarkTheme,
  compact = false,
  alwaysShowActions = false,
  isAssociated = true,
  isHighlighted = false,
  isAudible = false,
  isMuted = false,
  badge,
  onOpen,
  onPromote,
  onClose,
  onRename,
  onMediaControl,
}) => {

  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [isLocallyPaused, setIsLocallyPaused] = useState(false);

  useEffect(() => {
    if (!isAudible) {
      setIsLocallyPaused(false);
    }
  }, [isAudible]);

  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [editTitle, setEditTitle] = useState(tab.customTitle || tab.title || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const domain = getDomain(tab.url);
  const displayTitle = tab.customTitle || tab.title || domain || cleanUrl(tab.url) || 'Untitled Tab';

  useEffect(() => {
    if (isEditing) {
      setEditTitle(tab.customTitle || tab.title || '');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 20);
    }
  }, [isEditing, tab.customTitle, tab.title]);

  const isHttp = isValidHttpUrl(tab.url);

  const handleStartRename = (e: React.MouseEvent) => {
    if (!isHttp) return;
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
  };

  const handleSaveRename = () => {
    setIsEditing(false);
    onRename?.(tab, editTitle.trim());
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setIsEditing(false);
    setEditTitle(tab.customTitle || tab.title || '');
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.preventDefault();
    if (tab.url) {
      if (onOpen) {
        onOpen(tab.url, tab.id);
      } else {
        window.open(tab.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Color tokens
  const associatedBg = effectiveDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
  const hoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';
  const showActions = isMobile || alwaysShowActions || isHovered || isEditing;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '38px',
        minHeight: '38px',
        padding: '0 8px',
        borderRadius: '10px',
        backgroundColor: isEditing ? (effectiveDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.08)') : isHovered ? hoverBg : isAssociated ? associatedBg : 'transparent',
        outline: isHighlighted ? '2px solid #38bdf8' : isEditing ? '1.5px solid #38bdf8' : 'none',
        outlineOffset: (isHighlighted || isEditing) ? '-2px' : undefined,
        boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.6), 0 0 8px rgba(56, 189, 248, 0.35)' : 'none',
        color: textColor,
        cursor: isEditing ? 'default' : 'pointer',
        gap: '6px',
        transition: 'background-color 0.12s ease, outline 0.2s ease, box-shadow 0.2s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Left side: Favicon, Title or Inline Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        <div
          style={{
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <TabFavicon
            url={tab.url}
            size={18}
            emojiSize={18}
            isDarkTheme={isDarkTheme}
            showDomainFallback={true}
            globeIconSize={18}
            badge={tab.badge || badge}
          />
        </div>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelRename();
              }
            }}
            placeholder={tab.title || domain || 'Enter custom title...'}
            style={{
              flex: 1,
              minWidth: 0,
              height: '24px',
              padding: '2px 6px',
              borderRadius: '5px',
              border: `1px solid ${effectiveDark ? '#0284c7' : '#38bdf8'}`,
              backgroundColor: effectiveDark ? '#0f172a' : '#ffffff',
              color: textColor,
              fontSize: '13px',
              fontWeight: 500,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          /* Title taking 100% available width */
          <span
            onDoubleClick={isHttp ? handleStartRename : undefined}
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'inherit',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
            title={tab.customTitle ? `${tab.customTitle} (Original: ${tab.title || domain})` : displayTitle}
          >
            {displayTitle}
          </span>
        )}
      </div>

      {/* Right side action buttons & media controls */}
      {(showActions || isAudible) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {showActions && (
            <>
              {isEditing ? (
                <>
                  {/* Save / Checkmark Button */}
                  <button
                    type="button"
                    onClick={handleSaveRename}
                    title="Save title"
                    aria-label="Save title"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: effectiveDark ? '#34d399' : '#059669',
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'background-color 0.12s ease, color 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(52, 211, 153, 0.2)' : '#d1fae5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <CheckIcon size={14} color={effectiveDark ? '#34d399' : '#059669'} />
                  </button>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={handleCancelRename}
                    title="Cancel"
                    aria-label="Cancel"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: effectiveDark ? '#94a3b8' : textColor,
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'background-color 0.12s ease, color 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
                    }}
                  >
                    <CloseIcon size={12} />
                  </button>
                </>
              ) : (
                <>
                  {isHttp && (
                    <>
                      {/* Rename Button */}
                      <button
                        type="button"
                        onClick={handleStartRename}
                        title="Rename tab"
                        aria-label="Rename tab"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'transparent',
                          color: effectiveDark ? '#94a3b8' : textColor,
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                          transition: 'background-color 0.12s ease, color 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe';
                          e.currentTarget.style.color = '#0284c7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
                        }}
                      >
                        <EditIcon size={13} />
                      </button>

                      {/* "+" Button: Open Add Tab Modal prefilled */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onPromote(tab);
                        }}
                        title="Save to workspace"
                        aria-label="Save to workspace"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'transparent',
                          color: effectiveDark ? '#94a3b8' : textColor,
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                          transition: 'background-color 0.12s ease, color 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe';
                          e.currentTarget.style.color = '#0284c7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
                        }}
                      >
                        <PlusIcon size={14} />
                      </button>
                    </>
                  )}

                  {/* "x" Button: Close browser tab */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onClose(tab);
                    }}
                    title="Close tab"
                    aria-label="Close tab"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: effectiveDark ? '#94a3b8' : textColor,
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'background-color 0.12s ease, color 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
                    }}
                  >
                    <CloseIcon size={13} />
                  </button>
                </>
              )}
            </>
          )}

          {/* Compact inline media control bar - always visible on the right-most side when audible */}
          {isAudible && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1px',
                backgroundColor: effectiveDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                border: `1px solid ${effectiveDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.28)'}`,
                borderRadius: '6px',
                padding: '1px 3px',
                height: '24px',
                boxSizing: 'border-box',
                flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Previous track */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onMediaControl?.('prev');
                }}
                title="Previous track / Seek back"
                aria-label="Previous track"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: effectiveDark ? '#34d399' : '#059669',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'background-color 0.12s ease, transform 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <PrevTrackIcon size={11} />
              </button>

              {/* Play / Pause toggle */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const nextPaused = !isLocallyPaused;
                  setIsLocallyPaused(nextPaused);
                  onMediaControl?.(nextPaused ? 'pause' : 'play');
                }}
                title={isLocallyPaused ? 'Play' : 'Pause'}
                aria-label={isLocallyPaused ? 'Play' : 'Pause'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: effectiveDark ? '#34d399' : '#059669',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'background-color 0.12s ease, transform 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {isLocallyPaused ? <PlayIcon size={11} /> : <PauseIcon size={11} />}
              </button>


              {/* Next track */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onMediaControl?.('next');
                }}
                title="Next track / Seek forward"
                aria-label="Next track"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: effectiveDark ? '#34d399' : '#059669',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'background-color 0.12s ease, transform 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <NextTrackIcon size={11} />
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
