'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tab, Space, Folder } from '../../types/workspace';
import { buildBatchCoverReplacementPreview, type BatchCoverReplacement } from '../../utils/batchCoverReplacement';
import { searchRaindropCollectionCovers } from '../../utils/raindropClient';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { UploadedCoverPicker, type UploadedCoverPickerProps } from './UploadedCoverPicker';
import { TabFavicon } from './TabFavicon';
import { Button } from '../Button';
import { CloseIcon } from '../Icons';

interface ReplaceCoversModalProps extends UploadedCoverPickerProps {
  tabs: Tab[];
  spaces: Space[];
  folders: Folder[];
  onSearchCovers?: (query: string) => Promise<string[]>;
  onClose: () => void;
  onApply: (replacements: BatchCoverReplacement[]) => void;
}

export function ReplaceCoversModal({ tabs, spaces, folders, raindropToken, onListUploadedCovers, onUploadCover, onSearchCovers, onClose, onApply }: ReplaceCoversModalProps) {
  const { isDark } = useSystemTheme();
  const [find, setFind] = useState('');
  const [cover, setCover] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => buildBatchCoverReplacementPreview(tabs, find, cover), [tabs, find, cover]);
  const selected = preview.filter((row) => !excluded.has(row.id));
  const tabsById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const muted = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? '#334155' : '#e2e8f0';
  const canSearch = Boolean(raindropToken || onSearchCovers);

  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setSearchError('');
    setSearching(false);
    if (!canSearch || query.trim().length < 2) return;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const covers = onSearchCovers ? await onSearchCovers(query) : await searchRaindropCollectionCovers(raindropToken!, query);
        if (!cancelled) setResults(covers.slice(0, 60));
      } catch {
        if (!cancelled) setSearchError('Could not search predefined covers. Please retry.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [canSearch, query, raindropToken, onSearchCovers, searchAttempt]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    findRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled):not([type=file]), [tabindex="0"]'
      ) || []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => { document.removeEventListener('keydown', handleKey, true); previousFocus?.focus(); };
  }, [onClose]);

  const selectCover = (url: string) => { setCover(url); setExcluded(new Set()); };
  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '6px', padding: '10px 12px',
    borderRadius: '8px', border: `1px solid ${border}`, background: isDark ? '#0f172a' : '#fff', color: 'inherit', font: 'inherit',
  };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="replace-covers-title" onClick={(event) => event.stopPropagation()}
        style={{ background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f8fafc' : '#0f172a', border: `1px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '760px', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', fontSize: '14px' }}>
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <h2 id="replace-covers-title" style={{ margin: 0, fontSize: '18px' }}>Replace cover images</h2>
          <Button variant="ghost" size="sm" aria-label="Close Replace cover images" onClick={onClose}><CloseIcon size={18} /></Button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', minHeight: 0 }}>
          <p style={{ margin: '0 0 16px', color: muted, lineHeight: 1.5 }}>Set one cover image for matching saved URLs and named variants across all spaces and favourites. URLs and temporary browser tabs stay unchanged.</p>
          <label htmlFor="replace-covers-find">URL contains
            <input ref={findRef} id="replace-covers-find" value={find} onChange={(event) => { setFind(event.target.value); setExcluded(new Set()); }} style={inputStyle} autoComplete="off" spellCheck={false} />
          </label>
          <p style={{ color: muted, fontSize: '12px', margin: '8px 0 16px' }}>Matches literal text anywhere in the URL, case-sensitively.</p>
          <section aria-label="Replacement cover" style={{ padding: '12px', border: `1px solid ${border}`, borderRadius: '8px', marginBottom: '20px' }}>
            <strong>Replacement cover</strong>
            {cover && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
              <img src={cover} alt="Selected replacement cover" referrerPolicy="no-referrer" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
              <span style={{ color: muted }}>Selected for all included matches</span>
            </div>}
            <UploadedCoverPicker raindropToken={raindropToken} onListUploadedCovers={onListUploadedCovers} onUploadCover={onUploadCover}
              onBusyChange={setUploading} value={cover} onSelect={selectCover} isDark={isDark} />
            <label htmlFor="replace-covers-search" style={{ color: muted, fontSize: '12px' }}>Search predefined covers
              <input type="search" id="replace-covers-search" value={query} disabled={!canSearch || uploading} onChange={(event) => setQuery(event.target.value)} placeholder="Type at least 2 characters" style={inputStyle} />
            </label>
            {!canSearch && <p style={{ color: muted, fontSize: '12px' }}>Connect Raindrop to search predefined covers.</p>}
            <div role="status" aria-live="polite" style={{ color: muted, fontSize: '12px', marginTop: '8px' }}>{searching ? 'Searching predefined covers…' : canSearch && query.trim().length >= 2 && !results.length && !searchError ? 'No predefined covers found.' : ''}</div>
            {searchError && <div role="alert" style={{ color: isDark ? '#fca5a5' : '#b91c1c' }}>{searchError} <Button variant="ghost" size="sm" onClick={() => setSearchAttempt((n) => n + 1)}>Retry search</Button></div>}
            <div aria-label="Predefined covers" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '160px', overflowY: 'auto', marginTop: '8px' }}>
              {results.map((url, index) => <button key={`${url}-${index}`} type="button" disabled={uploading} aria-label={`Use predefined cover ${index + 1}`} aria-pressed={cover === url} onClick={() => selectCover(url)}
                style={{ width: '44px', height: '44px', padding: '5px', borderRadius: '8px', border: `2px solid ${cover === url ? '#0284c7' : border}`, background: 'transparent', cursor: 'pointer' }}>
                <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </button>)}
            </div>
          </section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            <strong role="status" aria-live="polite">{preview.length ? `${selected.length} of ${preview.length} cover changes selected` : 'Preview'}</strong>
            {preview.length > 0 && <Button variant="ghost" size="sm" onClick={() => setExcluded(selected.length === preview.length ? new Set(preview.map((row) => row.id)) : new Set())}>{selected.length === preview.length ? 'Deselect all' : 'Select all'}</Button>}
          </div>
          {!preview.length ? <p style={{ color: muted, padding: '24px 12px', margin: 0, textAlign: 'center', border: `1px dashed ${border}`, borderRadius: '8px' }}>{!find ? 'Enter URL text to find matching items.' : !cover ? 'Choose a replacement cover to preview changes.' : 'No cover changes. Matching items may already use this image.'}</p> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {preview.map((row) => {
                const tab = tabsById.get(row.tabId)!;
                const variant = tab.urlVariants?.find((item) => item.id === row.variantId);
                const folder = folders.find((item) => item.id === tab.parentFolderId);
                const location = tab.favourite ? 'Favourites' : spaces.find((space) => space.id === tab.parentSpaceId)?.name || 'Saved tabs';
                return <label key={row.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `1px solid ${border}`, borderRadius: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!excluded.has(row.id)} aria-label={`Include ${tab.customTitle || row.url}${variant ? ` — ${variant.name}` : ''}`} onChange={(event) => setExcluded((previous) => { const next = new Set(previous); if (event.target.checked) next.delete(row.id); else next.add(row.id); return next; })} style={{ marginTop: '3px', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
                    <strong>{tab.customTitle || 'Untitled tab'}{variant ? ` — ${variant.name}` : ''}</strong>
                    <div style={{ color: muted, fontSize: '12px', margin: '3px 0 6px' }}>{location}{folder ? ` / ${folder.name}` : ''}</div>
                    <code style={{ whiteSpace: 'pre-wrap' }}>{row.url}</code>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px' }}>
                      <div><div style={{ color: muted, fontSize: '12px', marginBottom: '6px' }}>Before</div><TabFavicon url={row.url} favIconUrl={row.beforeCover || (!tab.isGroup ? tab.favIconUrl : undefined)} customEmojiIcon={variant?.customEmojiIcon || tab.customEmojiIcon} size={32} isDarkTheme={isDark} /></div>
                      <span aria-hidden="true" style={{ color: muted }}>→</span>
                      <div><div style={{ color: muted, fontSize: '12px', marginBottom: '6px' }}>After</div><img src={row.afterCover} alt="Replacement cover" referrerPolicy="no-referrer" style={{ width: '32px', height: '32px', objectFit: 'contain' }} /></div>
                    </div>
                  </div>
                </label>;
              })}
            </div>}
        </div>
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!selected.length || uploading} onClick={() => { onApply(selected); onClose(); }}>Apply {selected.length} {selected.length === 1 ? 'cover' : 'covers'}</Button>
        </div>
      </div>
    </div>, document.body
  );
}
