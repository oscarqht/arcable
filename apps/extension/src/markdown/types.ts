export interface ExtractedPage {
  /** Page title as determined by the extractor; empty when unknown. */
  title: string;
  /** Markdown body, without front matter or the top-level title heading. */
  markdown: string;
}
