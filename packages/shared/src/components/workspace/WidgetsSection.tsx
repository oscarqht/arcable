'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, WidgetStyle, WidgetSize } from '../../types/workspace';
import { SpaceThemeTokens, getSpaceThemeStyles } from '../../utils/spaceTheme';
import { useSystemTheme } from '../../hooks/useSystemTheme';

export interface WidgetsSectionProps {
  widgets: WorkspaceWidget[];
  themeStyles?: SpaceThemeTokens;
  compact?: boolean;
  onAddWidget: (widget: { style: WidgetStyle; size: WidgetSize }) => void;
  onRemoveWidget: (id: string) => void;
  /** Moves sourceId before targetId; when targetId is omitted, moves it to the end. */
  onReorderWidget: (sourceId: string, targetId?: string) => void;
}

const SIZE_SPECS: Record<WidgetSize, { w: number; h: number }> = {
  small: { w: 80, h: 80 },
  medium: { w: 172, h: 80 },
  large: { w: 172, h: 172 },
};

const WIDGET_STYLES: { key: WidgetStyle; label: string }[] = [
  { key: 'digital', label: 'Digital Clock' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'analog', label: 'Analog Clock' },
  { key: 'combo', label: 'Date & Time' },
];

const WIDGET_SIZES: WidgetSize[] = ['small', 'medium', 'large'];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LONG_PRESS_MS = 550;

interface ClockInfo {
  timeMain: string;
  timeAmpm: string;
  weekdayShort: string;
  weekdayLong: string;
  monthShort: string;
  day: number;
  hourAngle: number;
  minuteAngle: number;
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function buildClockInfo(now: Date): ClockInfo {
  const h24 = now.getHours();
  const h12 = ((h24 + 11) % 12) + 1;
  return {
    timeMain: h12 + ':' + pad(now.getMinutes()),
    timeAmpm: h24 >= 12 ? 'PM' : 'AM',
    weekdayShort: WEEKDAY_SHORT[now.getDay()],
    weekdayLong: WEEKDAY_LONG[now.getDay()],
    monthShort: MONTH_SHORT[now.getMonth()],
    day: now.getDate(),
    hourAngle: ((h24 % 12) + now.getMinutes() / 60) * 30,
    minuteAngle: now.getMinutes() * 6 + now.getSeconds() * 0.1,
  };
}

interface FacePalette {
  textColor: string;
  clockFaceBg: string;
  clockBorder: string;
}

/** Renders the inner face of a widget for a given style + size. */
function WidgetFace({
  style,
  size,
  info,
  palette,
}: {
  style: WidgetStyle;
  size: WidgetSize;
  info: ClockInfo;
  palette: FacePalette;
}) {
  const isSmall = size === 'small';
  const isMedium = size === 'medium';
  const isLarge = size === 'large';
  const textColor = palette.textColor;

  if (style === 'digital') {
    const timeFontSize = isSmall ? 20 : isLarge ? 32 : 26;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isSmall ? 'center' : 'flex-start' }}>
        <div
          style={{
            fontSize: `${timeFontSize}px`,
            fontWeight: 700,
            letterSpacing: '-0.5px',
            color: textColor,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {info.timeMain}{' '}
          <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.75 }}>{info.timeAmpm}</span>
        </div>
        {isLarge && (
          <div style={{ fontSize: '13px', fontWeight: 600, color: textColor, opacity: 0.8, marginTop: '6px' }}>
            {info.weekdayShort}, {info.monthShort} {info.day}
          </div>
        )}
        {isMedium && (
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: textColor, opacity: 0.8, marginTop: '3px' }}>
            {info.weekdayShort}, {info.monthShort} {info.day}
          </div>
        )}
      </div>
    );
  }

  if (style === 'calendar') {
    const dayFontSize = isSmall ? 26 : isLarge ? 48 : 34;
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            background: '#ef4444',
            color: '#ffffff',
            fontSize: '10.5px',
            fontWeight: 700,
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '3px 0',
          }}
        >
          {info.monthShort}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: `${dayFontSize}px`, fontWeight: 700, color: textColor, lineHeight: 1 }}>
            {info.day}
          </div>
          {isLarge && (
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: textColor, opacity: 0.65, marginTop: '4px' }}>
              {info.weekdayLong}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (style === 'analog') {
    const clockDia = isSmall ? 48 : isLarge ? 130 : 56;
    const hourHandLen = isSmall ? 16 : isLarge ? 34 : 15;
    const minHandLen = isSmall ? 22 : isLarge ? 48 : 21;
    const clockFace = (
      <div
        style={{
          width: `${clockDia}px`,
          height: `${clockDia}px`,
          minWidth: `${clockDia}px`,
          minHeight: `${clockDia}px`,
          aspectRatio: '1',
          boxSizing: 'border-box',
          borderRadius: '999px',
          background: palette.clockFaceBg,
          border: `2px solid ${palette.clockBorder}`,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div style={{ position: 'absolute', top: '4px', left: '50%', width: '2px', height: '5px', background: textColor, opacity: 0.5, transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', bottom: '4px', left: '50%', width: '2px', height: '5px', background: textColor, opacity: 0.5, transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', left: '4px', top: '50%', width: '5px', height: '2px', background: textColor, opacity: 0.5, transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', right: '4px', top: '50%', width: '5px', height: '2px', background: textColor, opacity: 0.5, transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '2px', height: `${hourHandLen}px`, background: textColor, borderRadius: '2px', transformOrigin: 'bottom center', transform: `translate(-50%, -100%) rotate(${info.hourAngle}deg)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '2px', height: `${minHandLen}px`, background: textColor, borderRadius: '2px', transformOrigin: 'bottom center', transform: `translate(-50%, -100%) rotate(${info.minuteAngle}deg)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '5px', height: '5px', borderRadius: '999px', background: textColor, transform: 'translate(-50%, -50%)' }} />
      </div>
    );

    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', height: isLarge ? 'auto' : '100%' }}>
          {clockFace}
          {isMedium && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>{info.weekdayShort}</div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: textColor, opacity: 0.6 }}>
                {info.monthShort} {info.day}
              </div>
            </div>
          )}
        </div>
        {isLarge && (
          <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: textColor, opacity: 0.65, marginTop: '8px' }}>
            {info.weekdayLong}, {info.monthShort} {info.day}
          </div>
        )}
      </>
    );
  }

  // combo: date + time stack
  const timeFontSize = isSmall ? 20 : isLarge ? 32 : 26;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {isLarge && (
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: textColor, opacity: 0.82, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {info.weekdayLong}
        </div>
      )}
      {isMedium && (
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: textColor, opacity: 0.82, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {info.weekdayShort} · {info.monthShort} {info.day}
        </div>
      )}
      {isSmall && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: textColor, opacity: 0.82, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {info.weekdayShort}
          </div>
          <div style={{ fontSize: '9px', fontWeight: 700, color: textColor, opacity: 0.82, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {info.monthShort} {info.day}
          </div>
        </div>
      )}
      <div style={{ fontSize: `${timeFontSize}px`, fontWeight: 700, color: textColor, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {info.timeMain}
        <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.75, marginLeft: '3px' }}>{info.timeAmpm}</span>
      </div>
      {isLarge && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: textColor, opacity: 0.8, marginTop: '2px' }}>
          {info.monthShort} {info.day}
        </div>
      )}
    </div>
  );
}

export const WidgetsSection: React.FC<WidgetsSectionProps> = ({
  widgets,
  themeStyles,
  compact = false,
  onAddWidget,
  onRemoveWidget,
  onReorderWidget,
}) => {
  const { isDark } = useSystemTheme();
  const theme = useMemo(() => {
    return themeStyles || getSpaceThemeStyles(undefined, isDark);
  }, [themeStyles, isDark]);

  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock tick (1s keeps analog minute hand and time displays fresh)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  // Exit edit mode when the last widget is removed
  useEffect(() => {
    if (widgets.length === 0 && editMode) {
      setEditMode(false);
    }
  }, [widgets.length, editMode]);

  const info = useMemo(() => buildClockInfo(now), [now]);

  const hasWidgets = widgets.length > 0;

  const startPress = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }
    pressTimerRef.current = setTimeout(() => setEditMode(true), LONG_PRESS_MS);
  }, []);

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const handleDone = useCallback(() => {
    setEditMode(false);
    setPickerOpen(false);
  }, []);

  const handleWidgetDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {}
    setDragId(id);
  };

  const handleWidgetDragOver = (e: React.DragEvent, id: string) => {
    if (!dragId) return;
    e.preventDefault();
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleWidgetDrop = (e: React.DragEvent, id: string) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragId !== id) {
      onReorderWidget(dragId, id);
    }
    setDragId(null);
    setDragOverId(null);
  };

  const handleWidgetDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleRowDragOver = (e: React.DragEvent) => {
    if (dragId) e.preventDefault();
  };

  const handleRowDrop = (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    onReorderWidget(dragId);
    setDragId(null);
    setDragOverId(null);
  };

  const handleAdd = (style: WidgetStyle, size: WidgetSize) => {
    onAddWidget({ style, size });
    setPickerOpen(false);
  };

  // Frosted glass palette on top of the active space theme
  const panelPalette: FacePalette = {
    textColor: theme.textColor,
    clockFaceBg: theme.isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.55)',
    clockBorder: theme.borderColor,
  };

  const tileBg = theme.isDark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.52)';
  const tileBorder = theme.isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.65)';
  const tileShadow = theme.isDark
    ? 'inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 6px 16px rgba(0, 0, 0, 0.22)'
    : 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 6px 16px rgba(0, 0, 0, 0.10)';
  const dragOutlineColor = theme.isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.9)';

  // Picker sheet surface (solid, modal-like)
  const sheetBg = theme.isDark ? '#151e2e' : '#f4f6f5';
  const sheetText = theme.isDark ? '#f8fafc' : '#14342a';
  const galleryPalette: FacePalette = {
    textColor: sheetText,
    clockFaceBg: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
    clockBorder: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(20, 52, 42, 0.25)',
  };
  const galleryTileBg = theme.isDark ? '#1e293b' : '#ffffff';
  const galleryTileBorder = theme.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <div
      onMouseDown={hasWidgets ? startPress : undefined}
      onMouseUp={hasWidgets ? cancelPress : undefined}
      onMouseLeave={hasWidgets ? cancelPress : undefined}
      onTouchStart={hasWidgets ? startPress : undefined}
      onTouchEnd={hasWidgets ? cancelPress : undefined}
      title={hasWidgets && !editMode ? 'Long-press to edit widgets' : undefined}
      style={{
        padding: hasWidgets ? (compact ? '14px 14px 12px 14px' : '16px 18px') : (compact ? '8px 14px' : '12px 18px'),
        background: hasWidgets ? theme.shelfBg : (compact ? 'transparent' : (theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)')),
        backdropFilter: hasWidgets ? 'blur(18px)' : 'none',
        WebkitBackdropFilter: hasWidgets ? 'blur(18px)' : 'none',
        borderBottom: compact && hasWidgets ? `1px solid ${theme.borderColor}` : 'none',
        border: !compact ? `1px solid ${theme.borderColor}` : undefined,
        borderRadius: !compact ? '16px' : undefined,
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes arcable-widget-jiggle { 0% { transform: rotate(-1.4deg); } 50% { transform: rotate(1.4deg); } 100% { transform: rotate(-1.4deg); } }
        @keyframes arcable-widget-sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {(editMode || (!compact && hasWidgets)) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '26px', marginBottom: '10px' }}>
          {!compact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>🕒</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textColor, opacity: 0.9 }}>
                Widgets
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            {editMode ? (
              <button
                type="button"
                onClick={handleDone}
                style={{
                  border: 'none',
                  background: theme.badgeBg,
                  color: theme.badgeText,
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            ) : (
              hasWidgets && (
                <>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    title="Add a widget"
                    style={{
                      border: `1px solid ${theme.borderColor}`,
                      background: theme.badgeBg,
                      color: theme.textColor,
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>+</span>
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    title="Edit widgets"
                    style={{
                      border: `1px solid ${theme.borderColor}`,
                      background: 'transparent',
                      color: theme.textColor,
                      opacity: 0.8,
                      fontSize: '11px',
                      fontWeight: 500,
                      padding: '3px 9px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </>
              )
            )}
          </div>
        </div>
      )}

      {hasWidgets ? (
        <div
          onDragOver={handleRowDragOver}
          onDrop={handleRowDrop}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '4px', minHeight: '20px' }}
        >
          {widgets.map((widget) => {
            const spec = SIZE_SPECS[widget.size] || SIZE_SPECS.medium;
            const isDragging = editMode && dragId === widget.id;
            const isDragOver = editMode && dragOverId === widget.id && dragOverId !== dragId;

            return (
              <div
                key={widget.id}
                draggable={editMode}
                onDragStart={(e) => handleWidgetDragStart(e, widget.id)}
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                onDragEnd={handleWidgetDragEnd}
                style={{
                  width: `${spec.w}px`,
                  height: `${spec.h}px`,
                  position: 'relative',
                  animation: editMode ? 'arcable-widget-jiggle 0.22s ease-in-out infinite' : 'none',
                  opacity: isDragging ? 0.4 : 1,
                  cursor: editMode ? 'grab' : 'default',
                }}
              >
                {editMode && (
                  <button
                    type="button"
                    onClick={() => onRemoveWidget(widget.id)}
                    title="Remove widget"
                    style={{
                      position: 'absolute',
                      top: '-7px',
                      left: '-7px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '999px',
                      background: '#4b5563',
                      color: '#ffffff',
                      border: '2px solid #ffffff',
                      fontSize: '14px',
                      lineHeight: '18px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      zIndex: 2,
                    }}
                  >
                    −
                  </button>
                )}

                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '20px',
                    background: tileBg,
                    border: `1px solid ${tileBorder}`,
                    boxShadow: tileShadow,
                    outline: isDragOver ? `2px dashed ${dragOutlineColor}` : '2px dashed transparent',
                    outlineOffset: '3px',
                    position: 'relative',
                    overflow: 'hidden',
                    padding: '10px 12px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <WidgetFace style={widget.style} size={widget.size} info={info} palette={panelPalette} />
                </div>
              </div>
            );
          })}

          {editMode && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              title="Add a widget"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                background: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.2)',
                border: `2px dashed ${theme.isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.7)'}`,
                color: theme.textColor,
                fontSize: '26px',
                fontWeight: 300,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '32px' }}>
          {!compact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px' }}>🕒</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textColor, opacity: 0.9 }}>
                Widgets
              </span>
              <span style={{ fontSize: '12px', color: theme.textColor, opacity: 0.55 }}>
                Add clocks &amp; calendar widgets to your workspace
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Add a widget"
            style={{
              height: compact ? '26px' : '28px',
              padding: compact ? '0' : '0 12px',
              width: compact ? '26px' : 'auto',
              borderRadius: '999px',
              background: theme.badgeBg,
              border: `1.5px solid ${theme.borderColor}`,
              color: theme.textColor,
              fontSize: compact ? '15px' : '12px',
              fontWeight: 600,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              marginLeft: 'auto',
            }}
          >
            <span style={{ fontSize: compact ? '15px' : '14px', lineHeight: 1 }}>+</span>
            {!compact && <span>Add Widget</span>}
          </button>
        </div>
      )}

      {/* Add-widget picker sheet — rendered in a portal because the section's backdrop-filter
          would otherwise become the containing block for position: fixed */}
      {pickerOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.35)',
              zIndex: 9990,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9991,
              background: sheetBg,
              borderRadius: '20px 20px 0 0',
              padding: '16px 16px 20px 16px',
              boxShadow: '0 -12px 30px rgba(0, 0, 0, 0.25)',
              animation: 'arcable-widget-sheet-in 0.22s ease-out',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: sheetText }}>Add Date &amp; Time Widget</span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                title="Close"
                style={{
                  border: 'none',
                  background: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  width: '26px',
                  height: '26px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: sheetText,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ maxHeight: 'min(560px, 65vh)', overflowY: 'auto' }}>
              {WIDGET_SIZES.map((size) => (
                <div key={size} style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: sheetText,
                      opacity: 0.55,
                      marginBottom: '8px',
                    }}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {WIDGET_STYLES.map((s) => {
                      const spec = SIZE_SPECS[size];
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => handleAdd(s.key, size)}
                          title={`Add ${s.label} (${size})`}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            padding: 0,
                          }}
                        >
                          <div
                            style={{
                              width: `${spec.w}px`,
                              height: `${spec.h}px`,
                              borderRadius: '20px',
                              background: galleryTileBg,
                              border: `1px solid ${galleryTileBorder}`,
                              boxShadow: '0 3px 10px rgba(0, 0, 0, 0.08)',
                              position: 'relative',
                              overflow: 'hidden',
                              padding: '10px 12px',
                              boxSizing: 'border-box',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                            }}
                          >
                            <WidgetFace style={s.key} size={size} info={info} palette={galleryPalette} />
                          </div>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: sheetText, opacity: 0.75 }}>
                            {s.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
