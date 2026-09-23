import React from 'react';
import { isSafeUrl, toggleMarkdownCheckbox, parseInlineMarkdown, renderMarkdown } from '../src/utils/markdown';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

// 1. isSafeUrl tests
assertEqual(isSafeUrl('https://google.com'), true, 'https URL should be safe');
assertEqual(isSafeUrl('http://example.com/path?foo=bar'), true, 'http URL should be safe');
assertEqual(isSafeUrl('mailto:test@example.com'), true, 'mailto URL should be safe');
assertEqual(isSafeUrl('#section-1'), true, 'anchor URL should be safe');
assertEqual(isSafeUrl('/dashboard'), true, 'relative path should be safe');
assertEqual(isSafeUrl('javascript:alert(1)'), false, 'javascript protocol must be blocked');
assertEqual(isSafeUrl('javascript:void(0)'), false, 'javascript protocol must be blocked');
assertEqual(isSafeUrl('data:text/html,<script>alert(1)</script>'), false, 'data URI must be blocked');
assertEqual(isSafeUrl('vbscript:msgbox(1)'), false, 'vbscript must be blocked');
assertEqual(isSafeUrl(''), false, 'empty URL should not be safe');

// 2. toggleMarkdownCheckbox tests
const sampleText = `# My Note
- [ ] First task
- [x] Second task
  * [ ] Subtask
1. [ ] Numbered task
Plain text line`;

// Toggle unchecked task on line 1
const afterToggle1 = toggleMarkdownCheckbox(sampleText, 1);
assertEqual(
  afterToggle1.split('\n')[1],
  '- [x] First task',
  'line 1 unchecked box should become checked'
);

// Toggle checked task on line 2
const afterToggle2 = toggleMarkdownCheckbox(sampleText, 2);
assertEqual(
  afterToggle2.split('\n')[2],
  '- [ ] Second task',
  'line 2 checked box should become unchecked'
);

// Toggle indented subtask on line 3
const afterToggle3 = toggleMarkdownCheckbox(sampleText, 3);
assertEqual(
  afterToggle3.split('\n')[3],
  '  * [x] Subtask',
  'line 3 indented subtask should preserve indentation and become checked'
);

// Toggle numbered task on line 4
const afterToggle4 = toggleMarkdownCheckbox(sampleText, 4);
assertEqual(
  afterToggle4.split('\n')[4],
  '1. [x] Numbered task',
  'line 4 numbered task should become checked'
);

// Toggle non-checkbox line should not alter text
const afterToggleNonTask = toggleMarkdownCheckbox(sampleText, 5);
assertEqual(
  afterToggleNonTask,
  sampleText,
  'non-checkbox line should remain unchanged'
);

// Out of bounds line index
assertEqual(
  toggleMarkdownCheckbox(sampleText, 999),
  sampleText,
  'out of bounds line index should remain unchanged'
);

// 3. parseInlineMarkdown tests
const inlineNodes = parseInlineMarkdown('Hello **bold** and *italic* and ~~strike~~ and `code` and [link](https://arcable.app)', {
  isDark: false,
});
assertEqual(inlineNodes.length > 0, true, 'inline parser should produce nodes');

// 4. renderMarkdown test (full mode)
let toggledLine = -1;
let toggledVal: boolean | null = null;
const rendered = renderMarkdown(sampleText, {
  isDark: true,
  onToggleCheckbox: (lineIdx, checked) => {
    toggledLine = lineIdx;
    toggledVal = checked;
  },
});
assertEqual(React.isValidElement(rendered), true, 'renderMarkdown should return valid React element');

// 5. renderMarkdown test (compact mode)
const compactRendered = renderMarkdown(sampleText, {
  compact: true,
  isDark: false,
});
assertEqual(React.isValidElement(compactRendered), true, 'compact renderMarkdown should return valid React element');

// 6. renderMarkdown with code block and blockquote
const codeAndQuoteText = `> This is a quote
\`\`\`js
console.log("hello");
\`\`\`
---
- item 1
1. ordered 1`;

const renderedCodeQuote = renderMarkdown(codeAndQuoteText, { isDark: true });
assertEqual(React.isValidElement(renderedCodeQuote), true, 'renderMarkdown handles code blocks and blockquotes');

console.log('All markdown utility tests passed successfully!');
