import React from 'react';
import { Badge } from './Badge';

export interface HeaderProps {
  title?: string;
  badgeText?: string;
  badgeVariant?: 'info' | 'success' | 'warning' | 'default';
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Arcable',
  badgeText,
  badgeVariant = 'info',
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
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          A
        </div>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {title}
        </span>
        {badgeText && <Badge variant={badgeVariant}>{badgeText}</Badge>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
    </header>
  );
};
