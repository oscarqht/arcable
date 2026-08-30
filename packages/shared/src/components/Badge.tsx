import React from 'react';
import { useSystemTheme } from '../hooks/useSystemTheme';

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
  const { isDark } = useSystemTheme();

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
      transition: 'background-color 0.2s ease, color 0.2s ease',
    };

    const variantStyles: Record<string, React.CSSProperties> = isDark
      ? {
          default: { backgroundColor: 'rgba(255, 255, 255, 0.12)', color: '#e2e8f0' },
          info: { backgroundColor: 'rgba(2, 132, 199, 0.25)', color: '#38bdf8' },
          success: { backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' },
          warning: { backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#fde047' },
        }
      : {
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
