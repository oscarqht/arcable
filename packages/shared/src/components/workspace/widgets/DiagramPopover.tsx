'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  WorkspaceWidget,
  DiagramConfig,
  DiagramChartStyle,
  DiagramDataPoint,
} from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import {
  BarChartIcon,
  LineChartIcon,
  AreaChartIcon,
  PieChartIcon,
  DoughnutChartIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
} from '../../Icons';
import {
  DIAGRAM_PALETTES,
  DIAGRAM_PRESET_TEMPLATES,
  createDefaultDiagramConfig,
  getDataPointColor,
  computePieSlices,
} from '../../../utils/diagram';

export interface DiagramPopoverProps {
  widget: WorkspaceWidget;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (config: DiagramConfig) => void;
  theme: SpaceThemeTokens;
}

const CHART_STYLE_OPTIONS: Array<{
  style: DiagramChartStyle;
  label: string;
  icon: (color: string) => React.ReactNode;
}> = [
  {
    style: 'bar',
    label: 'Bar',
    icon: (c) => <BarChartIcon size={14} color={c} />,
  },
  {
    style: 'line',
    label: 'Line',
    icon: (c) => <LineChartIcon size={14} color={c} />,
  },
  {
    style: 'area',
    label: 'Area',
    icon: (c) => <AreaChartIcon size={14} color={c} />,
  },
  {
    style: 'pie',
    label: 'Pie',
    icon: (c) => <PieChartIcon size={14} color={c} />,
  },
  {
    style: 'doughnut',
    label: 'Donut',
    icon: (c) => <DoughnutChartIcon size={14} color={c} />,
  },
];

const PRESET_COLORS = [
  '#6366f1',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#84cc16',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#64748b',
  '#0f172a',
];

export const DiagramPopover: React.FC<DiagramPopoverProps> = ({
  widget,
  anchorRect,
  isOpen,
  onClose,
  onUpdateConfig,
  theme,
}) => {
  const config = useMemo(() => {
    const raw = (widget.config as DiagramConfig) || {};
    return {
      title: raw.title !== undefined ? raw.title : 'Metrics',
      chartStyle: (raw.chartStyle || 'bar') as DiagramChartStyle,
      dataPoints: Array.isArray(raw.dataPoints)
        ? raw.dataPoints
        : createDefaultDiagramConfig().dataPoints!,
      colorScheme: raw.colorScheme || 'vibrant',
      unit: raw.unit || '',
    };
  }, [widget.config]);

  const [title, setTitle] = useState(config.title);
  const [chartStyle, setChartStyle] = useState<DiagramChartStyle>(config.chartStyle);
  const [dataPoints, setDataPoints] = useState<DiagramDataPoint[]>(config.dataPoints);
  const [colorScheme, setColorScheme] = useState<string>(config.colorScheme);
  const [unit, setUnit] = useState(config.unit);

  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);

  // Sync state if widget changes externally
  useEffect(() => {
    setTitle(config.title);
    setChartStyle(config.chartStyle);
    setDataPoints(config.dataPoints);
    setColorScheme(config.colorScheme);
    setUnit(config.unit);
  }, [config, widget.id]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const popoverEl = document.getElementById(`diagram-popover-${widget.id}`);
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

  const width = 330;
  const height = 440;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const persistConfig = (updated: Partial<DiagramConfig>) => {
    const nextConfig: DiagramConfig = {
      title,
      chartStyle,
      dataPoints,
      colorScheme: colorScheme as any,
      unit,
      ...updated,
    };
    onUpdateConfig(nextConfig);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    persistConfig({ title: val });
  };

  const handleUnitChange = (val: string) => {
    setUnit(val);
    persistConfig({ unit: val });
  };

  const handleClearAll = () => {
    setDataPoints([]);
    persistConfig({ dataPoints: [] });
  };

  const handleStyleChange = (style: DiagramChartStyle) => {
    setChartStyle(style);
    persistConfig({ chartStyle: style });
  };

  const handleSchemeChange = (scheme: string) => {
    setColorScheme(scheme);
    persistConfig({ colorScheme: scheme as any });
  };

  const handlePointChange = (id: string, updates: Partial<DiagramDataPoint>) => {
    const updated = dataPoints.map((p) => (p.id === id ? { ...p, ...updates } : p));
    setDataPoints(updated);
    persistConfig({ dataPoints: updated });
  };

  const handleDeletePoint = (id: string) => {
    const updated = dataPoints.filter((p) => p.id !== id);
    setDataPoints(updated);
    persistConfig({ dataPoints: updated });
  };

  const handleAddPoint = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const parsedVal = parseFloat(newValue);
    const labelTrim = newLabel.trim() || `Point ${dataPoints.length + 1}`;
    const valNum = isNaN(parsedVal) ? 0 : parsedVal;

    const newPoint: DiagramDataPoint = {
      id: `dp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: labelTrim,
      value: valNum,
    };

    const updated = [...dataPoints, newPoint];
    setDataPoints(updated);
    setNewLabel('');
    setNewValue('');
    persistConfig({ dataPoints: updated });
  };

  const handleApplyPreset = (template: (typeof DIAGRAM_PRESET_TEMPLATES)[0]) => {
    setTitle(template.name);
    setChartStyle(template.chartStyle);
    setColorScheme(template.colorScheme);
    setDataPoints(template.dataPoints);
    setShowPresetsMenu(false);
    onUpdateConfig({
      title: template.name,
      chartStyle: template.chartStyle,
      colorScheme: template.colorScheme,
      dataPoints: template.dataPoints,
      unit,
    });
  };

  // Metrics for summary & scaling
  const sanitizedValues = dataPoints.map((p) => (Number.isFinite(p.value) ? p.value : 0));
  const totalSum = sanitizedValues.reduce((a, b) => a + b, 0);
  const maxValue = sanitizedValues.length > 0 ? Math.max(...sanitizedValues) : 0;
  const minValue = sanitizedValues.length > 0 ? Math.min(...sanitizedValues) : 0;
  const avgValue = sanitizedValues.length > 0 ? (totalSum / sanitizedValues.length).toFixed(1) : '0';

  const hoveredPoint = dataPoints.find((p) => p.id === hoveredPointId);

  // SVG Chart Preview Dimensions
  const svgWidth = 298;
  const svgHeight = 120;
  const paddingX = 20;
  const paddingBottom = 22;
  const paddingTop = 14;
  const chartInnerWidth = svgWidth - paddingX * 2;
  const chartInnerHeight = svgHeight - paddingTop - paddingBottom;

  const renderChartPreview = () => {
    if (dataPoints.length === 0) {
      return (
        <div
          style={{
            height: `${svgHeight}px`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: theme.subtextColor,
            fontSize: '12px',
          }}
        >
          <span style={{ fontSize: '20px' }}>📊</span>
          <span>No data points yet. Add points below.</span>
        </div>
      );
    }

    if (chartStyle === 'bar') {
      const barCount = dataPoints.length;
      const barGap = Math.max(4, Math.min(12, 60 / barCount));
      const totalGaps = barGap * (barCount - 1);
      const barWidth = Math.max(6, Math.min(36, (chartInnerWidth - totalGaps) / barCount));
      const effectiveMax = maxValue > 0 ? maxValue : 1;

      return (
        <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
          {/* Baseline */}
          <line
            x1={paddingX - 4}
            y1={svgHeight - paddingBottom}
            x2={svgWidth - paddingX + 4}
            y2={svgHeight - paddingBottom}
            stroke={theme.borderColor}
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {dataPoints.map((point, index) => {
            const val = Math.max(0, point.value || 0);
            const barHeight = Math.max(2, (val / effectiveMax) * chartInnerHeight);
            const x = paddingX + index * (barWidth + barGap);
            const y = svgHeight - paddingBottom - barHeight;
            const color = getDataPointColor(point, index, colorScheme);
            const isHovered = hoveredPointId === point.id;

            return (
              <g
                key={point.id}
                onMouseEnter={() => setHoveredPointId(point.id)}
                onMouseLeave={() => setHoveredPointId(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Bar rectangle */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="3"
                  ry="3"
                  fill={color}
                  opacity={isHovered ? 1 : 0.88}
                  style={{
                    transition: 'all 0.15s ease',
                    filter: isHovered ? 'brightness(1.15)' : 'none',
                  }}
                />

                {/* X-axis label */}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight - paddingBottom + 12}
                  textAnchor="middle"
                  fill={isHovered ? theme.textColor : theme.subtextColor}
                  fontSize="9.5"
                  fontWeight={isHovered ? '700' : '500'}
                  letterSpacing="-0.2px"
                  style={{ userSelect: 'none' }}
                >
                  {point.label.length > 4 ? point.label.slice(0, 3) + '…' : point.label}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (chartStyle === 'line' || chartStyle === 'area') {
      const effectiveMax = maxValue > 0 ? maxValue : 1;
      const count = dataPoints.length;
      const stepX = count > 1 ? chartInnerWidth / (count - 1) : chartInnerWidth / 2;

      const pointsCoords = dataPoints.map((point, index) => {
        const val = Math.max(0, point.value || 0);
        const x = count === 1 ? svgWidth / 2 : paddingX + index * stepX;
        const y = svgHeight - paddingBottom - (val / effectiveMax) * chartInnerHeight;
        return { x, y, point, index };
      });

      const polylinePoints = pointsCoords.map((pt) => `${pt.x},${pt.y}`).join(' ');
      const mainColor = DIAGRAM_PALETTES[colorScheme]?.[0] || '#6366f1';
      const gradientId = `diag-grad-${widget.id}`;

      const areaPathD =
        count > 1
          ? `M ${pointsCoords[0].x} ${svgHeight - paddingBottom} L ${pointsCoords
              .map((p) => `${p.x} ${p.y}`)
              .join(' L ')} L ${pointsCoords[count - 1].x} ${svgHeight - paddingBottom} Z`
          : '';

      return (
        <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={mainColor} stopOpacity={chartStyle === 'area' ? 0.38 : 0.15} />
              <stop offset="100%" stopColor={mainColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Baseline */}
          <line
            x1={paddingX - 4}
            y1={svgHeight - paddingBottom}
            x2={svgWidth - paddingX + 4}
            y2={svgHeight - paddingBottom}
            stroke={theme.borderColor}
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Area fill */}
          {chartStyle === 'area' && areaPathD && (
            <path d={areaPathD} fill={`url(#${gradientId})`} />
          )}

          {/* Stroke Line */}
          {count > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke={mainColor}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Vertices */}
          {pointsCoords.map((pt) => {
            const isHovered = hoveredPointId === pt.point.id;
            const ptColor = getDataPointColor(pt.point, pt.index, colorScheme);

            return (
              <g
                key={pt.point.id}
                onMouseEnter={() => setHoveredPointId(pt.point.id)}
                onMouseLeave={() => setHoveredPointId(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 5.5 : 3.5}
                  fill={theme.isDark ? '#0f172a' : '#ffffff'}
                  stroke={ptColor}
                  strokeWidth={isHovered ? 2.5 : 2}
                  style={{ transition: 'all 0.15s ease' }}
                />
                <text
                  x={pt.x}
                  y={svgHeight - paddingBottom + 12}
                  textAnchor="middle"
                  fill={isHovered ? theme.textColor : theme.subtextColor}
                  fontSize="9"
                  fontWeight={isHovered ? '700' : '500'}
                  letterSpacing="-0.2px"
                  style={{ userSelect: 'none' }}
                >
                  {pt.point.label.length > 4 ? pt.point.label.slice(0, 3) + '…' : pt.point.label}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (chartStyle === 'pie' || chartStyle === 'doughnut') {
      const cx = svgWidth / 2 - 38;
      const cy = svgHeight / 2 - 2;
      const outerR = 46;
      const innerR = chartStyle === 'doughnut' ? 26 : 0;
      const slices = computePieSlices(dataPoints, cx, cy, outerR, innerR, colorScheme);

      return (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
          <svg width="170" height={svgHeight} style={{ overflow: 'visible' }}>
            {slices.map((slice) => {
              const isHovered = hoveredPointId === slice.point.id;
              return (
                <path
                  key={slice.point.id}
                  d={slice.pathD}
                  fill={slice.color}
                  stroke={theme.isDark ? '#1e293b' : '#ffffff'}
                  strokeWidth="1.5"
                  opacity={isHovered ? 1 : 0.88}
                  onMouseEnter={() => setHoveredPointId(slice.point.id)}
                  onMouseLeave={() => setHoveredPointId(null)}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    filter: isHovered ? 'brightness(1.15)' : 'none',
                    transform: isHovered
                      ? `scale(1.04) translate(${Math.cos(slice.centerAngle) * 2}px, ${
                          Math.sin(slice.centerAngle) * 2
                        }px)`
                      : 'scale(1)',
                    transformOrigin: `${cx}px ${cy}px`,
                  }}
                />
              );
            })}
            {chartStyle === 'doughnut' && (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fill={theme.textColor}
                fontSize="11"
                fontWeight="800"
                style={{ userSelect: 'none', fontVariantNumeric: 'tabular-nums' }}
              >
                {hoveredPoint ? hoveredPoint.value : totalSum}
              </text>
            )}
          </svg>

          {/* Legend list on the right */}
          <div
            style={{
              flex: 1,
              maxHeight: `${svgHeight}px`,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              paddingLeft: '4px',
            }}
          >
            {slices.map((slice) => {
              const isHovered = hoveredPointId === slice.point.id;
              return (
                <div
                  key={slice.point.id}
                  onMouseEnter={() => setHoveredPointId(slice.point.id)}
                  onMouseLeave={() => setHoveredPointId(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '4px',
                    fontSize: '10.5px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    backgroundColor: isHovered
                      ? theme.isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.05)'
                      : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '2px',
                        backgroundColor: slice.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: theme.textColor,
                        fontWeight: isHovered ? 700 : 500,
                      }}
                    >
                      {slice.point.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: theme.subtextColor,
                      fontWeight: 600,
                      fontSize: '10px',
                      flexShrink: 0,
                    }}
                  >
                    {slice.percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  return createPortal(
    <div
      id={`diagram-popover-${widget.id}`}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${height}px`,
        backgroundColor: theme.isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${theme.borderColor}`,
        borderRadius: '16px',
        boxShadow: theme.isDark
          ? '0 16px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 16px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '12px 14px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: theme.textColor,
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (activeColorPickerId) setActiveColorPickerId(null);
        if (showPresetsMenu) setShowPresetsMenu(false);
      }}
    >
      {/* 1. Header: Title input, Unit, Presets & Done button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Title (e.g. Metrics)"
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: theme.textColor,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            borderBottom: `1px solid transparent`,
            padding: '2px 0',
            flex: 1,
            minWidth: 0,
          }}
          onFocus={(e) => (e.target.style.borderBottom = `1px solid ${theme.primaryColor}`)}
          onBlur={(e) => (e.target.style.borderBottom = '1px solid transparent')}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Unit input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '10.5px', color: theme.subtextColor }}>Unit:</span>
            <input
              type="text"
              value={unit}
              onChange={(e) => handleUnitChange(e.target.value)}
              placeholder="%"
              style={{
                width: '32px',
                padding: '2px 4px',
                fontSize: '11px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                color: theme.textColor,
                textAlign: 'center',
              }}
              title="Unit symbol (e.g. %, $, k)"
            />
          </div>

          {/* Preset templates trigger */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPresetsMenu(!showPresetsMenu);
              }}
              style={{
                fontSize: '11px',
                color: theme.subtextColor,
                background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${theme.borderColor}`,
                cursor: 'pointer',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title="Apply preset data"
            >
              <span>Presets</span>
            </button>

            {showPresetsMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '24px',
                  right: 0,
                  width: '140px',
                  backgroundColor: theme.isDark ? '#0f172a' : '#ffffff',
                  border: `1px solid ${theme.borderColor}`,
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                  padding: '3px',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {DIAGRAM_PRESET_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => handleApplyPreset(tpl)}
                    style={{
                      padding: '5px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: theme.textColor,
                      borderRadius: '5px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = theme.isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.05)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: '11.5px',
              color: '#ffffff',
              backgroundColor: theme.primaryColor,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '6px',
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* 2. Chart Style Segmented Control */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '3px',
          padding: '2.5px',
          backgroundColor: theme.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
          borderRadius: '8px',
          border: `1px solid ${theme.borderColor}`,
        }}
      >
        {CHART_STYLE_OPTIONS.map((opt) => {
          const isSelected = chartStyle === opt.style;
          const activeBg = theme.isDark ? '#334155' : '#ffffff';
          const activeColor = theme.textColor;
          const inactiveColor = theme.subtextColor;

          return (
            <button
              key={opt.style}
              type="button"
              onClick={() => handleStyleChange(opt.style)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                padding: '4px 0',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isSelected ? activeBg : 'transparent',
                boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                color: isSelected ? activeColor : inactiveColor,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={`${opt.label} Chart`}
            >
              {opt.icon(isSelected ? theme.primaryColor : inactiveColor)}
              <span style={{ fontSize: '9.5px', fontWeight: isSelected ? 700 : 500 }}>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Live Chart Preview Card */}
      <div
        style={{
          borderRadius: '12px',
          backgroundColor: theme.isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${theme.borderColor}`,
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          position: 'relative',
        }}
      >
        {/* Quick Readout Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '18px' }}>
          <div style={{ fontSize: '11px', color: theme.subtextColor, fontWeight: 600 }}>
            {hoveredPoint ? (
              <span style={{ color: theme.textColor }}>
                <strong>{hoveredPoint.label}:</strong>{' '}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {hoveredPoint.value}
                  {unit}
                </span>
              </span>
            ) : (
              <span>
                Total: <strong style={{ color: theme.textColor, fontVariantNumeric: 'tabular-nums' }}>{totalSum}{unit}</strong>
                {' · '}
                Avg: <strong style={{ color: theme.textColor, fontVariantNumeric: 'tabular-nums' }}>{avgValue}{unit}</strong>
              </span>
            )}
          </div>

          {/* Color Schemes Pill Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {Object.keys(DIAGRAM_PALETTES).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSchemeChange(s)}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  border: colorScheme === s ? `2px solid ${theme.textColor}` : '1px solid rgba(0,0,0,0.2)',
                  backgroundColor: DIAGRAM_PALETTES[s][0],
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                }}
                title={`Scheme: ${s}`}
              />
            ))}
          </div>
        </div>

        {/* SVG Drawing */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: `${svgHeight}px` }}>
          {renderChartPreview()}
        </div>
      </div>

      {/* 4. Data Points Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '22px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.subtextColor }}>
            Data Points ({dataPoints.length})
          </div>
          {dataPoints.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                fontSize: '10.5px',
                color: '#ef4444',
                backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${theme.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                cursor: 'pointer',
                padding: '2px 7px',
                borderRadius: '5px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)')}
              title="Clear all data points"
            >
              <TrashIcon size={11} color="#ef4444" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Points Table / List */}
        <div
          style={{
            maxHeight: '140px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '2px',
          }}
        >
          {dataPoints.map((point, index) => {
            const ptColor = getDataPointColor(point, index, colorScheme);
            const isPickerOpen = activeColorPickerId === point.id;

            return (
              <div
                key={point.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 6px',
                  borderRadius: '6px',
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                  position: 'relative',
                }}
              >
                {/* Color swatch picker */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveColorPickerId(isPickerOpen ? null : point.id);
                  }}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    backgroundColor: ptColor,
                    border: '1px solid rgba(0,0,0,0.2)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    padding: 0,
                  }}
                  title="Change color"
                />

                {/* Color dropdown popover */}
                {isPickerOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '24px',
                      left: '4px',
                      backgroundColor: theme.isDark ? '#0f172a' : '#ffffff',
                      border: `1px solid ${theme.borderColor}`,
                      borderRadius: '8px',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                      padding: '6px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '4px',
                      zIndex: 100,
                    }}
                  >
                    {PRESET_COLORS.map((clr) => (
                      <button
                        key={clr}
                        type="button"
                        onClick={() => {
                          handlePointChange(point.id, { color: clr });
                          setActiveColorPickerId(null);
                        }}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          backgroundColor: clr,
                          border: point.color === clr ? '2px solid #ffffff' : 'none',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        handlePointChange(point.id, { color: undefined });
                        setActiveColorPickerId(null);
                      }}
                      style={{
                        gridColumn: '1 / -1',
                        fontSize: '9.5px',
                        padding: '2px 0',
                        border: 'none',
                        background: 'transparent',
                        color: theme.subtextColor,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Reset to scheme
                    </button>
                  </div>
                )}

                {/* Label input */}
                <input
                  type="text"
                  value={point.label}
                  onChange={(e) => handlePointChange(point.id, { label: e.target.value })}
                  placeholder="Label"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '11.5px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${theme.borderColor}`,
                    background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#ffffff',
                    color: theme.textColor,
                    boxSizing: 'border-box',
                  }}
                />

                {/* Value input */}
                <input
                  type="number"
                  value={point.value}
                  onChange={(e) => handlePointChange(point.id, { value: parseFloat(e.target.value) || 0 })}
                  placeholder="Value"
                  style={{
                    width: '68px',
                    fontSize: '11.5px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${theme.borderColor}`,
                    background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#ffffff',
                    color: theme.textColor,
                    fontVariantNumeric: 'tabular-nums',
                    boxSizing: 'border-box',
                    textAlign: 'right',
                  }}
                />

                {/* Delete Point Button */}
                <button
                  type="button"
                  onClick={() => handleDeletePoint(point.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#ef4444',
                    cursor: 'pointer',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    opacity: 0.8,
                  }}
                  title="Remove data point"
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add New Point Form */}
        <form
          onSubmit={handleAddPoint}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px',
          }}
        >
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New label..."
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: '11px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: `1px dashed ${theme.borderColor}`,
              background: theme.isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc',
              color: theme.textColor,
            }}
          />
          <input
            type="number"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="0"
            style={{
              width: '64px',
              fontSize: '11px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: `1px dashed ${theme.borderColor}`,
              background: theme.isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc',
              color: theme.textColor,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
              color: theme.textColor,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              flexShrink: 0,
            }}
          >
            <PlusIcon size={11} />
            <span>Add</span>
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
