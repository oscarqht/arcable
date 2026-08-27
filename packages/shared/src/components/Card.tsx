import React from 'react';

export interface CardProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  extra,
  children,
  style,
  className,
}) => {
  return (
    <div
      className={className}
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        ...style,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '12px',
            borderBottom: subtitle || children ? '1px solid #f1f5f9' : 'none',
            paddingBottom: '8px',
          }}
        >
          <div>
            {title && <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{title}</h3>}
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>{subtitle}</p>}
          </div>
          {extra && <div>{extra}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};
