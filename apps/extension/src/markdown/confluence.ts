import TurndownService from 'turndown';
import { createTurndownService } from './turndown';
import type { ExtractedPage } from './types';

const CONTENT_SELECTORS = ['#main-content', '.wiki-content', '.confluence-content'];
const TITLE_SELECTORS = ['h1.pageTitle', '#title-text', 'h1.pagetitle'];
const NOISE_SELECTORS = [
  '.comment-threads',
  '.page-metadata',
  '.hidden',
  '.confluence-information-macro-footer',
  '.aui-sidebar',
  '.ia-splitter-handle',
  '.ia-fixed-sidebar',
  '.acs-side-bar',
];
const CODE_BLOCK_CLASSES = ['code-block', 'codeContent', 'syntaxhighlighter'];

function findContentRoot(doc: Document): Element | null {
  for (const selector of CONTENT_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function findTitle(doc: Document): string {
  for (const selector of TITLE_SELECTORS) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function cellText(cell: Element): string {
  return (cell.textContent?.trim() ?? '').replace(/\|/g, '\\|');
}

function tableToMarkdown(table: HTMLTableElement): string {
  if (table.parentElement?.closest('div[data-testid="sticky-table-fixed"]')) return '';

  const rows = Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
  const cellsOf = (row: Element) => Array.from(row.children).filter((c) => c.matches('th, td'));
  const matrix = rows.map(cellsOf).filter((cells) => cells.length > 0);
  if (matrix.length === 0) return '';

  const columnCount = Math.max(...matrix.map((cells) => cells.length));
  const pad = (cells: Element[]) =>
    Array.from({ length: columnCount }, (_, i) => (cells[i] ? cellText(cells[i]) : ''));

  const hasHeader = matrix[0].every((cell) => cell.tagName === 'TH');
  const header = hasHeader ? pad(matrix[0]) : Array(columnCount).fill('');
  const body = (hasHeader ? matrix.slice(1) : matrix).map(pad);

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${Array(columnCount).fill(':--').join(' | ')} |`,
    ...body.map((cells) => `| ${cells.join(' | ')} |`),
  ];
  return `\n${lines.join('\n')}\n\n`;
}

function createConfluenceTurndownService(): TurndownService {
  const service = createTurndownService();

  service.addRule('confluenceTable', {
    filter: 'table',
    replacement: (_content, node) => tableToMarkdown(node as HTMLTableElement),
  });

  service.addRule('confluenceCodeBlock', {
    filter: (node) =>
      node.nodeName === 'DIV' && CODE_BLOCK_CLASSES.some((cls) => (node as Element).classList.contains(cls)),
    replacement: (_content, node) => {
      const container = node as Element;
      const code = (container.querySelector('pre') ?? container).textContent ?? '';
      const language = container.getAttribute('data-language') ?? '';
      return `\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n\n`;
    },
  });

  service.addRule('confluenceImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const emoji = img.getAttribute('data-emoji-text');
      if (emoji) return emoji;
      const src = img.src || img.getAttribute('src') || '';
      return src ? `![${img.getAttribute('alt') ?? ''}](${src})` : '';
    },
  });

  return service;
}

/** Returns null when the page has no Confluence content root. */
export function extractConfluence(doc: Document): ExtractedPage | null {
  const root = findContentRoot(doc);
  if (!root) return null;

  const clone = root.cloneNode(true) as Element;
  NOISE_SELECTORS.forEach((selector) => clone.querySelectorAll(selector).forEach((el) => el.remove()));

  const markdown = createConfluenceTurndownService().turndown(clone as unknown as TurndownService.Node).trim();
  return markdown ? { title: findTitle(doc), markdown } : null;
}
