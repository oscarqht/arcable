'use client';

import React from 'react';
import {
  WorkspaceWidget,
  WidgetStyle,
  PomodoroConfig,
  CountdownConfig,
  NoteConfig,
  WeatherConfig,
  SearchConfig,
} from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import { NOTE_COLORS } from './StickyNotePopover';
import { getWeatherInterpretation } from '../../../utils/weatherService';
import { calculateCountdownStatus } from '../../../utils/countdown';
import { renderMarkdown } from '../../../utils/markdown';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ClockInfo {
  timeMain: string;
  timeAmpm: string;
  weekdayShort: string;
  monthShort: string;
  day: number;
  hourAngle: number;
  minuteAngle: number;
}

export function padZero(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

export function buildClockInfo(now: Date): ClockInfo {
  const h24 = now.getHours();
  const h12 = ((h24 + 11) % 12) + 1;
  const m = now.getMinutes();
  const s = now.getSeconds();
  return {
    timeMain: h12 + ':' + padZero(m),
    timeAmpm: h24 >= 12 ? 'PM' : 'AM',
    weekdayShort: WEEKDAY_SHORT[now.getDay()],
    monthShort: MONTH_SHORT[now.getMonth()],
    day: now.getDate(),
    hourAngle: ((h24 % 12) + m / 60) * 30,
    minuteAngle: m * 6 + s * 0.1,
  };
}

export interface WidgetTileContentProps {
  widget: WorkspaceWidget;
  theme: SpaceThemeTokens;
  clockInfo: ClockInfo;
  now?: Date;
  mode?: 'full' | 'mini';
  compact?: boolean; // true for 46px popover, false for 56px shelf
}

export const WidgetTileContent: React.FC<WidgetTileContentProps> = ({
  widget,
  theme,
  clockInfo,
  now = new Date(),
  mode = 'full',
  compact = false,
}) => {
  const isDark = theme.isDark;

  // =========================================================================
  // MINI MODE (16x16px for group 2x2 preview on the shelf)
  // =========================================================================
  if (mode === 'mini') {
    switch (widget.style) {
      case 'calendar': {
        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.18)',
              border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                height: '4.5px',
                backgroundColor: '#ef4444',
                width: '100%',
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                backgroundColor: isDark ? '#334155' : '#ffffff',
                color: isDark ? '#ffffff' : '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.3px',
              }}
            >
              {clockInfo.day}
            </div>
          </div>
        );
      }

      case 'digital': {
        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              backgroundColor: isDark ? '#090d16' : '#1e293b',
              border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)'}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              padding: '0.5px',
              flexShrink: 0,
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.15)',
            }}
          >
            <div
              style={{
                fontSize: '5.5px',
                fontWeight: 800,
                color: '#38bdf8',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.4px',
              }}
            >
              {clockInfo.timeMain}
            </div>
            <div
              style={{
                fontSize: '4px',
                fontWeight: 700,
                color: '#94a3b8',
                lineHeight: 1,
                textTransform: 'uppercase',
                marginTop: '1px',
                letterSpacing: '-0.2px',
              }}
            >
              {clockInfo.weekdayShort.slice(0, 2)}
            </div>
          </div>
        );
      }

      case 'analog': {
        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: isDark ? '#334155' : '#ffffff',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}`,
                boxShadow: '0 0.5px 2px rgba(0,0,0,0.15)',
                position: 'relative',
                boxSizing: 'border-box',
              }}
            >
              {/* Center Dot */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '2px',
                  height: '2px',
                  borderRadius: '50%',
                  backgroundColor: isDark ? '#ffffff' : '#0f172a',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              {/* Hour Hand */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '1px',
                  height: '3.5px',
                  backgroundColor: isDark ? '#ffffff' : '#0f172a',
                  borderRadius: '0.5px',
                  transformOrigin: 'bottom center',
                  transform: `translate(-50%, -100%) rotate(${clockInfo.hourAngle}deg)`,
                }}
              />
              {/* Minute Hand */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '0.8px',
                  height: '5px',
                  backgroundColor: isDark ? '#94a3b8' : '#475569',
                  borderRadius: '0.5px',
                  transformOrigin: 'bottom center',
                  transform: `translate(-50%, -100%) rotate(${clockInfo.minuteAngle}deg)`,
                }}
              />
            </div>
          </div>
        );
      }

      case 'combo': {
        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.18)',
              border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              boxSizing: 'border-box',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: '4.5px',
                fontWeight: 800,
                color: '#ef4444',
                lineHeight: 1,
                textTransform: 'uppercase',
              }}
            >
              {clockInfo.weekdayShort.slice(0, 3)}
            </div>
            <div
              style={{
                fontSize: '6.5px',
                fontWeight: 800,
                color: theme.textColor,
                lineHeight: 1,
                marginTop: '0.5px',
              }}
            >
              {clockInfo.day}
            </div>
          </div>
        );
      }

      case 'pomodoro': {
        const pomoConfig = (widget.config as PomodoroConfig) || {};
        const isRunning = Boolean(pomoConfig.isRunning);
        const mode = pomoConfig.mode || 'work';
        const defaultSeconds = (mode === 'work' ? (pomoConfig.workMinutes ?? 25) : (pomoConfig.breakMinutes ?? 5)) * 60;
        let remaining = pomoConfig.remainingSeconds ?? defaultSeconds;
        if (isRunning && pomoConfig.targetTimestamp) {
          remaining = Math.max(0, Math.ceil((pomoConfig.targetTimestamp - now.getTime()) / 1000));
        }
        const min = Math.ceil(remaining / 60);
        const accentColor = mode === 'work' ? '#ef4444' : '#10b981';

        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              backgroundColor: mode === 'work' ? (isDark ? '#450a0a' : '#fee2e2') : (isDark ? '#064e3b' : '#d1fae5'),
              border: `0.8px solid ${accentColor}`,
              boxShadow: isRunning ? `0 0 3px ${accentColor}` : '0 0.5px 2px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '7.5px', lineHeight: 1 }}>{mode === 'work' ? '🍅' : '☕'}</span>
            <span
              style={{
                fontSize: '4.5px',
                fontWeight: 800,
                color: accentColor,
                lineHeight: 1,
                marginTop: '0.5px',
              }}
            >
              {min}m
            </span>
          </div>
        );
      }

      case 'countdown': {
        const countConfig = (widget.config as CountdownConfig) || {};
        const targetStr = countConfig.targetDate;
        const { displayNum, displayUnit } = calculateCountdownStatus(targetStr, now.getTime());
        const unitShort = displayUnit?.charAt(0) || 'd';

        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              backgroundColor: isDark ? '#1e1b4b' : '#e0e7ff',
              border: `0.8px solid #818cf8`,
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: '6.5px',
                fontWeight: 800,
                color: '#6366f1',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {displayNum}
            </div>
            <div
              style={{
                fontSize: '4px',
                fontWeight: 700,
                color: isDark ? '#c7d2fe' : '#4338ca',
                lineHeight: 1,
                textTransform: 'uppercase',
                marginTop: '0.5px',
              }}
            >
              {unitShort}
            </div>
          </div>
        );
      }

      case 'note': {
        const noteConfig = (widget.config as NoteConfig) || {};
        const selectedColor = NOTE_COLORS.find((c) => c.key === noteConfig.colorTheme) || NOTE_COLORS[0];
        const bgColor = isDark ? selectedColor.bgDark : selectedColor.bgLight;
        const borderColor = isDark ? selectedColor.borderDark : selectedColor.borderLight;

        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '2.5px',
              backgroundColor: bgColor,
              border: `0.8px solid ${borderColor}`,
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '2.5px 2px',
              gap: '1.5px',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '75%',
                height: '1.2px',
                backgroundColor: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
                borderRadius: '0.5px',
              }}
            />
            <div
              style={{
                width: '85%',
                height: '1.2px',
                backgroundColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
                borderRadius: '0.5px',
              }}
            />
            <div
              style={{
                width: '50%',
                height: '1.2px',
                backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                borderRadius: '0.5px',
              }}
            />
          </div>
        );
      }

      case 'weather': {
        const weatherConfig = (widget.config as WeatherConfig) || {};
        const temp = weatherConfig.cachedTemp;
        const code = weatherConfig.cachedCode;
        const { emoji } = getWeatherInterpretation(code ?? 0);

        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              background: isDark
                ? 'linear-gradient(135deg, #1e293b, #0f172a)'
                : 'linear-gradient(135deg, #38bdf8, #0284c7)',
              border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)'}`,
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '7px', lineHeight: 1 }}>{emoji}</span>
            <span
              style={{
                fontSize: '5px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1,
                marginTop: '0.5px',
              }}
            >
              {temp !== undefined ? `${temp}°` : '--°'}
            </span>
          </div>
        );
      }

      case 'search': {
        return (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '3.5px',
              backgroundColor: isDark ? '#334155' : '#f1f5f9',
              border: `0.8px solid ${isDark ? '#475569' : '#cbd5e1'}`,
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '8px', lineHeight: 1 }}>🔍</span>
          </div>
        );
      }

      default:
        return <span style={{ fontSize: '12px', lineHeight: 1 }}>🧩</span>;
    }
  }

  // =========================================================================
  // FULL MODE (Used in shelf 56px and popover 46px panel)
  // =========================================================================
  const renderFullContent = () => {
    switch (widget.style) {
    case 'calendar': {
      const bannerHeight = compact ? '13px' : '17px';
      const monthFontSize = compact ? '8px' : '9px';
      const dayFontSize = compact ? '16px' : '19px';
      const weekdayFontSize = compact ? '7.5px' : '8.5px';

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: compact ? '9px' : '13px',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              height: bannerHeight,
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: monthFontSize,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {clockInfo.monthShort}
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingBottom: '2px',
            }}
          >
            <div
              style={{
                fontSize: dayFontSize,
                fontWeight: 800,
                lineHeight: 1,
                color: theme.textColor,
                letterSpacing: '-0.5px',
              }}
            >
              {clockInfo.day}
            </div>
            <div
              style={{
                fontSize: weekdayFontSize,
                fontWeight: 600,
                color: theme.subtextColor || theme.textColor,
                opacity: 0.65,
                marginTop: '1px',
                lineHeight: 1,
              }}
            >
              {clockInfo.weekdayShort}
            </div>
          </div>
        </div>
      );
    }

    case 'digital': {
      const timeFontSize = compact ? '11.5px' : '13.5px';
      const ampmFontSize = compact ? '7px' : '8.5px';
      const dateFontSize = compact ? '7.5px' : '9px';

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
            padding: compact ? '2px' : '4px 2px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontSize: timeFontSize,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: theme.textColor,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
            }}
          >
            <span>{clockInfo.timeMain}</span>
            <span
              style={{
                fontSize: ampmFontSize,
                fontWeight: 700,
                opacity: 0.65,
                marginLeft: '2px',
              }}
            >
              {clockInfo.timeAmpm}
            </span>
          </div>
          <div
            style={{
              fontSize: dateFontSize,
              fontWeight: 700,
              color: theme.subtextColor || theme.textColor,
              letterSpacing: '0.04em',
              marginTop: compact ? '1px' : '3px',
              lineHeight: 1,
              textTransform: 'uppercase',
              opacity: 0.95,
              whiteSpace: 'nowrap',
            }}
          >
            {clockInfo.weekdayShort} {clockInfo.day}
          </div>
        </div>
      );
    }

    case 'analog': {
      const dialSize = compact ? '30px' : '38px';
      const hourLength = compact ? '7.5px' : '10px';
      const minuteLength = compact ? '10.5px' : '14px';

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: dialSize,
              height: dialSize,
              minWidth: dialSize,
              minHeight: dialSize,
              borderRadius: '999px',
              background: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.75)',
              border: `1.5px solid ${theme.borderColor}`,
              position: 'relative',
            }}
          >
            {/* Hour Hand */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '2px',
                height: hourLength,
                background: theme.textColor,
                borderRadius: '1px',
                transformOrigin: 'bottom center',
                transform: `translate(-50%, -100%) rotate(${clockInfo.hourAngle}deg)`,
              }}
            />

            {/* Minute Hand */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '1.5px',
                height: minuteLength,
                background: theme.textColor,
                borderRadius: '1px',
                transformOrigin: 'bottom center',
                transform: `translate(-50%, -100%) rotate(${clockInfo.minuteAngle}deg)`,
              }}
            />

            {/* Center Dot */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '4px',
                height: '4px',
                borderRadius: '999px',
                background: theme.textColor,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </div>
      );
    }

    case 'combo': {
      const weekdayFontSize = compact ? '7.5px' : '8.5px';
      const dateFontSize = compact ? '7.5px' : '8.5px';
      const timeFontSize = compact ? '10.5px' : '12px';
      const ampmFontSize = compact ? '7px' : '8px';

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
            padding: compact ? '2px' : '3px 2px',
            boxSizing: 'border-box',
            gap: '1px',
          }}
        >
          <div
            style={{
              fontSize: weekdayFontSize,
              fontWeight: 800,
              color: theme.subtextColor || theme.textColor,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {clockInfo.weekdayShort}
          </div>
          <div
            style={{
              fontSize: dateFontSize,
              fontWeight: 800,
              color: theme.subtextColor || theme.textColor,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {clockInfo.monthShort} {clockInfo.day}
          </div>
          <div
            style={{
              fontSize: timeFontSize,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: theme.textColor,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              marginTop: '1px',
            }}
          >
            <span>{clockInfo.timeMain}</span>
            <span
              style={{
                fontSize: ampmFontSize,
                fontWeight: 700,
                opacity: 0.65,
                marginLeft: '2px',
                textTransform: 'lowercase',
              }}
            >
              {clockInfo.timeAmpm}
            </span>
          </div>
        </div>
      );
    }

    case 'pomodoro': {
      const pomoConfig = (widget.config as PomodoroConfig) || {};
      const isRunning = Boolean(pomoConfig.isRunning);
      const mode = pomoConfig.mode || 'work';
      const defaultSeconds = (mode === 'work' ? (pomoConfig.workMinutes ?? 25) : (pomoConfig.breakMinutes ?? 5)) * 60;
      let remaining = pomoConfig.remainingSeconds ?? defaultSeconds;
      if (isRunning && pomoConfig.targetTimestamp) {
        remaining = Math.max(0, Math.ceil((pomoConfig.targetTimestamp - now.getTime()) / 1000));
      }
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      const accentColor = mode === 'work' ? '#ef4444' : '#10b981';

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
            padding: compact ? '2px' : '4px 2px',
            boxSizing: 'border-box',
            gap: compact ? '1px' : '2px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: compact ? '10px' : '11px', lineHeight: 1 }}>{mode === 'work' ? '🍅' : '☕'}</span>
            {isRunning && (
              <div
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '999px',
                  backgroundColor: accentColor,
                  boxShadow: `0 0 4px ${accentColor}`,
                }}
              />
            )}
          </div>
          <div
            style={{
              fontSize: compact ? '11px' : '13px',
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: isRunning ? accentColor : theme.textColor,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.1,
            }}
          >
            {timeStr}
          </div>
          <div
            style={{
              fontSize: compact ? '7px' : '8px',
              fontWeight: 700,
              color: accentColor,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              opacity: 0.9,
              lineHeight: 1,
            }}
          >
            {mode === 'work' ? 'Focus' : 'Break'}
          </div>
        </div>
      );
    }

    case 'countdown': {
      const countConfig = (widget.config as CountdownConfig) || {};
      const targetStr = countConfig.targetDate;
      const title = countConfig.title || 'Countdown';
      const { displayNum, displayUnit } = calculateCountdownStatus(targetStr, now.getTime());

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
            padding: compact ? '2px' : '4px 3px',
            boxSizing: 'border-box',
            gap: compact ? '1px' : '2px',
          }}
        >
          <div
            style={{
              fontSize: compact ? '7px' : '8px',
              fontWeight: 700,
              color: theme.subtextColor || theme.textColor,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              maxWidth: compact ? '40px' : '48px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: compact ? '11.5px' : '13.5px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
              color: theme.textColor,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.1,
            }}
          >
            {displayNum}
          </div>
          <div
            style={{
              fontSize: compact ? '7px' : '8px',
              color: theme.subtextColor,
              opacity: 0.75,
              lineHeight: 1,
            }}
          >
            {displayUnit || 'Set date'}
          </div>
        </div>
      );
    }

    case 'note': {
      const noteConfig = (widget.config as NoteConfig) || {};
      const selectedColor = NOTE_COLORS.find((c) => c.key === noteConfig.colorTheme);
      const text = noteConfig.text || '';
      const trimmedText = text.trim();

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: trimmedText ? 'flex-start' : 'center',
            borderRadius: compact ? '9px' : '13px',
            backgroundColor: selectedColor
              ? (isDark ? selectedColor.bgDark : selectedColor.bgLight)
              : undefined,
            userSelect: 'none',
            padding: compact ? '3px 5px' : '4px 6px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {trimmedText ? (
            <div
              style={{
                width: '100%',
                maxHeight: '100%',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 4,
                lineClamp: 4,
                textOverflow: 'ellipsis',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {renderMarkdown(text, {
                compact: true,
                isDark,
                themeTextColor: isDark ? '#f1f5f9' : '#1e293b',
              })}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                gap: '2px',
              }}
            >
              <span style={{ fontSize: compact ? '12px' : '14px', lineHeight: 1 }}>📝</span>
              <span
                style={{
                  fontSize: compact ? '7.5px' : '8.5px',
                  fontWeight: 600,
                  opacity: 0.7,
                  color: isDark ? '#e2e8f0' : '#475569',
                }}
              >
                + Note
              </span>
            </div>
          )}
        </div>
      );
    }

    case 'weather': {
      const weatherConfig = (widget.config as WeatherConfig) || {};
      const temp = weatherConfig.cachedTemp;
      const code = weatherConfig.cachedCode;
      const unit = (weatherConfig.tempUnit || 'c').toUpperCase();
      const { emoji } = getWeatherInterpretation(code ?? 0);
      const city = weatherConfig.city || 'Weather';

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
            padding: compact ? '2px' : '4px 2px',
            boxSizing: 'border-box',
            gap: compact ? '1px' : '2px',
          }}
        >
          <span style={{ fontSize: compact ? '13px' : '15px', lineHeight: 1 }}>{emoji}</span>
          <div
            style={{
              fontSize: compact ? '11.5px' : '13px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
              color: theme.textColor,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.1,
            }}
          >
            {temp !== undefined ? `${temp}°${unit}` : '--°'}
          </div>
          <div
            style={{
              fontSize: compact ? '7px' : '8px',
              fontWeight: 600,
              color: theme.subtextColor,
              maxWidth: compact ? '40px' : '48px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            {city}
          </div>
        </div>
      );
    }

    case 'search': {
      const searchConfig = (widget.config as SearchConfig) || {};
      const engine = searchConfig.engine === 'custom' ? 'custom' : 'google';
      const engineIcon =
        engine === 'google'
          ? '🔍'
          : searchConfig.customIcon?.trim() || '⚙️';
      const engineName =
        engine === 'google'
          ? 'Google'
          : searchConfig.customName?.trim() || 'Custom';

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            userSelect: 'none',
            padding: compact ? '2px' : '4px 2px',
            boxSizing: 'border-box',
            gap: compact ? '1px' : '3px',
          }}
        >
          <span style={{ fontSize: compact ? '13px' : '15px', lineHeight: 1 }}>{engineIcon}</span>
          <div
            style={{
              fontSize: compact ? '7.5px' : '9px',
              fontWeight: 700,
              color: theme.textColor,
              maxWidth: compact ? '40px' : '48px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            {engineName}
          </div>
          <div
            style={{
              fontSize: compact ? '6.5px' : '7.5px',
              color: theme.subtextColor,
              opacity: 0.7,
              lineHeight: 1,
            }}
          >
            Search
          </div>
        </div>
      );
    }

    default:
      return <span style={{ fontSize: '18px', lineHeight: 1 }}>🧩</span>;
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: compact ? '9px' : '13px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {renderFullContent()}
    </div>
  );
};

