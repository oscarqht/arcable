'use client';

import React from 'react';

interface NotificationBadgeProps {
  badge?: string | number | null;
  size?: number;
  isDarkTheme?: boolean;
  style?: React.CSSProperties;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  badge,
  size = 18,
  isDarkTheme = false,
  style,
}) => {
  return Boolean(badge) ? (
    <span
      style={{
        position: 'absolute',
        top: '-4px',
        right: size >= 24 ? '-7px' : '-6px',
        backgroundColor: '#ef4444',
        color: '#ffffff',
        fontSize: size >= 24 ? '9.5px' : '9px',
        fontWeight: 700,
        lineHeight: 1,
        minWidth: size >= 24 ? '15px' : '14px',
        height: size >= 24 ? '15px' : '14px',
        borderRadius: '9999px',
        padding: size >= 24 ? '0 4px' : '0 3px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        border: `1.5px solid ${isDarkTheme ? '#1e293b' : '#ffffff'}`,
        pointerEvents: 'none',
        zIndex: 2,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      {badge}
    </span>
  ) : null;
};
