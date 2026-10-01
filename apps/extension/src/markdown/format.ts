/**
 * Pure helpers for turning an extracted page into a downloadable Markdown document.
 */

const MAX_SLUG_LENGTH = 80;
const FALLBACK_SLUG = 'page';

export interface DocumentMeta {
  title: string;
  url: string;
  date: string;
}

export function isExportableUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export function isYouTubeWatchUrl(url: string): boolean {
  return /^https?:\/\/(www\.|m\.)?youtube\.com\/watch/i.test(url);
}

/** Prefer the extractor's title, then the document title. */
export function pickTitle(extractorTitle: string | undefined, documentTitle: string | undefined): string {
  return extractorTitle?.trim() || documentTitle?.trim() || '';
}

export function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || FALLBACK_SLUG;
}

export function buildFileName(title: string): string {
  return `${slugifyTitle(title)}.md`;
}

export function buildMarkdownDocument(meta: DocumentMeta, body: string): string {
  const title = meta.title.trim();
  const trimmedBody = body.trim();
  const frontMatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `url: ${JSON.stringify(meta.url)}`,
    `date: ${JSON.stringify(meta.date)}`,
    '---',
  ].join('\n');

  const heading = `# ${title}`;
  const firstLine = trimmedBody.split('\n', 1)[0]?.trim();
  const needsHeading = title !== '' && firstLine !== heading;

  const parts = [frontMatter];
  if (needsHeading) parts.push(heading);
  if (trimmedBody) parts.push(trimmedBody);
  return `${parts.join('\n\n')}\n`;
}
