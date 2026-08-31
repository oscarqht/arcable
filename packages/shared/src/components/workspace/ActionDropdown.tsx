'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  hoverBg?: string;
  buttonStyle?: React.CSSProperties;
  className?: string;
}

export const ActionDropdown: React.FC<ActionDropdownProps> = ({
  items,
  isDarkTheme,
  visible = true,
  buttonTitle = 'More actions',
  align = 'right',
  size = 'sm',
  hoverBg,
  buttonStyle,
  className,
}) => {
  const { isDark: isSystemDark } = useSystemTheme();
  const effectiveDark = isDarkTheme !== undefined ? isDarkTheme : isSystemDark;
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeItems = items.filter(Boolean);

  // Determine if dropdown should open upwards (drop-up) or downwards (drop-down)
  useEffect(() => {
    if (!isOpen) return;

    const calculatePlacement = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight || (activeItems.length * 36 + 16);

      // Check space available in viewport
      const spaceBelowViewport = window.innerHeight - rect.bottom;
      const spaceAboveViewport = rect.top;

      // Check space available within closest scrollable or overflow-hidden parent (e.g. SpaceCard carousel container or scroll container)
      let containerBottom = window.innerHeight;
      let containerTop = 0;
      let parent = containerRef.current.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (
          style.overflow === 'hidden' ||
          style.overflowY === 'hidden' ||
          style.overflowY === 'auto' ||
          style.overflowY === 'scroll'
        ) {
          const pRect = parent.getBoundingClientRect();
          if (pRect.bottom < containerBottom) {
            containerBottom = pRect.bottom;
          }
          if (pRect.top > containerTop) {
            containerTop = pRect.top;
          }
        }
        parent = parent.parentElement;
      }

      const availableSpaceBelow = Math.min(spaceBelowViewport, containerBottom - rect.bottom);
      const availableSpaceAbove = Math.min(spaceAboveViewport, rect.top - containerTop);

      // If not enough room below for the menu + margin, and more room above (or enough room above)
      if (availableSpaceBelow < menuHeight + 8 && availableSpaceAbove > availableSpaceBelow) {
        setPlacement('top');
      } else {
        setPlacement('bottom');
      }
    };

    calculatePlacement();
    window.addEventListener('resize', calculatePlacement);
    window.addEventListener('scroll', calculatePlacement, true);

    return () => {
      window.removeEventListener('resize', calculatePlacement);
      window.removeEventListener('scroll', calculatePlacement, true);
    };
  }, [isOpen, activeItems.length]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
        zIndex: isOpen ? 100 : 'auto',
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
      `}</style>
      {/* ... Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
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
        <MoreHorizontalIcon size={iconSize} />
      </button>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            ...(placement === 'top'
              ? { bottom: 'calc(100% + 4px)', top: 'auto' }
              : { top: 'calc(100% + 4px)', bottom: 'auto' }),
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            backgroundColor: menuBg,
            borderRadius: '12px',
            border: `1px solid ${menuBorder}`,
            boxShadow: effectiveDark
              ? placement === 'top'
                ? '0 -10px 30px rgba(0, 0, 0, 0.5), 0 -4px 12px rgba(0, 0, 0, 0.3)'
                : '0 10px 30px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)'
              : placement === 'top'
                ? '0 -10px 30px rgba(0, 0, 0, 0.12), 0 -4px 12px rgba(0, 0, 0, 0.06)'
                : '0 10px 30px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
            padding: '5px',
            minWidth: '165px',
            maxWidth: '260px',
            maxHeight: 'calc(100vh - 40px)',
            overflowY: 'auto',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            userSelect: 'none',
            animation: 'dropdownFadeIn 0.15s ease-out',
            transformOrigin: placement === 'top'
              ? (align === 'right' ? 'bottom right' : 'bottom left')
              : (align === 'right' ? 'top right' : 'top left'),
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
        </div>
      )}
    </div>
  );
};
