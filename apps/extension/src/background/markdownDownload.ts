import browser from 'webextension-polyfill';
import { buildFileName, buildMarkdownDocument, isExportableUrl } from '../markdown/format';
import type { ExtractedPage } from '../markdown/types';
import { setMarkdownFailureBadge, setMarkdownSuccessBadge } from './badge';

export const DOWNLOAD_MARKDOWN_MENU_ID = 'arcable_download_markdown';

const EXTRACTOR_FILE = 'markdown-extractor.js';

/**
 * Runs in the page: save `content` as `fileName` via a temporary Blob link.
 * Must stay self-contained, as it is serialized into the tab.
 */
function downloadTextFile(fileName: string, content: string): boolean {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Runs in the page, after the extractor bundle has registered its global. */
async function runExtractor(): Promise<ExtractedPage | null> {
  const extract = (window as unknown as { __arcableExtractMarkdown?: () => Promise<ExtractedPage | null> })
    .__arcableExtractMarkdown;
  return extract ? extract() : null;
}

export async function handleMarkdownDownload(tabId: number): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.scripting) {
      throw new Error('Scripting API not available');
    }
    const tab = await browser.tabs.get(tabId);
    if (!isExportableUrl(tab.url)) {
      setMarkdownFailureBadge();
      return;
    }

    const target = { tabId };
    await chrome.scripting.executeScript({ target, files: [EXTRACTOR_FILE] });
    const [extraction] = await chrome.scripting.executeScript({ target, func: runExtractor });
    const page = extraction?.result as ExtractedPage | null | undefined;
    if (!page) {
      setMarkdownFailureBadge();
      return;
    }

    const content = buildMarkdownDocument(
      { title: page.title, url: tab.url, date: new Date().toISOString() },
      page.markdown
    );
    await chrome.scripting.executeScript({
      target,
      func: downloadTextFile,
      args: [buildFileName(page.title), content],
    });
    setMarkdownSuccessBadge();
  } catch (err) {
    console.warn('[markdownDownload] Failed to download page as Markdown:', err);
    setMarkdownFailureBadge();
  }
}
