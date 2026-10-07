import browser from 'webextension-polyfill';

// Runs in every eligible frame, including frames added after the page loads.
void browser.runtime.sendMessage({ type: 'ARCABLE_APPLY_HIDE_SCROLLBARS' }).catch(() => {
  // The extension may have been reloaded while this frame was starting.
});
