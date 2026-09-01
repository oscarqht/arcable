'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RaindropSearchItem, RaindropSearchResult, RaindropCollectionItem } from '../../types/raindrop';
import { searchRaindrop } from '../../utils/raindropClient';
import { cleanUrl } from '../../utils/format';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { TabFavicon } from './TabFavicon';
import { SearchIcon, CloseIcon, DropletIcon } from '../Icons';

export interface RaindropSearchInputProps {
  raindropToken?: string;
  onSearchRaindrop?: (query: string) => Promise<RaindropSearchResult>;
  onOpenTab?: (url: string, tabId?: string) => void;
  compact?: boolean;
  placeholder?: string;
}

type SelectableItem =
  | { type: 'collection'; data: RaindropCollectionItem; id: string }
  | { type: 'bookmark'; data: RaindropSearchItem; id: string };

export const RaindropSearchInput: React.FC<RaindropSearchInputProps> = ({
  raindropToken,
  onSearchRaindrop,
  onOpenTab,
  compact = false,
  placeholder = 'Search Raindrop bookmarks & collections...',
}) => {
  const { isDark } = useSystemTheme();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RaindropSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeRequestIdRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Global shortcut: Cmd+F / Ctrl+F to auto focus search input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        if (query.trim() && (searchResults || isSearching)) {
          setIsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [query, searchResults, isSearching]);

  // Perform search
  const executeSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setSearchResults(null);
        setIsSearching(false);
        setSearchError(null);
        setIsOpen(false);
        return;
      }

      const requestId = ++activeRequestIdRef.current;
      setIsSearching(true);
      setSearchError(null);
      setIsOpen(true);
      setHighlightedIndex(-1);

      try {
        let results: RaindropSearchResult;

        if (onSearchRaindrop) {
          results = await onSearchRaindrop(trimmed);
        } else if (raindropToken) {
          results = await searchRaindrop(raindropToken, trimmed);
        } else if (typeof window !== 'undefined') {
          // Fallback to web API route
          const res = await fetch(`/api/raindrop/search?query=${encodeURIComponent(trimmed)}`);
          if (res.ok) {
            results = await res.json();
          } else {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch search results');
          }
        } else {
          results = { items: [], collections: [] };
        }

        if (requestId === activeRequestIdRef.current) {
          setSearchResults(results || { items: [], collections: [] });
        }
      } catch (err: any) {
        if (requestId === activeRequestIdRef.current) {
          console.warn('[RaindropSearchInput] Search failed:', err);
          setSearchError(err?.message || 'Search failed');
          setSearchResults({ items: [], collections: [] });
        }
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [onSearchRaindrop, raindropToken]
  );

  // Debounced input handler (300ms)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value.trim()) {
      activeRequestIdRef.current++;
      setSearchResults(null);
      setIsSearching(false);
      setSearchError(null);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void executeSearch(value);
    }, 300);
  };

  const handleClear = () => {
    setQuery('');
    setSearchResults(null);
    setIsSearching(false);
    setSearchError(null);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Build selectable items list for keyboard navigation
  const selectableItems: SelectableItem[] = React.useMemo(() => {
    if (!searchResults) return [];
    const list: SelectableItem[] = [];

    (searchResults.collections || []).forEach((c) => {
      list.push({ type: 'collection', data: c, id: `col_${c._id}` });
    });

    (searchResults.items || []).forEach((item) => {
      list.push({ type: 'bookmark', data: item, id: `bm_${item._id}` });
    });

    return list;
  }, [searchResults]);

  const handleSelectBookmark = (item: RaindropSearchItem) => {
    setIsOpen(false);
    if (item.link) {
      if (onOpenTab) {
        onOpenTab(item.link);
      } else if (typeof window !== 'undefined') {
        window.open(item.link, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleSelectCollection = (collection: RaindropCollectionItem) => {
    setIsOpen(false);
    const collectionUrl = `https://app.raindrop.io/my/${collection._id}`;
    if (onOpenTab) {
      onOpenTab(collectionUrl);
    } else if (typeof window !== 'undefined') {
      window.open(collectionUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSelectCurrent = () => {
    if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
      const selected = selectableItems[highlightedIndex];
      if (selected.type === 'collection') {
        handleSelectCollection(selected.data);
      } else {
        handleSelectBookmark(selected.data);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && e.key === 'ArrowDown' && query.trim()) {
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectableItems.length > 0) {
        setHighlightedIndex((prev) => (prev < selectableItems.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectableItems.length > 0) {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : selectableItems.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectCurrent();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const el = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const hasCollections = Boolean(searchResults?.collections && searchResults.collections.length > 0);
  const hasItems = Boolean(searchResults?.items && searchResults.items.length > 0);
  const hasResults = hasCollections || hasItems;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
        zIndex: 40,
      }}
    >
      {/* Search Input Container */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {/* Left Search / Droplet Icon */}
        <div
          style={{
            position: 'absolute',
            left: compact ? '10px' : '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            color: isSearching ? '#0284c7' : isDark ? '#64748b' : '#94a3b8',
            transition: 'color 0.15s ease',
          }}
        >
          {isSearching ? (
            <span
              style={{
                display: 'inline-block',
                animation: 'arcable-search-spin 0.8s linear infinite',
                fontSize: compact ? '13px' : '15px',
                lineHeight: 1,
              }}
            >
              💧
            </span>
          ) : (
            <SearchIcon size={compact ? 14 : 16} />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.trim() && (searchResults || isSearching)) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            height: compact ? '34px' : '38px',
            padding: compact ? '6px 32px 6px 32px' : '8px 36px 8px 36px',
            borderRadius: compact ? '10px' : '12px',
            border: `1px solid ${
              isOpen
                ? '#0284c7'
                : isDark
                ? '#243247'
                : '#cbd5e1'
            }`,
            backgroundColor: isDark ? '#151e2e' : '#ffffff',
            color: isDark ? '#f8fafc' : '#0f172a',
            fontSize: compact ? '12px' : '13px',
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow: isOpen
              ? isDark
                ? '0 0 0 2px rgba(56, 189, 248, 0.25)'
                : '0 0 0 2px rgba(2, 132, 199, 0.15)'
              : 'none',
            transition: 'all 0.15s ease',
          }}
        />

        {/* Cmd+F Shortcut Hint */}
        {!query && (
          <div
            style={{
              position: 'absolute',
              right: compact ? '8px' : '10px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <kbd
              style={{
                fontSize: compact ? '9px' : '10px',
                padding: '2px 5px',
                borderRadius: '4px',
                backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                color: isDark ? '#64748b' : '#94a3b8',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              ⌘F
            </kbd>
          </div>
        )}

        {/* Clear Button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            title="Clear search"
            style={{
              position: 'absolute',
              right: compact ? '8px' : '10px',
              border: 'none',
              background: 'transparent',
              color: isDark ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
            }}
          >
            <CloseIcon size={compact ? 12 : 14} />
          </button>
        )}
      </div>

      <style>{`
        @keyframes arcable-search-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Floating Dropdown Results Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: isDark ? '#151e2e' : '#ffffff',
            border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
            borderRadius: '12px',
            boxShadow: isDark
              ? '0 16px 36px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)'
              : '0 16px 36px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(15, 23, 42, 0.06)',
            maxHeight: compact ? '320px' : '400px',
            overflowY: 'auto',
            zIndex: 9999,
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {/* Loading State */}
          {isSearching && !hasResults && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '24px 12px',
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: '13px',
              }}
            >
              <span
                style={{
                  fontSize: '16px',
                  display: 'inline-block',
                  animation: 'arcable-search-spin 0.8s linear infinite',
                }}
              >
                💧
              </span>
              <span>Searching Raindrop bookmarks...</span>
            </div>
          )}

          {/* Error State */}
          {!isSearching && searchError && (
            <div
              style={{
                padding: '16px 12px',
                textAlign: 'center',
                color: '#ef4444',
                fontSize: '12px',
              }}
            >
              {searchError}
            </div>
          )}

          {/* Empty Results State */}
          {!isSearching && !searchError && searchResults && !hasResults && (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: isDark ? '#64748b' : '#94a3b8',
                fontSize: '13px',
              }}
            >
              No matching Raindrop bookmarks found for &ldquo;<strong>{query}</strong>&rdquo;
            </div>
          )}

          {/* Collections Section */}
          {hasCollections && (
            <div style={{ marginBottom: '4px' }}>
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: isDark ? '#64748b' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Collections</span>
                <span
                  style={{
                    backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                    color: isDark ? '#cbd5e1' : '#475569',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '10px',
                  }}
                >
                  {searchResults?.collections.length}
                </span>
              </div>

              {searchResults?.collections.map((col) => {
                const itemIndex = selectableItems.findIndex((s) => s.type === 'collection' && s.data._id === col._id);
                const isSelected = itemIndex === highlightedIndex;

                return (
                  <div
                    key={col._id}
                    data-index={itemIndex}
                    onClick={() => handleSelectCollection(col)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: isSelected
                        ? isDark
                          ? '#1e293b'
                          : '#f1f5f9'
                        : 'transparent',
                      transition: 'background-color 0.1s ease',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '15px', flexShrink: 0 }}>📁</span>
                      <span
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 600,
                          color: isDark ? '#f8fafc' : '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col.title}
                      </span>
                    </div>

                    {typeof col.count === 'number' && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: isDark ? '#94a3b8' : '#64748b',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          flexShrink: 0,
                        }}
                      >
                        {col.count} items
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bookmarks Section */}
          {hasItems && (
            <div>
              {hasCollections && (
                <div
                  style={{
                    height: '1px',
                    backgroundColor: isDark ? '#243247' : '#e2e8f0',
                    margin: '4px 0',
                  }}
                />
              )}

              <div
                style={{
                  padding: '4px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: isDark ? '#64748b' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Bookmarks</span>
                <span
                  style={{
                    backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                    color: isDark ? '#cbd5e1' : '#475569',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '10px',
                  }}
                >
                  {searchResults?.items.length}
                </span>
                {isSearching && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#0284c7',
                      fontWeight: 500,
                      marginLeft: 'auto',
                    }}
                  >
                    updating...
                  </span>
                )}
              </div>

              {searchResults?.items.map((item) => {
                const itemIndex = selectableItems.findIndex((s) => s.type === 'bookmark' && s.data._id === item._id);
                const isSelected = itemIndex === highlightedIndex;

                return (
                  <div
                    key={item._id}
                    data-index={itemIndex}
                    onClick={() => handleSelectBookmark(item)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: isSelected
                        ? isDark
                          ? '#1e293b'
                          : '#f1f5f9'
                        : 'transparent',
                      transition: 'background-color 0.1s ease',
                    }}
                  >
                    {/* Top line: Icon + Title + Badges */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                      }}
                    >
                      <TabFavicon
                        url={item.link}
                        size={15}
                        isDarkTheme={isDark}
                        showDomainFallback={true}
                      />

                      <span
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 500,
                          color: isDark ? '#f8fafc' : '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {item.title || item.link}
                      </span>

                      {/* Collection badge */}
                      {item.collectionTitle && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 500,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                            color: isDark ? '#38bdf8' : '#0369a1',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {item.collectionTitle}
                        </span>
                      )}

                      {/* Tags */}
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: isDark ? '#334155' : '#f1f5f9',
                            color: isDark ? '#cbd5e1' : '#64748b',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          #{item.tags[0]}
                        </span>
                      )}
                    </div>

                    {/* Bottom line: Clean URL subtitle */}
                    {item.link && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: isDark ? '#64748b' : '#94a3b8',
                          marginLeft: '23px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cleanUrl(item.link)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
