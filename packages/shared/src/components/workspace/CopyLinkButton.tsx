'use client';

import React, { useState } from 'react';
import { LinkIcon, CheckIcon } from '../Icons';
import { copyToClipboard } from '../../utils/format';
import { useSystemTheme } from '../../hooks/useSystemTheme';

export interface CopyLinkButtonProps {
  url?: string;
  isDarkTheme?: boolean;
  textColor?: string;
  hoverBg?: string;
  hoverColor?: string;
  size?: number;
  iconSize?: number;
  strokeWidth?: number;
  title?: string;
  copiedTitle?: string;
  className?: string;
  style?: React.CSSProperties;
  copied?: boolean;
  onCopiedChange?: (copied: boolean) => void;
  onCopy?: (url: string, e: React.MouseEvent) => void;
}

export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({
  url,
  isDarkTheme,
  textColor,
  hoverBg,
  hoverColor,
  size = 24,
  iconSize = 13,
  strokeWidth = 2.2,
  title = 'Copy link',
  copiedTitle = 'Copied link!',
  className,
  style,
  copied: controlledCopied,
  onCopiedChange,
  onCopy,
}) => {
  const { isDark: systemDark } = useSystemTheme();
  const effectiveDark = isDarkTheme ?? systemDark;
  const [internalCopied, setInternalCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isCopied = controlledCopied !== undefined ? controlledCopied : internalCopied;

  if (!url) {
    return null;
  }

  const defaultHoverBg = hoverBg || (effectiveDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.1)');
  const defaultTextColor = effectiveDark ? '#94a3b8' : (textColor || '#191c1b');
  const defaultHoverColor = hoverColor || (effectiveDark ? '#38bdf8' : '#0284c7');
  const copiedColor = effectiveDark ? '#34d399' : '#059669';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;

    void copyToClipboard(url);

    if (controlledCopied === undefined) {
      setInternalCopied(true);
      setTimeout(() => setInternalCopied(false), 1600);
    }
    onCopiedChange?.(true);
    setTimeout(() => onCopiedChange?.(false), 1600);
    onCopy?.(url, e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isCopied ? copiedTitle : title}
      aria-label={isCopied ? copiedTitle : title}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '6px',
        border: 'none',
        background: isHovered && !isCopied ? defaultHoverBg : 'transparent',
        color: isCopied ? copiedColor : (isHovered ? defaultHoverColor : defaultTextColor),
        opacity: isCopied ? 1 : (isHovered ? 1 : 0.8),
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        transition: 'background-color 0.12s ease, color 0.12s ease, opacity 0.12s ease',
        ...style,
      }}
    >
      {isCopied ? (
        <CheckIcon size={iconSize} color={copiedColor} />
      ) : (
        <LinkIcon size={iconSize} strokeWidth={strokeWidth} />
      )}
    </button>
  );
};
