'use client';

import React, { useState, useEffect } from 'react';
import { Space, SpaceScheme, ZenThemeConfig } from '../../types/workspace';
import { Button } from '../Button';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { searchRaindropCollectionCovers } from '../../utils/raindropClient';
import { ZenThemePicker } from './ZenThemePicker';

export interface SpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  space?: Space | null; // null/undefined for create, Space for edit
  raindropToken?: string;
  onSearchCovers?: (query: string) => Promise<string[]>;
  onSave: (spaceData: {
    name: string;
    emojiIcon?: string;
    coverUrl?: string;
    colors?: string;
    themeNoise?: number;
    themeScheme?: SpaceScheme;
    themeConfig?: ZenThemeConfig;
  }) => void;
}

export const SpaceModal: React.FC<SpaceModalProps> = (props) => {
  if (!props.isOpen) return null;

  return <SpaceModalContent key={props.space?.id ?? '__new__'} {...props} />;
};

const SpaceModalContent: React.FC<SpaceModalProps> = ({
  onClose,
  space,
  raindropToken,
  onSearchCovers,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [name, setName] = useState(space?.name || '');
  const [coverQuery, setCoverQuery] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | undefined>(space?.coverUrl);
  const [coverResults, setCoverResults] = useState<string[]>([]);
  const [isSearchingCovers, setIsSearchingCovers] = useState(false);
  const [coverSearchError, setCoverSearchError] = useState<string | null>(null);

  // Theme states initialized directly from the space being edited
  const [colors, setColors] = useState<string>(space?.colors || '');
  const [themeNoise, setThemeNoise] = useState<number>(space?.themeNoise ?? 0);
  const [themeScheme, setThemeScheme] = useState<SpaceScheme>('auto');
  const [themeConfig, setThemeConfig] = useState<ZenThemeConfig | undefined>(
    space?.themeConfig ? { ...space.themeConfig, scheme: 'auto' } : undefined
  );

  // If the space prop itself updates while the modal is open, sync changes
  useEffect(() => {
    if (space) {
      setName(space.name || '');
      setCoverUrl(space.coverUrl);
      setColors(space.colors || '');
      setThemeNoise(space.themeNoise ?? 0);
      setThemeScheme('auto');
      setThemeConfig(space.themeConfig ? { ...space.themeConfig, scheme: 'auto' } : undefined);
    }
  }, [space]);

  useEffect(() => {
    if ((!raindropToken && !onSearchCovers) || coverQuery.trim().length < 2) {
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
  }, [raindropToken, onSearchCovers, coverQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      coverUrl,
      colors: colors || undefined,
      themeNoise: themeNoise > 0 ? themeNoise : undefined,
      themeScheme: 'auto',
      themeConfig: themeConfig ? { ...themeConfig, scheme: 'auto' } : undefined,
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '460px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {space ? 'Edit Space' : 'New Space'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '20px',
              cursor: 'pointer',
              color: isDark ? '#94a3b8' : '#64748b',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Inputs: Space Name & Collection Cover on same line */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            {/* Space Name */}
            <div style={{ flex: '1.2 1 0', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                Space Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Work, Personal, Research"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
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

            {/* Collection Cover */}
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', minHeight: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155', whiteSpace: 'nowrap' }}>
                    Cover
                  </label>
                  {coverUrl && (
                    <img
                      src={coverUrl}
                      alt=""
                      width="16"
                      height="16"
                      referrerPolicy="no-referrer"
                      style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '3px', display: 'block' }}
                    />
                  )}
                </div>
                {coverUrl && (
                  <button
                    type="button"
                    onClick={() => setCoverUrl(undefined)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '11px',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="search"
                value={coverQuery}
                onChange={(e) => setCoverQuery(e.target.value)}
                placeholder="Search covers..."
                disabled={!raindropToken && !onSearchCovers}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Cover search feedback & results (compact) */}
          {!raindropToken && !onSearchCovers && coverQuery.trim().length > 0 ? (
            <p style={{ margin: '-8px 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
              Connect Raindrop to search collection covers.
            </p>
          ) : (
            (isSearchingCovers || coverSearchError || coverResults.length > 0) && (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  paddingBottom: '4px',
                  marginTop: '-8px',
                  maxHeight: '80px',
                  flexWrap: 'wrap',
                }}
                aria-label="Raindrop cover search results"
              >
                {isSearchingCovers && <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Searching covers…</span>}
                {coverSearchError && <span role="alert" style={{ fontSize: '12px', color: isDark ? '#fca5a5' : '#dc2626' }}>{coverSearchError}</span>}
                {!isSearchingCovers && coverResults.map((cover) => (
                  <button
                    key={cover}
                    type="button"
                    onClick={() => setCoverUrl(cover)}
                    title="Use this collection cover"
                    aria-label="Use this collection cover"
                    style={{
                      width: '36px',
                      height: '36px',
                      padding: '4px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: coverUrl === cover ? '2px solid #38bdf8' : `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                      background: isDark ? '#0f172a' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img src={cover} alt="" width="24" height="24" referrerPolicy="no-referrer" style={{ width: '24px', height: '24px', objectFit: 'contain', display: 'block' }} />
                  </button>
                ))}
              </div>
            )
          )}

          {/* Theme Editor (Zen Gradient & Texture Generator) */}
          <ZenThemePicker
            colors={colors}
            themeNoise={themeNoise}
            themeScheme={themeScheme}
            themeConfig={themeConfig}
            spaceName={name || 'Space Preview'}
            coverUrl={coverUrl}
            isSystemDark={isDark}
            onChange={({ colors: newColors, themeNoise: newNoise, themeConfig: newCfg }) => {
              setColors(newColors);
              setThemeNoise(newNoise);
              setThemeScheme('auto');
              setThemeConfig(newCfg);
            }}
          />

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md">
              {space ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
