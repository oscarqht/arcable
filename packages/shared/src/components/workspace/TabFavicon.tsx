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
  style?: React.CSSProperties;
}

export const TabFavicon: React.FC<TabFaviconProps> = ({
  url,
  customEmojiIcon,
  size = 16,
  emojiSize,
  isDarkTheme = false,
  showDomainFallback = false,
  globeIconSize,
  globeIconColor,
  style,
}) => {
  const candidates = useMemo(() => getFaviconCandidates(url), [url]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const domain = useMemo(() => getDomain(url), [url]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [url]);

  if (customEmojiIcon) {
    return (
      <span
        style={{
          fontSize: `${emojiSize || size}px`,
          lineHeight: 1,
          flexShrink: 0,
          ...style,
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
          borderRadius: '3px',
          flexShrink: 0,
          ...style,
        }}
        onError={() => {
          setCandidateIndex((prev) => prev + 1);
        }}
      />
    );
  }

  if (showDomainFallback && domain) {
    return (
      <span
        style={{
          width: `${size + 2}px`,
          height: `${size + 2}px`,
          borderRadius: '4px',
          backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
          color: 'inherit',
          fontSize: '10px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textTransform: 'uppercase',
          flexShrink: 0,
          ...style,
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
      style={{ opacity: globeIconColor ? 1 : 0.6, flexShrink: 0, ...style }}
    />
  );
};
