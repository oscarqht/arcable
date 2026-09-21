'use client';

import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';

import { Tab, TabUrlVariant, TabOpenOptions } from '../../types/workspace';
import { MediaControlAction } from '../../types/tabTracker';
import { cleanUrl, areUrlsMatching } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { TabFavicon } from './TabFavicon';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import { CopyLinkButton } from './CopyLinkButton';
import {
  CopyIcon,
  CheckIcon,
  LinkIcon,
  ExternalLinkIcon,
  StarIcon,
  EditIcon,
  DuplicateIcon,
  TrashIcon,
  MinusIcon,
  SlashIcon,
  PrevTrackIcon,
  NextTrackIcon,
  PlayIcon,
  PauseIcon,
  ClockIcon,
  GlobeIcon,
} from '../Icons';
import { SpaceThemeTokens } from '../../utils/spaceTheme';
import { copyToClipboard } from '../../utils/format';

export interface TabRowProps {
  tab: Tab;
  themeStyles?: SpaceThemeTokens;
  isDarkTheme?: boolean;
  compact?: boolean;
  alwaysShowActions?: boolean;
  isAssociated?: boolean;
  isDiverted?: boolean;
  isHighlighted?: boolean;
  isAudible?: boolean;
  isMuted?: boolean;
  badge?: string | number | null;
  currentUrl?: string;
  /** Use single-letter variant labels when the containing space is narrow. */
  compactVariantLabels?: boolean;
  /** Raindrop collection containing this tab, when the tab is synced. */
  raindropCollectionId?: number;
  onOpen?: (url: string, tabId?: string, options?: TabOpenOptions) => void;
  onOpenTmpTab?: (url: string, title?: string) => void;
  onOpenVariant?: (url: string, tab: Tab, variant: TabUrlVariant, options?: TabOpenOptions) => void;
  onCloseAssociatedTab?: () => void;
  onResetDivertedUrl?: () => void;
  onMediaControl?: (action: MediaControlAction) => void;
  onEdit: (tab: Tab) => void;
  onDuplicate?: (tab: Tab) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleFavourite?: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  draggable?: boolean;
  onDragStartItem?: (e: React.DragEvent, tab: Tab) => void;
  onDragOverItem?: (e: React.DragEvent, tab: Tab) => void;
  onDropItem?: (e: React.DragEvent, tab: Tab) => void;
  onDragEndItem?: (e: React.DragEvent) => void;
}

export const TabRow: React.FC<TabRowProps> = ({
  tab,
  themeStyles,
  isDarkTheme,
  compact = false,
  alwaysShowActions = false,
  isAssociated = false,
  isDiverted = false,
  isHighlighted = false,
  isAudible = false,
  isMuted = false,
  badge,
  currentUrl,
  compactVariantLabels = false,
  raindropCollectionId,
  onOpen,
  onOpenTmpTab,
  onOpenVariant,
  onCloseAssociatedTab,
  onResetDivertedUrl,
  onMediaControl,
  onEdit,
  onDuplicate,
  onDelete,
  onTogglePin,
  onToggleFavourite,
  onMoveUp,
  onMoveDown,
  draggable = true,
  onDragStartItem,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
}) => {

  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const resolvedUrl = tab.url;
  const [isLocallyPaused, setIsLocallyPaused] = useState(false);

  useEffect(() => {
    if (!isAudible) {
      setIsLocallyPaused(false);
    }
  }, [isAudible]);

  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<'before' | 'after' | null>(null);

  const domain = getDomain(resolvedUrl);
  const displayTitle = tab.customTitle || domain || cleanUrl(resolvedUrl) || 'Untitled Tab';
  const secondaryVariants = tab.urlVariants && tab.urlVariants.length > 1 ? tab.urlVariants.slice(1) : [];
  const hasVariants = secondaryVariants.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tab.url) {
      const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
      if (onOpen) {
        onOpen(tab.url, tab.id, { inNewTab, event: e });
      } else {
        if (inNewTab) {
          window.open(tab.url, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = tab.url;
        }
      }
    }
  };


  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urlToCopy = currentUrl || tab.url;
    if (urlToCopy) {
      void copyToClipboard(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleEditInRaindrop = () => {
    if (
      Number.isSafeInteger(raindropCollectionId) &&
      (raindropCollectionId ?? 0) > 0 &&
      Number.isSafeInteger(tab.raindropId) &&
      (tab.raindropId ?? 0) > 0
    ) {
      window.open(
        `https://app.raindrop.io/my/${raindropCollectionId}/item/${tab.raindropId}/edit`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const handleOpenTmpTab = useCallback(
    (urlToOpen: string, titleToUse?: string) => {
      if (onOpenTmpTab) {
        onOpenTmpTab(urlToOpen, titleToUse);
      } else if (onOpen) {
        onOpen(urlToOpen, undefined, { inNewTab: true, asTmpTab: true });
      } else {
        window.open(urlToOpen, '_blank', 'noopener,noreferrer');
      }
    },
    [onOpenTmpTab, onOpen]
  );

  const tabMenuItems: ActionDropdownItem[] = useMemo(() => {
    const validVariants = (tab.urlVariants || []).filter((v) => Boolean(v.url));
    const hasMultipleVariants = validVariants.length > 1;

    const tmpTabMenuItem: ActionDropdownItem = {
      id: 'open-tmp-tab',
      label: 'Open in new tab',
      icon: <ExternalLinkIcon size={15} />,
      ...(hasMultipleVariants
        ? {
            children: validVariants.map((v, idx) => ({
              id: `open-tmp-var-${v.id || idx}`,
              label: v.name || cleanUrl(v.url) || 'Variant',
              icon: <GlobeIcon size={14} />,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                handleOpenTmpTab(v.url, v.name || displayTitle);
              },
            })),
          }
        : {
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              if (tab.url) {
                handleOpenTmpTab(tab.url, displayTitle);
              }
            },
          }),
      dividerAfter: Boolean(onToggleFavourite || onEdit || onDuplicate || onDelete),
    };

    const items: ActionDropdownItem[] = [
      {
        id: 'copy-url',
        label: copied ? 'Copied link!' : 'Copy link',
        icon: copied ? <CheckIcon size={15} color="#10b981" /> : <LinkIcon size={15} />,
        onClick: handleCopyUrl,
      },
      tmpTabMenuItem,
    ];

    if (onToggleFavourite) {
      items.push({
        id: 'toggle-fav',
        label: tab.favourite ? 'Remove favourite' : 'Add to favourites',
        icon: <StarIcon size={14} filled={Boolean(tab.favourite)} color={tab.favourite ? '#eab308' : 'currentColor'} />,
        onClick: () => onToggleFavourite(tab.id),
        dividerAfter: Boolean(onEdit || onDuplicate || onDelete),
      });
    }

    if (
      Number.isSafeInteger(raindropCollectionId) &&
      (raindropCollectionId ?? 0) > 0 &&
      Number.isSafeInteger(tab.raindropId) &&
      (tab.raindropId ?? 0) > 0
    ) {
      items.push({
        id: 'edit-in-raindrop',
        label: 'Edit in Raindrop',
        icon: <ExternalLinkIcon size={14} />,
        onClick: handleEditInRaindrop,
        dividerAfter: Boolean(onEdit || onDuplicate || onDelete),
      });
    }

    if (onEdit) {
      items.push({
        id: 'edit-tab',
        label: 'Edit tab',
        icon: <EditIcon size={14} />,
        onClick: () => onEdit(tab),
      });
    }

    if (onDuplicate) {
      items.push({
        id: 'duplicate-tab',
        label: 'Duplicate',
        icon: <DuplicateIcon size={14} />,
        onClick: () => onDuplicate(tab),
      });
    }

    if (onDelete) {
      items.push({
        id: 'delete-tab',
        label: 'Delete tab',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => onDelete(tab.id),
      });
    }

    return items;
  }, [
    copied,
    handleCopyUrl,
    handleOpenTmpTab,
    handleEditInRaindrop,
    displayTitle,
    raindropCollectionId,
    tab,
    onToggleFavourite,
    onEdit,
    onDuplicate,
    onDelete,
  ]);

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    startDrag(e, {
      id: tab.id,
      type: 'tab',
      parentFolderId: tab.parentFolderId,
      parentSpaceId: tab.parentSpaceId,
    });
    if (onDragStartItem) {
      onDragStartItem(e, tab);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Folders are always on top of tabs in the same level.
    // Only accept tab or tmpTab items! Folders must not be dragged down to below or onto tab items.
    if (!isDragAcceptable(e, ['tab', 'tmpTab'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === tab.id) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'before' : 'after';
    setDropIndicator(pos);

    if (onDragOverItem) {
      onDragOverItem(e, tab);
    }
  };

  const handleDragLeave = () => {
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isDragAcceptable(e, ['tab', 'tmpTab'])) {
      setDropIndicator(null);
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDropIndicator(null);
    if (onDropItem) {
      onDropItem(e, tab);
    }
    endDrag();
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDropIndicator(null);
    endDrag();
    if (onDragEndItem) {
      onDragEndItem(e);
    }
  };

  // Color tokens
  const associatedBg = effectiveDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.075)';
  const hoverBg = isAssociated
    ? (effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)')
    : (effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)');
  const activeIconHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';
  const showActions = isMobile || alwaysShowActions || isHovered || copied;


  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={() => {
        if (!isHovered) setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setDropIndicator(null);
      }}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '38px',
        minHeight: '38px',
        padding: '0 8px',
        borderRadius: '10px',
        backgroundColor: isHovered ? hoverBg : isAssociated ? associatedBg : 'transparent',
        borderTop: dropIndicator === 'before' ? '2px solid #0284c7' : '2px solid transparent',
        borderBottom: dropIndicator === 'after' ? '2px solid #0284c7' : '2px solid transparent',
        borderLeft: '2px solid transparent',
        borderRight: '2px solid transparent',
        outline: isHighlighted
          ? themeStyles?.activeIndicatorOutline || (effectiveDark ? '2px solid rgba(255, 255, 255, 0.9)' : '2px solid rgba(15, 23, 42, 0.85)')
          : 'none',
        outlineOffset: isHighlighted ? '-2px' : undefined,
        boxShadow: isHighlighted
          ? themeStyles?.activeIndicatorGlow || (effectiveDark ? '0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 10px rgba(255, 255, 255, 0.35)' : '0 0 0 1px rgba(255, 255, 255, 0.85), 0 0 8px rgba(0, 0, 0, 0.16)')
          : 'none',
        color: textColor,
        cursor: 'pointer',
        gap: '6px',
        transition: 'background-color 0.12s ease, outline 0.2s ease, box-shadow 0.2s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Left side: Favicon/Emoji, Diverted icon (if any), Title (Full Width) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        {/* Favicon or Custom Emoji */}
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
            url={resolvedUrl}
            favIconUrl={tab.favIconUrl}
            customEmojiIcon={tab.customEmojiIcon}
            size={18}
            emojiSize={18}
            isDarkTheme={isDarkTheme}
            showDomainFallback={true}
            globeIconSize={18}
            badge={badge}
          />
        </div>

        {/* Diverted "/" icon button when tab has navigated away */}
        {isDiverted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onResetDivertedUrl?.();
            }}
            title="Associated browser tab navigated to a different URL. Click to activate and return to original URL"
            aria-label="Restore original URL"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: effectiveDark ? 'rgba(234, 179, 8, 0.25)' : '#fef08a',
              color: effectiveDark ? '#fde047' : '#a16207',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              transition: 'all 0.12s ease',
            }}
          >
            <SlashIcon size={12} />
          </button>
        )}

        {/* Title taking available width */}
        <span
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: hasVariants ? '0 1 auto' : 1,
            minWidth: hasVariants ? '40px' : 0,
          }}
          title={displayTitle}
        >
          {displayTitle}
        </span>

        {/* Variant button group following title */}
        {hasVariants && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '6px',
              border: `1px solid ${effectiveDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.14)'}`,
              overflow: 'hidden',
              flexShrink: 1,
              minWidth: 0,
              backgroundColor: effectiveDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {secondaryVariants.map((v, idx) => {
              const isMatch = Boolean(currentUrl && areUrlsMatching(currentUrl, v.url));
              return (
                <button
                  key={v.id || idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
                    if (onOpenVariant) {
                      onOpenVariant(v.url, tab, v, { inNewTab, event: e });
                    } else if (onOpen) {
                      onOpen(v.url, tab.id, { inNewTab, event: e });
                    } else {
                      if (inNewTab) {
                        window.open(v.url, '_blank', 'noopener,noreferrer');
                      } else {
                        window.location.href = v.url;
                      }
                    }
                  }}
                  title={`${v.name}: ${v.url}`}
                  style={{
                    border: 'none',
                    borderRight:
                      idx < secondaryVariants.length - 1
                        ? `1px solid ${effectiveDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}`
                        : 'none',
                    background: isMatch
                      ? (effectiveDark ? '#0284c7' : '#0ea5e9')
                      : 'transparent',
                    color: isMatch
                      ? '#ffffff'
                      : (effectiveDark ? '#cbd5e1' : '#475569'),
                    fontWeight: isMatch ? 700 : 500,
                    fontSize: '11px',
                    padding: '2px 7px',
                    cursor: 'pointer',
                    maxWidth: '80px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.12s ease',
                    height: '20px',
                    lineHeight: '16px',
                    flexShrink: 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isMatch) {
                      e.currentTarget.style.backgroundColor = effectiveDark
                        ? 'rgba(255, 255, 255, 0.15)'
                        : 'rgba(0, 0, 0, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMatch) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {compactVariantLabels
                    ? (v.name || 'Variant').trim().charAt(0).toLocaleUpperCase()
                    : v.name || 'Variant'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right side: Actions (left) + Media controls (right-most) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Action Dropdown (...) button on hover */}
        <ActionDropdown
          items={tabMenuItems}
          isDarkTheme={effectiveDark}
          visible={showActions}
          hoverBg={activeIconHoverBg}
          buttonTitle="Tab options"
          size="sm"
        />

        {/* Copy Link icon button: between ... and - button */}
        {(showActions || copied) && (
          <CopyLinkButton
            url={currentUrl || tab.url}
            isDarkTheme={effectiveDark}
            textColor={textColor}
            hoverBg={activeIconHoverBg}
            iconSize={14}
            copied={copied}
            onCopiedChange={setCopied}
          />
        )}

        {/* "-" button: Always visible when associated */}
        {isAssociated && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onCloseAssociatedTab?.();
            }}
            title="Close associated browser tab"
            aria-label="Close associated browser tab"
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
              opacity: 0.8,
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              transition: 'background-color 0.12s ease, color 0.12s ease, opacity 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = effectiveDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = effectiveDark ? '#94a3b8' : textColor;
              e.currentTarget.style.opacity = '0.8';
            }}
          >
            <MinusIcon size={14} />
          </button>
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

    </div>
  );

};
