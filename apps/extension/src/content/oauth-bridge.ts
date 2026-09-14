import browser from 'webextension-polyfill';

/**
 * Relays OAuth results from Arcable Web App or OAuth providers to the extension.
 */
(function () {
  'use strict';

  let hasSent = false;

  function relayAuthTokens(provider: string, tokens: any) {
    if (!tokens || hasSent) return;
    hasSent = true;

    try {
      void browser.runtime.sendMessage({
        type: 'oauth_bridge_success',
        provider: provider || 'supabase',
        tokens,
      }).then(() => {
        console.log('[Arcable OAuth Bridge] Relayed tokens to extension successfully.');
      }).catch((err) => {
        console.warn('[Arcable OAuth Bridge] Failed to send message to background:', err);
      });
    } catch (err) {
      console.warn('[Arcable OAuth Bridge] Runtime sendMessage error:', err);
    }
  }

  // 1. Listen for window.postMessage from page
  window.addEventListener('message', (event) => {
    // Relaxed check: allow message from same window or same origin
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'oauth_success' || data.type === 'oauth_bridge_success') {
      relayAuthTokens(data.provider || 'supabase', data.tokens);
    }
  });

  // 2. Listen for custom DOM event from page
  document.addEventListener('arcable_oauth_relay', (event: any) => {
    const detail = event?.detail;
    if (detail && (detail.type === 'oauth_success' || detail.type === 'oauth_bridge_success')) {
      relayAuthTokens(detail.provider || 'supabase', detail.tokens);
    }
  });

  // 3. Fallback: Check localStorage for pending session
  function checkLocalStorage() {
    try {
      const raw = window.localStorage.getItem('arcable_pending_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.tokens) {
          relayAuthTokens(parsed.provider || 'supabase', parsed.tokens);
          window.localStorage.removeItem('arcable_pending_auth_session');
        }
      }
    } catch {}
  }

  checkLocalStorage();
  const timer = setInterval(() => {
    if (hasSent) {
      clearInterval(timer);
    } else {
      checkLocalStorage();
    }
  }, 500);

  setTimeout(() => clearInterval(timer), 15000);
})();
