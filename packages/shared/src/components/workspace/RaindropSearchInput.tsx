'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RaindropSearchItem, RaindropSearchResult, RaindropCollectionItem } from '../../types/raindrop';
import { searchRaindrop } from '../../utils/raindropClient';
import { cleanUrl } from '../../utils/format';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { TabFavicon } from './TabFavicon';
import { SearchIcon, CloseIcon, DropletIcon, ExternalLinkIcon } from '../Icons';

export interface RaindropSearchInputProps {
  raindropToken?: string;
  onSearchRaindrop?: (query: string) => Promise<RaindropSearchResult>;
  onOpenTab?: (url: string, tabId?: string) => void;
  compact?: boolean;
  placeholder?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

type SelectableItem =
  | { type: 'collection'; data: RaindropCollectionItem; id: string }
  | { type: 'bookmark'; data: RaindropSearchItem; id: string };

export const RaindropSearchInput: React.FC<RaindropSearchInputProps> = ({
  raindropToken,
  onSearchRaindrop,
  onOpenTab,
  compact = false,
  placeholder = 'Search Raindrop & filter spaces...',
  searchQuery,
  onSearchChange,
}) => {
  const { isDark } = useSystemTheme();
  const [internalQuery, setInternalQuery] = useState(searchQuery || '');
  const query = searchQuery !== undefined ? searchQuery : internalQuery;

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RaindropSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequestIdRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal query if external searchQuery changes
  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== internalQuery) {
      setInternalQuery(searchQuery);
    }
  }, [searchQuery]);

  // Global shortcut: Cmd+F / Ctrl+F to auto focus search input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Perform search against Raindrop API
  const executeSearch = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setSearchResults(null);
        setIsSearching(false);
        setSearchError(null);
        return;
      }

      const requestId = ++activeRequestIdRef.current;
      setIsSearching(true);
      setSearchError(null);
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

  // Trigger search on mount/query change if query initially populated
  useEffect(() => {
    if (query.trim() && !searchResults && !isSearching) {
      void executeSearch(query);
    }
  }, []);

  // Debounced input handler (250ms for Raindrop API, instant for space filter)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInternalQuery(value);
    onSearchChange?.(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value.trim()) {
      activeRequestIdRef.current++;
      setSearchResults(null);
      setIsSearching(false);
      setSearchError(null);
      setHighlightedIndex(-1);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void executeSearch(value);
    }, 250);
  };

  const handleClear = () => {
    setInternalQuery('');
    onSearchChange?.('');
    activeRequestIdRef.current++;
    setSearchResults(null);
    setIsSearching(false);
    setSearchError(null);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Build selectable items list for keyboard navigation
  const selectableItems: SelectableItem[] = useMemo(() => {
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
    if (item.link) {
      if (onOpenTab) {
        onOpenTab(item.link);
      } else if (typeof window !== 'undefined') {
        window.open(item.link, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleSelectCollection = (collection: RaindropCollectionItem) => {
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
      handleClear();
    }
  };

  const hasCollections = Boolean(searchResults?.collections && searchResults.collections.length > 0);
  const hasItems = Boolean(searchResults?.items && searchResults.items.length > 0);
  const hasResults = hasCollections || hasItems;
  const totalCount = (searchResults?.collections?.length || 0) + (searchResults?.items?.length || 0);

  const shouldShowResults = Boolean(
    query.trim() && (searchResults !== null || isSearching || searchError)
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes arcable-raindrop-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .raindrop-search-row {
          transition: background-color 0.15s ease, transform 0.1s ease;
        }
        .raindrop-search-row:hover {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'} !important;
        }
        .raindrop-search-row:hover .raindrop-open-icon {
          opacity: 1 !important;
        }
      `}</style>

      {/* Main Search Input Bar */}
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
            left: compact ? '12px' : '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            color: isSearching ? '#0284c7' : isDark ? '#64748b' : '#94a3b8',
            transition: 'color 0.15s ease',
            zIndex: 2,
          }}
        >
          {isSearching ? (
            <span
              style={{
                display: 'inline-block',
                animation: 'arcable-raindrop-spin 0.8s linear infinite',
                fontSize: compact ? '15px' : '16px',
                lineHeight: 1,
              }}
            >
              💧
            </span>
          ) : (
            <SearchIcon size={compact ? 15 : 16} />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={handleInputChange}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            height: compact ? '38px' : '42px',
            padding: compact ? '7px 36px 7px 38px' : '8px 40px 8px 44px',
            borderRadius: compact ? '14px' : '16px',
            border: `1px solid ${
              isInputFocused || shouldShowResults
                ? '#0284c7'
                : isDark
                ? '#243247'
                : '#cbd5e1'
            }`,
            backgroundColor: isDark ? '#151e2e' : '#ffffff',
            color: isDark ? '#f8fafc' : '#0f172a',
            fontSize: compact ? '13px' : '14px',
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow:
              isInputFocused || shouldShowResults
                ? isDark
                  ? '0 0 0 2px rgba(56, 189, 248, 0.25)'
                  : '0 0 0 2px rgba(2, 132, 199, 0.15)'
                : 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />

        {/* Cmd+F Shortcut Hint */}
        {!query && (
          <div
            style={{
              position: 'absolute',
              right: compact ? '10px' : '14px',
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
              right: compact ? '8px' : '12px',
              border: 'none',
              background: 'transparent',
              color: isDark ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background-color 0.1s ease',
            }}
          >
            <CloseIcon size={compact ? 13 : 15} />
          </button>
        )}
      </div>

      {/* Cozy Inline Layout Search Results Card (between Search Input and Space Cards) */}
      {shouldShowResults && (
        <div
          style={{
            marginTop: compact ? '10px' : '14px',
            backgroundColor: isDark ? '#151e2e' : '#ffffff',
            borderRadius: compact ? '20px' : '24px',
            border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
            boxShadow: isDark
              ? '0 2px 8px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.2)'
              : '0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 20px rgba(0, 0, 0, 0.03)',
            padding: compact ? '14px 14px' : '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxSizing: 'border-box',
            width: '100%',
            transition: 'all 0.2s ease',
          }}
        >
          {/* Card Header matching SpaceCard aesthetics */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '8px',
              borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
              {/* Droplet Badge Container */}
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '11px',
                  backgroundColor: isDark ? 'rgba(56, 189, 248, 0.16)' : '#e0f2fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '17px',
                  flexShrink: 0,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                💧
              </div>

              {/* Title & Count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '15.5px',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Raindrop Results
                </h3>

                {hasResults && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe',
                      color: isDark ? '#38bdf8' : '#0284c7',
                    }}
                  >
                    {totalCount}
                  </span>
                )}

                {isSearching && (
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: '#0284c7',
                      fontWeight: 500,
                    }}
                  >
                    searching...
                  </span>
                )}
              </div>
            </div>

            {/* Clear button */}
            <button
              type="button"
              onClick={handleClear}
              title="Close search results"
              style={{
                border: 'none',
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                color: isDark ? '#94a3b8' : '#64748b',
                cursor: 'pointer',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '11.5px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'background-color 0.15s ease',
              }}
            >
              <CloseIcon size={12} />
              <span>Clear</span>
            </button>
          </div>

          {/* Loading State */}
          {isSearching && !hasResults && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '24px 12px',
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: '13.5px',
              }}
            >
              <span
                style={{
                  fontSize: '18px',
                  display: 'inline-block',
                  animation: 'arcable-raindrop-spin 0.8s linear infinite',
                }}
              >
                💧
              </span>
              <span>Searching Raindrop bookmarks & collections...</span>
            </div>
          )}

          {/* Error State */}
          {!isSearching && searchError && (
            <div
              style={{
                padding: '14px 14px',
                textAlign: 'center',
                color: '#ef4444',
                fontSize: '13px',
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2',
                borderRadius: '10px',
                border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fecaca'}`,
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
                fontSize: '13.5px',
              }}
            >
              No matching Raindrop bookmarks found for &ldquo;<strong>{query}</strong>&rdquo;
            </div>
          )}

          {/* Collections Section */}
          {hasCollections && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                style={{
                  padding: '2px 4px 4px 4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
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
                    padding: '2px 6px',
                    borderRadius: '5px',
                    fontSize: '10.5px',
                  }}
                >
                  {searchResults?.collections.length}
                </span>
              </div>

              {searchResults?.collections.map((col) => {
                const itemIndex = selectableItems.findIndex(
                  (s) => s.type === 'collection' && s.data._id === col._id
                );
                const isSelected = itemIndex === highlightedIndex;

                return (
                  <div
                    key={col._id}
                    className="raindrop-search-row"
                    data-index={itemIndex}
                    onClick={() => handleSelectCollection(col)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: '44px',
                      padding: '9px 12px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(255, 255, 255, 0.1)'
                          : 'rgba(0, 0, 0, 0.06)'
                        : 'transparent',
                      gap: '12px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '15px',
                          flexShrink: 0,
                        }}
                      >
                        📁
                      </div>
                      <span
                        style={{
                          fontSize: '13.5px',
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {typeof col.count === 'number' && (
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 500,
                            color: isDark ? '#94a3b8' : '#64748b',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            padding: '3px 8px',
                            borderRadius: '10px',
                          }}
                        >
                          {col.count} items
                        </span>
                      )}
                      <span
                        className="raindrop-open-icon"
                        style={{
                          opacity: isSelected ? 1 : 0,
                          color: isDark ? '#94a3b8' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'opacity 0.15s ease',
                        }}
                      >
                        <ExternalLinkIcon size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bookmarks Section */}
          {hasItems && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                style={{
                  padding: '2px 4px 4px 4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
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
                    padding: '2px 6px',
                    borderRadius: '5px',
                    fontSize: '10.5px',
                  }}
                >
                  {searchResults?.items.length}
                </span>
              </div>

              {/* Scrollable list with cozy spacing matching SpaceCard items */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: compact ? '290px' : '360px',
                  overflowY: 'auto',
                  paddingRight: '3px',
                }}
              >
                {searchResults?.items.map((item) => {
                  const itemIndex = selectableItems.findIndex(
                    (s) => s.type === 'bookmark' && s.data._id === item._id
                  );
                  const isSelected = itemIndex === highlightedIndex;

                  return (
                    <div
                      key={item._id}
                      className="raindrop-search-row"
                      data-index={itemIndex}
                      onClick={() => handleSelectBookmark(item)}
                      onMouseEnter={() => setHighlightedIndex(itemIndex)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: '48px',
                        padding: '9px 12px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.06)'
                          : 'transparent',
                        gap: '12px',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Left: Favicon Container + Title & Clean URL Domain */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <TabFavicon
                            url={item.link}
                            size={16}
                            isDarkTheme={isDark}
                            showDomainFallback={true}
                          />
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            minWidth: 0,
                            flex: 1,
                            gap: '2px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13.5px',
                              fontWeight: 550,
                              color: isDark ? '#f8fafc' : '#0f172a',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.35,
                            }}
                          >
                            {item.title || item.link}
                          </span>

                          {item.link && (
                            <span
                              style={{
                                fontSize: '11.5px',
                                color: isDark ? '#94a3b8' : '#64748b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.25,
                                opacity: 0.85,
                              }}
                            >
                              {cleanUrl(item.link)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Collection badge, Tags & Open Icon */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexShrink: 0,
                        }}
                      >
                        {/* Collection badge */}
                        {item.collectionTitle && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                              color: isDark ? '#38bdf8' : '#0369a1',
                              whiteSpace: 'nowrap',
                              maxWidth: '120px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.collectionTitle}
                          </span>
                        )}

                        {/* Tag */}
                        {Array.isArray(item.tags) && item.tags.length > 0 && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '3px 7px',
                              borderRadius: '6px',
                              backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                              color: isDark ? '#94a3b8' : '#64748b',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            #{item.tags[0]}
                          </span>
                        )}

                        <span
                          className="raindrop-open-icon"
                          style={{
                            opacity: isSelected ? 1 : 0,
                            color: isDark ? '#94a3b8' : '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'opacity 0.15s ease',
                            marginLeft: '2px',
                          }}
                        >
                          <ExternalLinkIcon size={14} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
