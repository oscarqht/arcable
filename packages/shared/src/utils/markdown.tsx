import React from 'react';

export interface MarkdownRenderOptions {
  compact?: boolean;
  isDark?: boolean;
  themeTextColor?: string;
  accentColor?: string;
  onToggleCheckbox?: (lineIndex: number, newChecked: boolean) => void;
}

/**
 * Checks if a URL is safe to open (prevents javascript:, data:, etc. XSS attacks)
 */
export function isSafeUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return true;
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('mailto:')) {
    return true;
  }
  return false;
}

/**
 * Toggles a checkbox on the specified line in the markdown text.
 * Handles `- [ ]`, `- [x]`, `* [ ]`, `* [x]`, `1. [ ]`, etc.
 */
export function toggleMarkdownCheckbox(content: string, targetLineIndex: number): string {
  const lines = content.split('\n');
  if (targetLineIndex < 0 || targetLineIndex >= lines.length) return content;
  const line = lines[targetLineIndex];
  const checkboxRegex = /^(\s*(?:[-*]|\d+\.)\s+\[)([ xX])(\]\s*.*)$/;
  const match = line.match(checkboxRegex);
  if (!match) return content;

  const currentCheck = match[2];
  const newCheck = currentCheck.trim() === '' ? 'x' : ' ';
  lines[targetLineIndex] = `${match[1]}${newCheck}${match[3]}`;
  return lines.join('\n');
}

/**
 * Parses inline markdown:
 * - Code: `code`
 * - Links: [label](url)
 * - Bold: **text** or __text__
 * - Strikethrough: ~~text~~
 * - Italic: *text* or _text_
 */
export function parseInlineMarkdown(
  text: string,
  options: MarkdownRenderOptions,
  keyPrefix = ''
): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let tokenIndex = 0;

  while (remaining.length > 0) {
    // 1. Inline Code: `code`
    const codeMatch = remaining.match(/`([^`\n]+)`/);
    // 2. Link: [label](url)
    const linkMatch = remaining.match(/\[([^\]\n]+)\]\(([^)\s]+)\)/);
    // 3. Bold: **text** or __text__
    const boldMatch = remaining.match(/(?:\*\*([^*\n]+)\*\*|__([^_\n]+)__)/);
    // 4. Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/~~([^~\n]+)~~/);
    // 5. Italic: *text* or _text_ (excluding inside words like some_snake_case unless standalone)
    const italicMatch = remaining.match(/(?:\*([^*\n]+)\*|(?:^|[\s.,!?;:])_([^_\n]+)_(?:$|[\s.,!?;:]))/);

    // Find the earliest match
    const matches = [
      codeMatch ? { type: 'code', match: codeMatch, index: codeMatch.index ?? -1 } : null,
      linkMatch ? { type: 'link', match: linkMatch, index: linkMatch.index ?? -1 } : null,
      boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index ?? -1 } : null,
      strikeMatch ? { type: 'strike', match: strikeMatch, index: strikeMatch.index ?? -1 } : null,
      italicMatch ? { type: 'italic', match: italicMatch, index: italicMatch.index ?? -1 } : null,
    ].filter((m): m is NonNullable<typeof m> => m !== null && m.index >= 0);

    if (matches.length === 0) {
      nodes.push(remaining);
      break;
    }

    // Sort by earliest start index
    matches.sort((a, b) => a.index - b.index);
    const earliest = matches[0];

    // Push text before the match
    if (earliest.index > 0) {
      nodes.push(remaining.substring(0, earliest.index));
    }

    const key = `${keyPrefix}-tok-${tokenIndex++}`;

    switch (earliest.type) {
      case 'code': {
        const codeText = earliest.match[1];
        nodes.push(
          <code
            key={key}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: options.compact ? '7px' : '11px',
              backgroundColor: options.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
              padding: options.compact ? '0.5px 2px' : '1px 3.5px',
              borderRadius: '3px',
              verticalAlign: 'baseline',
            }}
          >
            {codeText}
          </code>
        );
        remaining = remaining.substring(earliest.index + earliest.match[0].length);
        break;
      }

      case 'link': {
        const label = earliest.match[1];
        const rawUrl = earliest.match[2];
        const safe = isSafeUrl(rawUrl);
        const linkColor = options.isDark ? '#60a5fa' : '#2563eb';

        if (options.compact) {
          nodes.push(
            <span
              key={key}
              style={{
                color: linkColor,
                textDecoration: 'underline',
              }}
            >
              {parseInlineMarkdown(label, options, `${key}-lbl`)}
            </span>
          );
        } else {
          nodes.push(
            <a
              key={key}
              href={safe ? rawUrl : '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (!safe) e.preventDefault();
              }}
              style={{
                color: linkColor,
                textDecoration: 'underline',
                cursor: safe ? 'pointer' : 'default',
              }}
            >
              {parseInlineMarkdown(label, options, `${key}-lbl`)}
            </a>
          );
        }
        remaining = remaining.substring(earliest.index + earliest.match[0].length);
        break;
      }

      case 'bold': {
        const boldText = earliest.match[1] || earliest.match[2];
        nodes.push(
          <strong key={key} style={{ fontWeight: 700 }}>
            {parseInlineMarkdown(boldText, options, `${key}-b`)}
          </strong>
        );
        remaining = remaining.substring(earliest.index + earliest.match[0].length);
        break;
      }

      case 'strike': {
        const strikeText = earliest.match[1];
        nodes.push(
          <del key={key} style={{ opacity: 0.65, textDecoration: 'line-through' }}>
            {parseInlineMarkdown(strikeText, options, `${key}-s`)}
          </del>
        );
        remaining = remaining.substring(earliest.index + earliest.match[0].length);
        break;
      }

      case 'italic': {
        const italicText = earliest.match[1] || earliest.match[2];
        // Handle boundary prefix if captured with underscore
        const matchedStr = earliest.match[0];
        const matchIndex = earliest.index;
        
        nodes.push(
          <em key={key} style={{ fontStyle: 'italic' }}>
            {parseInlineMarkdown(italicText, options, `${key}-i`)}
          </em>
        );
        remaining = remaining.substring(matchIndex + matchedStr.length);
        break;
      }
    }
  }

  return nodes;
}

/**
 * Renders full markdown (blocks + inline) into React elements
 */
export function renderMarkdown(
  content: string,
  options: MarkdownRenderOptions = {}
): React.ReactNode {
  if (!content || !content.trim()) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';

  const textColor = options.themeTextColor || (options.isDark ? '#f8fafc' : '#1e293b');
  const isCompact = Boolean(options.compact);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Fenced Code Block handling (```)
    if (rawLine.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const codeContent = codeBlockLines.join('\n');
        elements.push(
          <pre
            key={`code-block-${i}`}
            style={{
              margin: isCompact ? '1px 0' : '4px 0',
              padding: isCompact ? '2px 4px' : '6px 8px',
              backgroundColor: options.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)',
              borderRadius: isCompact ? '3px' : '6px',
              overflowX: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: isCompact ? '6.5px' : '11px',
              lineHeight: 1.3,
              border: `1px solid ${options.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
            }}
          >
            <code>{codeContent}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
        continue;
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = rawLine.trim().slice(3).trim();
        codeBlockLines = [];
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();

    // Empty lines
    if (!trimmed) {
      if (!isCompact) {
        elements.push(<div key={`empty-${i}`} style={{ height: '4px' }} />);
      }
      continue;
    }

    // Horizontal Rule: --- or ***
    if (/^([-*_]){3,}$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: `1px solid ${options.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
            margin: isCompact ? '2px 0' : '6px 0',
          }}
        />
      );
      continue;
    }

    // Headings: # H1, ## H2, ### H3
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];

      const fontSize = isCompact
        ? level === 1
          ? '8.5px'
          : level === 2
          ? '8px'
          : '7.5px'
        : level === 1
        ? '15px'
        : level === 2
        ? '13.5px'
        : '12px';

      elements.push(
        <div
          key={`heading-${i}`}
          style={{
            fontSize,
            fontWeight: 800,
            lineHeight: isCompact ? 1.15 : 1.3,
            margin: isCompact ? '0.5px 0' : '4px 0 2px 0',
            color: textColor,
            overflow: isCompact ? 'hidden' : undefined,
            textOverflow: isCompact ? 'ellipsis' : undefined,
            whiteSpace: isCompact ? 'nowrap' : undefined,
          }}
        >
          {parseInlineMarkdown(headingText, options, `h-${i}`)}
        </div>
      );
      continue;
    }

    // Blockquote: > quote
    const quoteMatch = rawLine.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const quoteText = quoteMatch[1];
      elements.push(
        <div
          key={`quote-${i}`}
          style={{
            borderLeft: `2.5px solid ${options.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)'}`,
            paddingLeft: isCompact ? '3px' : '7px',
            margin: isCompact ? '1px 0' : '3px 0',
            fontStyle: 'italic',
            opacity: 0.85,
            fontSize: isCompact ? '7px' : '12px',
            lineHeight: isCompact ? 1.15 : 1.4,
            overflow: isCompact ? 'hidden' : undefined,
            textOverflow: isCompact ? 'ellipsis' : undefined,
            whiteSpace: isCompact ? 'nowrap' : undefined,
          }}
        >
          {parseInlineMarkdown(quoteText, options, `q-${i}`)}
        </div>
      );
      continue;
    }

    // Task List Checkbox: - [ ] or - [x] or * [ ] or 1. [ ]
    const taskMatch = rawLine.match(/^(\s*)(?:[-*]|\d+\.)\s+\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const indentLevel = Math.min(Math.floor(taskMatch[1].length / 2), 4);
      const isChecked = taskMatch[2].toLowerCase() === 'x';
      const itemText = taskMatch[3];
      const lineIndex = i;

      if (isCompact) {
        elements.push(
          <div
            key={`task-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2.5px',
              fontSize: '7.5px',
              lineHeight: 1.15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              width: '100%',
              paddingLeft: `${indentLevel * 4}px`,
            }}
          >
            <span
              style={{
                fontSize: '7.5px',
                flexShrink: 0,
                opacity: isChecked ? 0.6 : 0.85,
                fontWeight: 700,
              }}
            >
              {isChecked ? '☑' : '☐'}
            </span>
            <span
              style={{
                textDecoration: isChecked ? 'line-through' : 'none',
                opacity: isChecked ? 0.6 : 0.9,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {parseInlineMarkdown(itemText, options, `t-${i}`)}
            </span>
          </div>
        );
      } else {
        elements.push(
          <div
            key={`task-${i}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              margin: '2px 0',
              paddingLeft: `${indentLevel * 12}px`,
              lineHeight: 1.4,
              fontSize: '12.5px',
            }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                e.stopPropagation();
                options.onToggleCheckbox?.(lineIndex, !isChecked);
              }}
              style={{
                cursor: 'pointer',
                margin: '2.5px 0 0 0',
                width: '13px',
                height: '13px',
                accentColor: options.accentColor || '#3b82f6',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                textDecoration: isChecked ? 'line-through' : 'none',
                opacity: isChecked ? 0.6 : 1,
                wordBreak: 'break-word',
                flex: 1,
              }}
            >
              {parseInlineMarkdown(itemText, options, `t-${i}`)}
            </span>
          </div>
        );
      }
      continue;
    }

    // Unordered List: - item or * item
    const unorderMatch = rawLine.match(/^(\s*)[-*]\s+(.*)$/);
    if (unorderMatch) {
      const indentLevel = Math.min(Math.floor(unorderMatch[1].length / 2), 4);
      const itemText = unorderMatch[2];

      elements.push(
        <div
          key={`ul-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: isCompact ? '2px' : '5px',
            margin: isCompact ? '0.5px 0' : '2px 0',
            paddingLeft: isCompact ? `${indentLevel * 4}px` : `${indentLevel * 12}px`,
            fontSize: isCompact ? '7.5px' : '12.5px',
            lineHeight: isCompact ? 1.15 : 1.4,
            overflow: isCompact ? 'hidden' : undefined,
            textOverflow: isCompact ? 'ellipsis' : undefined,
            whiteSpace: isCompact ? 'nowrap' : undefined,
          }}
        >
          <span style={{ opacity: 0.65, flexShrink: 0 }}>•</span>
          <span
            style={{
              flex: 1,
              overflow: isCompact ? 'hidden' : undefined,
              textOverflow: isCompact ? 'ellipsis' : undefined,
              whiteSpace: isCompact ? 'nowrap' : undefined,
              wordBreak: 'break-word',
            }}
          >
            {parseInlineMarkdown(itemText, options, `li-${i}`)}
          </span>
        </div>
      );
      continue;
    }

    // Ordered List: 1. item
    const orderMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (orderMatch) {
      const indentLevel = Math.min(Math.floor(orderMatch[1].length / 2), 4);
      const num = orderMatch[2];
      const itemText = orderMatch[3];

      elements.push(
        <div
          key={`ol-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: isCompact ? '2px' : '4px',
            margin: isCompact ? '0.5px 0' : '2px 0',
            paddingLeft: isCompact ? `${indentLevel * 4}px` : `${indentLevel * 12}px`,
            fontSize: isCompact ? '7.5px' : '12.5px',
            lineHeight: isCompact ? 1.15 : 1.4,
            overflow: isCompact ? 'hidden' : undefined,
            textOverflow: isCompact ? 'ellipsis' : undefined,
            whiteSpace: isCompact ? 'nowrap' : undefined,
          }}
        >
          <span style={{ opacity: 0.7, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {num}.
          </span>
          <span
            style={{
              flex: 1,
              overflow: isCompact ? 'hidden' : undefined,
              textOverflow: isCompact ? 'ellipsis' : undefined,
              whiteSpace: isCompact ? 'nowrap' : undefined,
              wordBreak: 'break-word',
            }}
          >
            {parseInlineMarkdown(itemText, options, `ol-${i}`)}
          </span>
        </div>
      );
      continue;
    }

    // Regular line / paragraph
    elements.push(
      <div
        key={`p-${i}`}
        style={{
          margin: isCompact ? '0.5px 0' : '2px 0',
          fontSize: isCompact ? '7.5px' : '12.5px',
          lineHeight: isCompact ? 1.15 : 1.45,
          color: textColor,
          overflow: isCompact ? 'hidden' : undefined,
          textOverflow: isCompact ? 'ellipsis' : undefined,
          whiteSpace: isCompact ? 'nowrap' : 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {parseInlineMarkdown(rawLine, options, `p-${i}`)}
      </div>
    );
  }

  // Handle unclosed code block if any
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre
        key="code-block-unclosed"
        style={{
          margin: isCompact ? '1px 0' : '4px 0',
          padding: isCompact ? '2px 4px' : '6px 8px',
          backgroundColor: options.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)',
          borderRadius: isCompact ? '3px' : '6px',
          overflowX: 'auto',
          fontFamily: 'ui-monospace, monospace',
          fontSize: isCompact ? '6.5px' : '11px',
        }}
      >
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return <>{elements}</>;
}
