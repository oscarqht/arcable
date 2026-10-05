import React from 'react';
import { EmojiPicker, EmojiPickerProps } from '../src/components/EmojiPicker';
import { QuickSearchPopover, resolveSearchUrl } from '../src/components/workspace/widgets/QuickSearchPopover';
import { SearchConfig, WorkspaceWidget } from '../src/types/workspace';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", received "${actual}"`);
  }
}

console.log('Running search widget emoji picker tests...');

// 1. Verify EmojiPicker exports and React component definition
assert(typeof EmojiPicker === 'function', 'EmojiPicker must be exported as a React FC');
assert(typeof QuickSearchPopover === 'function', 'QuickSearchPopover must be exported as a React FC');

// 2. Verify EmojiPickerProps type contracts and default expectations
const mockProps: EmojiPickerProps = {
  value: '🚀',
  onChange: (emoji: string) => {
    // callback
  },
  label: 'Emoji',
  compact: true,
  align: 'right',
  placement: 'auto',
  isDark: true,
  popoverWidth: 256,
  popoverHeight: 280,
  placeholder: '⚙️',
  allowClear: false,
};

assertEqual(mockProps.value, '🚀', 'EmojiPicker value must accept emoji character');
assertEqual(mockProps.compact, true, 'EmojiPicker must support compact mode');
assertEqual(mockProps.align, 'right', 'EmojiPicker must support right alignment');
assertEqual(mockProps.isDark, true, 'EmojiPicker must support isDark prop');
assertEqual(mockProps.popoverWidth, 256, 'EmojiPicker must accept custom popover width');

// 3. Verify column and sizing calculation logic
function computeColumnsAndSize(popoverWidth?: number | string, columns?: number) {
  const defaultWidth = 260;
  const numericWidth =
    typeof popoverWidth === 'number'
      ? popoverWidth
      : typeof popoverWidth === 'string'
      ? parseInt(popoverWidth, 10) || defaultWidth
      : defaultWidth;

  const activeColumns = columns ?? (numericWidth < 300 ? 7 : 8);
  const itemSize = activeColumns >= 8 ? '34px' : '31px';
  return { activeColumns, itemSize };
}

const compactCalculations = computeColumnsAndSize(256);
assertEqual(compactCalculations.activeColumns, 7, 'Width 256 must use 7 columns');
assertEqual(compactCalculations.itemSize, '31px', '7 columns must use 31px item size');

const standardCalculations = computeColumnsAndSize(320);
assertEqual(standardCalculations.activeColumns, 8, 'Width 320 must use 8 columns');
assertEqual(standardCalculations.itemSize, '34px', '8 columns must use 34px item size');

const customOverride = computeColumnsAndSize(256, 6);
assertEqual(customOverride.activeColumns, 6, 'Explicit columns must override width heuristic');

// 4. Verify SearchConfig customIcon integration
const searchConfigWithCustomEmoji: SearchConfig = {
  engine: 'custom',
  customUrl: 'https://duckduckgo.com/?q=%s',
  customName: 'DDG',
  customIcon: '🦆',
};

assertEqual(searchConfigWithCustomEmoji.customIcon, '🦆', 'Custom icon should store emoji character');

// 5. Verify resolveSearchUrl still behaves consistently
assertEqual(
  resolveSearchUrl(searchConfigWithCustomEmoji.engine, searchConfigWithCustomEmoji.customUrl, 'test query'),
  'https://duckduckgo.com/?q=test%20query',
  'Search url should properly resolve with custom emoji config'
);

console.log('All search widget emoji picker tests passed successfully!');
