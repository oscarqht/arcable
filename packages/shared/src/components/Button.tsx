import React from 'react';
import { useSystemTheme } from '../hooks/useSystemTheme';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  style,
  ...props
}) => {
  const { isDark } = useSystemTheme();

  const getStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 500,
      borderRadius: '6px',
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.6 : 1,
      transition: 'all 0.15s ease-in-out',
      border: '1px solid transparent',
      fontFamily: 'inherit',
      textDecoration: 'none',
      boxSizing: 'border-box',
    };

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { padding: '4px 10px', fontSize: '12px', height: '28px' },
      md: { padding: '8px 16px', fontSize: '14px', height: '36px' },
      lg: { padding: '12px 22px', fontSize: '16px', height: '44px' },
    };

    const variantStyles: Record<string, React.CSSProperties> = isDark
      ? {
          primary: {
            backgroundColor: '#0284c7',
            color: '#ffffff',
            borderColor: '#0284c7',
          },
          secondary: {
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            borderColor: '#334155',
          },
          outline: {
            backgroundColor: 'transparent',
            color: '#38bdf8',
            borderColor: '#38bdf8',
          },
          danger: {
            backgroundColor: '#dc2626',
            color: '#ffffff',
            borderColor: '#dc2626',
          },
          ghost: {
            backgroundColor: 'transparent',
            color: '#94a3b8',
            borderColor: 'transparent',
          },
        }
      : {
          primary: {
            backgroundColor: '#0284c7',
            color: '#ffffff',
            borderColor: '#0284c7',
          },
          secondary: {
            backgroundColor: '#f1f5f9',
            color: '#1e293b',
            borderColor: '#e2e8f0',
          },
          outline: {
            backgroundColor: 'transparent',
            color: '#0284c7',
            borderColor: '#0284c7',
          },
          danger: {
            backgroundColor: '#ef4444',
            color: '#ffffff',
            borderColor: '#ef4444',
          },
          ghost: {
            backgroundColor: 'transparent',
            color: '#64748b',
            borderColor: 'transparent',
          },
        };

    return {
      ...base,
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...style,
    };
  };

  return (
    <button disabled={disabled || isLoading} style={getStyles()} {...props}>
      {isLoading ? <span>Loading...</span> : children}
    </button>
  );
};
