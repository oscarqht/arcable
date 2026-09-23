import assert from 'node:assert';
import {
  dimHexForDarkMode,
  dimColorStringForDarkMode,
  getSpaceNoiseOverlayStyle,
  getSpaceThemeStyles,
  PRESET_GRADIENTS,
  PRESET_SOLID_COLORS,
} from '../dist/utils/spaceTheme.js';
import { relativeLuminance, contrastRatio, hexToRgb, rgbToHsl } from '../dist/utils/zenGradientGenerator.js';

console.log('Testing Space Theme Dark Mode & Noise Refinements...\n');

// 1. Verify dimHexForDarkMode lightness, saturation, and contrast against white text
console.log('1. Testing dimHexForDarkMode on representative colors:');
const testColors = [
  { name: 'Warm Silk', hex: '#fdfbf7' },
  { name: 'Blossom Rose', hex: '#f089ad' },
  { name: 'Lilac Orchid', hex: '#dab8fc' },
  { name: 'Sunset Orange', hex: '#fb923c' },
  { name: 'Yellow Gold', hex: '#f8d558' },
  { name: 'Matcha Lime', hex: '#84cc16' },
  { name: 'Mint Lagoon', hex: '#34d399' },
  { name: 'Mineral Slate', hex: '#64748b' },
  { name: 'Vibrant Blue', hex: '#3b82f6' },
];

const whiteRgb: [number, number, number] = [255, 255, 255];

for (const { name, hex } of testColors) {
  const dimmed = dimHexForDarkMode(hex);
  assert.match(dimmed, /^#[0-9a-f]{6}$/i, `${name}: Dimmed color should be a valid 6-char hex`);

  const rgb = hexToRgb(dimmed);
  const [h, s, l] = rgbToHsl(...rgb);
  const normalizedL = l / 100;
  const contrast = contrastRatio(whiteRgb, rgb);

  console.log(`  - ${name.padEnd(16)}: ${hex} -> ${dimmed} | L=${normalizedL.toFixed(2)} S=${(s / 100).toFixed(2)} | Contrast=${contrast.toFixed(1)}:1`);

  // Target lightness must stay within vibrant dark range [0.18, 0.24]
  assert.ok(
    normalizedL >= 0.18 && normalizedL <= 0.24,
    `${name}: Lightness ${normalizedL} should be in vibrant dark range [0.18, 0.24]`
  );

  // Target saturation should be vibrant [0.30, 0.70] for rich space colors
  const normalizedS = s / 100;
  assert.ok(
    normalizedS >= 0.30 && normalizedS <= 0.70,
    `${name}: Saturation ${normalizedS} should be vibrant and within [0.30, 0.70]`
  );

  // Must maintain high contrast with #ffffff text (WCAG AAA requires >= 7:1)
  assert.ok(
    contrast >= 8.0,
    `${name}: Contrast ratio ${contrast.toFixed(2)} against white text should exceed 8:1`
  );
}

// 2. Verify dimColorStringForDarkMode on preset gradients
console.log('\n2. Testing dimColorStringForDarkMode on PRESET_GRADIENTS:');
for (const preset of PRESET_GRADIENTS) {
  const dimmedGradient = dimColorStringForDarkMode(preset.value);
  assert.notStrictEqual(dimmedGradient, preset.value, `${preset.name}: Gradient should be dimmed in dark mode`);
  console.log(`  - ${preset.name.padEnd(16)}: Successfully dimmed gradient`);
}

// 3. Verify getSpaceNoiseOverlayStyle
console.log('\n3. Testing getSpaceNoiseOverlayStyle in light vs dark mode:');

// Test light mode
const lightNoise = getSpaceNoiseOverlayStyle(0.5, false, '#f089ad');
assert.ok(lightNoise, 'Light noise style should be defined');
assert.strictEqual(lightNoise?.mixBlendMode, 'overlay', 'Light mode on color should use overlay');
assert.strictEqual(lightNoise?.opacity, 0.5, 'Light mode opacity should remain 0.5');

// Test dark mode
const darkNoise = getSpaceNoiseOverlayStyle(0.5, true, '#2d1f24');
assert.ok(darkNoise, 'Dark noise style should be defined');
assert.strictEqual(darkNoise?.mixBlendMode, 'screen', 'Dark mode should use screen blend mode for visible grain');
assert.strictEqual(darkNoise?.opacity, 0.5 * 0.60, 'Dark mode opacity should be balanced to 60% (0.30)');

// Test pure white background
const whiteBgNoise = getSpaceNoiseOverlayStyle(0.4, false, '#ffffff');
assert.strictEqual(whiteBgNoise?.mixBlendMode, 'multiply', 'White background should use multiply');

console.log('  - Light mode: mixBlendMode=overlay, opacity=0.5');
console.log('  - Dark mode: mixBlendMode=screen (balanced sweet spot), opacity=0.30 (scaled by 0.60x)');
console.log('  - White background: mixBlendMode=multiply');

// 4. Verify getSpaceThemeStyles integration
console.log('\n4. Testing getSpaceThemeStyles integration:');
const lightTheme = getSpaceThemeStyles('#f8d558', false, 0.4);
const darkTheme = getSpaceThemeStyles('#f8d558', true, 0.4);

assert.strictEqual(lightTheme.isDark, false);
assert.strictEqual(darkTheme.isDark, true);
assert.notStrictEqual(lightTheme.containerBg, darkTheme.containerBg, 'Container background should differ');
assert.strictEqual(darkTheme.textColor, '#ffffff', 'Text should be crisp white');
assert.strictEqual(darkTheme.themeNoise, 0.4, 'Safe noise preserved');

console.log('  - Light Yellow: containerBg =', lightTheme.containerBg);
console.log('  - Dark Yellow:  containerBg =', darkTheme.containerBg);

console.log('\nAll Space Theme Dark Mode & Noise tests PASSED successfully!');
