'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Folder, Space, TabUrlVariant } from '../../types/workspace';
import { Button } from '../Button';
import { EmojiPicker } from '../EmojiPicker';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { getFolderPath, getTreeOrderedFolders } from '../../utils/treeUtils';

interface TabModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab?: Tab | null; // null/undefined for create, Tab for edit
  allFolders: Folder[];
  allSpaces: Space[];
  defaultSpaceId?: string;
  defaultFolderId?: string;
  initialUrl?: string;
  initialTitle?: string;
  initialPinned?: boolean;
  initialFavourite?: boolean;
  onDelete?: (tabId: string) => void;
  onSave: (tabData: {
    url: string;
    urlVariants?: TabUrlVariant[];
    defaultVariantId?: string;
    parentSpaceId?: string;
    parentFolderId?: string;
    customTitle?: string;
    customEmojiIcon?: string;
    pinned?: boolean;
    favourite?: boolean;
  }) => void;
}

export const TabModal: React.FC<TabModalProps> = ({
  isOpen,
  onClose,
  tab,
  allFolders,
  allSpaces,
  defaultSpaceId,
  defaultFolderId,
  initialUrl,
  initialTitle,
  initialPinned,
  initialFavourite,
  onDelete,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [url, setUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customEmojiIcon, setCustomEmojiIcon] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId || allSpaces[0]?.id || '');
  const [parentFolderId, setParentFolderId] = useState(defaultFolderId || '');

  // Variants state
  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<TabUrlVariant[]>([]);
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
        setCustomEmojiIcon(tab.customEmojiIcon || '');
        setFavourite(Boolean(tab.favourite));
        setParentSpaceId(tab.parentSpaceId || defaultSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(tab.parentFolderId || '');

        if (tab.urlVariants && tab.urlVariants.length > 0) {
          setShowVariants(true);
          setVariants(tab.urlVariants.map((v) => ({ ...v })));
          setDefaultVariantId(tab.defaultVariantId || tab.urlVariants[0]?.id || '');
        } else {
          setShowVariants(false);
          setVariants([]);
          setDefaultVariantId('');
        }
      } else {
        setUrl(initialUrl || '');
        setCustomTitle(initialTitle || '');
        setCustomEmojiIcon('');
        setFavourite(Boolean(initialFavourite));
        setParentSpaceId(defaultSpaceId || allSpaces[0]?.id || '');
        setParentFolderId(defaultFolderId || '');
        setShowVariants(false);
        setVariants([]);
        setDefaultVariantId('');
      }
    }

    prevIsOpenRef.current = isOpen;
    prevTabIdRef.current = tab?.id;
  }, [isOpen, tab, defaultSpaceId, defaultFolderId, initialUrl, initialTitle, initialFavourite, allSpaces]);

  // If the selected space was deleted remotely while modal is open, fallback parentSpaceId gracefully without resetting other fields
  useEffect(() => {
    if (!isOpen) return;
    if (!favourite && parentSpaceId && allSpaces.length > 0 && !allSpaces.some((s) => s.id === parentSpaceId)) {
      setParentSpaceId(allSpaces[0].id);
      setParentFolderId('');
    }
  }, [isOpen, favourite, parentSpaceId, allSpaces]);

  // Available folders in selected space
  const spaceFolders = useMemo(() => {
    const foldersInSpace = allFolders.filter((f) => f.parentSpaceId === parentSpaceId);
    return getTreeOrderedFolders(foldersInSpace);
  }, [allFolders, parentSpaceId]);

  if (!isOpen) return null;

  const handleEnableVariants = () => {
    const currentUrlVal = url.trim();
    const firstId = 'var_' + Date.now() + '_1';
    const secondId = 'var_' + Date.now() + '_2';
    const initialVariants: TabUrlVariant[] = [
      {
        id: firstId,
        name: 'Default',
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
      } else if (defaultVariantId === idToRemove) {
        setDefaultVariantId(next[0].id);
      }
      return next;
    });
  };

  const handleSwitchToSingleUrl = () => {
    const def = variants.find((v) => v.id === defaultVariantId) || variants[0];
    if (def && def.url) {
      setUrl(def.url);
    }
    setShowVariants(false);
    setVariants([]);
    setDefaultVariantId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (showVariants && variants.length > 0) {
      const validVariants = variants.filter((v) => v.name.trim() || v.url.trim());
      let defVariant = validVariants.find((v) => v.id === defaultVariantId);
      if (!defVariant && validVariants.length > 0) {
        defVariant = validVariants[0];
      }
      const finalDefaultUrl = defVariant ? defVariant.url.trim() : url.trim();
      if (!finalDefaultUrl) return;
      if (!favourite && !parentSpaceId) return;

      onSave({
        url: finalDefaultUrl,
        urlVariants:
          validVariants.length > 1
            ? validVariants.map((v) => ({
                ...v,
                name: v.name.trim() || 'Variant',
                url: v.url.trim(),
              }))
            : undefined,
        defaultVariantId: validVariants.length > 1 && defVariant ? defVariant.id : undefined,
        parentSpaceId: favourite ? undefined : parentSpaceId,
        parentFolderId: favourite ? undefined : parentFolderId || undefined,
        customTitle: customTitle.trim() || undefined,
        customEmojiIcon: customEmojiIcon.trim() || undefined,
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
      parentSpaceId: favourite ? undefined : parentSpaceId,
      parentFolderId: favourite ? undefined : parentFolderId || undefined,
      customTitle: customTitle.trim() || undefined,
      customEmojiIcon: customEmojiIcon.trim() || undefined,
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
              <input
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{
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
                {variants.map((v) => {
                  const isDefault = defaultVariantId === v.id;
                  return (
                    <div
                      key={v.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                        padding: '8px',
                        borderRadius: '8px',
                        border: `1px solid ${isDefault ? (isDark ? '#0284c7' : '#38bdf8') : (isDark ? '#334155' : '#e2e8f0')}`,
                      }}
                    >
                      {/* Default selector radio */}
                      <label
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          fontSize: '10px',
                          color: isDefault ? '#0284c7' : (isDark ? '#94a3b8' : '#64748b'),
                          fontWeight: isDefault ? 700 : 500,
                          gap: '2px',
                          minWidth: '38px',
                          userSelect: 'none',
                        }}
                        title="Set as default URL"
                      >
                        <input
                          type="radio"
                          name="defaultVariantRadio"
                          checked={isDefault}
                          onChange={() => setDefaultVariantId(v.id)}
                          style={{ cursor: 'pointer', margin: 0 }}
                        />
                        {isDefault ? 'Default' : 'Set def'}
                      </label>

                      {/* Name input */}
                      <input
                        type="text"
                        placeholder="Name (e.g. Prod)"
                        value={v.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVariants((prev) => prev.map((item) => (item.id === v.id ? { ...item, name: val } : item)));
                        }}
                        style={{
                          width: '105px',
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
                      <input
                        type="text"
                        placeholder="https://example.com"
                        value={v.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVariants((prev) => prev.map((item) => (item.id === v.id ? { ...item, url: val } : item)));
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
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
              placeholder="e.g. Arcable Documentation (leave blank to use URL)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              style={{
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
            />
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
                {allSpaces.map((s) => (
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

          <EmojiPicker

            value={customEmojiIcon}
            onChange={setCustomEmojiIcon}
            label="Custom Emoji Icon"
            allowClear
          />


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
              <Button type="submit" variant="primary" size="md">
                {tab ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
