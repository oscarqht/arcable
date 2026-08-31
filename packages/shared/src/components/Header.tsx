import React from 'react';
import { Badge } from './Badge';
import { ARCABLE_LOGO_DATA_URL } from '../assets/logo';
import { useSystemTheme } from '../hooks/useSystemTheme';

export interface HeaderProps {
  title?: string;
  logoSrc?: string;
  badgeText?: string;
  badgeVariant?: 'info' | 'success' | 'warning' | 'default';
  leftContent?: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Arcable',
  logoSrc = ARCABLE_LOGO_DATA_URL,
  badgeText,
  badgeVariant = 'info',
  leftContent,
  actions,
  style,
}) => {
  const { isDark } = useSystemTheme();

  return (
    <>
      <style>{`@media (max-width: 319px) { .arcable-header-title { display: none !important; } }`}</style>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: isDark ? '#151e2e' : '#ffffff',
          borderBottom: isDark ? '1px solid #243247' : '1px solid #e2e8f0',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src={logoSrc}
            alt={title}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
          <span
            className="arcable-header-title"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: isDark ? '#f8fafc' : '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </span>
          {badgeText && <Badge variant={badgeVariant}>{badgeText}</Badge>}
          {leftContent}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
      </header>
    </>
  );
};
