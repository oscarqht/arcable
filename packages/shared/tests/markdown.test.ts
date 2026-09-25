import React from 'react';
import {
  isSafeUrl,
  toggleMarkdownCheckbox,
  parseInlineMarkdown,
  renderMarkdown,
  findMarkdownLinkAtPosition,
  renderMarkdownSyntaxHighlight,
} from '../src/utils/markdown';

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
}) as React.ReactElement<{ children: React.ReactElement<{ style?: React.CSSProperties }>[] }>;
assertEqual(React.isValidElement(compactRendered), true, 'compact renderMarkdown should return valid React element');
const compactChildren = compactRendered.props.children;
const headingEl = compactChildren[0];
assertEqual(headingEl.props.style?.whiteSpace, 'pre-wrap', 'heading should have pre-wrap whiteSpace to allow wrapping');
assertEqual(headingEl.props.style?.wordBreak, 'break-word', 'heading should have break-word wordBreak');
const lastParagraphEl = compactChildren[compactChildren.length - 1];
assertEqual(lastParagraphEl.props.style?.whiteSpace, 'pre-wrap', 'paragraph should have pre-wrap whiteSpace to allow wrapping');
assertEqual(lastParagraphEl.props.style?.wordBreak, 'break-word', 'paragraph should have break-word wordBreak');

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

// 7. findMarkdownLinkAtPosition tests
const linkSample = 'Visit [Arcable](https://arcable.app) for details and [Google](https://google.com).';
const foundLink1 = findMarkdownLinkAtPosition(linkSample, 10);
assertEqual(foundLink1 !== null, true, 'should find link at cursor position 10');
assertEqual(foundLink1?.label, 'Arcable', 'should extract link label');
assertEqual(foundLink1?.url, 'https://arcable.app', 'should extract link url');

const foundLink2 = findMarkdownLinkAtPosition(linkSample, 60);
assertEqual(foundLink2?.label, 'Google', 'should extract second link');
assertEqual(foundLink2?.url, 'https://google.com', 'should extract second link url');

const noLink = findMarkdownLinkAtPosition(linkSample, 2);
assertEqual(noLink, null, 'should return null when cursor is outside any link');

// 8. renderMarkdownSyntaxHighlight tests
let toggledLineIndex = -1;
let toggledNewChecked: boolean | null = null;
let toggleCallCount = 0;
const highlighted = renderMarkdownSyntaxHighlight(sampleText, {
  isDark: true,
  onToggleCheckbox: (lineIdx, newChecked) => {
    toggledLineIndex = lineIdx;
    toggledNewChecked = newChecked;
    toggleCallCount++;
  },
});
assertEqual(React.isValidElement(highlighted), true, 'renderMarkdownSyntaxHighlight returns valid React element');

// Test interaction on checkbox span in renderMarkdownSyntaxHighlight
const taskElement = (highlighted as React.ReactElement).props.children[1];
const checkboxSpan = taskElement.props.children[3];
assertEqual(checkboxSpan.props.role, 'button', 'checkbox should have button role');

// mousedown should preventDefault and NOT trigger onToggleCheckbox
checkboxSpan.props.onMouseDown({ preventDefault: () => {}, stopPropagation: () => {} });
assertEqual(toggleCallCount, 0, 'onMouseDown should not toggle checkbox');

// click should trigger onToggleCheckbox exactly once with (lineIndex, newChecked)
checkboxSpan.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
assertEqual(toggleCallCount, 1, 'onClick should toggle checkbox');
assertEqual(toggledLineIndex, 1, 'onClick should pass correct lineIndex');
assertEqual(toggledNewChecked, true, 'onClick should pass newChecked true for unchecked item');

// 9. toggleMarkdownCheckbox explicitChecked tests
const testText = '# Heading\n- [ ] Unchecked item\n- [x] Checked item';
const forcedChecked = toggleMarkdownCheckbox(testText, 1, true);
assertEqual(forcedChecked, '# Heading\n- [x] Unchecked item\n- [x] Checked item', 'explicitChecked=true should check item');
const alreadyCheckedRemainsChecked = toggleMarkdownCheckbox(forcedChecked, 1, true);
assertEqual(alreadyCheckedRemainsChecked, '# Heading\n- [x] Unchecked item\n- [x] Checked item', 'explicitChecked=true on already checked item remains checked');
const forcedUnchecked = toggleMarkdownCheckbox(testText, 2, false);
assertEqual(forcedUnchecked, '# Heading\n- [ ] Unchecked item\n- [ ] Checked item', 'explicitChecked=false should uncheck item');

const highlightedEmpty = renderMarkdownSyntaxHighlight('');
assertEqual(highlightedEmpty, null, 'empty content returns null');

// 10. Verify exact 1:1 character content of task list checkbox in highlight output
const taskContentSample = '- [ ] sample';
const renderedTaskHighlight = renderMarkdownSyntaxHighlight(taskContentSample) as React.ReactElement;
const taskDiv = renderedTaskHighlight.props.children[0];
const cb = taskDiv.props.children[3];
// cb is the checkbox span containing '[', ' ' / 'x', ']'
const cbChildren = cb.props.children;
assertEqual(cbChildren[0].props.children, '[', 'first bracket is [');
assertEqual(cbChildren[1].props.children, ' ', 'unchecked inner character is space');
assertEqual(cbChildren[2].props.children, ']', 'second bracket is ]');
assertEqual(cb.props.style?.padding, undefined, 'checkbox span has no padding to prevent layout shift');

console.log('All markdown utility tests passed successfully!');

