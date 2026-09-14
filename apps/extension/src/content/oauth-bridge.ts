import browser from 'webextension-polyfill';
import {
  createExtensionOAuthCallbackUrl,
  isAllowedExtensionOAuthRedirect,
} from '@arcable/shared/utils';

/**
 * Relays OAuth results from Arcable Web App or OAuth providers to the extension.
 */
export function initOAuthBridge(): void {
  const hostname = window.location.hostname.toLowerCase();
  const isAllowedAuthHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === 'arcable.vercel.app' ||
    hostname === 'oh-auth.vercel.app' ||
    hostname.endsWith('.arcable.dev');

  if (!isAllowedAuthHost || (window as any).__ARCABLE_OAUTH_BRIDGE_INITIALIZED__) {
    return;
  }
  (window as any).__ARCABLE_OAUTH_BRIDGE_INITIALIZED__ = true;

  let hasSent = false;
  let isSending = false;

  function getExtensionRedirect(): string | null {
    const params = new URLSearchParams(window.location.search);
    const directRedirect = params.get('extensionRedirect');
    if (isAllowedExtensionOAuthRedirect(directRedirect)) {
      return directRedirect;
    }

    const state = params.get('state');
    if (!state) return null;
    try {
      const statePayload = JSON.parse(state);
      return isAllowedExtensionOAuthRedirect(statePayload?.extensionRedirect)
        ? statePayload.extensionRedirect
        : null;
    } catch {
      return null;
    }
  }

  async function relayAuthTokens(provider: string, tokens: any) {
    if (!tokens || hasSent || isSending) return;
    isSending = true;

    try {
      const extensionRedirect = getExtensionRedirect();
      if (extensionRedirect && tokens.access_token) {
        hasSent = true;
        window.location.replace(
          createExtensionOAuthCallbackUrl(extensionRedirect, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expires_at,
            expires_in: tokens.expires_in,
            user: tokens.user,
          })
        );
        return;
      }

      const response: any = await browser.runtime.sendMessage({
        type: 'oauth_bridge_success',
        provider: provider || 'raindrop',
        tokens,
      });
      if (response?.success) {
        hasSent = true;
        window.localStorage.removeItem('arcable_pending_auth_session');
        console.log('[Arcable OAuth Bridge] Relayed tokens to extension successfully.');
      } else {
        console.warn('[Arcable OAuth Bridge] Background rejected OAuth tokens:', response?.error);
      }
    } catch (err) {
      console.warn('[Arcable OAuth Bridge] Runtime sendMessage error:', err);
    } finally {
      isSending = false;
    }
  }

  // 1. Listen for window.postMessage from page
  window.addEventListener('message', (event) => {
    // Relaxed check: allow message from same window or same origin
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'oauth_success' || data.type === 'oauth_bridge_success') {
      void relayAuthTokens(data.provider || 'raindrop', data.tokens);
    }
  });

  // 2. Listen for custom DOM event from page
  document.addEventListener('arcable_oauth_relay', (event: any) => {
    const detail = event?.detail;
    if (detail && (detail.type === 'oauth_success' || detail.type === 'oauth_bridge_success')) {
      void relayAuthTokens(detail.provider || 'raindrop', detail.tokens);
    }
  });

  // 3. Fallback: Check localStorage for pending session
  function checkLocalStorage() {
    try {
      const raw = window.localStorage.getItem('arcable_pending_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.tokens) {
          void relayAuthTokens(parsed.provider || 'raindrop', parsed.tokens);
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

  setTimeout(() => clearInterval(timer), 30000);
}

// Used by the dedicated document_start content-script entry.
initOAuthBridge();
