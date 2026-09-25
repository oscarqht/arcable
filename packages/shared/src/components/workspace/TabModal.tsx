'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Folder, Space, TabUrlVariant } from '../../types/workspace';
import { Button } from '../Button';
import { StarIcon } from '../Icons';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { getSortedSpaces } from '../../hooks/useWorkspace';
import { getDomain, getFolderPath, getTreeOrderedFolders, getSiblingTabs, findTabTitleConflict } from '../../utils/treeUtils';
import { searchRaindropCollectionCovers } from '../../utils/raindropClient';
import { generateId } from '../../utils/format';

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputStyle: React.CSSProperties;
  required?: boolean;
  autoFocus?: boolean;
}

const UrlInput: React.FC<UrlInputProps> = ({
  value,
  onChange,
  placeholder,
  inputStyle,
  required,
  autoFocus,
}) => {
  return (
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        required={required}
        autoFocus={autoFocus}
      />
  );
};

interface TabModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab?: Tab | null; // null/undefined for create, Tab for edit
  existingTabs?: Tab[];
  allFolders: Folder[];
  allSpaces: Space[];
  defaultSpaceId?: string;
  defaultFolderId?: string;
  initialUrl?: string;
  initialTitle?: string;
  initialPinned?: boolean;
  initialFavourite?: boolean;
  initialIsGroup?: boolean;
  raindropToken?: string;
  onSearchCovers?: (query: string) => Promise<string[]>;
  onDelete?: (tabId: string) => void;
  onSave: (tabData: {
    url: string;
    urlVariants?: TabUrlVariant[];
    defaultVariantId?: string;
    parentSpaceId?: string;
    parentFolderId?: string;
    customTitle?: string;
    customEmojiIcon?: string;
    favIconUrl?: string;
    pinned?: boolean;
    favourite?: boolean;
    isGroup?: boolean;
  }) => void;
}

export const TabModal: React.FC<TabModalProps> = ({
  isOpen,
  onClose,
  tab,
  existingTabs,
  allFolders,
  allSpaces,
  defaultSpaceId,
  defaultFolderId,
  initialUrl,
  initialTitle,
  initialPinned,
  initialFavourite,
  initialIsGroup,
  raindropToken,
  onSearchCovers,
  onDelete,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [url, setUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [coverQuery, setCoverQuery] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [coverResults, setCoverResults] = useState<string[]>([]);
  const [isSearchingCovers, setIsSearchingCovers] = useState(false);
  const [coverSearchError, setCoverSearchError] = useState<string | null>(null);
  const orderedSpaces = useMemo(() => getSortedSpaces(allSpaces), [allSpaces]);
  const [favourite, setFavourite] = useState(false);
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId || orderedSpaces[0]?.id || '');
  const [parentFolderId, setParentFolderId] = useState(defaultFolderId || '');

  // Variants state
  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<TabUrlVariant[]>([]);
  const [draggedVariantId, setDraggedVariantId] = useState<string | null>(null);
  const [variantDropIndicator, setVariantDropIndicator] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  const [defaultVariantId, setDefaultVariantId] = useState<string>('');

  const prevIsOpenRef = React.useRef(false);
  const prevTabIdRef = React.useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isNewlyOpened = isOpen && !prevIsOpenRef.current;
    const tabChanged = isOpen && tab?.id !== prevTabIdRef.current;

    if (isNewlyOpened || tabChanged) {
      if (tab) {
        setUrl(tab.url || '');
        setCustomTitle(tab.customTitle || '');
        setCoverQuery('');
        setCoverUrl(tab.favIconUrl);
        setFavourite(Boolean(tab.favourite));
        setParentSpaceId(tab.parentSpaceId || defaultSpaceId || orderedSpaces[0]?.id || '');
        setParentFolderId(tab.parentFolderId || '');

        if (tab.urlVariants && tab.urlVariants.length > 0) {
          setShowVariants(true);
          const rawVariants = tab.urlVariants.map((v) => ({ ...v }));
          if (tab.defaultVariantId) {
            const defIdx = rawVariants.findIndex((v) => v.id === tab.defaultVariantId);
            if (defIdx > 0) {
              const [def] = rawVariants.splice(defIdx, 1);
              rawVariants.unshift(def);
            }
          }
          setVariants(rawVariants);
          setDefaultVariantId(rawVariants[0]?.id || '');
          if (rawVariants[0]?.name) {
            setCustomTitle(rawVariants[0].name);
          }
        } else {
          setShowVariants(false);
          setVariants([]);
          setDefaultVariantId('');
        }
      } else {
        setUrl(initialUrl || '');
        setCustomTitle(initialTitle || '');
        setCoverQuery('');
        setCoverUrl(undefined);
        setFavourite(Boolean(initialFavourite));
        setParentSpaceId(defaultSpaceId || orderedSpaces[0]?.id || '');
        setParentFolderId(defaultFolderId || '');
        if (initialIsGroup) {
          setShowVariants(true);
          const firstName = initialTitle || 'Group';
          const v1 = { id: generateId('var'), name: firstName, url: '' };
          const v2 = { id: generateId('var'), name: '', url: '' };
          setVariants([v1, v2]);
          setDefaultVariantId(v1.id);
          setCustomTitle(firstName);
        } else {
          setShowVariants(false);
          setVariants([]);
          setDefaultVariantId('');
        }
      }
    }

    prevIsOpenRef.current = isOpen;
    prevTabIdRef.current = tab?.id;
  }, [isOpen, tab, defaultSpaceId, defaultFolderId, initialUrl, initialTitle, initialFavourite, initialIsGroup, orderedSpaces]);

  useEffect(() => {
    if (!isOpen || (!raindropToken && !onSearchCovers) || coverQuery.trim().length < 2) {
      setCoverResults([]);
      setIsSearchingCovers(false);
      setCoverSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingCovers(true);
      try {
        const results = onSearchCovers
          ? await onSearchCovers(coverQuery)
          : await searchRaindropCollectionCovers(raindropToken!, coverQuery);
        if (!cancelled) {
          setCoverResults(results.slice(0, 60));
          setCoverSearchError(null);
        }
      } catch {
        if (!cancelled) {
          setCoverResults([]);
          setCoverSearchError('Could not search Raindrop covers. Try again shortly.');
        }
      } finally {
        if (!cancelled) setIsSearchingCovers(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, raindropToken, onSearchCovers, coverQuery]);

  // If the selected space was deleted remotely while modal is open, fallback parentSpaceId gracefully without resetting other fields
  useEffect(() => {
    if (!isOpen) return;
    if (!favourite && parentSpaceId && orderedSpaces.length > 0 && !orderedSpaces.some((s) => s.id === parentSpaceId)) {
      setParentSpaceId(orderedSpaces[0].id);
      setParentFolderId('');
    }
  }, [isOpen, favourite, parentSpaceId, orderedSpaces]);

  // Available folders in selected space
  const spaceFolders = useMemo(() => {
    const foldersInSpace = allFolders.filter((f) => f.parentSpaceId === parentSpaceId);
    return getTreeOrderedFolders(foldersInSpace);
  }, [allFolders, parentSpaceId]);

  const isVariantsMode = showVariants && variants.length > 0;
  const firstVariantName = isVariantsMode ? (variants[0]?.name || '') : '';

  const currentSiblingTabs = useMemo(() => {
    if (!existingTabs) return [];
    return getSiblingTabs(
      existingTabs,
      {
        favourite,
        parentSpaceId: favourite ? undefined : parentSpaceId,
        parentFolderId: favourite ? undefined : parentFolderId || undefined,
      },
      tab?.id
    );
  }, [existingTabs, favourite, parentSpaceId, parentFolderId, tab?.id]);

  const effectiveCandidateTitle = useMemo(() => {
    if (isVariantsMode) {
      return firstVariantName.trim();
    }
    const custom = customTitle.trim();
    if (custom) return custom;
    const u = url.trim();
    if (u) {
      const domain = getDomain(u);
      return domain || u;
    }
    return '';
  }, [isVariantsMode, firstVariantName, customTitle, url]);

  const titleConflictTab = useMemo(() => {
    if (!effectiveCandidateTitle) return undefined;
    return findTabTitleConflict(effectiveCandidateTitle, currentSiblingTabs);
  }, [effectiveCandidateTitle, currentSiblingTabs]);

  const duplicateVariantName = useMemo(() => {
    if (!isVariantsMode) return null;
    const seen = new Set<string>();
    for (const v of variants) {
      if (!v.name.trim() && !v.url.trim()) continue;
      const effectiveName = v.name.trim().toLowerCase() || 'variant';
      if (seen.has(effectiveName)) {
        return v.name.trim() || 'Variant';
      }
      seen.add(effectiveName);
    }
    return null;
  }, [isVariantsMode, variants]);

  const titleErrorMessage = titleConflictTab
    ? `A tab with the name "${effectiveCandidateTitle}" already exists in this ${
        favourite ? 'favourites shelf' : parentFolderId ? 'folder' : 'space root'
      }.`
    : null;

  const variantErrorMessage = duplicateVariantName
    ? `Variant names within this tab must be unique (duplicate: "${duplicateVariantName}").`
    : null;

  if (!isOpen) return null;

  const handleEnableVariants = () => {
    const currentUrlVal = url.trim();
    const firstId = 'var_' + Date.now() + '_1';
    const secondId = 'var_' + Date.now() + '_2';
    const initialFirstName = customTitle.trim() || getDomain(currentUrlVal) || 'Default';
    const initialVariants: TabUrlVariant[] = [
      {
        id: firstId,
        name: initialFirstName,
        url: currentUrlVal || '',
      },
      {
        id: secondId,
        name: '',
        url: '',
      },
    ];
    setVariants(initialVariants);
    setDefaultVariantId(firstId);
    setShowVariants(true);
    setCustomTitle(initialFirstName);
  };

  const handleAddVariantRow = () => {
    const newId = 'var_' + Date.now() + '_' + (variants.length + 1);
    setVariants((prev) => [...prev, { id: newId, name: '', url: '' }]);
  };

  const handleRemoveVariantRow = (idToRemove: string) => {
    setVariants((prev) => {
      const next = prev.filter((v) => v.id !== idToRemove);
      if (next.length === 0) {
        setShowVariants(false);
        setDefaultVariantId('');
      } else {
        setDefaultVariantId(next[0].id);
      }
      return next;
    });
  };

  const handleReorderVariant = (draggedId: string, targetId: string, position: 'before' | 'after') => {
    if (draggedId === targetId) return;
    setVariants((prev) => {
      const draggedIndex = prev.findIndex((v) => v.id === draggedId);
      if (draggedIndex === -1) return prev;
      const next = [...prev];
      const [dragged] = next.splice(draggedIndex, 1);
      let targetIndex = next.findIndex((v) => v.id === targetId);
      if (targetIndex === -1) return prev;
      if (position === 'after') targetIndex += 1;
      next.splice(targetIndex, 0, dragged);
      if (next[0]?.id) {
        setDefaultVariantId(next[0].id);
      }
      return next;
    });
  };

  const handleSwitchToSingleUrl = () => {
    const def = variants[0];
    if (def && def.url) {
      setUrl(def.url);
    }
    if (def && def.name) {
      setCustomTitle(def.name);
    }
    setShowVariants(false);
    setVariants([]);
    setDefaultVariantId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (titleConflictTab || duplicateVariantName) return;

    if (showVariants && variants.length > 0) {
      const validVariants = variants.filter((v) => v.name.trim() || v.url.trim());
      const isFavGroup = Boolean(favourite && (initialIsGroup || (tab?.favourite && tab?.isGroup)));
      const defVariant = validVariants[0];
      const finalDefaultUrl = defVariant ? defVariant.url.trim() : url.trim();
      if (!finalDefaultUrl) return;
      if (!favourite && !parentSpaceId) return;

      const firstVarName = (defVariant?.name || variants[0]?.name || '').trim();

      onSave({
        url: finalDefaultUrl,
        urlVariants:
          validVariants.length > 0
            ? validVariants.map((v) => ({
                ...v,
                name: v.name.trim() || 'Variant',
                url: v.url.trim(),
              }))
            : undefined,
        defaultVariantId: validVariants.length > 0 && defVariant ? defVariant.id : undefined,
        isGroup: isFavGroup,
        parentSpaceId: favourite ? undefined : parentSpaceId,
        parentFolderId: favourite ? undefined : parentFolderId || undefined,
        customTitle: firstVarName || undefined,
        customEmojiIcon: undefined,
        favIconUrl: defVariant?.favIconUrl || coverUrl,
        pinned: false,
        favourite,
      });
      onClose();
      return;
    }

    if (!url.trim()) return;
    if (!favourite && !parentSpaceId) return;

    onSave({
      url: url.trim(),
      urlVariants: undefined,
      defaultVariantId: undefined,
      isGroup: false,
      parentSpaceId: favourite ? undefined : parentSpaceId,
      parentFolderId: favourite ? undefined : parentFolderId || undefined,
      customTitle: customTitle.trim() || undefined,
      customEmojiIcon: undefined,
      favIconUrl: coverUrl,
      pinned: false,
      favourite,
    });
    onClose();
  };


  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {tab ? 'Edit Tab' : 'Add New Tab'}
          </h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: isDark ? '#94a3b8' : '#94a3b8',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!showVariants ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                  URL <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={handleEnableVariants}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0284c7',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Add multiple URL variants (e.g. Prod, Staging, Dev)"
                >
                  <span>+</span> Add Variant
                </button>
              </div>
              <UrlInput
                value={url}
                onChange={setUrl}
                placeholder="https://example.com"
                inputStyle={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                required
                autoFocus
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                  URL Variants <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSwitchToSingleUrl}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isDark ? '#94a3b8' : '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                >
                  Single URL mode
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {variants.map((v, index) => {
                  const isDefault = index === 0;
                  const isDragging = draggedVariantId === v.id;
                  const showBefore = variantDropIndicator?.id === v.id && variantDropIndicator.position === 'before';
                  const showAfter = variantDropIndicator?.id === v.id && variantDropIndicator.position === 'after';
                  return (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggedVariantId(v.id);
                      }}
                      onDragOver={(e) => {
                        if (!draggedVariantId || draggedVariantId === v.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        const position = e.clientY < midY ? 'before' : 'after';
                        setVariantDropIndicator({ id: v.id, position });
                      }}
                      onDragLeave={() => {
                        setVariantDropIndicator((prev) => (prev?.id === v.id ? null : prev));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggedVariantId && variantDropIndicator) {
                          handleReorderVariant(draggedVariantId, variantDropIndicator.id, variantDropIndicator.position);
                        }
                        setDraggedVariantId(null);
                        setVariantDropIndicator(null);
                      }}
                      onDragEnd={() => {
                        setDraggedVariantId(null);
                        setVariantDropIndicator(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                        padding: '8px',
                        borderRadius: '8px',
                        border: `1px solid ${isDefault ? (isDark ? '#0284c7' : '#38bdf8') : (isDark ? '#334155' : '#e2e8f0')}`,
                        borderTop: showBefore ? '2px solid #0284c7' : undefined,
                        borderBottom: showAfter ? '2px solid #0284c7' : undefined,
                        opacity: isDragging ? 0.5 : 1,
                      }}
                    >
                      {/* Drag handle */}
                      <span
                        style={{
                          cursor: 'grab',
                          color: isDark ? '#64748b' : '#94a3b8',
                          fontSize: '14px',
                          padding: '0 2px',
                          flexShrink: 0,
                          userSelect: 'none',
                        }}
                        title="Drag to reorder (top variant is default)"
                      >
                        ⠿
                      </span>

                      {/* Default indicator (first row is always default) */}
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isDefault && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              backgroundColor: isDark ? 'rgba(2, 132, 199, 0.25)' : '#e0f2fe',
                              color: isDark ? '#38bdf8' : '#0284c7',
                              userSelect: 'none',
                            }}
                            title="Default variant (top variant is always default; drag to top to change)"
                          >
                            <StarIcon size={11} filled color="currentColor" />
                          </span>
                        )}
                      </div>

                      {/* Name input */}
                      <input
                        type="text"
                        placeholder="Name"
                        title="Variant name (e.g. Default, Prod, Dev)"
                        value={v.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVariants((prev) => prev.map((item) => (item.id === v.id ? { ...item, name: val } : item)));
                        }}
                        style={{
                          width: '75px',
                          flexShrink: 0,
                          padding: '7px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          color: isDark ? '#f8fafc' : '#0f172a',
                          fontSize: '13px',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />

                      {/* URL input */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <UrlInput
                          value={v.url}
                          onChange={(val) => {
                            setVariants((prev) => prev.map((item) => (item.id === v.id ? { ...item, url: val } : item)));
                          }}
                          placeholder="https://example.com"
                          inputStyle={{
                            width: '100%',
                            padding: '7px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            color: isDark ? '#f8fafc' : '#0f172a',
                            fontSize: '13px',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                          required={isDefault}
                        />
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveVariantRow(v.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: isDark ? '#94a3b8' : '#64748b',
                          fontSize: '14px',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                        title="Remove variant"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ef4444';
                          e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {variantErrorMessage && (
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#ef4444', fontWeight: 500 }}>
                  {variantErrorMessage}
                </p>
              )}

              <button
                type="button"
                onClick={handleAddVariantRow}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: `1px dashed ${isDark ? '#475569' : '#cbd5e1'}`,
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>+</span> Add another variant
              </button>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
              Custom Title
            </label>
            <input
              type="text"
              placeholder={isVariantsMode ? (firstVariantName || 'Set by first variant') : 'e.g. Arcable Documentation (leave blank to use URL)'}
              value={isVariantsMode ? firstVariantName : customTitle}
              disabled={isVariantsMode}
              onChange={(e) => setCustomTitle(e.target.value)}
              title={isVariantsMode ? "Custom Title is set to the first variant's name when URL variants are enabled" : undefined}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: `1px solid ${titleConflictTab ? '#ef4444' : isDark ? '#475569' : '#cbd5e1'}`,
                backgroundColor: isVariantsMode
                  ? (isDark ? '#1e293b' : '#f1f5f9')
                  : (isDark ? '#0f172a' : '#ffffff'),
                color: isVariantsMode
                  ? (isDark ? '#94a3b8' : '#64748b')
                  : (isDark ? '#f8fafc' : '#0f172a'),
                cursor: isVariantsMode ? 'not-allowed' : 'text',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {titleErrorMessage && (
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#ef4444', fontWeight: 500 }}>
                {titleErrorMessage}
              </p>
            )}
          </div>

          {/* Favourite checkbox */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: favourite ? (isDark ? 'rgba(22, 101, 52, 0.25)' : '#f0fdf4') : (isDark ? '#0f172a' : '#f8fafc'),
              borderRadius: '6px',
              border: favourite ? `1px solid ${isDark ? '#15803d' : '#86efac'}` : `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              id="favouriteTabCheckbox"
              checked={favourite}
              onChange={(e) => setFavourite(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />

            <label htmlFor="favouriteTabCheckbox" style={{ fontSize: '13px', fontWeight: 600, color: favourite ? (isDark ? '#86efac' : '#166534') : (isDark ? '#cbd5e1' : '#334155'), cursor: 'pointer' }}>
              ⭐ Mark as Favourite
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', opacity: favourite ? 0.5 : 1 }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                Space {favourite ? null : <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <select
                value={parentSpaceId}
                disabled={favourite}
                onChange={(e) => {
                  setParentSpaceId(e.target.value);
                  setParentFolderId('');
                }}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  fontSize: '13px',
                  backgroundColor: favourite ? (isDark ? '#334155' : '#f1f5f9') : (isDark ? '#0f172a' : '#ffffff'),
                  color: isDark ? '#f8fafc' : '#0f172a',
                  cursor: favourite ? 'not-allowed' : 'default',
                  boxSizing: 'border-box',
                }}
              >
                {orderedSpaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emojiIcon ? `${s.emojiIcon} ` : ''}{s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                Folder
              </label>
              <select
                value={parentFolderId}
                disabled={favourite}
                onChange={(e) => setParentFolderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  fontSize: '13px',
                  backgroundColor: favourite ? (isDark ? '#334155' : '#f1f5f9') : (isDark ? '#0f172a' : '#ffffff'),
                  color: isDark ? '#f8fafc' : '#0f172a',
                  cursor: favourite ? 'not-allowed' : 'default',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">(None - Root of Space)</option>
                {spaceFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.customEmojiIcon ? `${f.customEmojiIcon} ` : '📁 '}{getFolderPath(f.id, allFolders)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
              Tab Cover
            </label>
            <input
              type="search"
              value={coverQuery}
              onChange={(e) => setCoverQuery(e.target.value)}
              placeholder="Search Raindrop covers"
              disabled={!raindropToken && !onSearchCovers}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
            />
            {!raindropToken && !onSearchCovers ? (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Connect Raindrop to search tab covers.</p>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', minHeight: '40px' }} aria-label="Raindrop tab cover search results">
                {isSearchingCovers && <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Searching covers…</span>}
                {coverSearchError && <span role="alert" style={{ fontSize: '12px', color: isDark ? '#fca5a5' : '#dc2626' }}>{coverSearchError}</span>}
                {!isSearchingCovers && coverResults.map((cover) => (
                  <button key={cover} type="button" onClick={() => setCoverUrl(cover)} title="Use this tab cover" aria-label="Use this tab cover" style={{ width: '40px', height: '40px', padding: '5px', borderRadius: '8px', cursor: 'pointer', border: coverUrl === cover ? '2px solid #38bdf8' : `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, background: isDark ? '#0f172a' : '#ffffff' }}>
                    <img src={cover} alt="" width="28" height="28" referrerPolicy="no-referrer" style={{ width: '28px', height: '28px', objectFit: 'contain', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>


          <div style={{ display: 'flex', justifyContent: tab && onDelete ? 'space-between' : 'flex-end', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
            {tab && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(tab.id);
                  onClose();
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🗑️ Delete Tab
              </button>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={Boolean(titleConflictTab || duplicateVariantName)}
              >
                {tab ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
