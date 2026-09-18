'use client';

import React, { useState } from 'react';
import { Tab, TabOpenOptions } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import { cleanUrl } from '../../utils/format';
import { getDomain } from '../../utils/treeUtils';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { TabFavicon } from './TabFavicon';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  PinIcon,
  PlusIcon,
  StarIcon,
  EditIcon,
  DuplicateIcon,
  TrashIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
} from '../Icons';

export interface PinnedTabsShelfProps {
  tabs: Tab[];
  tabAssociations?: TabAssociationMap;
  isDarkTheme?: boolean;
  shelfBg?: string;
  onOpenTab?: (url: string, tabId?: string, options?: TabOpenOptions) => void;
  onOpenTmpTab?: (url: string, title?: string) => void;
  onEditTab: (tab: Tab) => void;
  onDuplicateTab?: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onTogglePinTab: (tabId: string) => void;
  onToggleFavouriteTab?: (tabId: string) => void;
  onAddPinnedTab: () => void;
  onReorderPinnedTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
}

export const PinnedTabsShelf: React.FC<PinnedTabsShelfProps> = ({
  tabs,
  tabAssociations,
  isDarkTheme,
  shelfBg,
  onOpenTab,
  onOpenTmpTab,
  onEditTab,
  onDuplicateTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onAddPinnedTab,
  onReorderPinnedTabs,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  if (tabs.length === 0) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    startDrag(e, { id: tabId, type: 'pinnedTab' });
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    if (!isDragAcceptable(e, ['pinnedTab'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === tabId) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const pos = e.clientX < midX ? 'before' : 'after';
    setDragOverTabId(tabId);
    setDropPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    if (!isDragAcceptable(e, ['pinnedTab'])) {
      setDragOverTabId(null);
      setDropPosition(null);
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const pos = dropPosition || 'after';
    setDragOverTabId(null);
    setDropPosition(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      const activeDrag = getActiveDrag();
      const sourceId = activeDrag?.id || (raw ? (JSON.parse(raw) as { id: string }).id : null);
      if (!sourceId || sourceId === targetTabId) return;

      onReorderPinnedTabs?.(sourceId, targetTabId, pos);
    } catch {} finally {
      endDrag();
    }
  };

  const handleDragEnd = () => {
    setDragOverTabId(null);
    setDropPosition(null);
    endDrag();
  };

  const resolvedBg = shelfBg || (effectiveDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.03)');
  const itemBg = effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.85)';
  const itemHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.25)' : '#ffffff';
  const textColor = effectiveDark ? '#ffffff' : '#191c1b';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '10px 12px',
        backgroundColor: resolvedBg,
        borderRadius: '16px',
        border: `1px solid ${effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85 }}>
          <PinIcon size={14} filled={true} />
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Pinned ({tabs.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onAddPinnedTab}
          title="Add pinned tab"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '3px 7px',
            borderRadius: '6px',
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <PlusIcon size={13} />
          <span>Pin Tab</span>
        </button>
      </div>

      {/* Grid of Pinned Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))',
          gap: '7px',
        }}
      >
        {tabs.map((tab) => {
          const isHovered = hoveredTabId === tab.id;
          const isDragTarget = dragOverTabId === tab.id;
          const domain = getDomain(tab.url);
          const displayTitle = tab.customTitle || domain || cleanUrl(tab.url) || 'Pinned Tab';

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => {
                setHoveredTabId(null);
                if (dragOverTabId === tab.id) {
                  setDragOverTabId(null);
                  setDropPosition(null);
                }
              }}
              onClick={(e) => {
                if (tab.url) {
                  const inNewTab = Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
                  if (onOpenTab) {
                    onOpenTab(tab.url, tab.id, { inNewTab, event: e });
                  } else {
                    if (inNewTab) {
                      window.open(tab.url, '_blank', 'noopener,noreferrer');
                    } else {
                      window.location.href = tab.url;
                    }
                  }
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 9px',
                backgroundColor: isHovered ? itemHoverBg : itemBg,
                color: textColor,
                border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
                borderLeft: isDragTarget && dropPosition === 'before' ? '3px solid #0284c7' : undefined,
                borderRight: isDragTarget && dropPosition === 'after' ? '3px solid #0284c7' : undefined,
                borderRadius: '11px',
                cursor: 'grab',
                transition: 'all 0.12s ease',
                position: 'relative',
                userSelect: 'none',
                boxShadow: isHovered ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
              title={`${displayTitle}\n${tab.url}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
                <TabFavicon
                  url={tab.url}
                  favIconUrl={tab.favIconUrl}
                  customEmojiIcon={tab.customEmojiIcon}
                  size={18}
                  emojiSize={18}
                  globeIconSize={18}
                  badge={tabAssociations?.[tab.id]?.badge}
                />

                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'inherit',
                  }}
                >
                  {displayTitle}
                </span>
              </div>

              {/* Action dropdown on hover */}
              <ActionDropdown
                items={[
                  {
                    id: 'copy-url',
                    label: 'Copy URL',
                    icon: <CopyIcon size={14} />,
                    onClick: () => {
                      if (tab.url) navigator.clipboard.writeText(tab.url);
                    },
                  },
                  (() => {
                    const validVariants = (tab.urlVariants || []).filter((v) => Boolean(v.url));
                    const hasMultipleVariants = validVariants.length > 1;
                    const handleOpenTmpTab = (urlToOpen: string, titleToUse?: string) => {
                      if (onOpenTmpTab) {
                        onOpenTmpTab(urlToOpen, titleToUse);
                      } else if (onOpenTab) {
                        onOpenTab(urlToOpen, undefined, { inNewTab: true, asTmpTab: true });
                      } else {
                        window.open(urlToOpen, '_blank', 'noopener,noreferrer');
                      }
                    };

                    return {
                      id: 'open-tmp-tab',
                      label: 'Open in new tab',
                      icon: <ExternalLinkIcon size={14} />,
                      ...(hasMultipleVariants
                        ? {
                            children: validVariants.map((v, idx) => ({
                              id: `open-tmp-var-${v.id || idx}`,
                              label: v.name || cleanUrl(v.url) || 'Variant',
                              icon: <GlobeIcon size={13} />,
                              onClick: (e: any) => {
                                e?.stopPropagation?.();
                                handleOpenTmpTab(v.url, v.name || displayTitle);
                              },
                            })),
                          }
                        : {
                            onClick: (e: any) => {
                              e?.stopPropagation?.();
                              if (tab.url) {
                                handleOpenTmpTab(tab.url, displayTitle);
                              }
                            },
                          }),
                      dividerAfter: Boolean(onToggleFavouriteTab || onTogglePinTab),
                    };
                  })(),
                  ...(onToggleFavouriteTab
                    ? [
                        {
                          id: 'toggle-fav',
                          label: tab.favourite ? 'Remove favourite' : 'Add favourite',
                          icon: (
                            <StarIcon
                              size={14}
                              filled={Boolean(tab.favourite)}
                              color={tab.favourite ? '#eab308' : 'currentColor'}
                            />
                          ),
                          onClick: () => onToggleFavouriteTab(tab.id),
                        },
                      ]
                    : []),
                  {
                    id: 'unpin',
                    label: 'Unpin tab',
                    icon: <PinIcon size={14} />,
                    onClick: () => onTogglePinTab(tab.id),
                    dividerAfter: Boolean(onEditTab || onDuplicateTab || onDeleteTab),
                  },
                  {
                    id: 'edit-tab',
                    label: 'Edit tab',
                    icon: <EditIcon size={14} />,
                    onClick: () => onEditTab(tab),
                  },
                  ...(onDuplicateTab
                    ? [
                        {
                          id: 'duplicate-tab',
                          label: 'Duplicate',
                          icon: <DuplicateIcon size={14} />,
                          onClick: () => onDuplicateTab(tab),
                        },
                      ]
                    : []),
                  {
                    id: 'delete-tab',
                    label: 'Delete tab',
                    icon: <TrashIcon size={14} />,
                    danger: true,
                    onClick: () => onDeleteTab(tab.id),
                  },
                ]}
                isDarkTheme={effectiveDark}
                visible={isMobile || isHovered}
                hoverBg={itemHoverBg}
                buttonTitle="Pinned tab options"
                size="sm"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
