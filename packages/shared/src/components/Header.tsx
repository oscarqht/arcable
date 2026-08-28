import React from 'react';
import { Badge } from './Badge';
import { ARCABLE_LOGO_DATA_URL } from '../assets/logo';

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
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
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
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {title}
        </span>
        {badgeText && <Badge variant={badgeVariant}>{badgeText}</Badge>}
        {leftContent}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
    </header>
  );
};
