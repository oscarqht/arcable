import browser from 'webextension-polyfill';
import type { SwitcherAction } from '../tabSwitcher/session';

const FOCUS_RETRY_MS = 100;
const FOCUS_TIMEOUT_MS = 5000;
let windowIdPromise: Promise<number | undefined> | undefined;
let focusTimer: ReturnType<typeof setInterval> | undefined;
let switcherSequence = false;

function getWindowId(): Promise<number | undefined> {
  windowIdPromise ??= browser.windows.getCurrent().then(win => win.id).catch(() => undefined);
  return windowIdPromise;
}

// The search input may still be hydrating, so retry until it acknowledges the event.
function focusSearch(): void {
  clearInterval(focusTimer);
  const deadline = Date.now() + FOCUS_TIMEOUT_MS;
  const attempt = () => {
    const handled = !window.dispatchEvent(new Event('arcable:focus-search', { cancelable: true }));
    if (handled || Date.now() > deadline) clearInterval(focusTimer);
  };
  focusTimer = setInterval(attempt, FOCUS_RETRY_MS);
  attempt();
}

function sendSwitcherKey(action: SwitcherAction): void {
  void getWindowId().then(windowId => {
    if (windowId === undefined) return;
    return browser.runtime.sendMessage({ type: 'ARCABLE_TAB_SWITCHER_PANEL_KEY', action, windowId });
  }).catch(() => {});
}

// Lets the background know this panel is open (and whether it has focus) without an async
// query, which would expire the Alt+F command's user gesture. Reconnects after worker restarts.
function connectPresence(): void {
  void getWindowId().then(windowId => {
    if (windowId === undefined) return;
    const port = browser.runtime.connect({ name: 'arcable-sidepanel' });
    const report = () => {
      try { port.postMessage({ windowId, focused: document.hasFocus() }); } catch { /* reconnecting */ }
    };
    window.addEventListener('focus', report);
    window.addEventListener('blur', report);
    port.onDisconnect.addListener(() => {
      window.removeEventListener('focus', report);
      window.removeEventListener('blur', report);
      setTimeout(connectPresence, 500);
    });
    report();
  });
}

export function initSidepanelShortcuts(): void {
  connectPresence();

  browser.runtime.onMessage.addListener((message: unknown) => {
    const input = message as { type?: string; windowId?: number };
    if (input?.type !== 'ARCABLE_FOCUS_SIDEPANEL_SEARCH') return undefined;
    void getWindowId().then(windowId => {
      if (input.windowId === undefined || windowId === undefined || input.windowId === windowId) focusSearch();
    });
    return undefined;
  });

  // Alt+F may have opened this panel before the listener above existed.
  void getWindowId().then(windowId =>
    browser.runtime.sendMessage({ type: 'ARCABLE_CONSUME_SIDEPANEL_SEARCH_FOCUS', windowId }),
  ).then(response => {
    if ((response as { success?: boolean } | undefined)?.success) focusSearch();
  }).catch(() => {});

  // Mirrors content/tab-switcher.ts: the overlay lives in the active tab while keys arrive here.
  window.addEventListener('keydown', event => {
    if (!event.isTrusted) return;
    // code remains KeyT on macOS, where Option+T produces a different character.
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing && event.code === 'KeyT') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) {
        switcherSequence = true;
        sendSwitcherKey(event.shiftKey ? 'previous' : 'next');
      }
    } else if (switcherSequence && ['Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { switcherSequence = false; sendSwitcherKey('cancel'); }
      else if (event.key === 'Enter') { switcherSequence = false; sendSwitcherKey('commit'); }
      else sendSwitcherKey(event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey) ? 'previous' : 'next');
    }
  }, true);

  window.addEventListener('keyup', event => {
    if (!event.isTrusted || event.key !== 'Alt' || !switcherSequence) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    switcherSequence = false;
    sendSwitcherKey('commit');
  }, true);

  // Leaving the panel (e.g. clicking a card in the page) hands the sequence to the tab itself.
  window.addEventListener('blur', () => { switcherSequence = false; });
}
