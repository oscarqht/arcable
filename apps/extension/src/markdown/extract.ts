import { extractConfluence } from './confluence';
import { isYouTubeWatchUrl, pickTitle } from './format';
import { extractGeneric } from './generic';
import type { ExtractedPage } from './types';
import { extractYouTube } from './youtube';

/**
 * Pick a site-specific extractor, falling back to the generic one when it
 * returns nothing or throws. Returns null only if the generic extractor fails too.
 */
export async function extractPage(doc: Document = document): Promise<ExtractedPage | null> {
  let page: ExtractedPage | null = null;
  try {
    page = isYouTubeWatchUrl(doc.location.href) ? await extractYouTube(doc) : extractConfluence(doc);
  } catch (err) {
    console.warn('[markdown] Site extractor failed, falling back to generic:', err);
  }

  if (!page) {
    try {
      page = extractGeneric(doc);
    } catch (err) {
      console.error('[markdown] Generic extraction failed:', err);
      return null;
    }
  }
  if (!page) return null;

  return { title: pickTitle(page.title, doc.title), markdown: page.markdown };
}
