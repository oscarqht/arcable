import { resolveSearchUrl } from '../src/components/workspace/widgets/QuickSearchPopover';

function assertEqual(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", received "${actual}"`);
  }
}

console.log('Running search widget url tests...');

// 1. Google engine with query
assertEqual(
  resolveSearchUrl('google', undefined, 'hello world'),
  'https://www.google.com/search?q=hello%20world',
  'Google search with query must interpolate encoded query'
);

// 2. Google engine with empty query (or whitespace) - must replace %s with empty string
assertEqual(
  resolveSearchUrl('google', undefined, ''),
  'https://www.google.com/search?q=',
  'Google search with empty query must replace %s with empty string'
);

assertEqual(
  resolveSearchUrl('google', undefined, '   '),
  'https://www.google.com/search?q=',
  'Google search with whitespace query must replace %s with empty string'
);

assertEqual(
  resolveSearchUrl(undefined, undefined, ''),
  'https://www.google.com/search?q=',
  'Default search engine with empty query must replace %s with empty string'
);

// 3. Custom search URL with query
assertEqual(
  resolveSearchUrl('custom', 'https://duckduckgo.com/?q=%s', 'react tips'),
  'https://duckduckgo.com/?q=react%20tips',
  'Custom search with query must interpolate encoded query'
);

// 4. Custom search URL with empty query - must replace %s with empty string
assertEqual(
  resolveSearchUrl('custom', 'https://duckduckgo.com/?q=%s', ''),
  'https://duckduckgo.com/?q=',
  'Custom search with empty query must replace %s with empty string'
);

assertEqual(
  resolveSearchUrl('custom', 'https://duckduckgo.com/?q=%s', '  '),
  'https://duckduckgo.com/?q=',
  'Custom search with whitespace query must replace %s with empty string'
);

// 5. Custom search URL with multiple %s placeholders
assertEqual(
  resolveSearchUrl('custom', 'https://example.com/search/%s?query=%s', ''),
  'https://example.com/search/?query=',
  'Custom search with multiple %s must replace all with empty string'
);

assertEqual(
  resolveSearchUrl('custom', 'https://example.com/search/%s?query=%s', 'test'),
  'https://example.com/search/test?query=test',
  'Custom search with multiple %s must replace all with query'
);

// 6. Custom search without %s placeholder
assertEqual(
  resolveSearchUrl('custom', 'https://news.ycombinator.com', ''),
  'https://news.ycombinator.com',
  'Custom search without %s must return original URL'
);

// 7. Custom search with empty customUrl fallback
assertEqual(
  resolveSearchUrl('custom', '', ''),
  'https://www.google.com/search?q=',
  'Custom search with empty customUrl must fallback to Google and replace %s with empty string'
);

console.log('All search widget url tests passed successfully!');
