import browser from 'webextension-polyfill';
import { SwitcherSession, type SwitcherAction, type SwitcherTab } from '../tabSwitcher/session';

const isTopFrame = window === window.top;
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let previousFocus: Element | null = null;
let frameSequence = false;

const styles = `
  :host { all: initial; color-scheme: dark; }
  * { box-sizing: border-box; }
  .panel { width: min(1060px, calc(100vw - 40px)); padding: 20px;
    color: #f3f4f6; background: #181b22; border: 1px solid #3b404d; border-radius: 18px;
    box-shadow: 0 24px 80px #0008; font: 13px/1.4 system-ui, sans-serif; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  strong { font-size: 14px; font-weight: 600; }
  .hint { color: #a6adbd; font-size: 12px; }
  .tabs { display: grid; grid-template-columns: repeat(var(--count), minmax(0, 1fr)); gap: 10px; }
  button { appearance: none; min-width: 0; text-align: left; font: inherit; color: inherit;
    border: 2px solid transparent; border-radius: 11px; padding: 6px; background: #242832; cursor: pointer; }
  button[aria-selected="true"] { border-color: #a79bff; background: #39334f; }
  button:hover { background: #343a48; }
  button:focus-visible { outline: 2px solid #c4bcff; outline-offset: 2px; }
  .preview { aspect-ratio: 8 / 5; overflow: hidden; border-radius: 6px; background: #11141b;
    display: flex; align-items: center; justify-content: center; color: #8b94a8; font-size: 30px; }
  .preview img { width: 100%; height: 100%; object-fit: contain; }
  .preview img.preview-favicon { width: 36px; height: 36px; object-fit: contain; }
  .title-row { display: flex; align-items: center; gap: 6px; margin-top: 9px; min-width: 0; }
  .favicon-box { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .favicon-box img.favicon { width: 16px; height: 16px; object-fit: contain; border-radius: 3px; }
  .favicon-fallback { width: 16px; height: 16px; border-radius: 3px; background: #2f3441;
    display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #a6adbd; line-height: 1; text-transform: uppercase; }
  .favicon-fallback svg { width: 14px; height: 14px; stroke: #a6adbd; }
  .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
  .url { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .url { color: #a6adbd; font-size: 11px; margin-top: 3px; }
  .badge { height: 17px; color: #bbb3ff; font-size: 10px; margin-top: 7px; }
  .loading { color: #a6adbd; padding: 30px 0; text-align: center; }
  @media (max-width: 600px) { .panel { padding: 12px; width: calc(100vw - 20px); }
    .tabs { gap: 5px; } button { padding: 3px; } .hint { font-size: 10px; } }
`;

function getDomain(urlStr?: string): string {
  if (!urlStr || !/^https?:\/\//i.test(urlStr)) return '';
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function createGlobeIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');

  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', '2');
  line.setAttribute('y1', '12');
  line.setAttribute('x2', '22');
  line.setAttribute('y2', '12');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z');

  svg.append(circle, line, path);
  return svg;
}

function renderFavicon(wrapper: HTMLElement, tab: SwitcherTab): void {
  const domain = getDomain(tab.url);
  const letter = (domain || tab.title || tab.url || '?').slice(0, 1).toUpperCase();

  const showFallback = () => {
    wrapper.replaceChildren();
    const fallback = document.createElement('div');
    fallback.className = 'favicon-fallback';
    if (letter && letter !== '?') {
      fallback.textContent = letter;
    } else {
      fallback.append(createGlobeIcon());
    }
    wrapper.append(fallback);
  };

  const candidateUrls: string[] = [];
  if (tab.favIconUrl) {
    candidateUrls.push(tab.favIconUrl);
  }
  if (/^https?:\/\//i.test(tab.url || '')) {
    try {
      const originFavicon = `${new URL(tab.url).origin}/favicon.ico`;
      if (!candidateUrls.includes(originFavicon)) {
        candidateUrls.push(originFavicon);
      }
    } catch {
      // Ignore invalid URL
    }
  }

  if (candidateUrls.length === 0) {
    showFallback();
    return;
  }

  let index = 0;
  const img = document.createElement('img');
  img.className = 'favicon';
  img.alt = '';

  const tryNext = () => {
    if (index < candidateUrls.length) {
      img.src = candidateUrls[index++];
    } else {
      img.remove();
      showFallback();
    }
  };

  img.onerror = tryNext;
  tryNext();
  wrapper.append(img);
}

function closeOverlay(): void {
  host?.remove();
  host = null;
  shadow = null;
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected && document.hasFocus()) {
    previousFocus.focus({ preventScroll: true });
  }
  previousFocus = null;
}

function render(tabs: SwitcherTab[], selected: number): void {
  if (!host) {
    previousFocus = document.activeElement;
    host = document.createElement('div');
    host.id = 'arcable-tab-switcher';
    // Inline !important shields the host from page CSS; the cards live in an isolated shadow tree.
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;';
    host.tabIndex = -1;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Recent tabs');
    shadow = host.attachShadow({ mode: 'closed' });
    host.addEventListener('pointerdown', event => {
      if (event.composedPath()[0] === host) session.cancel();
    });
    (document.body || document.documentElement).append(host);
    // A manual popover participates in the top layer, above page dialogs and fullscreen content.
    if (typeof host.showPopover === 'function') {
      host.setAttribute('popover', 'manual');
      try { host.showPopover(); } catch { /* fixed overlay remains usable */ }
    }
    host.focus({ preventScroll: true });
  }
  if (!shadow) return;
  shadow.replaceChildren();
  const style = document.createElement('style');
  style.textContent = styles;
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = 'Recent tabs';
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = 'Alt + T to cycle · Release Alt to switch · Esc to cancel';
  header.append(title, hint);
  panel.append(header);
  if (!tabs.length) {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Loading recent tabs…';
    panel.append(loading);
  } else {
    const list = document.createElement('div');
    list.className = 'tabs';
    list.style.setProperty('--count', String(tabs.length));
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Recent tabs');
    tabs.forEach((tab, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(index === selected));
      card.setAttribute('aria-label', `${tab.title}, ${tab.url}${index === 0 ? ', current tab' : ''}`);
      card.tabIndex = index === selected ? 0 : -1;
      card.title = `${tab.title}\n${tab.url}`;
      card.addEventListener('click', () => session.choose(index));
      const preview = document.createElement('div');
      preview.className = 'preview';
      if (tab.thumbnail?.startsWith('data:image/')) {
        const img = document.createElement('img');
        img.src = tab.thumbnail;
        img.alt = '';
        preview.append(img);
      } else if (tab.favIconUrl) {
        const img = document.createElement('img');
        img.className = 'preview-favicon';
        img.src = tab.favIconUrl;
        img.alt = '';
        img.onerror = () => {
          img.remove();
          preview.textContent = (tab.title || tab.url || '?').slice(0, 1).toUpperCase();
        };
        preview.append(img);
      } else {
        preview.textContent = (tab.title || tab.url || '?').slice(0, 1).toUpperCase();
      }
      card.append(preview);

      const titleRow = document.createElement('div');
      titleRow.className = 'title-row';

      const faviconBox = document.createElement('div');
      faviconBox.className = 'favicon-box';
      renderFavicon(faviconBox, tab);
      titleRow.append(faviconBox);

      const titleElement = document.createElement('div');
      titleElement.className = 'title';
      titleElement.textContent = tab.title || 'Untitled tab';
      titleRow.append(titleElement);

      card.append(titleRow);

      const urlElement = document.createElement('div');
      urlElement.className = 'url';
      urlElement.textContent = tab.url;
      card.append(urlElement);

      const badgeElement = document.createElement('div');
      badgeElement.className = 'badge';
      badgeElement.textContent = index === 0 ? 'Current tab' : '\u00a0';
      card.append(badgeElement);

      list.append(card);
    });
    panel.append(list);
  }
  shadow.append(style, panel);
}

const session = new SwitcherSession({
  load: async () => {
    const response = await browser.runtime.sendMessage({ type: 'ARCABLE_TAB_SWITCHER_LIST' }) as { tabs?: SwitcherTab[] } | undefined;
    return response?.tabs || [];
  },
  render,
  close: closeOverlay,
  activate: tabId => browser.runtime.sendMessage({ type: 'ARCABLE_TAB_SWITCHER_ACTIVATE', tabId }),
  visibility: open => {
    void browser.runtime.sendMessage({ type: 'ARCABLE_TAB_SWITCHER_VISIBILITY', open }).catch(() => {});
  },
});

function dispatch(action: SwitcherAction): void {
  if (isTopFrame) session.handle(action);
  else void browser.runtime.sendMessage({ type: 'ARCABLE_TAB_SWITCHER_KEY', action }).catch(() => {});
}

window.addEventListener('keydown', event => {
  if (!event.isTrusted) return;
  // code remains KeyT on macOS, where Option+T produces a different character.
  const shortcut = event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing && event.code === 'KeyT';
  if (shortcut) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) {
      frameSequence = !isTopFrame;
      dispatch(event.shiftKey ? 'previous' : 'next');
    }
  } else if (session.active || frameSequence) {
    if (['Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { frameSequence = false; dispatch('cancel'); }
      else if (event.key === 'Enter') { frameSequence = false; dispatch('commit'); }
      else dispatch(event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey) ? 'previous' : 'next');
    }
  }
}, true);

window.addEventListener('keyup', event => {
  if (!event.isTrusted) return;
  if (event.key === 'Alt' && (session.active || frameSequence)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    frameSequence = false;
    dispatch('commit');
  }
}, true);

if (isTopFrame) {
  browser.runtime.onMessage.addListener((message: unknown) => {
    const input = message as { type?: string; action?: SwitcherAction };
    if (input?.type === 'ARCABLE_TAB_SWITCHER_KEY' && input.action &&
      ['next', 'previous', 'commit', 'cancel'].includes(input.action)) {
      session.handle(input.action);
    }
    return undefined;
  });
  window.addEventListener('blur', () => {
    if (!document.hasFocus()) { frameSequence = false; session.cancel(); }
  });
} else {
  // The top-frame overlay takes focus after a child frame starts the sequence.
  window.addEventListener('blur', () => { frameSequence = false; });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { frameSequence = false; if (isTopFrame) session.cancel(); }
});
window.addEventListener('pagehide', () => { frameSequence = false; if (isTopFrame) session.cancel(); });
