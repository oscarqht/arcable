'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, CountdownConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { HourglassIcon } from '../../Icons';
import { sendTimerNotification } from '../../../utils/timerAlert';
import {
  COUNTDOWN_PRESETS,
  calculateCountdownStatus,
  createDefaultCountdownConfig,
  createTargetDateFromMinutes,
  toDatetimeLocalString,
} from '../../../utils/countdown';

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
  const [title, setTitle] = useState(config.title || 'Countdown');
  const [targetDateStr, setTargetDateStr] = useState(() => {
    return config.targetDate || createDefaultCountdownConfig().targetDate!;
  });
  const [customMinutes, setCustomMinutes] = useState('');
  const [isCustomMinutesDirty, setIsCustomMinutesDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Sync state if widget config changes from external source
  useEffect(() => {
    if (config.title) setTitle(config.title);
    if (config.targetDate) setTargetDateStr(config.targetDate);
  }, [config.title, config.targetDate, widget.id]);

  // Ensure default targetDate is persisted if widget was added without it
  useEffect(() => {
    if (!config.targetDate && isOpen) {
      const defaultCfg = createDefaultCountdownConfig();
      setTargetDateStr(defaultCfg.targetDate!);
      onUpdateConfig({
        ...config,
        title: config.title || defaultCfg.title,
        targetDate: defaultCfg.targetDate,
      });
    }
  }, [config.targetDate, isOpen]);

  // Live countdown state
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Current status
  const status = calculateCountdownStatus(targetDateStr, now);

  // Completion notification (fires only if completed within last 30s)
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (status.isCompleted && !notifiedRef.current && targetDateStr) {
      const targetTime = new Date(targetDateStr).getTime();
      if (!isNaN(targetTime) && Date.now() - targetTime < 30000) {
        notifiedRef.current = true;
        sendTimerNotification(
          '⏳ Countdown Finished!',
          `"${title || 'Countdown'}" has reached zero!`
        );
      }
    }
    if (!status.isCompleted) {
      notifiedRef.current = false;
    }
  }, [status.isCompleted, targetDateStr, title]);

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

  const width = 260;
  const height = isEditing ? 300 : 220;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const handleSetPreset = (minutesToAdd: number) => {
    const newTarget = createTargetDateFromMinutes(minutesToAdd);
    setTargetDateStr(newTarget);
    setCustomMinutes(String(minutesToAdd));
    setIsCustomMinutesDirty(false);
    onUpdateConfig({
      ...config,
      title: title.trim() || 'Countdown',
      targetDate: newTarget,
    });
  };

  const handleApplyCustom = () => {
    const mins = parseFloat(customMinutes);
    if (!isNaN(mins) && mins > 0) {
      const newTarget = createTargetDateFromMinutes(mins);
      setTargetDateStr(newTarget);
      setIsCustomMinutesDirty(false);
      onUpdateConfig({
        ...config,
        title: title.trim() || 'Countdown',
        targetDate: newTarget,
      });
    }
  };

  const handleSave = () => {
    setIsEditing(false);
    let finalTarget = targetDateStr;
    if (isCustomMinutesDirty) {
      const mins = parseFloat(customMinutes);
      if (!isNaN(mins) && mins > 0) {
        finalTarget = createTargetDateFromMinutes(mins);
        setTargetDateStr(finalTarget);
        setIsCustomMinutesDirty(false);
      }
    }
    onUpdateConfig({
      ...config,
      title: title.trim() || 'Countdown',
      targetDate: finalTarget,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '10.5px', color: theme.subtextColor, display: 'block', marginBottom: '3px' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Focus, Tea, Meeting"
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
            <label style={{ fontSize: '10.5px', color: theme.subtextColor, display: 'block', marginBottom: '4px' }}>
              Predefined Duration
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {COUNTDOWN_PRESETS.map((mins) => {
                const isSelected = customMinutes === String(mins) && !isCustomMinutesDirty;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleSetPreset(mins)}
                    style={{
                      padding: '5px 0',
                      fontSize: '11px',
                      fontWeight: isSelected ? 700 : 500,
                      borderRadius: '6px',
                      border: `1px solid ${isSelected ? theme.primaryColor : theme.borderColor}`,
                      background: isSelected
                        ? (theme.isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)')
                        : 'transparent',
                      color: isSelected ? theme.primaryColor : theme.textColor,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {mins}m
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '10.5px', color: theme.subtextColor, display: 'block', marginBottom: '4px' }}>
              Custom Minutes
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="number"
                min="1"
                max="10000"
                placeholder="e.g. 20"
                value={customMinutes}
                onChange={(e) => {
                  setCustomMinutes(e.target.value);
                  setIsCustomMinutesDirty(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyCustom();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.borderColor}`,
                  background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                  color: theme.textColor,
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={handleApplyCustom}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: theme.primaryColor,
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                Set
              </button>
            </div>
          </div>

          <details style={{ fontSize: '10.5px', color: theme.subtextColor, marginTop: '2px' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', marginBottom: '4px' }}>
              Or pick specific date & time...
            </summary>
            <input
              type="datetime-local"
              value={toDatetimeLocalString(new Date(targetDateStr))}
              onChange={(e) => {
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) {
                    const iso = d.toISOString();
                    setTargetDateStr(iso);
                    setCustomMinutes('');
                    setIsCustomMinutesDirty(false);
                    onUpdateConfig({
                      ...config,
                      title: title.trim() || 'Countdown',
                      targetDate: iso,
                    });
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '4px 6px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                color: theme.textColor,
                fontSize: '11px',
                boxSizing: 'border-box',
              }}
            />
          </details>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {status.isCompleted ? (
            <div style={{ padding: '12px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontSize: '22px' }}>🎉</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>Time's up!</div>
              <div style={{ fontSize: '11px', color: theme.subtextColor }}>
                Countdown has reached zero.
              </div>
              <button
                type="button"
                onClick={() => handleSetPreset(15)}
                style={{
                  marginTop: '4px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.borderColor}`,
                  background: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                  color: theme.textColor,
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Restart (15m)
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: status.days > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                gap: '6px',
                width: '100%',
                textAlign: 'center',
              }}
            >
              {status.days > 0 && (
                <div
                  style={{
                    background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderRadius: '10px',
                    padding: '8px 4px',
                  }}
                >
                  <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{status.days}</div>
                  <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Days</div>
                </div>
              )}
              <div
                style={{
                  background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: '10px',
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{status.hours}</div>
                <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Hours</div>
              </div>
              <div
                style={{
                  background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: '10px',
                  padding: '8px 4px',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{status.minutes}</div>
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
                  {status.seconds}
                </div>
                <div style={{ fontSize: '9px', color: theme.subtextColor, textTransform: 'uppercase' }}>Secs</div>
              </div>
            </div>
          )}

          {targetDateStr && (
            <div style={{ fontSize: '11px', color: theme.subtextColor }}>
              {(() => {
                const target = new Date(targetDateStr);
                if (isNaN(target.getTime())) return null;
                const isToday = target.toDateString() === new Date().toDateString();
                const timeStr = target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return isToday
                  ? `Target: Today at ${timeStr}`
                  : `Target: ${target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${timeStr}`;
              })()}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};
