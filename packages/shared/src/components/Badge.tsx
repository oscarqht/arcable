import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'default';
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  style,
}) => {
  const getStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: 600,
      borderRadius: '9999px',
      letterSpacing: '0.025em',
      textTransform: 'uppercase',
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      default: { backgroundColor: '#e2e8f0', color: '#334155' },
      info: { backgroundColor: '#e0f2fe', color: '#0369a1' },
      success: { backgroundColor: '#dcfce7', color: '#15803d' },
      warning: { backgroundColor: '#fef3c7', color: '#b45309' },
    };

    return {
      ...base,
      ...variantStyles[variant],
      ...style,
    };
  };

  return <span style={getStyles()}>{children}</span>;
};
