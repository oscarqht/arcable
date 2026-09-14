import browser from 'webextension-polyfill';

/**
 * Relays OAuth results from Arcable Web App or OAuth providers to the extension.
 */
export function initOAuthBridge(): void {
  if ((window as any).__ARCABLE_OAUTH_BRIDGE_INITIALIZED__) {
    return;
  }
  (window as any).__ARCABLE_OAUTH_BRIDGE_INITIALIZED__ = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object' || (data.type !== 'oauth_success' && data.type !== 'oauth_bridge_success')) {
      return;
    }

    browser.runtime.sendMessage({
      type: 'oauth_bridge_success',
      provider: data.provider || 'raindrop',
      tokens: data.tokens,
    });
  });
}

// Automatically initialize when injected as content script
initOAuthBridge();
