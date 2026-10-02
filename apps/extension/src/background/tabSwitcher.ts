import browser from 'webextension-polyfill';

export interface SwitcherTab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  thumbnail?: string;
}
export type TabSwitcherResponse = { tabs: SwitcherTab[] } | { success: boolean };

const PREVIEW_SESSION_KEY = 'arcable_tab_switcher_previews_v1';
const MAX_PREVIEWS = 40;
const MAX_PREVIEW_BYTES = 2_000_000;
const previews = new Map<number, { url: string; image: string }>();
const activity = new Map<number, number>();
const visible = new Set<number>();
const keyQueues = new Map<number, Promise<TabSwitcherResponse>>();
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let captureGeneration = 0;
let capturing = false;
let lastCaptureAt = 0;
let lastActivationAt = 0;
let restorePromise: Promise<void> | undefined;
let restored = false;
const changedDuringRestore = new Set<number>();
let persistQueue = Promise.resolve();

function trimPreviews(): void {
  let bytes = [...previews.values()].reduce((sum, preview) => sum + preview.image.length * 2, 0);
  while (previews.size > MAX_PREVIEWS || bytes > MAX_PREVIEW_BYTES) {
    const oldest = previews.entries().next().value;
    if (!oldest) break;
    bytes -= oldest[1].image.length * 2;
    previews.delete(oldest[0]);
  }
}

function restorePreviews(): Promise<void> {
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    const session = browser.storage?.session;
    if (!session) return;
    const stored = await session.get(PREVIEW_SESSION_KEY);
    const entries = stored[PREVIEW_SESSION_KEY];
    if (!Array.isArray(entries)) return;
    const liveTabs = await browser.tabs.query({});
    const current = new Map(previews);
    // Restored entries precede fresh captures in eviction order. A navigation or
    // removal observed while storage was loading must never resurrect an image.
    for (const entry of entries.slice(-MAX_PREVIEWS)) {
      if (!entry || !Number.isInteger(entry.id) || typeof entry.url !== 'string' ||
          typeof entry.image !== 'string' || !entry.image.startsWith('data:image/jpeg;base64,') ||
          entry.image.length * 2 > MAX_PREVIEW_BYTES || changedDuringRestore.has(entry.id)) continue;
      if (liveTabs.some(tab => tab.id === entry.id && tab.url === entry.url)) {
        previews.set(entry.id, { url: entry.url, image: entry.image });
      }
    }
    for (const [id, preview] of current) { previews.delete(id); previews.set(id, preview); }
    trimPreviews();
  })().catch(() => {
    // Session storage is optional; Firefox background pages retain the memory cache.
  }).finally(() => { restored = true; changedDuringRestore.clear(); });
  return restorePromise;
}

function persistPreviews(): void {
  if (!browser.storage?.session) return;
  persistQueue = persistQueue.then(async () => {
    await restorePreviews();
    await browser.storage.session.set({
      [PREVIEW_SESSION_KEY]: [...previews].map(([id, preview]) => ({ id, ...preview })),
    });
  }).catch(() => {});
}

function deletePreview(id: number): void {
  if (!restored) changedDuringRestore.add(id);
  previews.delete(id);
  persistPreviews();
}

function invalidateCapture(): void {
  captureGeneration++;
  clearTimeout(captureTimer);
}

function storePreview(id: number, url: string, image: string): void {
  if (!restored) changedDuringRestore.add(id);
  previews.delete(id);
  previews.set(id, { url, image });
  trimPreviews();
  persistPreviews();
}

async function shrinkPreview(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, 320 / bitmap.width, 200 / bitmap.height);
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const small = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.55 });
      const bytes = new Uint8Array(await small.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:image/jpeg;base64,${btoa(binary)}`;
    } finally {
      bitmap.close();
    }
  }
  // Firefox's persistent background page also supports ordinary DOM canvases.
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, 320 / image.naturalWidth, 200 / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.55);
}

function scheduleCapture(tabId: number, windowId: number): void {
  invalidateCapture();
  const generation = captureGeneration;
  captureTimer = setTimeout(() => {
    void (async () => {
      if (capturing || generation !== captureGeneration || visible.has(tabId)) return;
      capturing = true;
      try {
        const tab = await browser.tabs.get(tabId);
        const window = await browser.windows.get(windowId);
        if (!tab.active || !window.focused || !/^https?:\/\//i.test(tab.url || '') || visible.has(tabId) || generation !== captureGeneration) return;
        lastCaptureAt = Date.now();
        const full = await browser.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 });
        const small = await shrinkPreview(full);
        const current = await browser.tabs.get(tabId);
        if (generation !== captureGeneration || visible.has(tabId) || !current.active || current.url !== tab.url) return;
        storePreview(tabId, tab.url!, small);
      } catch {
        // Restricted pages, missing capture permission, or a closed tab use the favicon.
      } finally {
        capturing = false;
      }
    })();
  }, Math.max(800, 1100 - (Date.now() - lastCaptureAt)));
}

export function initTabSwitcherBackground(): void {
  void restorePreviews();
  browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
    // Preserve event order even when two activations share the same millisecond.
    lastActivationAt = Math.max(Date.now(), lastActivationAt + 1);
    activity.set(tabId, lastActivationAt);
    // Switching away dismisses the old content overlay, including when it cannot message us.
    visible.clear();
    scheduleCapture(tabId, windowId);
  });
  browser.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.url) {
      deletePreview(id);
      visible.delete(id);
      invalidateCapture();
    }
    if (tab.active && tab.windowId !== undefined && change.status === 'complete') scheduleCapture(id, tab.windowId);
  });
  browser.tabs.onRemoved.addListener((id) => {
    deletePreview(id);
    activity.delete(id);
    visible.delete(id);
  });
  browser.windows.onFocusChanged.addListener((windowId) => {
    invalidateCapture();
    if (windowId < 0) return;
    void browser.tabs.query({ active: true, windowId }).then(([tab]) => {
      if (tab?.id !== undefined) scheduleCapture(tab.id, windowId);
    }).catch(() => {});
  });
  void browser.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
    if (tab?.id !== undefined && tab.windowId !== undefined) scheduleCapture(tab.id, tab.windowId);
  }).catch(() => {});
}

/** Undefined means this message belongs to another background handler. */
export function handleTabSwitcherMessage(message: any, sender: browser.Runtime.MessageSender): Promise<TabSwitcherResponse> | undefined {
  if (!['ARCABLE_TAB_SWITCHER_LIST', 'ARCABLE_TAB_SWITCHER_ACTIVATE', 'ARCABLE_TAB_SWITCHER_VISIBILITY', 'ARCABLE_TAB_SWITCHER_KEY'].includes(message?.type)) return undefined;
  const source = sender.tab;
  if (source?.id === undefined || source.windowId === undefined) return Promise.resolve({ success: false });
  const sourceId = source.id;
  const sourceWindowId = source.windowId;
  if (message.type === 'ARCABLE_TAB_SWITCHER_LIST' || (message.type === 'ARCABLE_TAB_SWITCHER_VISIBILITY' && message.open === true)) {
    visible.add(sourceId);
    invalidateCapture();
  }
  if (message.type === 'ARCABLE_TAB_SWITCHER_VISIBILITY') {
    if (message.open === false) {
      visible.delete(sourceId);
      scheduleCapture(sourceId, sourceWindowId);
    }
    return Promise.resolve({ success: true });
  }
  const requestGeneration = captureGeneration;
  const clearFailedList = () => {
    if (message.type === 'ARCABLE_TAB_SWITCHER_LIST' && requestGeneration === captureGeneration) visible.delete(sourceId);
  };
  const run = async (): Promise<TabSwitcherResponse> => {
    try {
      if (message.type === 'ARCABLE_TAB_SWITCHER_LIST') await restorePreviews();
      const tabs = await browser.tabs.query({ windowId: sourceWindowId });
      if (!tabs.some((tab) => tab.id === sourceId && tab.active)) {
        clearFailedList();
        return { success: false };
      }
      if (message.type === 'ARCABLE_TAB_SWITCHER_KEY') {
        if (!['next', 'previous', 'commit', 'cancel'].includes(message.action)) return { success: false };
        await browser.tabs.sendMessage(sourceId, message, { frameId: 0 });
        return { success: true };
      }
      if (message.type === 'ARCABLE_TAB_SWITCHER_ACTIVATE') {
        if (!Number.isInteger(message.tabId) || !tabs.some((tab) => tab.id === message.tabId)) return { success: false };
        await browser.tabs.update(message.tabId, { active: true });
        return { success: true };
      }
      const recent = tabs.filter((tab) => tab.id !== undefined).sort((a, b) => {
        if (a.id === sourceId) return -1;
        if (b.id === sourceId) return 1;
        return Math.max(activity.get(b.id!) || 0, b.lastAccessed || 0) - Math.max(activity.get(a.id!) || 0, a.lastAccessed || 0);
      }).slice(0, 5);
      return { tabs: recent.map((tab) => ({
        id: tab.id!,
        title: tab.title || tab.url || 'Untitled tab',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        thumbnail: previews.get(tab.id!)?.url === tab.url ? previews.get(tab.id!)?.image : undefined,
      })) };
    } catch {
      clearFailedList();
      return { success: false };
    }
  };
  if (message.type !== 'ARCABLE_TAB_SWITCHER_KEY') return run();
  // A quick iframe Alt release must not overtake its opening key while the
  // worker queries tabs or delivers the message to the top frame.
  const queued = (keyQueues.get(sourceId) || Promise.resolve()).then(run);
  keyQueues.set(sourceId, queued);
  void queued.then(() => { if (keyQueues.get(sourceId) === queued) keyQueues.delete(sourceId); });
  return queued;
}

