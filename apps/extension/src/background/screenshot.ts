import browser from 'webextension-polyfill';

/**
 * Screenshot management for Arcable extension.
 * Supports visible viewport screenshot capture and full-page scrolling capture,
 * saving the image to storage and launching the standalone Arcable Screenshot Editor.
 */

const CAPTURE_MIN_INTERVAL_MS = 550;
const CAPTURE_RATE_LIMIT_MAX_RETRIES = 3;
const CAPTURE_RATE_LIMIT_INITIAL_BACKOFF_MS = 500;
const MAX_CANVAS_DIMENSION_PX = 32000;
const MAX_CANVAS_AREA_PX = 250_000_000;
const HIDDEN_MARKER_ATTR = 'data-arcable-fph-hidden';

import { setActionBadge } from './badge';

export const EDITOR_SCREENSHOT_STORAGE_KEY = 'editorScreenshot';

/**
 * Capture a screenshot of the visible area of the specified tab.
 */
export async function captureTabScreenshot(tabId: number): Promise<string | null> {
  try {
    const tab = await browser.tabs.get(tabId);
    const windowId = tab.windowId;

    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.captureVisibleTab === 'function') {
      return await new Promise<string | null>((resolve) => {
        chrome.tabs.captureVisibleTab(windowId ?? chrome.windows.WINDOW_ID_CURRENT, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            console.warn('[screenshot] captureVisibleTab failed:', chrome.runtime.lastError?.message);
            resolve(null);
          } else {
            resolve(dataUrl);
          }
        });
      });
    }

    // Polyfill fallback
    return await (browser.tabs as any).captureVisibleTab(windowId, { format: 'png' });
  } catch (error) {
    console.warn('[screenshot] Failed to capture tab viewport:', error);
    return null;
  }
}

/**
 * Read page and viewport metrics from the target tab.
 */
async function getPageMetrics(tabId: number): Promise<{
  scrollWidth: number;
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  origScrollX: number;
  origScrollY: number;
}> {
  if (typeof chrome === 'undefined' || !chrome.scripting) {
    throw new Error('Scripting API not available');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0
      ),
      scrollHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      ),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      origScrollX: window.scrollX,
      origScrollY: window.scrollY,
    }),
  });

  const metrics = results?.[0]?.result;
  if (!metrics) {
    throw new Error('Could not read page metrics for this page.');
  }
  return metrics as any;
}

/**
 * Scroll the page to the given coordinates and wait for repainting.
 */
async function scrollAndSettle(tabId: number, x: number, y: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollX: number, scrollY: number) =>
      new Promise<void>((resolve) => {
        window.scrollTo(scrollX, scrollY);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 100);
          });
        });
      }),
    args: [x, y],
  });
}

/**
 * Temporarily hide fixed and sticky elements so they don't repeat on each slice.
 */
async function hideFixedElements(tabId: number, markerAttr: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (attr: string) => {
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const position = getComputedStyle(el).position;
        if (position === 'fixed' || position === 'sticky') {
          el.setAttribute(attr, '1');
          (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
        }
      }
    },
    args: [markerAttr],
  });
}

/**
 * Restore elements hidden by hideFixedElements.
 */
async function restoreFixedElements(tabId: number, markerAttr: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (attr: string) => {
      const hidden = document.querySelectorAll(`[${attr}]`);
      for (const el of hidden) {
        (el as HTMLElement).style.removeProperty('visibility');
        el.removeAttribute(attr);
      }
    },
    args: [markerAttr],
  });
}

/**
 * Capture viewport with rate limiting and exponential backoff.
 */
async function captureViewportWithRateLimit(
  windowId: number,
  rateState: { lastCaptureAt: number }
): Promise<string> {
  const sinceLast = Date.now() - rateState.lastCaptureAt;
  if (sinceLast < CAPTURE_MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_MIN_INTERVAL_MS - sinceLast));
  }

  let backoff = CAPTURE_RATE_LIMIT_INITIAL_BACKOFF_MS;
  for (let attempt = 0; attempt <= CAPTURE_RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (result) => {
          if (chrome.runtime.lastError || !result) {
            reject(new Error(chrome.runtime.lastError?.message || 'Empty capture result'));
          } else {
            resolve(result);
          }
        });
      });
      rateState.lastCaptureAt = Date.now();
      return dataUrl;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND');
      if (!isRateLimit || attempt === CAPTURE_RATE_LIMIT_MAX_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff *= 2;
    }
  }

  throw new Error('Failed to capture viewport after retries.');
}

/**
 * Convert Blob to Base64 data URL.
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  const base64 = btoa(binary);
  return `data:${blob.type || 'image/png'};base64,${base64}`;
}

/**
 * Compute the list of vertical scroll positions needed to tile full height.
 */
function computeTilePositions(scrollHeight: number, viewportHeight: number, devicePixelRatio: number): number[] {
  if (scrollHeight <= viewportHeight) {
    return [0];
  }

  const roundingMargin = Math.ceil(devicePixelRatio >= 1 ? devicePixelRatio : 1 / devicePixelRatio);
  const stepHeight = Math.max(1, viewportHeight - roundingMargin);

  const positions: number[] = [];
  let y = 0;
  while (true) {
    if (y + viewportHeight >= scrollHeight) {
      positions.push(Math.max(0, scrollHeight - viewportHeight));
      break;
    }
    positions.push(y);
    y += stepHeight;
  }
  return positions;
}

/**
 * Capture full-page screenshot by scrolling, capturing tiles, and stitching together.
 */
export async function captureFullPageScreenshot(
  tabId: number,
  onProgress?: (current: number, total: number) => void
): Promise<string | null> {
  const tab = await browser.tabs.get(tabId);
  const windowId = tab.windowId;
  if (windowId === undefined) {
    throw new Error('Tab windowId is undefined');
  }

  const metrics = await getPageMetrics(tabId);
  const { scrollWidth, scrollHeight, viewportWidth, viewportHeight, devicePixelRatio, origScrollX, origScrollY } =
    metrics;

  const dpr = devicePixelRatio || 1;
  const canvasWidth = Math.round(Math.min(scrollWidth, viewportWidth) * dpr);
  const canvasHeight = Math.round(scrollHeight * dpr);

  if (
    canvasWidth > MAX_CANVAS_DIMENSION_PX ||
    canvasHeight > MAX_CANVAS_DIMENSION_PX ||
    canvasWidth * canvasHeight > MAX_CANVAS_AREA_PX
  ) {
    throw new Error('Page is too long to capture as one image.');
  }

  const positions = computeTilePositions(scrollHeight, viewportHeight, dpr);
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get OffscreenCanvas 2D context');
  }

  const rateState = { lastCaptureAt: 0 };
  let fixedElementsHidden = false;

  try {
    for (let i = 0; i < positions.length; i++) {
      const y = positions[i];
      await scrollAndSettle(tabId, origScrollX, y);

      const dataUrl = await captureViewportWithRateLimit(windowId, rateState);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      ctx.drawImage(bitmap, 0, Math.round(y * dpr));
      bitmap.close();

      if (i === 0 && positions.length > 1 && !fixedElementsHidden) {
        await hideFixedElements(tabId, HIDDEN_MARKER_ATTR);
        fixedElementsHidden = true;
      }

      if (typeof onProgress === 'function') {
        onProgress(i + 1, positions.length);
      }
    }
  } finally {
    try {
      if (fixedElementsHidden) {
        await restoreFixedElements(tabId, HIDDEN_MARKER_ATTR);
      }
    } catch (error) {
      console.warn('[screenshot] Failed to restore hidden elements:', error);
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (x: number, y: number) => window.scrollTo(x, y),
        args: [origScrollX, origScrollY],
      });
    } catch (error) {
      console.warn('[screenshot] Failed to restore scroll position:', error);
    }
  }

  const finalBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToDataUrl(finalBlob);
}

/**
 * Handle screenshot capture for either visible viewport or full page,
 * saving the image to storage and opening the screenshot editor tab.
 */
export async function handleScreenshotCapture(tabId: number, mode: 'viewport' | 'fullpage' = 'viewport'): Promise<boolean> {
  try {
    let dataUrl: string | null = null;

    if (mode === 'fullpage') {
      setActionBadge('⏳', '#f59e0b', 0);
      dataUrl = await captureFullPageScreenshot(tabId, (current, total) => {
        setActionBadge(`${Math.round((current / total) * 100)}%`, '#3b82f6', 0);
      });
      setActionBadge('✓', '#10b981', 1500);
    } else {
      setActionBadge('📸', '#3b82f6', 1500);
      dataUrl = await captureTabScreenshot(tabId);
    }

    if (!dataUrl) {
      setActionBadge('❌', '#ef4444', 2000);
      return false;
    }

    await browser.storage.local.set({ [EDITOR_SCREENSHOT_STORAGE_KEY]: dataUrl });
    await browser.tabs.create({ url: 'editor/index.html' });
    return true;
  } catch (error) {
    console.warn('[screenshot] Capture failed:', error);
    setActionBadge('❌', '#ef4444', 2000);
    return false;
  }
}
