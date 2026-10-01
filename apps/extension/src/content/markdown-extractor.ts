import { extractPage } from '../markdown/extract';

/**
 * Injected on demand by the background (see background/markdownDownload.ts).
 * Registers a global the background then calls via a second executeScript.
 */
(window as unknown as { __arcableExtractMarkdown?: typeof extractPage }).__arcableExtractMarkdown = extractPage;
