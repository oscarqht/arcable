'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, PomodoroConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { PlayIcon, PauseIcon, RotateCcwIcon, SettingsIcon } from '../../Icons';
import { sendTimerNotification } from '../../../utils/timerAlert';

export interface PomodoroPopoverProps {
  widget: WorkspaceWidget;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (config: PomodoroConfig) => void;
  theme: SpaceThemeTokens;
}

export const PomodoroPopover: React.FC<PomodoroPopoverProps> = ({
  widget,
  anchorRect,
  isOpen,
  onClose,
  onUpdateConfig,
  theme,
}) => {
  const config = (widget.config as PomodoroConfig) || {};
  const workMinutes = config.workMinutes ?? 25;
  const breakMinutes = config.breakMinutes ?? 5;
  const mode = config.mode ?? 'work';
  const isRunning = Boolean(config.isRunning);

  const [showSettings, setShowSettings] = useState(false);
  const [customWorkMin, setCustomWorkMin] = useState(workMinutes);
  const [customBreakMin, setCustomBreakMin] = useState(breakMinutes);

  // Compute remaining seconds
  const defaultTotalSeconds = (mode === 'work' ? workMinutes : breakMinutes) * 60;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (isRunning && config.targetTimestamp) {
      const diff = Math.max(0, Math.ceil((config.targetTimestamp - Date.now()) / 1000));
      return diff;
    }
    return config.remainingSeconds ?? defaultTotalSeconds;
  });

  // Tick effect
  useEffect(() => {
    if (!isRunning || !config.targetTimestamp) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.ceil((config.targetTimestamp! - Date.now()) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        clearInterval(interval);
        // Timer completed!
        const nextMode = mode === 'work' ? 'break' : 'work';
        const nextTotal = (nextMode === 'work' ? workMinutes : breakMinutes) * 60;
        sendTimerNotification(
          mode === 'work' ? '🍅 Pomodoro Finished!' : '☕ Break Ended!',
          mode === 'work' ? 'Great focus! Time to take a short break.' : 'Break over! Ready to focus again?'
        );
        onUpdateConfig({
          ...config,
          mode: nextMode,
          isRunning: false,
          targetTimestamp: undefined,
          remainingSeconds: nextTotal,
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isRunning, config.targetTimestamp, mode, workMinutes, breakMinutes]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const popoverEl = document.getElementById(`pomodoro-popover-${widget.id}`);
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

  const width = 240;
  const height = showSettings ? 280 : 230;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const totalCurrentSeconds = (mode === 'work' ? workMinutes : breakMinutes) * 60;
  const progressPercent = Math.max(0, Math.min(100, ((totalCurrentSeconds - remainingSeconds) / totalCurrentSeconds) * 100));

  const handleTogglePlay = () => {
    if (isRunning) {
      // Pause
      onUpdateConfig({
        ...config,
        isRunning: false,
        remainingSeconds,
        targetTimestamp: undefined,
      });
    } else {
      // Start
      const target = Date.now() + remainingSeconds * 1000;
      onUpdateConfig({
        ...config,
        isRunning: true,
        targetTimestamp: target,
        remainingSeconds,
      });
    }
  };

  const handleReset = () => {
    const total = (mode === 'work' ? workMinutes : breakMinutes) * 60;
    setRemainingSeconds(total);
    onUpdateConfig({
      ...config,
      isRunning: false,
      targetTimestamp: undefined,
      remainingSeconds: total,
    });
  };

  const handleSwitchMode = (newMode: 'work' | 'break') => {
    const total = (newMode === 'work' ? workMinutes : breakMinutes) * 60;
    setRemainingSeconds(total);
    onUpdateConfig({
      ...config,
      mode: newMode,
      isRunning: false,
      targetTimestamp: undefined,
      remainingSeconds: total,
    });
  };

  const handleSaveSettings = () => {
    const validWork = Math.max(1, Math.min(120, Number(customWorkMin) || 25));
    const validBreak = Math.max(1, Math.min(60, Number(customBreakMin) || 5));
    const total = (mode === 'work' ? validWork : validBreak) * 60;
    setShowSettings(false);
    setRemainingSeconds(total);
    onUpdateConfig({
      ...config,
      workMinutes: validWork,
      breakMinutes: validBreak,
      isRunning: false,
      targetTimestamp: undefined,
      remainingSeconds: total,
    });
  };

  return createPortal(
    <div
      id={`pomodoro-popover-${widget.id}`}
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
        gap: '12px',
        color: theme.textColor,
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Header with Mode switcher & Settings toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            display: 'flex',
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            borderRadius: '999px',
            padding: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => handleSwitchMode('work')}
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'work' ? '#ef4444' : 'transparent',
              color: mode === 'work' ? '#ffffff' : theme.textColor,
              transition: 'all 0.15s ease',
            }}
          >
            Focus
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('break')}
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'break' ? '#10b981' : 'transparent',
              color: mode === 'break' ? '#ffffff' : theme.textColor,
              transition: 'all 0.15s ease',
            }}
          >
            Break
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          title="Timer settings"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: showSettings ? theme.primaryColor : theme.subtextColor,
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '6px',
          }}
        >
          <SettingsIcon size={14} />
        </button>
      </div>

      {showSettings ? (
        /* Settings form */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span>Focus Duration (min):</span>
            <input
              type="number"
              min={1}
              max={120}
              value={customWorkMin}
              onChange={(e) => setCustomWorkMin(Number(e.target.value))}
              style={{
                width: '56px',
                padding: '4px 6px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                color: theme.textColor,
                fontSize: '12px',
                textAlign: 'center',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span>Break Duration (min):</span>
            <input
              type="number"
              min={1}
              max={60}
              value={customBreakMin}
              onChange={(e) => setCustomBreakMin(Number(e.target.value))}
              style={{
                width: '56px',
                padding: '4px 6px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                color: theme.textColor,
                fontSize: '12px',
                textAlign: 'center',
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSaveSettings}
            style={{
              marginTop: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              background: theme.primaryColor,
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save Settings
          </button>
        </div>
      ) : (
        /* Main Timer display & controls */
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', margin: '4px 0' }}>
            <div
              style={{
                fontSize: '36px',
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-1px',
                color: mode === 'work' ? (isRunning ? '#ef4444' : theme.textColor) : '#10b981',
                lineHeight: 1,
              }}
            >
              {formattedTime}
            </div>
            <div style={{ fontSize: '10.5px', color: theme.subtextColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isRunning ? (mode === 'work' ? 'Focusing...' : 'Resting...') : 'Paused'}
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '4px',
                borderRadius: '999px',
                background: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                overflow: 'hidden',
                marginTop: '6px',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: mode === 'work' ? '#ef4444' : '#10b981',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleTogglePlay}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '999px',
                border: 'none',
                background: mode === 'work' ? '#ef4444' : '#10b981',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {isRunning ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
              <span>{isRunning ? 'Pause' : 'Start'}</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              title="Reset timer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '999px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: theme.textColor,
                cursor: 'pointer',
              }}
            >
              <RotateCcwIcon size={13} />
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
};
