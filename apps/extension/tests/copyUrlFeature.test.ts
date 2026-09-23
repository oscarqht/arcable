import assert from 'node:assert';

(globalThis as any).chrome = {
  runtime: { id: 'test-ext' },
  tabs: {},
  contextMenus: {},
};

const {
  COPY_MENU_IDS,
  formatUrl,
  formatTitle,
  formatTitleDashUrl,
  formatTitleUrl,
  formatMarkdownLink,
  formatTabData,
  getTabData,
  isCopyMenuItem,
  getCopyFormatType,
  isExtensionOrSystemPage,
} = await import('../src/background/clipboard');

console.log('Testing copy URL feature formatting and utilities...');

const mockTabs = [
  { title: 'Google Search', url: 'https://www.google.com' },
  { title: 'GitHub', url: 'https://github.com' },
];

// 1. Test formatUrl
assert.strictEqual(
  formatUrl([mockTabs[0]]),
  'https://www.google.com',
  'formatUrl should format single tab URL'
);
assert.strictEqual(
  formatUrl(mockTabs),
  'https://www.google.com\nhttps://github.com',
  'formatUrl should format multiple tab URLs separated by newline'
);

// 2. Test formatTitle
assert.strictEqual(
  formatTitle([mockTabs[0]]),
  'Google Search',
  'formatTitle should format single tab title'
);
assert.strictEqual(
  formatTitle(mockTabs),
  'Google Search\nGitHub',
  'formatTitle should format multiple tab titles'
);

// 3. Test formatTitleDashUrl
assert.strictEqual(
  formatTitleDashUrl([mockTabs[0]]),
  'Google Search - https://www.google.com',
  'formatTitleDashUrl should format single tab "Title - URL"'
);
assert.strictEqual(
  formatTitleDashUrl(mockTabs),
  'Google Search - https://www.google.com\nGitHub - https://github.com',
  'formatTitleDashUrl should format multiple tabs separated by newline'
);

// 4. Test formatTitleUrl
assert.strictEqual(
  formatTitleUrl([mockTabs[0]]),
  'Google Search\nhttps://www.google.com',
  'formatTitleUrl should format single tab "Title\\nURL"'
);
assert.strictEqual(
  formatTitleUrl(mockTabs),
  'Google Search\nhttps://www.google.com\n\nGitHub\nhttps://github.com',
  'formatTitleUrl should format multiple tabs separated by double newline'
);

// 5. Test formatMarkdownLink
assert.strictEqual(
  formatMarkdownLink([mockTabs[0]]),
  '[Google Search](https://www.google.com)',
  'formatMarkdownLink should format single tab as [Title](URL)'
);
assert.strictEqual(
  formatMarkdownLink(mockTabs),
  '[Google Search](https://www.google.com)\n[GitHub](https://github.com)',
  'formatMarkdownLink should format multiple tabs as [Title](URL) separated by newline'
);

// 6. Test fallback when title is missing or empty
const emptyTitleTabs = [
  { title: '', url: 'https://example.com' },
];
assert.strictEqual(
  formatTitleDashUrl(emptyTitleTabs),
  'https://example.com - https://example.com',
  'formatTitleDashUrl should fallback to URL when title is empty'
);
assert.strictEqual(
  formatTitleUrl(emptyTitleTabs),
  'https://example.com\nhttps://example.com',
  'formatTitleUrl should fallback to URL when title is empty'
);
assert.strictEqual(
  formatMarkdownLink(emptyTitleTabs),
  '[https://example.com](https://example.com)',
  'formatMarkdownLink should fallback to URL when title is empty'
);

// 7. Test formatTabData dispatcher
assert.strictEqual(formatTabData('url', mockTabs), formatUrl(mockTabs));
assert.strictEqual(formatTabData('title', mockTabs), formatTitle(mockTabs));
assert.strictEqual(formatTabData('title-dash-url', mockTabs), formatTitleDashUrl(mockTabs));
assert.strictEqual(formatTabData('title-url', mockTabs), formatTitleUrl(mockTabs));
assert.strictEqual(formatTabData('markdown-link', mockTabs), formatMarkdownLink(mockTabs));

// 8. Test getTabData extraction and filtering
const rawTabs = [
  { title: ' Valid Title ', url: 'https://example.org' },
  { title: undefined, url: 'https://notitle.org' },
  { title: 'No URL', url: '' },
  { title: 'Undefined URL' },
];
const extracted = getTabData(rawTabs);
assert.strictEqual(extracted.length, 2, 'Should only keep tabs with valid URLs');
assert.strictEqual(extracted[0].title, 'Valid Title', 'Should trim title');
assert.strictEqual(extracted[0].url, 'https://example.org');
assert.strictEqual(extracted[1].title, 'https://notitle.org', 'Should use URL if title undefined');
assert.strictEqual(extracted[1].url, 'https://notitle.org');

// 9. Test isCopyMenuItem
assert.strictEqual(isCopyMenuItem(COPY_MENU_IDS.URL), true);
assert.strictEqual(isCopyMenuItem(COPY_MENU_IDS.TITLE_DASH_URL), true);
assert.strictEqual(isCopyMenuItem(COPY_MENU_IDS.TITLE_URL), true);
assert.strictEqual(isCopyMenuItem(COPY_MENU_IDS.MARKDOWN_LINK), true);
assert.strictEqual(isCopyMenuItem(COPY_MENU_IDS.TITLE), true);
assert.strictEqual(isCopyMenuItem(COPY_MENU_IDS.PARENT), false);
assert.strictEqual(isCopyMenuItem('random_menu_id'), false);

// 10. Test getCopyFormatType
assert.strictEqual(getCopyFormatType(COPY_MENU_IDS.URL), 'url');
assert.strictEqual(getCopyFormatType(COPY_MENU_IDS.TITLE_DASH_URL), 'title-dash-url');
assert.strictEqual(getCopyFormatType(COPY_MENU_IDS.TITLE_URL), 'title-url');
assert.strictEqual(getCopyFormatType(COPY_MENU_IDS.MARKDOWN_LINK), 'markdown-link');
assert.strictEqual(getCopyFormatType(COPY_MENU_IDS.TITLE), 'title');
assert.strictEqual(getCopyFormatType('arcable_take_screenshot'), null);

// 11. Test isExtensionOrSystemPage
assert.strictEqual(isExtensionOrSystemPage('chrome://extensions'), true);
assert.strictEqual(isExtensionOrSystemPage('about:blank'), true);
assert.strictEqual(isExtensionOrSystemPage('chrome-extension://abcdef/popup.html'), true);
assert.strictEqual(isExtensionOrSystemPage('moz-extension://abcdef/index.html'), true);
assert.strictEqual(isExtensionOrSystemPage('edge://settings'), true);
assert.strictEqual(isExtensionOrSystemPage('https://github.com'), false);
assert.strictEqual(isExtensionOrSystemPage('http://localhost:3000'), false);
assert.strictEqual(isExtensionOrSystemPage('file:///path/to/file.txt'), false);

console.log('✅ All copy URL feature tests passed successfully!');
