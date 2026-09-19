'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SpaceScheme, ZenThemeDot, ZenThemeConfig } from '../../types/workspace';
import {
  MAX_DOTS,
  MIN_OPACITY,
  MAX_OPACITY,
  DEFAULT_OPACITY,
  COLOR_HARMONIES,
  ColorHarmony,
  getColorFromPosition,
  calculateInitialPosition,
  calculateCompliments,
  interpolateWavePath,
  compileZenGradient,
  ZEN_PRESET_PAGES,
  ZenPresetSwatch,
  hexToRgb,
  rgbToHex,
  EXPLICIT_BLACKWHITE_TYPE,
  EXPLICIT_LIGHTNESS_TYPE,
} from '../../utils/zenGradientGenerator';
import { getSpaceThemeStyles, getSpaceNoiseOverlayStyle, NOISE_SVG_DATA_URI } from '../../utils/spaceTheme';

export interface ZenThemePickerProps {
  colors?: string;
  themeNoise?: number;
  themeScheme?: SpaceScheme;
  themeConfig?: ZenThemeConfig;
  spaceName?: string;
  coverUrl?: string;
  isSystemDark?: boolean;
  onChange: (data: {
    colors: string;
    themeNoise: number;
    themeScheme: SpaceScheme;
    themeConfig: ZenThemeConfig;
  }) => void;
}

interface CanvasDot {
  id: number;
  x: number;
  y: number;
  rgb: [number, number, number];
  lightness: number;
  type?: string;
  isPrimary?: boolean;
}

const CANVAS_SIZE = 340;
const RADIUS = CANVAS_SIZE / 2;
const PRIMARY_DOT_RADIUS = 18;
const SECONDARY_DOT_RADIUS = 14;

export const ZenThemePicker: React.FC<ZenThemePickerProps> = ({
  colors,
  themeNoise = 0,
  themeScheme = 'auto',
  themeConfig,
  spaceName = 'Space Preview',
  coverUrl,
  isSystemDark = false,
  onChange,
}) => {
  // 1. Theme Scheme ('auto' | 'light' | 'dark')
  const [scheme, setScheme] = useState<SpaceScheme>(themeScheme || themeConfig?.scheme || 'auto');

  // 2. Opacity
  const [opacity, setOpacity] = useState<number>(() => {
    if (typeof themeConfig?.opacity === 'number') {
      return Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, themeConfig.opacity));
    }
    return DEFAULT_OPACITY;
  });

  // 3. Texture / Grain (0 to 1 in 16 steps)
  const [texture, setTexture] = useState<number>(() => {
    if (typeof themeConfig?.texture === 'number') {
      return Math.round(themeConfig.texture * 16) / 16;
    }
    if (typeof themeNoise === 'number' && themeNoise > 0) {
      return Math.round(themeNoise * 16) / 16;
    }
    return 0;
  });

  // 4. Algorithm
  const [useAlgo, setUseAlgo] = useState<string>(() => {
    return themeConfig?.gradientColors?.[0]?.algorithm || 'analogous';
  });

  // 5. Lightness
  const [currentLightness, setCurrentLightness] = useState<number>(() => {
    return themeConfig?.gradientColors?.[0]?.lightness ?? 50;
  });

  // 6. Dots initialization
  const [dots, setDots] = useState<CanvasDot[]>(() => {
    if (themeConfig?.gradientColors && themeConfig.gradientColors.length > 0) {
      return themeConfig.gradientColors.map((dot, index) => {
        let rgb: [number, number, number] = [56, 189, 248];
        if (Array.isArray(dot.c) && dot.c.length === 3) {
          rgb = [dot.c[0], dot.c[1], dot.c[2]];
        } else if (typeof dot.c === 'string') {
          rgb = hexToRgb(dot.c);
        }

        let pos = dot.position;
        if (!pos) {
          pos = calculateInitialPosition(rgb, CANVAS_SIZE);
        }

        return {
          id: index,
          x: pos.x,
          y: pos.y,
          rgb,
          lightness: dot.lightness ?? 50,
          type: dot.type,
          isPrimary: index === 0,
        };
      });
    }

    // Fallback: If legacy colors string exists
    if (colors && typeof colors === 'string' && colors.trim()) {
      const hexMatch = colors.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
      if (hexMatch) {
        const rgb = hexToRgb(hexMatch[0]);
        const pos = calculateInitialPosition(rgb, CANVAS_SIZE);
        return [
          {
            id: 0,
            x: pos.x,
            y: pos.y,
            rgb,
            lightness: 50,
            isPrimary: true,
          },
        ];
      }
    }

    // Default 1 primary dot
    const defaultRgb: [number, number, number] = [91, 236, 173];
    const defaultPos = calculateInitialPosition(defaultRgb, CANVAS_SIZE);
    return [
      {
        id: 0,
        x: defaultPos.x,
        y: defaultPos.y,
        rgb: defaultRgb,
        lightness: 60,
        isPrimary: true,
      },
    ];
  });

  // 7. Swatch Carousel Page (0 to 4)
  const [carouselPage, setCarouselPage] = useState(0);

  // Dragging state
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingDotIdRef = useRef<number | null>(null);
  const isPointerDownOnCanvasRef = useRef(false);

  // Rotary Dial Dragging
  const dialRef = useRef<HTMLDivElement>(null);
  const isDraggingDialRef = useRef(false);

  // Calculate effective dark appearance for preview
  const isDarkEffective = scheme === 'dark' ? true : scheme === 'light' ? false : isSystemDark;

  // Compile gradient
  const compiledGradient = useMemo(() => {
    const zenDots: ZenThemeDot[] = dots.map((d) => ({
      c: d.rgb,
      isPrimary: d.isPrimary,
      algorithm: useAlgo,
      lightness: d.lightness,
      position: { x: d.x, y: d.y },
      type: d.type,
    }));
    return compileZenGradient(zenDots, opacity, isDarkEffective);
  }, [dots, opacity, isDarkEffective, useAlgo]);

  // Emit updates whenever dots, opacity, texture, or scheme change
  const notifyChange = useCallback(
    (
      newDots: CanvasDot[],
      newOpacity: number,
      newTexture: number,
      newScheme: SpaceScheme,
      newAlgo: string
    ) => {
      const zenDots: ZenThemeDot[] = newDots.map((d) => ({
        c: d.rgb,
        isPrimary: d.isPrimary,
        algorithm: newAlgo,
        lightness: d.lightness,
        position: { x: d.x, y: d.y },
        type: d.type,
      }));

      const grad = compileZenGradient(
        zenDots,
        newOpacity,
        newScheme === 'dark' ? true : newScheme === 'light' ? false : isSystemDark
      );

      const cfg: ZenThemeConfig = {
        type: 'gradient',
        gradientColors: zenDots,
        opacity: newOpacity,
        texture: newTexture,
        scheme: newScheme,
      };

      onChange({
        colors: grad,
        themeNoise: newTexture,
        themeScheme: newScheme,
        themeConfig: cfg,
      });
    },
    [isSystemDark, onChange]
  );

  // ================= Canvas Drag Handling =================
  const updateDotsPosition = useCallback(
    (targetDotId: number, rawX: number, rawY: number) => {
      const centerX = RADIUS;
      const centerY = RADIUS;
      let dx = rawX - centerX;
      let dy = rawY - centerY;
      const maxDist = RADIUS - 12;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > maxDist) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * maxDist;
        dy = Math.sin(angle) * maxDist;
      }

      const clampedX = Math.round(centerX + dx);
      const clampedY = Math.round(centerY + dy);

      setDots((prevDots) => {
        const targetDot = prevDots.find((d) => d.id === targetDotId);
        if (!targetDot) return prevDots;

        const { rgb, lightness } = getColorFromPosition(
          clampedX,
          clampedY,
          CANVAS_SIZE,
          targetDot.type,
          currentLightness
        );

        if (targetDot.isPrimary) {
          // Dragging primary dot: update secondary dots via calculateCompliments
          const tempDots = prevDots.map((d) =>
            d.id === 0 ? { id: 0, position: { x: clampedX, y: clampedY }, type: d.type } : { id: d.id, position: { x: d.x, y: d.y }, type: d.type }
          );

          const { updatedDots } = calculateCompliments(tempDots, 'update', useAlgo, CANVAS_SIZE);

          const newDots: CanvasDot[] = updatedDots.map((ud) => {
            const { rgb: uRgb, lightness: uL } = getColorFromPosition(
              ud.position.x,
              ud.position.y,
              CANVAS_SIZE,
              ud.type,
              currentLightness
            );
            return {
              id: ud.id,
              x: ud.position.x,
              y: ud.position.y,
              rgb: uRgb,
              lightness: uL,
              type: ud.type,
              isPrimary: ud.id === 0,
            };
          });

          notifyChange(newDots, opacity, texture, scheme, useAlgo);
          return newDots;
        } else {
          // Dragging secondary dot: if not floating, switch to floating
          const newAlgo = useAlgo === 'floating' ? 'floating' : 'floating';
          setUseAlgo(newAlgo);

          const newDots = prevDots.map((d) =>
            d.id === targetDotId
              ? {
                  ...d,
                  x: clampedX,
                  y: clampedY,
                  rgb,
                  lightness,
                }
              : d
          );

          notifyChange(newDots, opacity, texture, scheme, newAlgo);
          return newDots;
        }
      });
    },
    [currentLightness, notifyChange, opacity, scheme, texture, useAlgo]
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked near an existing dot
    let clickedDotId: number | null = null;
    for (const dot of dots) {
      const radiusThreshold = dot.isPrimary ? PRIMARY_DOT_RADIUS + 6 : SECONDARY_DOT_RADIUS + 6;
      const d = Math.sqrt((x - dot.x) ** 2 + (y - dot.y) ** 2);
      if (d <= radiusThreshold) {
        clickedDotId = dot.id;
        break;
      }
    }

    if (clickedDotId !== null) {
      draggingDotIdRef.current = clickedDotId;
    } else {
      // Clicked on canvas: move primary dot to this location
      draggingDotIdRef.current = 0;
      updateDotsPosition(0, x, y);
    }

    isPointerDownOnCanvasRef.current = true;
    canvasRef.current.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownOnCanvasRef.current || draggingDotIdRef.current === null || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    updateDotsPosition(draggingDotIdRef.current, x, y);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownOnCanvasRef.current) return;
    isPointerDownOnCanvasRef.current = false;
    draggingDotIdRef.current = null;
    if (canvasRef.current && canvasRef.current.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // ================= Add / Remove / Algo Actions =================
  const handleAddDot = () => {
    if (dots.length >= MAX_DOTS) return;
    const tempDots = dots.map((d) => ({
      id: d.id,
      position: { x: d.x, y: d.y },
      type: d.type,
    }));
    const { updatedDots, selectedAlgo } = calculateCompliments(tempDots, 'add', useAlgo, CANVAS_SIZE);
    setUseAlgo(selectedAlgo);

    const newDots: CanvasDot[] = updatedDots.map((ud) => {
      const { rgb, lightness } = getColorFromPosition(
        ud.position.x,
        ud.position.y,
        CANVAS_SIZE,
        ud.type,
        currentLightness
      );
      return {
        id: ud.id,
        x: ud.position.x,
        y: ud.position.y,
        rgb,
        lightness,
        type: ud.type,
        isPrimary: ud.id === 0,
      };
    });

    setDots(newDots);
    notifyChange(newDots, opacity, texture, scheme, selectedAlgo);
  };

  const handleRemoveDot = () => {
    if (dots.length <= 1) return;
    const tempDots = dots.slice(0, dots.length - 1).map((d) => ({
      id: d.id,
      position: { x: d.x, y: d.y },
      type: d.type,
    }));
    const { updatedDots, selectedAlgo } = calculateCompliments(tempDots, 'remove', useAlgo, CANVAS_SIZE);
    setUseAlgo(selectedAlgo);

    const newDots: CanvasDot[] = updatedDots.map((ud) => {
      const { rgb, lightness } = getColorFromPosition(
        ud.position.x,
        ud.position.y,
        CANVAS_SIZE,
        ud.type,
        currentLightness
      );
      return {
        id: ud.id,
        x: ud.position.x,
        y: ud.position.y,
        rgb,
        lightness,
        type: ud.type,
        isPrimary: ud.id === 0,
      };
    });

    setDots(newDots);
    notifyChange(newDots, opacity, texture, scheme, selectedAlgo);
  };

  const handleToggleAlgo = () => {
    const applicableHarmonies = COLOR_HARMONIES.filter(
      (h) => h.angles.length + 1 === dots.length
    );
    if (applicableHarmonies.length <= 1) return;

    const currentIndex = applicableHarmonies.findIndex((h) => h.type === useAlgo);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % applicableHarmonies.length;
    const nextAlgo = applicableHarmonies[nextIndex].type;
    setUseAlgo(nextAlgo);

    const tempDots = dots.map((d) => ({
      id: d.id,
      position: { x: d.x, y: d.y },
      type: d.type,
    }));
    const { updatedDots } = calculateCompliments(tempDots, 'update', nextAlgo, CANVAS_SIZE);

    const newDots: CanvasDot[] = updatedDots.map((ud) => {
      const { rgb, lightness } = getColorFromPosition(
        ud.position.x,
        ud.position.y,
        CANVAS_SIZE,
        ud.type,
        currentLightness
      );
      return {
        id: ud.id,
        x: ud.position.x,
        y: ud.position.y,
        rgb,
        lightness,
        type: ud.type,
        isPrimary: ud.id === 0,
      };
    });

    setDots(newDots);
    notifyChange(newDots, opacity, texture, scheme, nextAlgo);
  };

  // ================= Swatch Preset Selection =================
  const handleSelectSwatch = (swatch: ZenPresetSwatch) => {
    const [rawX, rawY] = swatch.position.split(',').map((p) => parseFloat(p.trim()));
    // Scale coordinates from Zen's reference 380px to our canvas size
    const scale = CANVAS_SIZE / 380;
    const x = Math.round(rawX * scale);
    const y = Math.round(rawY * scale);

    const numDots = Math.max(1, Math.min(MAX_DOTS, swatch.numDots || 1));
    const algo = swatch.algo || (numDots > 1 ? 'analogous' : 'floating');
    const lightness = swatch.lightness !== undefined ? swatch.lightness : currentLightness;
    const type = swatch.type || (swatch.lightness !== undefined ? EXPLICIT_LIGHTNESS_TYPE : undefined);

    setCurrentLightness(lightness);
    setUseAlgo(algo);

    const initialDots = [
      { id: 0, position: { x, y }, type },
    ];
    for (let i = 1; i < numDots; i++) {
      initialDots.push({ id: i, position: { x: 0, y: 0 }, type });
    }

    const { updatedDots, selectedAlgo } = calculateCompliments(initialDots, 'update', algo, CANVAS_SIZE);
    setUseAlgo(selectedAlgo);

    const newDots: CanvasDot[] = updatedDots.map((ud) => {
      const { rgb, lightness: l } = getColorFromPosition(
        ud.position.x,
        ud.position.y,
        CANVAS_SIZE,
        ud.type,
        lightness
      );
      return {
        id: ud.id,
        x: ud.position.x,
        y: ud.position.y,
        rgb,
        lightness: l,
        type: ud.type,
        isPrimary: ud.id === 0,
      };
    });

    setDots(newDots);
    notifyChange(newDots, opacity, texture, scheme, selectedAlgo);
  };

  // ================= Rotary Dial Handling =================
  const updateTextureFromPointer = (clientX: number, clientY: number) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    let normalized = deg / 360;
    let snapped = Math.round(normalized * 16) / 16;
    if (snapped >= 1) snapped = 0;

    setTexture(snapped);
    notifyChange(dots, opacity, snapped, scheme, useAlgo);
  };

  const handleDialPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dialRef.current) return;
    isDraggingDialRef.current = true;
    dialRef.current.setPointerCapture(e.pointerId);
    updateTextureFromPointer(e.clientX, e.clientY);
  };

  const handleDialPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDialRef.current) return;
    updateTextureFromPointer(e.clientX, e.clientY);
  };

  const handleDialPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDialRef.current) return;
    isDraggingDialRef.current = false;
    if (dialRef.current && dialRef.current.hasPointerCapture(e.pointerId)) {
      dialRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // Wave Slider Path
  const waveProgress = Math.max(0, Math.min(1, (opacity - MIN_OPACITY) / (MAX_OPACITY - MIN_OPACITY)));
  const interpolatedPath = useMemo(() => interpolateWavePath(waveProgress), [waveProgress]);

  // Active Harmony object
  const currentHarmonyObj = COLOR_HARMONIES.find((h) => h.type === useAlgo);
  const activeHarmonyName = dots.length === 1 ? 'Single Dot' : currentHarmonyObj?.name || 'Floating';

  // Live preview tokens
  const previewTokens = useMemo(() => {
    return getSpaceThemeStyles(compiledGradient, isDarkEffective, texture, scheme);
  }, [compiledGradient, isDarkEffective, texture, scheme]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
        userSelect: 'none',
      }}
    >
      {/* 1. Header / Scheme Selector (Auto, Light, Dark) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: isDarkEffective ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          padding: '4px',
          borderRadius: '12px',
          gap: '4px',
          width: 'fit-content',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setScheme('auto');
            notifyChange(dots, opacity, texture, 'auto', useAlgo);
          }}
          title="Auto (follows system appearance)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '9px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            backgroundColor: scheme === 'auto' ? (isDarkEffective ? '#27272a' : '#ffffff') : 'transparent',
            color: scheme === 'auto' ? (isDarkEffective ? '#ffffff' : '#09090b') : isDarkEffective ? '#a1a1aa' : '#71717a',
            boxShadow: scheme === 'auto' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {/* Sparkles SVG */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            <path d="M5 3v4M3 5h4M19 17v4M17 19h4"/>
          </svg>
          <span>Auto</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setScheme('light');
            notifyChange(dots, opacity, texture, 'light', useAlgo);
          }}
          title="Light appearance"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '9px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            backgroundColor: scheme === 'light' ? (isDarkEffective ? '#27272a' : '#ffffff') : 'transparent',
            color: scheme === 'light' ? (isDarkEffective ? '#ffffff' : '#09090b') : isDarkEffective ? '#a1a1aa' : '#71717a',
            boxShadow: scheme === 'light' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {/* Sun SVG */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          </svg>
          <span>Light</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setScheme('dark');
            notifyChange(dots, opacity, texture, 'dark', useAlgo);
          }}
          title="Dark appearance"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '9px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            backgroundColor: scheme === 'dark' ? (isDarkEffective ? '#27272a' : '#ffffff') : 'transparent',
            color: scheme === 'dark' ? (isDarkEffective ? '#ffffff' : '#09090b') : isDarkEffective ? '#a1a1aa' : '#71717a',
            boxShadow: scheme === 'dark' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {/* Moon SVG */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
          </svg>
          <span>Dark</span>
        </button>
      </div>

      {/* 2. Interactive Dot Matrix Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        style={{
          width: `${CANVAS_SIZE}px`,
          height: `${CANVAS_SIZE}px`,
          borderRadius: '50%',
          position: 'relative',
          touchAction: 'none',
          cursor: 'crosshair',
          backgroundColor: isDarkEffective ? '#141416' : '#f5f5f7',
          backgroundImage: isDarkEffective
            ? 'radial-gradient(circle, rgba(255, 255, 255, 0.22) 1.5px, transparent 1.5px)'
            : 'radial-gradient(circle, rgba(0, 0, 0, 0.18) 1.5px, transparent 1.5px)',
          backgroundSize: '16px 16px',
          backgroundPosition: 'center center',
          boxShadow: isDarkEffective
            ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.4)'
            : 'inset 0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Subtle center indicator */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isDarkEffective ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        />

        {/* Color Dots */}
        {dots.map((dot) => {
          const isPrimary = dot.isPrimary;
          const size = isPrimary ? PRIMARY_DOT_RADIUS * 2 : SECONDARY_DOT_RADIUS * 2;
          const [r, g, b] = dot.rgb;
          const colorStr = `rgb(${r}, ${g}, ${b})`;

          return (
            <div
              key={dot.id}
              style={{
                position: 'absolute',
                left: `${dot.x}px`,
                top: `${dot.y}px`,
                width: `${size}px`,
                height: `${size}px`,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                backgroundColor: colorStr,
                border: isPrimary ? '3.5px solid #ffffff' : '2.5px solid rgba(255, 255, 255, 0.95)',
                boxShadow: isPrimary
                  ? '0 0 0 1px rgba(0,0,0,0.2), 0 4px 14px rgba(0,0,0,0.45)'
                  : '0 0 0 1px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.3)',
                cursor: 'grab',
                pointerEvents: 'none', // pointer events caught by canvas container
                transition: isPointerDownOnCanvasRef.current ? 'none' : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: isPrimary ? 10 : 5,
              }}
            >
              {isPrimary && (
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    opacity: 0.9,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Action Toolbar (+, -, algo) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: `${CANVAS_SIZE}px`,
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Add dot button */}
          <button
            type="button"
            onClick={handleAddDot}
            disabled={dots.length >= MAX_DOTS}
            title="Add color dot (max 3)"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isDarkEffective ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              backgroundColor: isDarkEffective ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
              color: isDarkEffective ? '#ffffff' : '#0f172a',
              cursor: dots.length >= MAX_DOTS ? 'not-allowed' : 'pointer',
              opacity: dots.length >= MAX_DOTS ? 0.35 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          {/* Remove dot button */}
          <button
            type="button"
            onClick={handleRemoveDot}
            disabled={dots.length <= 1}
            title="Remove color dot"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isDarkEffective ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              backgroundColor: isDarkEffective ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
              color: isDarkEffective ? '#ffffff' : '#0f172a',
              cursor: dots.length <= 1 ? 'not-allowed' : 'pointer',
              opacity: dots.length <= 1 ? 0.35 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>

          {/* Toggle Algo button (Zen algorithm icon) */}
          <button
            type="button"
            onClick={handleToggleAlgo}
            disabled={dots.length <= 1}
            title={`Color Harmony: ${activeHarmonyName} (Click to switch)`}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isDarkEffective ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              backgroundColor: isDarkEffective ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
              color: isDarkEffective ? '#ffffff' : '#0f172a',
              cursor: dots.length <= 1 ? 'not-allowed' : 'pointer',
              opacity: dots.length <= 1 ? 0.35 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
              <path d="M4.75 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m8.5-1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M9 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"/>
            </svg>
          </button>
        </div>

        {/* Harmony badge */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: isDarkEffective ? '#a1a1aa' : '#64748b',
            letterSpacing: '0.02em',
          }}
        >
          {activeHarmonyName} ({dots.length} {dots.length === 1 ? 'color' : 'colors'})
        </span>
      </div>

      {/* 4. Swatch Carousel (5 pages, 8 swatches each) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: `${CANVAS_SIZE}px`,
        }}
      >
        <button
          type="button"
          onClick={() => setCarouselPage((p) => Math.max(0, p - 1))}
          disabled={carouselPage === 0}
          title="Previous palettes"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            backgroundColor: isDarkEffective ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
            color: isDarkEffective ? '#ffffff' : '#0f172a',
            cursor: carouselPage === 0 ? 'not-allowed' : 'pointer',
            opacity: carouselPage === 0 ? 0.3 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flex: 1,
            gap: '6px',
          }}
        >
          {ZEN_PRESET_PAGES[carouselPage].map((swatch, idx) => {
            const isMultiDot = swatch.numDots > 1;
            let swatchBackground = swatch.background || '#ffffff';

            if (isMultiDot && swatch.c1 && swatch.c2 && swatch.c3) {
              swatchBackground = `linear-gradient(-35deg, ${swatch.c2} 0%, ${swatch.c1} 50%, ${swatch.c3} 100%)`;
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSwatch(swatch)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: swatchBackground,
                  border: isDarkEffective ? '1.5px solid rgba(255, 255, 255, 0.18)' : '1.5px solid rgba(0, 0, 0, 0.12)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  outline: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setCarouselPage((p) => Math.min(ZEN_PRESET_PAGES.length - 1, p + 1))}
          disabled={carouselPage === ZEN_PRESET_PAGES.length - 1}
          title="Next palettes"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            backgroundColor: isDarkEffective ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
            color: isDarkEffective ? '#ffffff' : '#0f172a',
            cursor: carouselPage === ZEN_PRESET_PAGES.length - 1 ? 'not-allowed' : 'pointer',
            opacity: carouselPage === ZEN_PRESET_PAGES.length - 1 ? 0.3 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* 5. Bottom Controls: Wavy Slider + Rotary Texture Dial */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          width: `${CANVAS_SIZE}px`,
          marginTop: '4px',
        }}
      >
        {/* Wavy Opacity Slider */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* Animated SVG Sine Wave */}
          <svg
            viewBox="0 -7.605 455 70"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <linearGradient id="zen-slider-wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={isDarkEffective ? 'rgb(161, 161, 161)' : 'rgb(90, 90, 90)'} />
                <stop offset={`${waveProgress * 100}%`} stopColor={isDarkEffective ? 'rgb(161, 161, 161)' : 'rgb(90, 90, 90)'} />
                <stop offset="100%" stopColor={isDarkEffective ? 'rgba(161, 161, 161, 0.3)' : 'rgba(77, 77, 77, 0.3)'} />
              </linearGradient>
            </defs>
            <path
              d={interpolatedPath}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              stroke="url(#zen-slider-wave-gradient)"
              strokeWidth="7"
            />
          </svg>

          {/* Accessible HTML range input over the wave */}
          <input
            type="range"
            min={MIN_OPACITY}
            max={MAX_OPACITY}
            step={0.005}
            value={opacity}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setOpacity(val);
              notifyChange(dots, val, texture, scheme, useAlgo);
            }}
            style={{
              position: 'relative',
              width: '100%',
              height: '40px',
              opacity: 0,
              cursor: 'pointer',
              zIndex: 2,
            }}
            title={`Opacity / Gradient Intensity: ${Math.round(waveProgress * 100)}%`}
          />

          {/* Custom draggable thumb indicator */}
          <div
            style={{
              position: 'absolute',
              left: `${waveProgress * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${12 + waveProgress * 12}px`,
              height: `${36 + waveProgress * 14}px`,
              borderRadius: '9999px',
              backgroundColor: isDarkEffective ? '#e4e4e7' : '#ffffff',
              border: isDarkEffective ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(0, 0, 0, 0.2)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
              pointerEvents: 'none',
              zIndex: 1,
              transition: 'width 0.1s ease, height 0.1s ease',
            }}
          />
        </div>

        {/* Rotary Dial / Texture Knob */}
        <div
          ref={dialRef}
          onPointerDown={handleDialPointerDown}
          onPointerMove={handleDialPointerMove}
          onPointerUp={handleDialPointerUp}
          onPointerCancel={handleDialPointerUp}
          title={`Texture & Grain: ${Math.round(texture * 100)}%`}
          style={{
            width: '74px',
            height: '74px',
            position: 'relative',
            cursor: 'grab',
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* 16 Radial Dot Indicators */}
          {Array.from({ length: 16 }).map((_, i) => {
            const rad = (i / 16) * Math.PI * 2;
            const leftPct = Math.cos(rad) * 44 + 50;
            const topPct = Math.sin(rad) * 44 + 50;
            const stepValue = i / 16;
            const isActive = texture >= stepValue && texture > 0;

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: '3.5px',
                  height: '3.5px',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: isActive
                    ? (isDarkEffective ? '#38bdf8' : '#0284c7')
                    : isDarkEffective ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)',
                  transition: 'background-color 0.15s ease',
                  pointerEvents: 'none',
                }}
              />
            );
          })}

          {/* Center 3D Knob Disc */}
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              position: 'relative',
              background: isDarkEffective
                ? 'linear-gradient(135deg, #27272a 0%, #18181b 100%)'
                : 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
              border: isDarkEffective ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.15)',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            {/* Grain preview inside knob */}
            {texture > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url("${NOISE_SVG_DATA_URI}")`,
                  backgroundSize: '80px 80px',
                  opacity: Math.min(1, texture * 1.3),
                  mixBlendMode: isDarkEffective ? 'screen' : 'multiply',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          {/* Rotating Needle / Pointer Handler */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '6px',
              height: '14px',
              borderRadius: '2px',
              backgroundColor: isDarkEffective ? '#38bdf8' : '#0284c7',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
              transformOrigin: '50% 23px', // Rotates around center
              transform: `translate(-50%, -23px) rotate(${texture * 360}deg)`,
              pointerEvents: 'none',
              transition: isDraggingDialRef.current ? 'none' : 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          />
        </div>
      </div>

      {/* 6. Live Space Card Preview */}
      <div
        style={{
          width: `${CANVAS_SIZE}px`,
          padding: '12px 14px',
          borderRadius: '12px',
          background: previewTokens.containerBg,
          position: 'relative',
          overflow: 'hidden',
          border: isDarkEffective ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: previewTokens.cardBoxShadow,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minHeight: '46px',
        }}
      >
        {/* Grain overlay on preview card */}
        {texture > 0 && (
          <div
            aria-hidden="true"
            style={getSpaceNoiseOverlayStyle(texture, previewTokens.isDark, previewTokens.containerBg) || undefined}
          />
        )}

        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            width="24"
            height="24"
            referrerPolicy="no-referrer"
            style={{ width: '24px', height: '24px', objectFit: 'contain', zIndex: 1 }}
          />
        ) : (
          <span style={{ fontSize: '18px', zIndex: 1 }}>📁</span>
        )}

        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: previewTokens.textColor,
            zIndex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {spaceName.trim() || 'Space Preview'}
        </span>
      </div>
    </div>
  );
};
