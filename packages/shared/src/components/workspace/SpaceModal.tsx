'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Space } from '../../types/workspace';
import { Button } from '../Button';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { searchRaindropCollectionCovers } from '../../utils/raindropClient';
import { PRESET_GRADIENTS, PRESET_SOLID_COLORS, NOISE_SVG_DATA_URI } from '../../utils/spaceTheme';

interface SpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  space?: Space | null; // null/undefined for create, Space for edit
  raindropToken?: string;
  onSearchCovers?: (query: string) => Promise<string[]>;
  onSave: (spaceData: { name: string; emojiIcon?: string; coverUrl?: string; colors?: string; themeNoise?: number }) => void;
}

export const SpaceModal: React.FC<SpaceModalProps> = ({
  isOpen,
  onClose,
  space,
  raindropToken,
  onSearchCovers,
  onSave,
}) => {
  const { isDark } = useSystemTheme();
  const [name, setName] = useState('');
  const [coverQuery, setCoverQuery] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [coverResults, setCoverResults] = useState<string[]>([]);
  const [isSearchingCovers, setIsSearchingCovers] = useState(false);
  const [coverSearchError, setCoverSearchError] = useState<string | null>(null);

  // Theme states
  const [colors, setColors] = useState<string>('');
  const [themeNoise, setThemeNoise] = useState<number>(0);
  const [themeTab, setThemeTab] = useState<'presets' | 'custom'>('presets');
  const [customMode, setCustomMode] = useState<'solid' | 'gradient'>('solid');
  const [customSolid, setCustomSolid] = useState<string>('#3b82f6');
  const [customGrad1, setCustomGrad1] = useState<string>('#6366f1');
  const [customGrad2, setCustomGrad2] = useState<string>('#ec4899');

  const prevIsOpenRef = React.useRef(false);
  const prevSpaceIdRef = React.useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isNewlyOpened = isOpen && !prevIsOpenRef.current;
    const spaceChanged = isOpen && space?.id !== prevSpaceIdRef.current;

    if (isNewlyOpened || spaceChanged) {
      if (space) {
        setName(space.name || '');
        setCoverQuery('');
        setCoverUrl(space.coverUrl);
        const existingColor = space.colors || '';
        setColors(existingColor);
        setThemeNoise(space.themeNoise ?? 0);

        // Detect if color is a preset or custom
        if (existingColor) {
          const isPresetGrad = PRESET_GRADIENTS.some((g) => g.value === existingColor || g.id === existingColor);
          const isPresetSolid = PRESET_SOLID_COLORS.includes(existingColor);
          if (!isPresetGrad && !isPresetSolid) {
            setThemeTab('custom');
            if (existingColor.includes('gradient')) {
              setCustomMode('gradient');
              const hexMatches = existingColor.match(/#[0-9a-fA-F]{3,8}/g);
              if (hexMatches && hexMatches.length >= 2) {
                setCustomGrad1(hexMatches[0]);
                setCustomGrad2(hexMatches[1]);
              }
            } else if (existingColor.startsWith('#')) {
              setCustomMode('solid');
              setCustomSolid(existingColor);
            }
          } else {
            setThemeTab('presets');
          }
        } else {
          setThemeTab('presets');
        }
      } else {
        setName('');
        setCoverQuery('');
        setCoverUrl(undefined);
        setColors('');
        setThemeNoise(0);
        setThemeTab('presets');
        setCustomMode('solid');
        setCustomSolid('#3b82f6');
        setCustomGrad1('#6366f1');
        setCustomGrad2('#ec4899');
      }
      setCoverResults([]);
      setCoverSearchError(null);
    }

    prevIsOpenRef.current = isOpen;
    prevSpaceIdRef.current = space?.id;
  }, [isOpen, space]);

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

  const handleApplyCustomSolid = (hex: string) => {
    setCustomSolid(hex);
    setColors(hex);
  };

  const handleApplyCustomGradient = (c1: string, c2: string) => {
    setCustomGrad1(c1);
    setCustomGrad2(c2);
    setColors(`linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`);
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      coverUrl,
      colors: colors || undefined,
      themeNoise: themeNoise > 0 ? themeNoise : undefined,
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
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
          {/* Space Name */}
          <div>
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
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                Collection Cover
              </label>
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
                  }}
                >
                  Remove cover
                </button>
              )}
            </div>
            <input
              type="search"
              value={coverQuery}
              onChange={(e) => setCoverQuery(e.target.value)}
              placeholder="Search Raindrop covers, e.g. work or travel"
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
            {!raindropToken && !onSearchCovers ? (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                Connect Raindrop to search collection covers.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', minHeight: '40px' }} aria-label="Raindrop cover search results">
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
                      width: '40px',
                      height: '40px',
                      padding: '5px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: coverUrl === cover ? '2px solid #38bdf8' : `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                      background: isDark ? '#0f172a' : '#ffffff',
                    }}
                  >
                    <img src={cover} alt="" width="28" height="28" referrerPolicy="no-referrer" style={{ width: '28px', height: '28px', objectFit: 'contain', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Space Theme & Color Palette */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                Space Theme
              </label>
              {/* Segmented Mode Selector: Presets vs Custom */}
              <div
                style={{
                  display: 'inline-flex',
                  backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                  padding: '2px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setThemeTab('presets')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: themeTab === 'presets' ? (isDark ? '#334155' : '#ffffff') : 'transparent',
                    color: themeTab === 'presets' ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                    boxShadow: themeTab === 'presets' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Presets
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setThemeTab('custom');
                    if (!colors || PRESET_GRADIENTS.some((g) => g.value === colors || g.id === colors) || PRESET_SOLID_COLORS.includes(colors)) {
                      if (customMode === 'solid') {
                        setColors(customSolid);
                      } else {
                        setColors(`linear-gradient(135deg, ${customGrad1} 0%, ${customGrad2} 100%)`);
                      }
                    }
                  }}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: themeTab === 'custom' ? (isDark ? '#334155' : '#ffffff') : 'transparent',
                    color: themeTab === 'custom' ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                    boxShadow: themeTab === 'custom' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Presets Tab */}
            {themeTab === 'presets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Row 1: Gradients */}
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {PRESET_GRADIENTS.map((g) => {
                    const isSelected = colors === g.value || colors === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setColors(g.value)}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: g.value,
                          border: 'none',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                          padding: 0,
                          boxShadow: isSelected
                            ? (isDark ? '0 0 0 2.5px #1e293b, 0 0 0 4.5px #38bdf8, 0 2px 8px rgba(0,0,0,0.35)' : '0 0 0 2.5px #ffffff, 0 0 0 4.5px #0f172a, 0 2px 8px rgba(0,0,0,0.15)')
                            : (isDark ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 1px 3px rgba(0,0,0,0.2)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0,0,0,0.06)'),
                          transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        title={g.name}
                        aria-label={g.name}
                      />
                    );
                  })}
                </div>

                {/* Row 2: Solid Colors */}
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {PRESET_SOLID_COLORS.map((c: string) => {
                    const isSelected = colors === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColors(c)}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: 'none',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                          padding: 0,
                          boxShadow: isSelected
                            ? (isDark ? '0 0 0 2.5px #1e293b, 0 0 0 4.5px #38bdf8, 0 2px 8px rgba(0,0,0,0.35)' : '0 0 0 2.5px #ffffff, 0 0 0 4.5px #0f172a, 0 2px 8px rgba(0,0,0,0.15)')
                            : (isDark ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 1px 3px rgba(0,0,0,0.2)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0,0,0,0.06)'),
                          transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        title={c}
                        aria-label={`Solid color ${c}`}
                      />
                    );
                  })}
                </div>

                {/* Row 3: No theme color option */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setColors('')}
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      borderRadius: '14px',
                      backgroundColor: isDark ? '#334155' : '#f1f5f9',
                      border: 'none',
                      outline: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: !colors
                        ? (isDark ? '0 0 0 2px #38bdf8' : '0 0 0 2px #0f172a')
                        : 'none',
                      transition: 'all 0.15s ease',
                      fontSize: '12px',
                      color: isDark ? '#cbd5e1' : '#475569',
                    }}
                    title="No theme color (Default)"
                    aria-label="No theme color (Default)"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="5.5" stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth="1.5" />
                      <line x1="4" y1="12" x2="12" y2="4" stroke="#ef4444" strokeWidth="1.5" />
                    </svg>
                    <span>Default (No Theme Color)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Custom Tab (Arc & Zen Browser Style) */}
            {themeTab === 'custom' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                  padding: '12px',
                  borderRadius: '10px',
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                }}
              >
                {/* Arc style Solid vs Gradient sub-mode */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode('solid');
                      handleApplyCustomSolid(customSolid);
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: `1px solid ${customMode === 'solid' ? '#38bdf8' : isDark ? '#475569' : '#cbd5e1'}`,
                      background: customMode === 'solid' ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                      color: customMode === 'solid' ? '#38bdf8' : isDark ? '#94a3b8' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Single Color
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode('gradient');
                      handleApplyCustomGradient(customGrad1, customGrad2);
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: `1px solid ${customMode === 'gradient' ? '#38bdf8' : isDark ? '#475569' : '#cbd5e1'}`,
                      background: customMode === 'gradient' ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                      color: customMode === 'gradient' ? '#38bdf8' : isDark ? '#94a3b8' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Two-Color Gradient
                  </button>
                </div>

                {/* Solid Custom Mode */}
                {customMode === 'solid' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0 }}>
                      <input
                        type="color"
                        value={customSolid}
                        onChange={(e) => handleApplyCustomSolid(e.target.value)}
                        style={{
                          opacity: 0,
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          cursor: 'pointer',
                          zIndex: 2,
                        }}
                      />
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: customSolid,
                          boxShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.4), 0 2px 5px rgba(0,0,0,0.2)',
                          border: `2px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                        }}
                      />
                    </div>
                    <input
                      type="text"
                      value={customSolid}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomSolid(val);
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          handleApplyCustomSolid(val);
                        }
                      }}
                      placeholder="#3b82f6"
                      maxLength={7}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        color: isDark ? '#f8fafc' : '#0f172a',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        width: '100px',
                      }}
                    />
                    <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                      Click color circle to pick custom hue
                    </span>
                  </div>
                )}

                {/* Gradient Custom Mode (Arc style 2 stops) */}
                {customMode === 'gradient' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Stop 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
                          <input
                            type="color"
                            value={customGrad1}
                            onChange={(e) => handleApplyCustomGradient(e.target.value, customGrad2)}
                            style={{
                              opacity: 0,
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              cursor: 'pointer',
                              zIndex: 2,
                            }}
                          />
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: customGrad1,
                              border: `2px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569', fontWeight: 500 }}>
                          Color 1
                        </span>
                      </div>

                      {/* Direction arrow */}
                      <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: '14px' }}>➔</span>

                      {/* Stop 2 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
                          <input
                            type="color"
                            value={customGrad2}
                            onChange={(e) => handleApplyCustomGradient(customGrad1, e.target.value)}
                            style={{
                              opacity: 0,
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              cursor: 'pointer',
                              zIndex: 2,
                            }}
                          />
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: customGrad2,
                              border: `2px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569', fontWeight: 500 }}>
                          Color 2
                        </span>
                      </div>
                    </div>

                    {/* Gradient bar preview */}
                    <div
                      style={{
                        height: '24px',
                        borderRadius: '6px',
                        background: `linear-gradient(135deg, ${customGrad1} 0%, ${customGrad2} 100%)`,
                        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Arc-Style Texture & Noise Slider (Available for both Presets and Custom) */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>
                  Texture & Grain
                </span>
                <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'monospace' }}>
                  {Math.round(themeNoise * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(themeNoise * 100)}
                onChange={(e) => setThemeNoise(Number(e.target.value) / 100)}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: '#38bdf8',
                }}
              />
            </div>

            {/* Mini Card Live Preview */}
            <div
              style={{
                marginTop: '12px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: colors || (isDark ? '#0f172a' : '#f8fafc'),
                position: 'relative',
                overflow: 'hidden',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minHeight: '44px',
              }}
            >
              {/* Noise overlay */}
              {themeNoise > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url("${NOISE_SVG_DATA_URI}")`,
                    backgroundRepeat: 'repeat',
                    mixBlendMode: 'overlay',
                    opacity: themeNoise,
                    pointerEvents: 'none',
                    borderRadius: 'inherit',
                  }}
                />
              )}
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  width="24"
                  height="24"
                  referrerPolicy="no-referrer"
                  style={{ width: '24px', height: '24px', objectFit: 'contain', zIndex: 1 }}
                />
              ) : (
                <span style={{ fontSize: '18px', zIndex: 1 }}>📁</span>
              )}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: colors ? '#ffffff' : (isDark ? '#f8fafc' : '#0f172a'),
                  textShadow: colors ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
                  zIndex: 1,
                }}
              >
                {name.trim() || 'Space Preview'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
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

