import assert from 'node:assert';
import {
  buildFileName,
  buildMarkdownDocument,
  isExportableUrl,
  isYouTubeWatchUrl,
  pickTitle,
  slugifyTitle,
} from '../src/markdown/format';

console.log('Testing markdown format helpers...');

// slugifyTitle / buildFileName
assert.strictEqual(slugifyTitle('Hello, World!'), 'hello-world');
assert.strictEqual(slugifyTitle('  --Multiple   spaces--  '), 'multiple-spaces');
assert.strictEqual(slugifyTitle('日本語のタイトル'), '日本語のタイトル');
assert.strictEqual(slugifyTitle('///'), 'page');
assert.strictEqual(slugifyTitle(''), 'page');
const long = slugifyTitle(`${'a'.repeat(79)} bbbb`);
assert.ok(long.length <= 80 && !long.endsWith('-'), 'long slugs are truncated without trailing hyphen');
assert.strictEqual(buildFileName('My Page: Notes'), 'my-page-notes.md');

// URL helpers
assert.strictEqual(isExportableUrl('https://example.com/a'), true);
assert.strictEqual(isExportableUrl('http://example.com'), true);
assert.strictEqual(isExportableUrl('chrome://extensions'), false);
assert.strictEqual(isExportableUrl('about:blank'), false);
assert.strictEqual(isExportableUrl(undefined), false);
assert.strictEqual(isYouTubeWatchUrl('https://www.youtube.com/watch?v=abc'), true);
assert.strictEqual(isYouTubeWatchUrl('https://m.youtube.com/watch?v=abc'), true);
assert.strictEqual(isYouTubeWatchUrl('https://www.youtube.com/shorts/abc'), false);
assert.strictEqual(isYouTubeWatchUrl('https://example.com/watch'), false);

// pickTitle
assert.strictEqual(pickTitle('Extractor', 'Doc'), 'Extractor');
assert.strictEqual(pickTitle('  ', 'Doc'), 'Doc');
assert.strictEqual(pickTitle(undefined, undefined), '');

// buildMarkdownDocument
const meta = { title: 'A "quoted" title', url: 'https://example.com/x?a=1', date: '2026-10-01T00:00:00.000Z' };
const doc = buildMarkdownDocument(meta, '\nBody text\n');
assert.strictEqual(
  doc,
  [
    '---',
    'title: "A \\"quoted\\" title"',
    'url: "https://example.com/x?a=1"',
    'date: "2026-10-01T00:00:00.000Z"',
    '---',
    '',
    '# A "quoted" title',
    '',
    'Body text',
    '',
  ].join('\n')
);

const dedup = buildMarkdownDocument({ ...meta, title: 'Same' }, '# Same\n\nBody');
assert.strictEqual(dedup.match(/^# Same$/gm)?.length, 1, 'does not duplicate a leading heading');

const noTitle = buildMarkdownDocument({ ...meta, title: '' }, 'Body');
assert.ok(!/^# /m.test(noTitle), 'no heading when title is empty');
assert.ok(noTitle.endsWith('Body\n'));

console.log('✅ Markdown format helper tests passed successfully!');
