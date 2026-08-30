import React from 'react';
import { useSystemTheme } from '../hooks/useSystemTheme';

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
  const { isDark } = useSystemTheme();

  return (
    <div
      className={className}
      style={{
        backgroundColor: isDark ? '#151e2e' : '#ffffff',
        border: isDark ? '1px solid #243247' : '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: isDark
          ? '0 1px 3px 0 rgba(0, 0, 0, 0.3)'
          : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
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
            borderBottom: subtitle || children
              ? isDark
                ? '1px solid rgba(255, 255, 255, 0.08)'
                : '1px solid #f1f5f9'
              : 'none',
            paddingBottom: '8px',
          }}
        >
          <div>
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 600,
                  color: isDark ? '#f8fafc' : '#0f172a',
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  color: isDark ? '#94a3b8' : '#64748b',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {extra && <div>{extra}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};
