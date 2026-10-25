'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tab, Space, Folder } from '../../types/workspace';
import { BatchUrlReplacement, buildBatchUrlReplacementPreview } from '../../utils/batchUrlReplacement';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { Button } from '../Button';
import { CloseIcon } from '../Icons';

interface ReplaceUrlsModalProps {
  tabs: Tab[];
  spaces: Space[];
  folders: Folder[];
  onClose: () => void;
  onApply: (replacements: BatchUrlReplacement[]) => void;
}

export function ReplaceUrlsModal({ tabs, spaces, folders, onClose, onApply }: ReplaceUrlsModalProps) {
  const { isDark } = useSystemTheme();
  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => buildBatchUrlReplacementPreview(tabs, find, replacement), [tabs, find, replacement]);
  const selected = preview.filter((row) => !excluded.has(row.id));
  const tabsById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const muted = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? '#334155' : '#e2e8f0';

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
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
      ) || []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      previousFocus?.focus();
    };
  }, [onClose]);

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '6px',
    padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`,
    background: isDark ? '#0f172a' : '#fff', color: 'inherit', font: 'inherit',
  };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="replace-urls-title" onClick={(event) => event.stopPropagation()}
        style={{ background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f8fafc' : '#0f172a', border: `1px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '760px', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', fontSize: '14px' }}>
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <h2 id="replace-urls-title" style={{ margin: 0, fontSize: '18px' }}>Replace URLs</h2>
          <Button variant="ghost" size="sm" aria-label="Close Replace URLs" onClick={onClose}><CloseIcon size={18} /></Button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', minHeight: 0 }}>
          <p style={{ margin: '0 0 16px', color: muted, lineHeight: 1.5 }}>Update saved URLs and named variants across all spaces and favourites. Temporary and live browser tabs stay unchanged.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px' }}>
            <label htmlFor="replace-urls-find">Find text
              <input ref={findRef} id="replace-urls-find" value={find} onChange={(event) => { setFind(event.target.value); setExcluded(new Set()); }} style={inputStyle} autoComplete="off" spellCheck={false} />
            </label>
            <label htmlFor="replace-urls-replacement">Replace with
              <input id="replace-urls-replacement" value={replacement} onChange={(event) => { setReplacement(event.target.value); setExcluded(new Set()); }} style={inputStyle} autoComplete="off" spellCheck={false} />
            </label>
          </div>
          <p style={{ color: muted, fontSize: '12px', lineHeight: 1.5, margin: '10px 0 20px' }}>Case-sensitive, literal text replacement of every occurrence. Slashes are kept exactly as entered. Leave replacement empty to delete matching text.</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            <strong role="status" aria-live="polite">{preview.length ? `${selected.length} of ${preview.length} URL changes selected` : 'Preview'}</strong>
            {preview.length > 0 && <Button variant="ghost" size="sm" onClick={() => setExcluded(selected.length === preview.length ? new Set(preview.map((row) => row.id)) : new Set())}>{selected.length === preview.length ? 'Deselect all' : 'Select all'}</Button>}
          </div>
          {preview.length === 0 ? <p style={{ color: muted, padding: '24px 12px', margin: 0, textAlign: 'center', border: `1px dashed ${border}`, borderRadius: '8px' }}>{!find ? 'Enter find text to preview matching URLs.' : find === replacement ? 'Find and replacement are identical. No URLs will change.' : 'No matching URLs.'}</p> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {preview.map((row) => {
                const tab = tabsById.get(row.tabId)!;
                const variant = tab.urlVariants?.find((item) => item.id === row.variantId);
                const folder = folders.find((item) => item.id === tab.parentFolderId);
                const location = tab.favourite ? 'Favourites' : spaces.find((space) => space.id === tab.parentSpaceId)?.name || 'Saved tabs';
                return <label key={row.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `1px solid ${border}`, borderRadius: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!excluded.has(row.id)} aria-label={`Include ${tab.customTitle || row.before}${variant ? ` — ${variant.name}` : ''}`} onChange={(event) => setExcluded((previous) => { const next = new Set(previous); if (event.target.checked) next.delete(row.id); else next.add(row.id); return next; })} style={{ marginTop: '3px', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
                    <div style={{ fontWeight: 600 }}>{tab.customTitle || 'Untitled tab'}{variant ? ` — ${variant.name}` : ''}</div>
                    <div style={{ color: muted, fontSize: '12px', margin: '3px 0 10px' }}>{location}{folder ? ` / ${folder.name}` : ''}</div>
                    <div style={{ color: muted, fontSize: '12px' }}>Before</div>
                    <code style={{ display: 'block', whiteSpace: 'pre-wrap', margin: '3px 0 8px' }}>{row.before}</code>
                    <div style={{ color: muted, fontSize: '12px' }}>After</div>
                    <code style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: '3px', color: isDark ? '#7dd3fc' : '#0369a1' }}>{row.after || '(empty)'}</code>
                  </div>
                </label>;
              })}
            </div>}
        </div>
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={selected.length === 0} onClick={() => { onApply(selected); onClose(); }}>Apply {selected.length} {selected.length === 1 ? 'change' : 'changes'}</Button>
        </div>
      </div>
    </div>, document.body
  );
}
