import { ZenThemeDot, ZenThemeConfig, SpaceScheme } from '../types/workspace';

export const EXPLICIT_LIGHTNESS_TYPE = 'explicit-lightness';
export const EXPLICIT_BLACKWHITE_TYPE = 'explicit-black-white';
export const MAX_DOTS = 3;
export const MIN_OPACITY = 0.25;
export const MAX_OPACITY = 0.8;
export const DEFAULT_OPACITY = 0.5;

export interface ColorHarmony {
  type: string;
  name: string;
  angles: number[];
}

export const COLOR_HARMONIES: ColorHarmony[] = [
  { type: 'complementary', name: 'Complementary', angles: [180] },
  { type: 'singleAnalogous', name: 'Analogous', angles: [310] },
  { type: 'splitComplementary', name: 'Split Complementary', angles: [150, 210] },
  { type: 'analogous', name: 'Analogous', angles: [50, 310] },
  { type: 'triadic', name: 'Triadic', angles: [120, 240] },
  { type: 'floating', name: 'Floating', angles: [] },
];

/**
 * Converts HSL values to RGB [0-255, 0-255, 0-255]
 * h: 0-1, s: 0-1, l: 0-1
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // Normalize if passed in degrees / percentages (e.g. h: 0-360, s: 0-100, l: 0-100)
  if (h > 1) h = (h % 360) / 360;
  if (s > 1) s = s / 100;
  if (l > 1) l = l / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Converts RGB values [0-255, 0-255, 0-255] to HSL [h: 0-360, s: 0-100, l: 0-100]
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  return [
    parseInt(clean.substring(0, 2), 16) || 0,
    parseInt(clean.substring(2, 4), 16) || 0,
    parseInt(clean.substring(4, 6), 16) || 0,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function blendColors(rgb1: [number, number, number], rgb2: [number, number, number], percentage: number): [number, number, number] {
  const p = percentage > 1 ? percentage / 100 : percentage;
  return [
    Math.round(rgb1[0] * (1 - p) + rgb2[0] * p),
    Math.round(rgb1[1] * (1 - p) + rgb2[1] * p),
    Math.round(rgb1[2] * (1 - p) + rgb2[2] * p),
  ];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lum1 = relativeLuminance(rgb1);
  const lum2 = relativeLuminance(rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Calculates (x, y) coordinates on a circular canvas from an RGB color.
 */
export function calculateInitialPosition([r, g, b]: [number, number, number], canvasSize = 360): { x: number; y: number } {
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const radius = canvasSize / 2;
  const [hue, saturation] = rgbToHsl(r, g, b);
  const angle = (hue / 360) * 2 * Math.PI;
  const normalizedSaturation = saturation / 100;
  const x = centerX + radius * normalizedSaturation * Math.cos(angle);
  const y = centerY + radius * normalizedSaturation * Math.sin(angle);
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Extracts RGB color from canvas position (x, y) based on Zen Browser's polar coordinate math.
 */
export function getColorFromPosition(
  x: number,
  y: number,
  canvasSize = 360,
  type?: string,
  lightnessInput = 50
): { rgb: [number, number, number]; lightness: number } {
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const radius = canvasSize / 2;

  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) {
    angle += 360;
  }

  const normalizedDistance = 1 - Math.min(distance / radius, 1);
  const hue = angle;
  let saturation = normalizedDistance * 100;
  let lightness = lightnessInput;

  if (type !== EXPLICIT_LIGHTNESS_TYPE) {
    saturation = 90 + (1 - normalizedDistance) * 10;
    lightness = Math.round((1 - normalizedDistance) * 100);
  }

  if (type === EXPLICIT_BLACKWHITE_TYPE) {
    saturation = 0;
    lightness = Math.round((1 - normalizedDistance) * 100);
  }

  const [r, g, b] = hslToRgb(hue / 360, saturation / 100, lightness / 100);
  return {
    rgb: [
      Math.min(255, Math.max(0, r)),
      Math.min(255, Math.max(0, g)),
      Math.min(255, Math.max(0, b)),
    ],
    lightness,
  };
}

/**
 * Calculates complementary / harmonic dot positions given the current dots, harmony mode, and action.
 */
export function calculateCompliments(
  dots: Array<{ id: number; position: { x: number; y: number }; type?: string }>,
  action: 'add' | 'remove' | 'update' = 'update',
  useHarmony = '',
  canvasSize = 360
): { updatedDots: Array<{ id: number; position: { x: number; y: number }; type?: string }>; selectedAlgo: string } {
  if (dots.length === 0) {
    return { updatedDots: [], selectedAlgo: '' };
  }

  const targetNumDots = Math.max(
    1,
    Math.min(MAX_DOTS, dots.length + (action === 'add' ? 1 : action === 'remove' ? -1 : 0))
  );

  let selectedHarmony = COLOR_HARMONIES.find((h) => h.type === useHarmony);
  if (!selectedHarmony || selectedHarmony.angles.length + 1 !== targetNumDots) {
    selectedHarmony = COLOR_HARMONIES.find((h) => h.angles.length + 1 === targetNumDots) || COLOR_HARMONIES[0];
  }

  const centerPosition = { x: canvasSize / 2, y: canvasSize / 2 };
  const primaryDot = dots.find((d) => d.id === 0) || dots[0];
  const deltaX = primaryDot.position.x - centerPosition.x;
  const deltaY = primaryDot.position.y - centerPosition.y;
  let baseAngle = (Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 360) % 360;
  let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const radius = canvasSize / 2;
  if (distance > radius) distance = radius;

  const updatedDots: Array<{ id: number; position: { x: number; y: number }; type?: string }> = [
    {
      id: 0,
      position: primaryDot.position,
      type: primaryDot.type,
    },
  ];

  selectedHarmony.angles.forEach((angleOffset, index) => {
    const newAngle = (baseAngle + angleOffset) % 360;
    const radian = (newAngle * Math.PI) / 180;
    const newPosition = {
      x: Math.round(centerPosition.x + distance * Math.cos(radian)),
      y: Math.round(centerPosition.y + distance * Math.sin(radian)),
    };
    updatedDots.push({
      id: index + 1,
      position: newPosition,
      type: primaryDot.type,
    });
  });

  return { updatedDots, selectedAlgo: selectedHarmony.type };
}

// Sine wave interpolation math
export const SINE_PATH_LINE = 'M 51.373 27.395 L 367.037 27.395';
export const SINE_PATH_WAVE = 'M 51.373 27.395 C 60.14 -8.503 68.906 -8.503 77.671 27.395 C 86.438 63.293 95.205 63.293 103.971 27.395 C 112.738 -8.503 121.504 -8.503 130.271 27.395 C 139.037 63.293 147.803 63.293 156.57 27.395 C 165.335 -8.503 174.101 -8.503 182.868 27.395 C 191.634 63.293 200.4 63.293 209.167 27.395 C 217.933 -8.503 226.7 -8.503 235.467 27.395 C 244.233 63.293 252.999 63.293 261.765 27.395 C 270.531 -8.503 279.297 -8.503 288.064 27.395 C 296.83 63.293 305.596 63.293 314.363 27.395 C 323.13 -8.503 331.896 -8.503 340.662 27.395 M 314.438 27.395 C 323.204 -8.503 331.97 -8.503 340.737 27.395 C 349.503 63.293 358.27 63.293 367.037 27.395';

interface PathPoint {
  type: 'M' | 'C' | 'L';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

function parseSinePath(pathStr: string): PathPoint[] {
  const points: PathPoint[] = [];
  const commands = pathStr.match(/[MCL]\s*[\d\s.\-,]+/g);
  if (!commands) return points;

  commands.forEach((command) => {
    const type = command.charAt(0) as 'M' | 'C' | 'L';
    const coords = command.slice(1).trim().split(/[\s,]+/).map(Number);
    switch (type) {
      case 'M':
        points.push({ type: 'M', x: coords[0], y: coords[1] });
        break;
      case 'C':
        for (let i = 0; i < coords.length; i += 6) {
          points.push({
            type: 'C',
            x1: coords[i],
            y1: coords[i + 1],
            x2: coords[i + 2],
            y2: coords[i + 3],
            x: coords[i + 4],
            y: coords[i + 5],
          });
        }
        break;
      case 'L':
        points.push({ type: 'L', x: coords[0], y: coords[1] });
        break;
    }
  });
  return points;
}

const parsedSinePoints = parseSinePath(SINE_PATH_WAVE);

/**
 * Interpolates SVG sine path between flat line (progress = 0) and sine wave (progress = 1).
 */
export function interpolateWavePath(progress: number): string {
  if (progress <= 0.001) return SINE_PATH_LINE;
  if (progress >= 0.999) return SINE_PATH_WAVE;

  const referenceY = 27.395;
  const t = Math.max(0, Math.min(1, progress));
  let newPathData = '';

  parsedSinePoints.forEach((p) => {
    switch (p.type) {
      case 'M': {
        const interpolatedY = referenceY + ((p.y ?? referenceY) - referenceY) * t;
        newPathData += `M ${p.x} ${interpolatedY} `;
        break;
      }
      case 'C': {
        const y1 = referenceY + ((p.y1 ?? referenceY) - referenceY) * t;
        const y2 = referenceY + ((p.y2 ?? referenceY) - referenceY) * t;
        const y = referenceY + ((p.y ?? referenceY) - referenceY) * t;
        newPathData += `C ${p.x1} ${y1} ${p.x2} ${y2} ${p.x} ${y} `;
        break;
      }
      case 'L':
        newPathData += `L ${p.x} ${p.y} `;
        break;
    }
  });

  return newPathData.trim();
}

/**
 * Compiles a Zen Browser gradient string from the given dots and opacity.
 */
export function compileZenGradient(
  dots: ZenThemeDot[],
  opacity = 0.5,
  isDark = false
): string {
  if (!dots || dots.length === 0) {
    return isDark ? '#18181b' : '#ffffff';
  }

  const formatDotColor = (dot: ZenThemeDot): string => {
    if (typeof dot.c === 'string') return dot.c;
    const [r, g, b] = dot.c;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  if (dots.length === 1) {
    return formatDotColor(dots[0]);
  }

  const rotation = -30;
  if (dots.length === 2) {
    const c1 = formatDotColor(dots[0]);
    const c2 = formatDotColor(dots[1]);
    return `linear-gradient(${rotation}deg, ${c2} 30%, transparent 120%), linear-gradient(${rotation + 180}deg, ${c1} 30%, transparent 120%)`;
  }

  // 3 dots
  const c1 = formatDotColor(dots[2] || dots[0]);
  const c2 = formatDotColor(dots[0]);
  const c3 = formatDotColor(dots[1]);
  return `linear-gradient(-5deg, ${c1} 10%, transparent 80%), radial-gradient(circle at 95% 0%, ${c3} 0%, transparent 75%), radial-gradient(circle at 0% 0%, ${c2} 10%, transparent 70%)`;
}

/**
 * Preset swatch data from Zen's theme-picker.inc (5 pages, 8 swatches each)
 */
export interface ZenPresetSwatch {
  lightness?: number;
  algo: string;
  numDots: number;
  position: string; // "x,y"
  type?: string;
  background?: string;
  c1?: string;
  c2?: string;
  c3?: string;
}

export const ZEN_PRESET_PAGES: ZenPresetSwatch[][] = [
  // Page 1: Light float colors
  [
    { lightness: 90, algo: 'floating', numDots: 1, position: '240,240', background: '#f4efdf' },
    { lightness: 80, algo: 'floating', numDots: 1, position: '233,157', background: '#f0b8cd' },
    { lightness: 80, algo: 'floating', numDots: 1, position: '236,111', background: '#e9c3e3' },
    { lightness: 70, algo: 'floating', numDots: 1, position: '234,173', background: '#da7682' },
    { lightness: 70, algo: 'floating', numDots: 1, position: '220,187', background: '#eb8570' },
    { lightness: 60, algo: 'floating', numDots: 1, position: '225,237', background: '#dcce7f' },
    { lightness: 60, algo: 'floating', numDots: 1, position: '147,195', background: '#5becad' },
    { lightness: 50, algo: 'floating', numDots: 1, position: '81,84', background: '#919bb5' },
  ],
  // Page 2: 3-dot analogous soft gradients
  [
    { lightness: 90, algo: 'analogous', numDots: 3, position: '240,240', c1: 'rgb(245, 237, 214)', c2: 'rgb(221, 243, 216)', c3: 'rgb(243, 216, 225)' },
    { lightness: 85, algo: 'analogous', numDots: 3, position: '233,157', c1: 'rgb(243, 190, 222)', c2: 'rgb(247, 222, 186)', c3: 'rgb(223, 195, 238)' },
    { lightness: 80, algo: 'analogous', numDots: 3, position: '236,111', c1: 'rgb(229, 179, 228)', c2: 'rgb(236, 172, 178)', c3: 'rgb(197, 185, 223)' },
    { lightness: 70, algo: 'analogous', numDots: 3, position: '234,173', c1: 'rgb(235, 122, 159)', c2: 'rgb(239, 239, 118)', c3: 'rgb(210, 133, 224)' },
    { lightness: 70, algo: 'analogous', numDots: 3, position: '220,187', c1: 'rgb(242, 115, 123)', c2: 'rgb(175, 242, 115)', c3: 'rgb(230, 125, 232)' },
    { lightness: 60, algo: 'analogous', numDots: 3, position: '225,237', c1: 'rgb(221, 205, 85)', c2: 'rgb(97, 212, 94)', c3: 'rgb(215, 91, 124)' },
    { lightness: 60, algo: 'analogous', numDots: 3, position: '147,195', c1: 'rgb(75, 231, 210)', c2: 'rgb(84, 175, 222)', c3: 'rgb(62, 244, 112)' },
    { lightness: 55, algo: 'analogous', numDots: 3, position: '81,84', c1: 'rgb(122, 132, 158)', c2: 'rgb(137, 117, 164)', c3: 'rgb(116, 162, 164)' },
  ],
  // Page 3: Dark float colors
  [
    { lightness: 10, algo: 'floating', numDots: 1, position: '171,72', background: 'rgb(93, 86, 106)' },
    { lightness: 40, algo: 'floating', numDots: 1, position: '265,79', background: '#997096' },
    { lightness: 35, algo: 'floating', numDots: 1, position: '301,176', background: '#956066' },
    { lightness: 30, algo: 'floating', numDots: 1, position: '237,210', background: '#9c6645' },
    { lightness: 30, algo: 'floating', numDots: 1, position: '91,228', background: '#517b6c' },
    { lightness: 25, algo: 'floating', numDots: 1, position: '67,159', background: '#576e75' },
    { lightness: 20, algo: 'floating', numDots: 1, position: '314,235', background: 'rgb(131, 109, 95)' },
    { lightness: 20, algo: 'floating', numDots: 1, position: '118,215', background: '#447464' },
  ],
  // Page 4: Dark 3-dot analogous
  [
    { lightness: 10, algo: 'analogous', numDots: 3, position: '171,72', c1: 'rgb(23, 17, 34)', c2: 'rgb(37, 14, 35)', c3: 'rgb(18, 22, 33)' },
    { lightness: 40, algo: 'analogous', numDots: 3, position: '265,79', c1: 'rgb(128, 76, 124)', c2: 'rgb(141, 63, 66)', c3: 'rgb(97, 88, 116)' },
    { lightness: 35, algo: 'analogous', numDots: 3, position: '301,176', c1: 'rgb(122, 56, 64)', c2: 'rgb(126, 121, 52)', c3: 'rgb(111, 68, 110)' },
    { lightness: 30, algo: 'analogous', numDots: 3, position: '237,210', c1: 'rgb(131, 65, 22)', c2: 'rgb(64, 128, 25)', c3: 'rgb(122, 31, 91)' },
    { lightness: 30, algo: 'analogous', numDots: 3, position: '91,228', c1: 'rgb(45, 108, 85)', c2: 'rgb(52, 85, 101)', c3: 'rgb(52, 118, 35)' },
    { lightness: 25, algo: 'analogous', numDots: 3, position: '67,159', c1: 'rgb(45, 74, 83)', c2: 'rgb(46, 50, 81)', c3: 'rgb(38, 90, 65)' },
    { lightness: 20, algo: 'analogous', numDots: 3, position: '314,235', c1: 'rgb(64, 47, 38)', c2: 'rgb(55, 64, 38)', c3: 'rgb(59, 43, 52)' },
    { lightness: 20, algo: 'analogous', numDots: 3, position: '118,215', c1: 'rgb(22, 80, 61)', c2: 'rgb(26, 60, 76)', c3: 'rgb(27, 87, 15)' },
  ],
  // Page 5: Monochrome / grayscale ramp
  [
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '340,180', background: 'rgb(224, 224, 224)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '315,180', background: 'rgb(192, 192, 192)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '292.5,180', background: 'rgb(160, 160, 160)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '270,180', background: 'rgb(128, 128, 128)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '247.5,180', background: 'rgb(96, 96, 96)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '225,180', background: 'rgb(64, 64, 64)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '202.5,180', background: 'rgb(32, 32, 32)' },
    { type: EXPLICIT_BLACKWHITE_TYPE, algo: 'floating', numDots: 1, position: '180,180', background: 'rgb(0, 0, 0)' },
  ],
];
