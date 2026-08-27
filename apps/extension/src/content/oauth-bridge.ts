import browser from 'webextension-polyfill';

/**
 * Relays OAuth results from Arcable Web App or OAuth providers to the extension.
 */
(function () {
  'use strict';

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'oauth_success') {
      return;
    }

    browser.runtime.sendMessage({
      type: 'oauth_bridge_success',
      provider: data.provider || 'raindrop',
      tokens: data.tokens,
    });
  });
})();
