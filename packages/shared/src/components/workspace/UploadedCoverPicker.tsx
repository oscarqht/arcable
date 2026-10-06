'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { UploadedCover } from '../../types/raindrop';
import { listUploadedCovers, uploadCoverToLibrary, validateCoverImage } from '../../utils/coverLibrary';

export interface UploadedCoverPickerProps {
  raindropToken?: string;
  onListUploadedCovers?: () => Promise<UploadedCover[]>;
  onUploadCover?: (name: string, dataUrl: string) => Promise<UploadedCover>;
  onBusyChange?: (busy: boolean) => void;
}

export const UploadedCoverPicker: React.FC<UploadedCoverPickerProps & {
  value?: string;
  onSelect: (url: string) => void;
  isDark: boolean;
}> = ({ raindropToken, onListUploadedCovers, onUploadCover, onBusyChange, value, onSelect, isDark }) => {
  const [covers, setCovers] = useState<UploadedCover[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const connected = Boolean(raindropToken || onListUploadedCovers);

  useEffect(() => {
    const current = ++generation.current;
    setCovers([]);
    setError('');
    setUploading(false);
    onBusyChange?.(false);
    if (connected) {
      setLoading(true);
      const request = onListUploadedCovers ? onListUploadedCovers() : listUploadedCovers(raindropToken!);
      request.then((items) => {
        if (generation.current === current) setCovers(items);
      }).catch((err) => {
        if (generation.current === current) setError(err instanceof Error ? err.message : 'Could not load uploads.');
      }).finally(() => {
        if (generation.current === current) setLoading(false);
      });
    }
    return () => { ++generation.current; };
  }, [connected, raindropToken, onListUploadedCovers, onBusyChange, reload]);

  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);

  const upload = async (file: File) => {
    const current = generation.current;
    setError('');
    setUploading(true);
    onBusyChange?.(true);
    try {
      validateCoverImage(file);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('This file could not be opened as an image.'));
        image.src = dataUrl;
      });
      const item = onUploadCover ? await onUploadCover(file.name, dataUrl) : await uploadCoverToLibrary(raindropToken!, file.name, dataUrl);
      if (generation.current !== current) return;
      setCovers((items) => [item, ...items.filter((cover) => cover.id !== item.id)]);
      onSelect(item.url);
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : 'Upload failed. Please retry.');
    } finally {
      if (generation.current === current) {
        setUploading(false);
        onBusyChange?.(false);
      }
    }
  };

  return <div style={{ margin: '8px 0', fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <strong>My uploads</strong>
      <button type="button" disabled={!connected || loading || uploading} onClick={() => fileInput.current?.click()}
        style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #64748b', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
        {uploading ? 'Uploading…' : 'Upload image'}
      </button>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif" hidden aria-label="Upload cover image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }} />
    </div>
    <p style={{ margin: '6px 0', fontSize: '11px', opacity: 0.8 }}>PNG, JPEG, GIF · up to 2 MB. Uploads stay in your library when you cancel.</p>
    {!connected && <p>Connect Raindrop to upload and reuse covers.</p>}
    <div role="status" aria-live="polite">{loading ? 'Loading uploads…' : uploading ? 'Uploading image…' : connected && !covers.length && !error ? 'No uploaded covers yet.' : ''}</div>
    {error && <div role="alert" style={{ color: isDark ? '#fca5a5' : '#b91c1c', margin: '6px 0' }}>
      {error} <button type="button" disabled={uploading || loading} onClick={() => setReload((n) => n + 1)}>Reload library</button>
    </div>}
    <div aria-label="Uploaded covers" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '150px', overflowY: 'auto', marginTop: '6px' }}>
      {covers.map((cover) => <button key={cover.id} type="button" title={cover.name} aria-label={`Use uploaded cover ${cover.name}`}
        aria-pressed={value === cover.url} disabled={uploading} onClick={() => onSelect(cover.url)}
        style={{ width: '40px', height: '40px', padding: '3px', borderRadius: '6px', border: `1px solid ${value === cover.url ? '#0284c7' : '#64748b'}`, background: value === cover.url ? '#e0f2fe' : 'transparent', cursor: 'pointer' }}>
        <img src={cover.url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </button>)}
    </div>
    <div style={{ marginTop: '10px', fontWeight: 600 }}>Predefined covers</div>
  </div>;
};
