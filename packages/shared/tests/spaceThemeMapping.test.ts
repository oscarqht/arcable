import assert from 'node:assert';
import {
  resolveZenThemeSettings,
  parseColorToRgb,
  parseZenGradientColors,
  findMatchingCarouselPage,
  CANVAS_SIZE,
} from '../src/components/workspace/ZenThemePicker';
import { ZEN_PRESET_PAGES, EXPLICIT_BLACKWHITE_TYPE } from '../src/utils/zenGradientGenerator';
import { ZenThemeConfig } from '../src/types/workspace';

console.log('Testing Space Theme Mapping into Components...');

// 1. Space with full themeConfig (3 dots, opacity, texture dial, algorithm, lightness)
{
  const spaceThemeConfig: ZenThemeConfig = {
    type: 'gradient',
    opacity: 0.68,
    texture: 0.375, // 6/16 steps on rotary dial
    scheme: 'auto',
    gradientColors: [
      {
        c: [56, 189, 248],
        isPrimary: true,
        algorithm: 'triadic',
        lightness: 65,
        position: { x: 210, y: 140 },
      },
      {
        c: [248, 113, 113],
        isPrimary: false,
        algorithm: 'triadic',
        lightness: 60,
        position: { x: 120, y: 190 },
      },
      {
        c: [52, 211, 153],
        isPrimary: false,
        algorithm: 'triadic',
        lightness: 55,
        position: { x: 170, y: 240 },
      },
    ],
  };

  const resolved = resolveZenThemeSettings({
    themeConfig: spaceThemeConfig,
    colors: 'some-colors',
    themeNoise: 0.375,
    isSystemDark: false,
    canvasSize: CANVAS_SIZE,
  });

  assert.strictEqual(resolved.dots.length, 3, 'Should map exactly 3 dots onto the canvas');
  assert.strictEqual(resolved.dots[0].isPrimary, true, 'First dot should be primary');
  assert.deepStrictEqual(resolved.dots[0].rgb, [56, 189, 248], 'First dot RGB should match space theme');
  assert.deepStrictEqual(resolved.dots[1].rgb, [248, 113, 113], 'Second dot RGB should match space theme');
  assert.deepStrictEqual(resolved.dots[2].rgb, [52, 211, 153], 'Third dot RGB should match space theme');
  assert.strictEqual(resolved.dots[0].x, 210, 'Dot 0 X position should be mapped');
  assert.strictEqual(resolved.dots[0].y, 140, 'Dot 0 Y position should be mapped');

  assert.strictEqual(resolved.opacity, 0.68, 'Wavy opacity slider should be mapped to 0.68');
  assert.strictEqual(resolved.texture, 0.375, 'Rotary dial texture should be mapped to 0.375 (6/16 steps)');
  assert.strictEqual(resolved.useAlgo, 'triadic', 'Active harmony algorithm should be mapped to triadic');
  assert.strictEqual(resolved.currentLightness, 65, 'Current lightness should be mapped to 65');
  assert.strictEqual(resolved.carouselPage, 1, 'Should map to light 3-dot swatch carousel page (page index 1)');
  console.log('✓ Full themeConfig mapped into canvas dots, wave slider, rotary dial, algo, and carousel page');
}

// 2. Space with 2 dots and complementary algorithm
{
  const spaceThemeConfig: ZenThemeConfig = {
    type: 'gradient',
    opacity: 0.45,
    texture: 0.125, // 2/16 steps
    gradientColors: [
      {
        c: [236, 72, 153],
        isPrimary: true,
        algorithm: 'complementary',
        lightness: 50,
        position: { x: 190, y: 150 },
      },
      {
        c: [34, 197, 94],
        isPrimary: false,
        algorithm: 'complementary',
        lightness: 50,
        position: { x: 150, y: 190 },
      },
    ],
  };

  const resolved = resolveZenThemeSettings({
    themeConfig: spaceThemeConfig,
    colors: '',
    themeNoise: 0.125,
    isSystemDark: false,
  });

  assert.strictEqual(resolved.dots.length, 2, 'Should map 2 dots');
  assert.strictEqual(resolved.useAlgo, 'complementary', 'Algorithm should be complementary');
  assert.strictEqual(resolved.opacity, 0.45, 'Opacity should be 0.45');
  assert.strictEqual(resolved.texture, 0.125, 'Texture should be 0.125');
  console.log('✓ 2-dot complementary theme mapped successfully');
}

// 3. String-based dot colors (rgb and rgba strings)
{
  const spaceThemeConfig: ZenThemeConfig = {
    type: 'gradient',
    opacity: 0.5,
    texture: 0,
    gradientColors: [
      {
        c: 'rgb(243, 190, 222)',
        isPrimary: true,
        position: { x: 100, y: 100 },
      },
      {
        c: 'rgba(56, 189, 248, 0.8)',
        isPrimary: false,
        position: { x: 200, y: 200 },
      },
    ],
  };

  const resolved = resolveZenThemeSettings({
    themeConfig: spaceThemeConfig,
  });

  assert.deepStrictEqual(resolved.dots[0].rgb, [243, 190, 222], 'rgb() string parsed to RGB tuple');
  assert.deepStrictEqual(resolved.dots[1].rgb, [56, 189, 248], 'rgba() string parsed to RGB tuple');
  console.log('✓ String-based dot color formats parsed properly');
}

// 4. Legacy colors string with compiled 3-dot Zen gradient
{
  const compiledZenGradient =
    'linear-gradient(-5deg, rgba(243, 195, 238, 0.6) 10%, transparent 80%), radial-gradient(circle at 95% 0%, rgba(247, 222, 186, 0.6) 0%, transparent 75%), radial-gradient(circle at 0% 0%, rgba(243, 190, 222, 0.6) 10%, transparent 70%)';

  const resolved = resolveZenThemeSettings({
    themeConfig: undefined,
    colors: compiledZenGradient,
    themeNoise: 0.25,
    isSystemDark: false,
  });

  assert.strictEqual(resolved.dots.length, 3, 'Parsed 3 dots from compiled Zen gradient');
  assert.strictEqual(resolved.opacity, 0.6, 'Extracted opacity 0.6 from rgba components');
  assert.strictEqual(resolved.texture, 0.25, 'Mapped themeNoise 0.25 to texture dial');
  assert.strictEqual(resolved.useAlgo, 'analogous', 'Mapped 3-dot algo to analogous');
  console.log('✓ Compiled Zen gradient string parsed into dots, opacity, and texture dial');
}

// 5. Preset theme name (e.g. 'warm-silk')
{
  const resolved = resolveZenThemeSettings({
    colors: 'warm-silk',
    themeNoise: 0,
  });

  assert.strictEqual(resolved.dots.length, 1, 'Mapped preset into 1 dot');
  assert.deepStrictEqual(resolved.dots[0].rgb, [235, 213, 190], 'Extracted warm-silk primary color RGB');
  console.log('✓ Preset theme name mapped into dot and color');
}

// 6. Matching Swatch Carousel Page from ZEN_PRESET_PAGES
{
  // Page 2 swatch (index 1 in 0-based indexing: 3-dot analogous soft gradients)
  const swatchPage1 = ZEN_PRESET_PAGES[1][0];
  const [rx, ry] = swatchPage1.position.split(',').map((p) => parseFloat(p.trim()));
  const sx = Math.round(rx * (CANVAS_SIZE / 380));
  const sy = Math.round(ry * (CANVAS_SIZE / 380));

  const page = findMatchingCarouselPage(
    [
      { id: 0, x: sx, y: sy, rgb: [245, 237, 214], lightness: 90, isPrimary: true },
      { id: 1, x: sx + 20, y: sy + 20, rgb: [221, 243, 216], lightness: 90, isPrimary: false },
      { id: 2, x: sx - 20, y: sy - 20, rgb: [243, 216, 225], lightness: 90, isPrimary: false },
    ],
    90,
    false,
    CANVAS_SIZE
  );

  assert.strictEqual(page, 1, 'Carousel page matches Page 2 (index 1: 3-dot analogous)');

  // Monochrome swatch on page 5 (index 4)
  const monoPage = findMatchingCarouselPage(
    [{ id: 0, x: 170, y: 170, rgb: [128, 128, 128], lightness: 50, type: EXPLICIT_BLACKWHITE_TYPE, isPrimary: true }],
    50,
    false,
    CANVAS_SIZE
  );
  assert.strictEqual(monoPage, 4, 'Monochrome dot matches grayscale carousel page (index 4)');
  console.log('✓ Swatch Carousel page matching verified');
}

// 7. New Space (no themeConfig, no colors, no themeNoise)
{
  const resolved = resolveZenThemeSettings({});

  assert.strictEqual(resolved.dots.length, 1, 'Default 1 primary dot');
  assert.deepStrictEqual(resolved.dots[0].rgb, [91, 236, 173], 'Default green dot RGB');
  assert.strictEqual(resolved.opacity, 0.5, 'Default opacity 0.5');
  assert.strictEqual(resolved.texture, 0, 'Default texture 0');
  assert.strictEqual(resolved.useAlgo, 'analogous', 'Default algorithm analogous');
  console.log('✓ New space defaults mapped correctly');
}

console.log('\nAll Space Theme Mapping tests PASSED successfully!');
