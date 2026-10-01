import { Readability } from '@mozilla/readability';
import { createTurndownService } from './turndown';
import type { ExtractedPage } from './types';

const BODY_FALLBACK_STRIP_SELECTOR =
  'script, style, noscript, iframe, svg, canvas, img, video, ' +
  'header, footer, nav, aside, [hidden], [aria-hidden="true"]';

function dropEmptyParagraphs(service: ReturnType<typeof createTurndownService>): void {
  service.addRule('dropEmptyParagraph', {
    filter: (node) => node.nodeName === 'P' && !node.textContent?.trim() && !node.querySelector('img'),
    replacement: () => '',
  });
}

/** Readability on a cloned document, falling back to a cleaned `<body>` clone. */
export function extractGeneric(doc: Document): ExtractedPage | null {
  let html = '';
  let title = '';

  try {
    const article = new Readability(doc.cloneNode(true) as Document).parse();
    if (article?.content) {
      html = article.content;
      title = article.title?.trim() ?? '';
    }
  } catch (err) {
    console.warn('[markdown] Readability failed, falling back to body:', err);
  }

  if (!html && doc.body) {
    const bodyClone = doc.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelectorAll(BODY_FALLBACK_STRIP_SELECTOR).forEach((el) => el.remove());
    html = bodyClone.innerHTML;
  }
  if (!html) return null;

  const service = createTurndownService();
  dropEmptyParagraphs(service);
  const markdown = service.turndown(html).trim();
  return markdown ? { title, markdown } : null;
}
