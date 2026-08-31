'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getFaviconCandidates, getDomain } from '../../utils/treeUtils';
import { GlobeIcon } from '../Icons';

export interface TabFaviconProps {
  url?: string;
  customEmojiIcon?: string;
  size?: number;
  emojiSize?: number;
  isDarkTheme?: boolean;
  showDomainFallback?: boolean;
  globeIconSize?: number;
  globeIconColor?: string;
  badge?: string | number | null;
  style?: React.CSSProperties;
}

export const TabFavicon: React.FC<TabFaviconProps> = ({
  url,
  customEmojiIcon,
  size = 18,
  emojiSize,
  isDarkTheme = false,
  showDomainFallback = false,
  globeIconSize,
  globeIconColor,
  badge,
  style,
}) => {
  const candidates = useMemo(() => getFaviconCandidates(url), [url]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const domain = useMemo(() => getDomain(url), [url]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [url]);

  const renderIcon = () => {
    if (customEmojiIcon) {
      return (
        <span
          style={{
            fontSize: `${emojiSize || size}px`,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {customEmojiIcon}
        </span>
      );
    }

    if (candidateIndex < candidates.length) {
      const currentSrc = candidates[candidateIndex];
      return (
        <img
          key={currentSrc}
          src={currentSrc}
          alt=""
          style={{
            width: `${size}px`,
            height: `${size}px`,
            objectFit: 'contain',
            borderRadius: size >= 32 ? '8px' : '3px',
            flexShrink: 0,
          }}
          onError={() => {
            setCandidateIndex((prev) => prev + 1);
          }}
        />
      );
    }

    if (showDomainFallback && domain) {
      const fallbackFontSize = Math.max(10, Math.round(size * 0.5));
      return (
        <span
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: size >= 32 ? '8px' : size >= 20 ? '6px' : '4px',
            backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
            color: 'inherit',
            fontSize: `${fallbackFontSize}px`,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {domain.charAt(0)}
        </span>
      );
    }

    return (
      <GlobeIcon
        size={globeIconSize || size}
        color={globeIconColor || 'inherit'}
        style={{ opacity: globeIconColor ? 1 : 0.6, flexShrink: 0 }}
      />
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {renderIcon()}

      {Boolean(badge) && (
        <span
          style={{
            position: 'absolute',
            top: size >= 24 ? '-4px' : '-4px',
            right: size >= 24 ? '-7px' : '-6px',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            fontSize: size >= 24 ? '9px' : '8.5px',
            fontWeight: 700,
            lineHeight: 1,
            minWidth: size >= 24 ? '14px' : '13px',
            height: size >= 24 ? '14px' : '13px',
            borderRadius: '7px',
            padding: size >= 24 ? '0 3.5px' : '0 3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
            border: `1.5px solid ${isDarkTheme ? '#1e293b' : '#ffffff'}`,
            pointerEvents: 'none',
            zIndex: 2,
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
};
