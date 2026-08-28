'use client';

import React, { useState } from 'react';
import { Tab } from '../../types/workspace';
import { cleanUrl } from '../../utils/format';

export interface FavouriteTabsShelfProps {
  tabs: Tab[];
  onOpenTab?: (url: string) => void;
  onEditTab: (tab: Tab) => void;
  onDeleteTab: (tabId: string) => void;
  onToggleFavouriteTab: (tabId: string) => void;
  onAddFavouriteTab: () => void;
}

export const FavouriteTabsShelf: React.FC<FavouriteTabsShelfProps> = ({
  tabs,
  onOpenTab,
  onEditTab,
  onDeleteTab,
  onToggleFavouriteTab,
  onAddFavouriteTab,
}) => {
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>⭐</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Favourites ({tabs.length})
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
            • Visible across all spaces
          </span>
        </div>
        <button
          onClick={onAddFavouriteTab}
          title="Add new global favourite tab"
          style={{
            border: 'none',
            background: 'none',
            color: '#0284c7',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 8px',
            borderRadius: '6px',
          }}
        >
          + Favourite
        </button>
      </div>

      {tabs.length === 0 ? (
        <div
          onClick={onAddFavouriteTab}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            backgroundColor: '#f8fafc',
            color: '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>⭐</span>
          <span>No favourite tabs yet. Click to add a favourite tab accessible across all spaces.</span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '8px',
          }}
        >
          {tabs.map((tab) => {
            const isHovered = hoveredTabId === tab.id;
            const displayTitle = tab.customTitle || cleanUrl(tab.url) || 'Untitled';

            return (
              <div
                key={tab.id}
                onMouseEnter={() => setHoveredTabId(tab.id)}
                onMouseLeave={() => setHoveredTabId(null)}
                onClick={() => {
                  if (onOpenTab) {
                    onOpenTab(tab.url);
                  } else {
                    window.open(tab.url, '_blank', 'noopener,noreferrer');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: isHovered ? '#f0fdf4' : '#f8fafc',
                  border: isHovered ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: isHovered ? '0 2px 4px rgba(0,0,0,0.04)' : 'none',
                }}
                title={`${displayTitle}\n${tab.url} (Favourite - Global)`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: '15px',
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      backgroundColor: isHovered ? '#ffffff' : '#f1f5f9',
                    }}
                  >
                    {tab.customEmojiIcon || '🌐'}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {displayTitle}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        color: '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cleanUrl(tab.url)}
                    </span>
                  </div>
                </div>

                {/* Action buttons on hover */}
                {isHovered && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      backgroundColor: '#f0fdf4',
                      paddingLeft: '4px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      title="Remove from favourites"
                      onClick={() => onToggleFavouriteTab(tab.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: '1px 2px',
                      }}
                    >
                      ⭐
                    </button>
                    <button
                      title="Edit tab"
                      onClick={() => onEditTab(tab)}
                      style={{
                        border: 'none',
                        background: 'none',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '1px 2px',
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      title="Delete tab"
                      onClick={() => onDeleteTab(tab.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '1px 2px',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
