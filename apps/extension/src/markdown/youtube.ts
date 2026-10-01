import type { ExtractedPage } from './types';

const SHORT_WAIT_MS = 3000;

const TRANSCRIPT_BUTTON_SELECTOR =
  'ytd-video-description-transcript-section-renderer button[aria-label*="transcript" i], ' +
  'button[aria-label*="Show transcript" i]';
const TRANSCRIPT_PANEL_SELECTOR =
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';

const UI_NOISE_LINES = new Set([
  'Show less',
  'Show more',
  '...more',
  '…...more',
  'Learn more',
  'Transcript',
  'Show transcript',
  'Follow along using the transcript.',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForElement(doc: Document, selector: string, timeout: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = doc.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const found = doc.querySelector(selector);
      if (found) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function cleanDescription(raw: string): string {
  const seen = new Set<string>();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || UI_NOISE_LINES.has(line)) return false;
      if (/^\d[\d,]*\s+views/.test(line)) return false;
      if (/^\d+\s+products?$/.test(line)) return false;
      if (/^\d+\.?\d*[KMB]?\s+subscribers?$/.test(line)) return false;
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

async function readDescription(doc: Document): Promise<string> {
  const container = doc.querySelector('ytd-watch-metadata #description');
  if (!container) return '';
  const expand = container.querySelector<HTMLElement>('tp-yt-paper-button#expand');
  if (expand) {
    expand.click();
    await sleep(300);
  }
  return cleanDescription(container.textContent?.trim() ?? '');
}

/** Returns the transcript as a `- timestamp: text` list, or '' when unavailable. */
async function readTranscript(doc: Document): Promise<string> {
  const subtitlesButton = await waitForElement(doc, '.ytp-subtitles-button', SHORT_WAIT_MS);
  if (!subtitlesButton || subtitlesButton.getAttribute('title')?.toLowerCase().includes('unavailable')) {
    return '';
  }

  const expand = doc.querySelector<HTMLElement>('ytd-watch-metadata tp-yt-paper-button#expand');
  if (expand) {
    expand.click();
    await sleep(500);
  }

  const button = (await waitForElement(doc, TRANSCRIPT_BUTTON_SELECTOR, SHORT_WAIT_MS)) as HTMLElement | null;
  if (!button) return '';
  button.click();
  await sleep(800);

  const panel = await waitForElement(doc, TRANSCRIPT_PANEL_SELECTOR, SHORT_WAIT_MS);
  const list = panel?.querySelector('#segments-container');
  if (!list) return '';

  // Scroll to trigger lazy-loaded segments.
  await sleep(500);
  list.scrollTop = list.scrollHeight;
  await sleep(500);
  list.scrollTop = 0;
  await sleep(300);

  return Array.from(list.querySelectorAll('ytd-transcript-segment-renderer'))
    .map((segment) => {
      const timestamp = segment.querySelector('.segment-timestamp')?.textContent?.trim();
      const text = segment.querySelector('.segment-text')?.textContent?.trim();
      return timestamp && text ? `- ${timestamp}: ${text}` : null;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Returns null when the page doesn't look like a loaded watch page. */
export async function extractYouTube(doc: Document): Promise<ExtractedPage | null> {
  const title =
    doc.querySelector('ytd-watch-metadata #title')?.textContent?.trim() ||
    doc.querySelector('h1.title')?.textContent?.trim() ||
    '';
  if (!title) return null;

  const channel = doc.querySelector('ytd-channel-name yt-formatted-string')?.textContent?.trim() ?? '';

  let description = '';
  try {
    description = await readDescription(doc);
  } catch (err) {
    console.warn('[markdown] YouTube description failed:', err);
  }

  let transcript = '';
  try {
    transcript = await readTranscript(doc);
  } catch (err) {
    console.warn('[markdown] YouTube transcript failed:', err);
  }

  const sections: string[] = [];
  if (channel) sections.push(`**Channel:** ${channel}`);
  if (description) sections.push(`## Description\n\n${description}`);
  if (transcript) sections.push(`## Transcript\n\n${transcript}`);
  return { title, markdown: sections.join('\n\n') };
}
