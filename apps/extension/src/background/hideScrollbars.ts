import browser from 'webextension-polyfill';

export const STORAGE_KEY_HIDE_SCROLLBARS = 'arcable_hide_all_scrollbars';

// Only change scrollbar presentation; leave overflow and input handling intact.
export const HIDE_SCROLLBARS_CSS = `
  * { scrollbar-width: none !important; }
  *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
`;

// Serialize updates so a quick on/off toggle cannot leave an older injection behind.
let pendingUpdate = Promise.resolve();
export function applyHideScrollbars(target: browser.Scripting.InjectionTarget): Promise<void> {
  pendingUpdate = pendingUpdate.then(async () => {
    const stored = await browser.storage.local.get(STORAGE_KEY_HIDE_SCROLLBARS);
    const details = { target, css: HIDE_SCROLLBARS_CSS, origin: 'USER' as const };
    // Remove first to avoid accumulating duplicate styles on startup or frame requests.
    await browser.scripting.removeCSS(details);
    if (stored[STORAGE_KEY_HIDE_SCROLLBARS] === true) {
      await browser.scripting.insertCSS(details);
    }
  }).catch(() => {
    // Browser-protected pages, revoked site access, or frames/tabs closed during injection.
  });
  return pendingUpdate;
}

// A registered CSS content script is applied by the browser before first paint. Injecting from
// the background after a message round trip lets scrollbars render briefly and shifts the layout.
const REGISTERED_SCRIPT_ID = 'arcable-hide-scrollbars-css';
let pendingRegistration = Promise.resolve();
function syncRegisteredCss(): Promise<void> {
  pendingRegistration = pendingRegistration.then(async () => {
    const stored = await browser.storage.local.get(STORAGE_KEY_HIDE_SCROLLBARS);
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [REGISTERED_SCRIPT_ID] });
    const enabled = stored[STORAGE_KEY_HIDE_SCROLLBARS] === true;
    if (!enabled && existing.length > 0) {
      await browser.scripting.unregisterContentScripts({ ids: [REGISTERED_SCRIPT_ID] });
    } else if (enabled && existing.length === 0) {
      await browser.scripting.registerContentScripts([{
        id: REGISTERED_SCRIPT_ID,
        matches: ['<all_urls>'],
        css: ['hide-scrollbars.css'],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: true,
      }]);
    }
  }).catch(console.warn);
  return pendingRegistration;
}

export function initHideScrollbarsBackground(): void {
  void syncRegisteredCss();
  const updateOpenTabs = async () => {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.flatMap(tab => tab.id === undefined ? [] : [
      applyHideScrollbars({ tabId: tab.id, allFrames: true }),
    ]));
  };
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY_HIDE_SCROLLBARS]) {
      void syncRegisteredCss();
      void updateOpenTabs().catch(console.warn);
    }
  });
  // Also style pages already open when the extension starts or reloads.
  void updateOpenTabs().catch(console.warn);
}
