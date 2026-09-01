'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontalIcon } from '../Icons';
import { useSystemTheme } from '../../hooks/useSystemTheme';

export interface ActionDropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  disabled?: boolean;
  dividerAfter?: boolean;
}

export interface ActionDropdownProps {
  items: ActionDropdownItem[];
  isDarkTheme?: boolean;
  visible?: boolean;
  buttonTitle?: string;
  triggerIcon?: React.ReactNode;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  hoverBg?: string;
  buttonStyle?: React.CSSProperties;
  className?: string;
}

interface MenuCoords {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight?: number;
}

export const ActionDropdown: React.FC<ActionDropdownProps> = ({
  items,
  isDarkTheme,
  visible = true,
  buttonTitle = 'More actions',
  triggerIcon,
  align = 'right',
  size = 'sm',
  hoverBg,
  buttonStyle,
  className,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeItems = items.filter(Boolean);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate and update menu fixed position relative to viewport
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // If trigger element has 0 size or is completely hidden
    if (rect.width === 0 && rect.height === 0) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const menuEl = menuRef.current;
    const menuHeight = menuEl ? menuEl.offsetHeight : (activeItems.length * 36 + 16);
    const menuWidth = menuEl ? menuEl.offsetWidth : 210;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Prefer bottom placement unless there is not enough room below and more room above
    const fitsBelow = spaceBelow >= menuHeight + 8;
    const fitsAbove = spaceAbove >= menuHeight + 8;

    let newPlacement: 'bottom' | 'top' = 'bottom';
    if (!fitsBelow && (fitsAbove || spaceAbove > spaceBelow)) {
      newPlacement = 'top';
    } else {
      newPlacement = 'bottom';
    }

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;

    if (newPlacement === 'bottom') {
      top = rect.bottom + 4;
      maxHeight = Math.max(140, viewportHeight - top - 12);
    } else {
      bottom = viewportHeight - rect.top + 4;
      maxHeight = Math.max(140, rect.top - 12);
    }

    let left: number | undefined;
    let right: number | undefined;

    if (align === 'right') {
      const rightDistance = viewportWidth - rect.right;
      right = Math.max(8, Math.min(rightDistance, viewportWidth - menuWidth - 8));
    } else {
      left = Math.max(8, Math.min(rect.left, viewportWidth - menuWidth - 8));
    }

    setPlacement(newPlacement);
    setMenuCoords({ top, bottom, left, right, maxHeight });
  }, [align, activeItems.length]);

  // Position updates on open, resize, or scroll
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    const rafId = requestAnimationFrame(() => {
      updatePosition();
    });

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (activeItems.length === 0) {
    return null;
  }

  const shouldShow = visible || isOpen;
  if (!shouldShow) {
    return null;
  }

  const defaultHoverBg = hoverBg || (effectiveDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)');
  const menuBg = effectiveDark ? '#1e293b' : '#ffffff';
  const menuBorder = effectiveDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const itemTextColor = effectiveDark ? '#f1f5f9' : '#1e293b';
  const itemHoverBg = effectiveDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const dividerColor = effectiveDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)';

  const padding = size === 'sm' ? '4px 6px' : '6px 8px';
  const iconSize = size === 'sm' ? 16 : 18;

  const menuContent =
    isOpen && mounted && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuCoords?.top !== undefined ? `${menuCoords.top}px` : 'auto',
              bottom: menuCoords?.bottom !== undefined ? `${menuCoords.bottom}px` : 'auto',
              left: menuCoords?.left !== undefined ? `${menuCoords.left}px` : 'auto',
              right: menuCoords?.right !== undefined ? `${menuCoords.right}px` : 'auto',
              maxHeight: menuCoords?.maxHeight !== undefined ? `${menuCoords.maxHeight}px` : 'calc(100vh - 40px)',
              backgroundColor: menuBg,
              borderRadius: '12px',
              border: `1px solid ${menuBorder}`,
              boxShadow: effectiveDark
                ? placement === 'top'
                  ? '0 -12px 36px rgba(0, 0, 0, 0.6), 0 -4px 14px rgba(0, 0, 0, 0.4)'
                  : '0 12px 36px rgba(0, 0, 0, 0.6), 0 4px 14px rgba(0, 0, 0, 0.4)'
                : placement === 'top'
                  ? '0 -12px 36px rgba(0, 0, 0, 0.16), 0 -4px 14px rgba(0, 0, 0, 0.08)'
                  : '0 12px 36px rgba(0, 0, 0, 0.16), 0 4px 14px rgba(0, 0, 0, 0.08)',
              padding: '5px',
              minWidth: '165px',
              maxWidth: '260px',
              overflowY: 'auto',
              zIndex: 99999,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              userSelect: 'none',
              animation: 'dropdownFadeIn 0.15s ease-out',
              transformOrigin:
                placement === 'top'
                  ? align === 'right'
                    ? 'bottom right'
                    : 'bottom left'
                  : align === 'right'
                    ? 'top right'
                    : 'top left',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {activeItems.map((item) => (
              <React.Fragment key={item.id}>
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (item.disabled) return;
                    setIsOpen(false);
                    item.onClick(e);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: item.danger ? '#ef4444' : itemTextColor,
                    padding: '7px 10px',
                    borderRadius: '8px',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background-color 0.12s ease, color 0.12s ease',
                    opacity: item.disabled ? 0.5 : 1,
                    boxSizing: 'border-box',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (item.disabled) return;
                    e.currentTarget.style.backgroundColor = item.danger
                      ? effectiveDark
                        ? 'rgba(239, 68, 68, 0.18)'
                        : '#fef2f2'
                      : itemHoverBg;
                    if (item.danger) {
                      e.currentTarget.style.color = '#dc2626';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (item.disabled) return;
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = item.danger ? '#ef4444' : itemTextColor;
                  }}
                >
                  {item.icon && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        flexShrink: 0,
                        color: item.danger ? 'inherit' : 'inherit',
                        opacity: 0.9,
                      }}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {item.label}
                  </span>
                </button>

                {item.dividerAfter && (
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: dividerColor,
                      margin: '3px 0',
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes arcable-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          updatePosition();
          setIsOpen((prev) => !prev);
        }}
        title={buttonTitle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        style={{
          border: 'none',
          background: isOpen ? defaultHoverBg : 'transparent',
          color: 'inherit',
          padding,
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isOpen ? 1 : 0.85,
          transition: 'all 0.15s ease',
          outline: 'none',
          ...buttonStyle,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = defaultHoverBg;
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.opacity = '0.85';
          }
        }}
      >
        {triggerIcon || <MoreHorizontalIcon size={iconSize} />}
      </button>

      {/* Portal Menu Popup */}
      {menuContent}
    </div>
  );
};
