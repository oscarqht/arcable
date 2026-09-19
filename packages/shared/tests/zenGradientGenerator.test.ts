import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getColorFromPosition,
  calculateInitialPosition,
  calculateCompliments,
  interpolateWavePath,
  compileZenGradient,
  ZEN_PRESET_PAGES,
  COLOR_HARMONIES,
  hexToRgb,
  rgbToHex,
  hslToRgb,
  rgbToHsl,
  blendColors,
  contrastRatio,
  ZenThemeDot,
} from '../src/utils/zenGradientGenerator';

test('color conversions: hexToRgb and rgbToHex roundtrip correctly', () => {
  const hex = '#38bdf8';
  const rgb = hexToRgb(hex);
  assert.deepEqual(rgb, [56, 189, 248]);
  const backToHex = rgbToHex(...rgb);
  assert.equal(backToHex.toLowerCase(), hex.toLowerCase());
});

test('color conversions: hslToRgb and rgbToHsl roundtrip correctly', () => {
  const [r, g, b] = hslToRgb(200, 90, 60);
  const [h, s, l] = rgbToHsl(r, g, b);
  assert.ok(Math.abs(h - 200) <= 2, `Expected hue ~200, got ${h}`);
  assert.ok(Math.abs(s - 90) <= 2, `Expected sat ~90, got ${s}`);
  assert.ok(Math.abs(l - 60) <= 2, `Expected lightness ~60, got ${l}`);
});

test('blendColors smoothly interpolates between two colors', () => {
  const c1: [number, number, number] = [0, 0, 0];
  const c2: [number, number, number] = [200, 200, 200];
  const blended = blendColors(c1, c2, 0.5);
  assert.deepEqual(blended, [100, 100, 100]);
});

test('calculateInitialPosition and getColorFromPosition polar coordinates', () => {
  const size = 340;
  const rgb: [number, number, number] = [56, 189, 248];
  const pos = calculateInitialPosition(rgb, size);

  assert.ok(pos.x >= 0 && pos.x <= size, `x should be inside canvas, got ${pos.x}`);
  assert.ok(pos.y >= 0 && pos.y <= size, `y should be inside canvas, got ${pos.y}`);

  const retrieved = getColorFromPosition(pos.x, pos.y, size);
  assert.ok(Array.isArray(retrieved.rgb) && retrieved.rgb.length === 3);
});

test('calculateCompliments correctly generates harmonic dot positions', () => {
  const size = 340;
  const initialDots = [
    { id: 0, position: { x: 170, y: 70 }, type: undefined },
  ];

  // 1. Add dot -> 2 dots, default complementary (180 deg)
  const add1 = calculateCompliments(initialDots, 'add', 'complementary', size);
  assert.equal(add1.updatedDots.length, 2);
  assert.equal(add1.selectedAlgo, 'complementary');

  // Verify opposite angle (distance from center should be preserved)
  const center = size / 2;
  const d0x = add1.updatedDots[0].position.x - center;
  const d0y = add1.updatedDots[0].position.y - center;
  const d1x = add1.updatedDots[1].position.x - center;
  const d1y = add1.updatedDots[1].position.y - center;

  const angle0 = Math.atan2(d0y, d0x) * (180 / Math.PI);
  const angle1 = Math.atan2(d1y, d1x) * (180 / Math.PI);
  const diffAngle = Math.abs((angle1 - angle0 + 360) % 360);
  assert.ok(Math.abs(diffAngle - 180) <= 2, `Expected complementary angle ~180, got ${diffAngle}`);

  // 2. Add dot -> 3 dots, default splitComplementary or analogous
  const add2 = calculateCompliments(add1.updatedDots, 'add', 'analogous', size);
  assert.equal(add2.updatedDots.length, 3);

  // 3. Remove dot -> back to 2 dots
  const rem1 = calculateCompliments(add2.updatedDots, 'remove', 'analogous', size);
  assert.equal(rem1.updatedDots.length, 2);

  // 4. Remove dot -> back to 1 dot
  const rem2 = calculateCompliments(rem1.updatedDots, 'remove', 'complementary', size);
  assert.equal(rem2.updatedDots.length, 1);
});

test('interpolateWavePath smoothly generates SVG cubic bezier sine paths', () => {
  // t = 0 (progress 0)
  const path0 = interpolateWavePath(0);
  assert.ok(path0.startsWith('M 51.373 27.395'));
  assert.ok(!path0.includes('NaN'));

  // t = 0.5 (progress 50%)
  const pathHalf = interpolateWavePath(0.5);
  assert.ok(pathHalf.startsWith('M 51.373 27.395'));
  assert.ok(pathHalf.includes('C '));
  assert.ok(!pathHalf.includes('NaN'));

  // t = 1 (progress 100%)
  const pathFull = interpolateWavePath(1);
  assert.ok(pathFull.startsWith('M 51.373 27.395'));
  assert.ok(pathFull.includes('C '));
  assert.ok(!pathFull.includes('NaN'));
});

test('compileZenGradient compiles valid CSS gradient strings for 1, 2, and 3 dots', () => {
  // 1 dot
  const dot1: ZenThemeDot = { c: [56, 189, 248], isPrimary: true };
  const grad1 = compileZenGradient([dot1], 0.5, false);
  assert.ok(grad1.includes('rgba('));
  assert.ok(grad1.includes('rgba('));

  // 2 dots
  const dot2: ZenThemeDot = { c: [236, 72, 153], isPrimary: false };
  const grad2 = compileZenGradient([dot1, dot2], 0.6, false);
  assert.ok(grad2.includes('linear-gradient('));

  // 3 dots
  const dot3: ZenThemeDot = { c: [34, 197, 94], isPrimary: false };
  const grad3 = compileZenGradient([dot1, dot2, dot3], 0.7, false);
  assert.ok(grad3.includes('radial-gradient('));
  assert.ok(grad3.includes('linear-gradient('));

  // Dark mode compilation
  const gradDark = compileZenGradient([dot1, dot2, dot3], 0.5, true);
  assert.ok(gradDark.includes('rgba('));
});

test('ZEN_PRESET_PAGES contains exactly 5 pages with 8 presets each', () => {
  assert.equal(ZEN_PRESET_PAGES.length, 5);
  for (let i = 0; i < ZEN_PRESET_PAGES.length; i++) {
    const page = ZEN_PRESET_PAGES[i];
    assert.equal(page.length, 8, `Page ${i + 1} should have 8 presets`);
    for (const swatch of page) {
      assert.ok(typeof swatch.position === 'string' && swatch.position.includes(','));
      assert.ok(swatch.numDots >= 1 && swatch.numDots <= 3);
    }
  }
});
