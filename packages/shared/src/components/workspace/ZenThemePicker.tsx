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
  rgbToHsl,
  EXPLICIT_BLACKWHITE_TYPE,
  EXPLICIT_LIGHTNESS_TYPE,
} from '../../utils/zenGradientGenerator';
import { getSpaceThemeStyles, getSpaceNoiseOverlayStyle, NOISE_SVG_DATA_URI, PRESET_GRADIENTS } from '../../utils/spaceTheme';

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

export interface CanvasDot {
  id: number;
  x: number;
  y: number;
  rgb: [number, number, number];
  lightness: number;
  type?: string;
  isPrimary?: boolean;
}

export interface ResolvedZenThemeSettings {
  dots: CanvasDot[];
  opacity: number;
  texture: number;
  useAlgo: string;
  currentLightness: number;
  carouselPage: number;
}

export const CANVAS_SIZE = 340;
const RADIUS = CANVAS_SIZE / 2;
const PRIMARY_DOT_RADIUS = 18;
const SECONDARY_DOT_RADIUS = 14;

/**
 * Parses any color format (RGB array, rgba string, rgb string, hex string) into an [r, g, b] tuple.
 */
export function parseColorToRgb(
  color: [number, number, number] | string | undefined | null
): [number, number, number] | null {
  if (!color) return null;
  if (Array.isArray(color) && color.length >= 3) {
    return [
      Math.min(255, Math.max(0, Math.round(color[0]))),
      Math.min(255, Math.max(0, Math.round(color[1]))),
      Math.min(255, Math.max(0, Math.round(color[2]))),
    ];
  }
  if (typeof color === 'string') {
    const trimmed = color.trim();
    const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      return [
        Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10))),
        Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10))),
        Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10))),
      ];
    }
    const hexMatch = trimmed.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
    if (hexMatch) {
      return hexToRgb(hexMatch[0]);
    }
    const matchedPreset = PRESET_GRADIENTS.find((g) => g.id === trimmed || g.value === trimmed);
    if (matchedPreset) {
      return hexToRgb(matchedPreset.primary);
    }
  }
  return null;
}

/**
 * Parses legacy colors string (Zen compiled gradients, preset values, hex strings) into dots and opacity.
 */
export function parseZenGradientColors(
  colorsStr: string,
  canvasSize = CANVAS_SIZE
): { dots: CanvasDot[]; opacity?: number; algo?: string; lightness?: number } | null {
  if (!colorsStr || typeof colorsStr !== 'string' || !colorsStr.trim()) return null;
  const trimmed = colorsStr.trim();

  // 1. Look for all rgba or rgb occurrences
  const rgbaRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/gi;
  const matches: Array<{ rgb: [number, number, number]; opacity?: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = rgbaRegex.exec(trimmed)) !== null) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const op = match[4] !== undefined ? parseFloat(match[4]) : undefined;
    matches.push({ rgb: [r, g, b], opacity: op });
  }

  let extractedOpacity: number | undefined;
  if (matches.length > 0 && matches[0].opacity !== undefined && !isNaN(matches[0].opacity)) {
    extractedOpacity = Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, matches[0].opacity));
  }

  if (matches.length >= 3) {
    // 3-dot Zen gradient compiled order:
    // match[0] is dot[2], match[1] is dot[1], match[2] is dot[0]
    const dot0Rgb = matches[2].rgb;
    const dot1Rgb = matches[1].rgb;
    const dot2Rgb = matches[0].rgb;
    const pos0 = calculateInitialPosition(dot0Rgb, canvasSize);
    const pos1 = calculateInitialPosition(dot1Rgb, canvasSize);
    const pos2 = calculateInitialPosition(dot2Rgb, canvasSize);
    const [, , l0] = rgbToHsl(...dot0Rgb);
    const [, , l1] = rgbToHsl(...dot1Rgb);
    const [, , l2] = rgbToHsl(...dot2Rgb);

    return {
      dots: [
        { id: 0, x: pos0.x, y: pos0.y, rgb: dot0Rgb, lightness: l0, isPrimary: true },
        { id: 1, x: pos1.x, y: pos1.y, rgb: dot1Rgb, lightness: l1, isPrimary: false },
        { id: 2, x: pos2.x, y: pos2.y, rgb: dot2Rgb, lightness: l2, isPrimary: false },
      ],
      opacity: extractedOpacity,
      algo: 'analogous',
      lightness: l0,
    };
  }

  if (matches.length === 2) {
    // 2-dot Zen gradient compiled order:
    // match[0] is dot[1], match[1] is dot[0]
    const dot0Rgb = matches[1].rgb;
    const dot1Rgb = matches[0].rgb;
    const pos0 = calculateInitialPosition(dot0Rgb, canvasSize);
    const pos1 = calculateInitialPosition(dot1Rgb, canvasSize);
    const [, , l0] = rgbToHsl(...dot0Rgb);
    const [, , l1] = rgbToHsl(...dot1Rgb);

    return {
      dots: [
        { id: 0, x: pos0.x, y: pos0.y, rgb: dot0Rgb, lightness: l0, isPrimary: true },
        { id: 1, x: pos1.x, y: pos1.y, rgb: dot1Rgb, lightness: l1, isPrimary: false },
      ],
      opacity: extractedOpacity,
      algo: 'complementary',
      lightness: l0,
    };
  }

  if (matches.length === 1) {
    const dot0Rgb = matches[0].rgb;
    const pos0 = calculateInitialPosition(dot0Rgb, canvasSize);
    const [, , l0] = rgbToHsl(...dot0Rgb);
    return {
      dots: [{ id: 0, x: pos0.x, y: pos0.y, rgb: dot0Rgb, lightness: l0, isPrimary: true }],
      opacity: extractedOpacity,
      algo: 'floating',
      lightness: l0,
    };
  }

  // 2. Check PRESET_GRADIENTS
  const matchedPreset = PRESET_GRADIENTS.find((g) => g.id === trimmed || g.value === trimmed);
  if (matchedPreset) {
    const rgb = hexToRgb(matchedPreset.primary);
    const pos = calculateInitialPosition(rgb, canvasSize);
    const [, , l] = rgbToHsl(...rgb);
    return {
      dots: [{ id: 0, x: pos.x, y: pos.y, rgb, lightness: l, isPrimary: true }],
      algo: 'floating',
      lightness: l,
    };
  }

  // 3. Fallback hex match
  const hexMatch = trimmed.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
  if (hexMatch) {
    const rgb = hexToRgb(hexMatch[0]);
    const pos = calculateInitialPosition(rgb, canvasSize);
    const [, , l] = rgbToHsl(...rgb);
    return {
      dots: [{ id: 0, x: pos.x, y: pos.y, rgb, lightness: l, isPrimary: true }],
      algo: 'floating',
      lightness: l,
    };
  }

  return null;
}

/**
 * Finds the preset swatch carousel page (0 to 4) that matches the current theme settings.
 */
export function findMatchingCarouselPage(
  dots: CanvasDot[],
  currentLightness: number,
  isDarkEffective: boolean,
  canvasSize = CANVAS_SIZE
): number {
  if (!dots || dots.length === 0) return 0;

  const isBlackWhite = dots[0]?.type === EXPLICIT_BLACKWHITE_TYPE;
  if (isBlackWhite) {
    return 4; // Page 5: Monochrome / grayscale ramp
  }

  // Search for an exact or near coordinate match in ZEN_PRESET_PAGES
  const scale = canvasSize / 380;
  for (let pageIdx = 0; pageIdx < ZEN_PRESET_PAGES.length; pageIdx++) {
    const page = ZEN_PRESET_PAGES[pageIdx];
    for (const swatch of page) {
      if (swatch.numDots !== dots.length) continue;
      // Do not match blackwhite swatches with non-blackwhite dots
      if (Boolean(swatch.type === EXPLICIT_BLACKWHITE_TYPE) !== isBlackWhite) continue;

      const [rawX, rawY] = swatch.position.split(',').map((p) => parseFloat(p.trim()));
      const sx = Math.round(rawX * scale);
      const sy = Math.round(rawY * scale);

      // Check distance to primary dot
      const dist = Math.hypot(dots[0].x - sx, dots[0].y - sy);
      if (dist <= 8) {
        return pageIdx;
      }
    }
  }

  if (dots.length === 3) {
    return isDarkEffective || currentLightness <= 45 ? 3 : 1; // Page 4 (dark 3-dot) or Page 2 (light 3-dot)
  }

  // 1 or 2 dots
  return isDarkEffective || currentLightness <= 45 ? 2 : 0; // Page 3 (dark 1-dot) or Page 1 (light 1-dot)
}

/**
 * Resolves full component theme settings from incoming theme props.
 */
export function resolveZenThemeSettings({
  themeConfig,
  colors,
  themeNoise = 0,
  isSystemDark = false,
  canvasSize = CANVAS_SIZE,
}: {
  themeConfig?: ZenThemeConfig;
  colors?: string;
  themeNoise?: number;
  isSystemDark?: boolean;
  canvasSize?: number;
}): ResolvedZenThemeSettings {
  let resolvedDots: CanvasDot[] = [];
  let resolvedOpacity: number = DEFAULT_OPACITY;
  let resolvedTexture: number = 0;
  let resolvedAlgo: string = 'analogous';
  let resolvedLightness: number = 50;

  // Texture / Noise (0 to 1 in 16 steps)
  if (typeof themeConfig?.texture === 'number') {
    resolvedTexture = Math.round(themeConfig.texture * 16) / 16;
  } else if (typeof themeNoise === 'number' && themeNoise > 0) {
    resolvedTexture = Math.round(themeNoise * 16) / 16;
  }

  // Dots & Opacity mapping
  if (themeConfig?.gradientColors && themeConfig.gradientColors.length > 0) {
    resolvedDots = themeConfig.gradientColors.map((dot, index) => {
      let rgb: [number, number, number] = [56, 189, 248];
      const parsedRgb = parseColorToRgb(dot.c);
      if (parsedRgb) {
        rgb = parsedRgb;
      }

      let pos = dot.position;
      // If position missing, invalid, or (0,0), calculate from color
      if (!pos || (pos.x === 0 && pos.y === 0)) {
        pos = calculateInitialPosition(rgb, canvasSize);
      } else if (pos.x > canvasSize || pos.y > canvasSize) {
        // Was likely saved on 380px Zen reference canvas
        pos = {
          x: Math.round((pos.x * canvasSize) / 380),
          y: Math.round((pos.y * canvasSize) / 380),
        };
      }

      return {
        id: index,
        x: pos.x,
        y: pos.y,
        rgb,
        lightness: dot.lightness ?? 50,
        type: dot.type,
        isPrimary: Boolean(dot.isPrimary || index === 0),
      };
    });

    if (typeof themeConfig.opacity === 'number') {
      resolvedOpacity = Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, themeConfig.opacity));
    }

    resolvedAlgo =
      themeConfig.gradientColors[0]?.algorithm ||
      (resolvedDots.length > 1 ? 'analogous' : 'floating');
    resolvedLightness = themeConfig.gradientColors[0]?.lightness ?? 50;
  } else if (colors && colors.trim()) {
    // Fallback: Parse from legacy colors string
    const parsed = parseZenGradientColors(colors, canvasSize);
    if (parsed) {
      resolvedDots = parsed.dots;
      if (parsed.opacity !== undefined) resolvedOpacity = parsed.opacity;
      if (parsed.algo) resolvedAlgo = parsed.algo;
      if (parsed.lightness !== undefined) resolvedLightness = parsed.lightness;
    }
  }

  // Fallback to default primary dot if no dots resolved
  if (resolvedDots.length === 0) {
    const defaultRgb: [number, number, number] = [91, 236, 173];
    const defaultPos = calculateInitialPosition(defaultRgb, canvasSize);
    resolvedDots = [
      {
        id: 0,
        x: defaultPos.x,
        y: defaultPos.y,
        rgb: defaultRgb,
        lightness: 60,
        isPrimary: true,
      },
    ];
    resolvedLightness = 60;
  }

  const carouselPage = findMatchingCarouselPage(
    resolvedDots,
    resolvedLightness,
    isSystemDark,
    canvasSize
  );

  return {
    dots: resolvedDots,
    opacity: resolvedOpacity,
    texture: resolvedTexture,
    useAlgo: resolvedAlgo,
    currentLightness: resolvedLightness,
    carouselPage,
  };
}

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
  // Theme Scheme is always 'auto'
  const scheme: SpaceScheme = 'auto';

  // Initialize theme settings from incoming props
  const initialResolved = useMemo(() => {
    return resolveZenThemeSettings({
      themeConfig,
      colors,
      themeNoise,
      isSystemDark,
      canvasSize: CANVAS_SIZE,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [opacity, setOpacity] = useState<number>(initialResolved.opacity);
  const [texture, setTexture] = useState<number>(initialResolved.texture);
  const [useAlgo, setUseAlgo] = useState<string>(initialResolved.useAlgo);
  const [currentLightness, setCurrentLightness] = useState<number>(initialResolved.currentLightness);
  const [dots, setDots] = useState<CanvasDot[]>(initialResolved.dots);
  const [carouselPage, setCarouselPage] = useState<number>(initialResolved.carouselPage);

  // Track last emitted payload to distinguish internal updates from external prop changes
  const lastEmittedRef = useRef<{
    colors?: string;
    themeNoise?: number;
    themeConfig?: ZenThemeConfig;
  } | null>(null);

  // Synchronize state when incoming props change from the outside
  useEffect(() => {
    const last = lastEmittedRef.current;
    if (
      last &&
      last.colors === colors &&
      last.themeNoise === themeNoise &&
      last.themeConfig === themeConfig
    ) {
      return;
    }

    const updated = resolveZenThemeSettings({
      themeConfig,
      colors,
      themeNoise,
      isSystemDark,
      canvasSize: CANVAS_SIZE,
    });

    setOpacity(updated.opacity);
    setTexture(updated.texture);
    setUseAlgo(updated.useAlgo);
    setCurrentLightness(updated.currentLightness);
    setDots(updated.dots);
    setCarouselPage(updated.carouselPage);
  }, [themeConfig, colors, themeNoise, isSystemDark]);

  // Dragging state
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingDotIdRef = useRef<number | null>(null);
  const isPointerDownOnCanvasRef = useRef(false);

  // Rotary Dial Dragging
  const dialRef = useRef<HTMLDivElement>(null);
  const isDraggingDialRef = useRef(false);

  // Effective appearance follows system theme (scheme is always 'auto')
  const isDarkEffective = isSystemDark;

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

  // Emit updates whenever dots, opacity, or texture change
  const notifyChange = useCallback(
    (
      newDots: CanvasDot[],
      newOpacity: number,
      newTexture: number,
      _newScheme: SpaceScheme,
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

      const grad = compileZenGradient(zenDots, newOpacity, isSystemDark);

      const cfg: ZenThemeConfig = {
        type: 'gradient',
        gradientColors: zenDots,
        opacity: newOpacity,
        texture: newTexture,
        scheme: 'auto',
      };

      lastEmittedRef.current = {
        colors: grad,
        themeNoise: newTexture,
        themeConfig: cfg,
      };

      onChange({
        colors: grad,
        themeNoise: newTexture,
        themeScheme: 'auto',
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
