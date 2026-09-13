'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, CountdownConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { HourglassIcon, CheckIcon } from '../../Icons';

export interface CountdownPopoverProps {
  widget: WorkspaceWidget;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (config: CountdownConfig) => void;
  theme: SpaceThemeTokens;
}

export const CountdownPopover: React.FC<CountdownPopoverProps> = ({
  widget,
  anchorRect,
  isOpen,
  onClose,
  onUpdateConfig,
  theme,
}) => {
  const config = (widget.config as CountdownConfig) || {};
  const [title, setTitle] = useState(config.title || 'My Event');
  const [targetDateStr, setTargetDateStr] = useState(() => {
    if (config.targetDate) return config.targetDate;
    // Default to tomorrow 9am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [isEditing, setIsEditing] = useState(false);

  // Live countdown state
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const popoverEl = document.getElementById(`countdown-popover-${widget.id}`);
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, widget.id]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const width = 250;
  const height = isEditing ? 250 : 210;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const targetTimestamp = new Date(targetDateStr).getTime();
  const diffMs = Math.max(0, targetTimestamp - now);

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  const isCompleted = diffMs <= 0;

  const handleSave = () => {
    setIsEditing(false);
    onUpdateConfig({
      ...config,
      title: title.trim() || 'My Event',
      targetDate: targetDateStr,
    });
  };

  const handleSetPreset = (hoursToAdd: number) => {
    const d = new Date(Date.now() + hoursToAdd * 60 * 60 * 1000);
    const str = d.toISOString().slice(0, 16);
    setTargetDateStr(str);
    onUpdateConfig({
      ...config,
      title: title.trim() || 'My Event',
      targetDate: str,
    });
  };

  return createPortal(
    <div
      id={`countdown-popover-${widget.id}`}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: theme.isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${theme.borderColor}`,
        borderRadius: '16px',
        boxShadow: theme.isDark
          ? '0 12px 36px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 12px 36px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '14px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: theme.textColor,
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
          <HourglassIcon size={14} color={theme.primaryColor} />
          <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || 'Countdown'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
          style={{
            fontSize: '11px',
            color: theme.primaryColor,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '10.5px', color: theme.subtextColor, display: 'block', marginBottom: '3px' }}>
              Event Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product Launch"
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '8px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                color: theme.textColor,
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '10.5px', color: theme.subtextColor, display: 'block', marginBottom: '3px' }}>
              Target Date & Time
            </label>
            <input
              type="datetime-local"
              value={targetDateStr}
              onChange={(e) => setTargetDateStr(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '8px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                color: theme.textColor,
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
            <button
              type="button"
              onClick={() => handleSetPreset(24)}
              style={{
                flex: 1,
                padding: '4px',
                fontSize: '10.5px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: 'transparent',
                color: theme.textColor,
                cursor: 'pointer',
              }}
            >
              +1 Day
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset(168)}
              style={{
                flex: 1,
                padding: '4px',
                fontSize: '10.5px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: 'transparent',
                color: theme.textColor,
                cursor: 'pointer',
              }}
            >
              +1 Week
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset(720)}
              style={{
                flex: 1,
                padding: '4px',
                fontSize: '10.5px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: 'transparent',
                color: theme.textColor,
                cursor: 'pointer',
              }}
            >
              +1 Month
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {isCompleted ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>🎉 Reached!</div>
              <div style={{ fontSize: '11px', color: theme.subtextColor, marginTop: '4px' }}>
                This event has arrived.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px',
                width: '100%',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: '10px',
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{days}</div>
                <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Days</div>
              </div>
              <div
                style={{
                  background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: '10px',
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{hours}</div>
                <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Hours</div>
              </div>
              <div
                style={{
                  background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: '10px',
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{minutes}</div>
                <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Mins</div>
              </div>
              <div
                style={{
                  background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: '10px',
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: theme.primaryColor }}>
                  {seconds}
                </div>
                <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Secs</div>
              </div>
            </div>
          )}

          <div style={{ fontSize: '11px', color: theme.subtextColor }}>
            Target: {new Date(targetDateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
