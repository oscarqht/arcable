import browser from 'webextension-polyfill';

// Runs in every eligible frame, including frames added after the page loads.
// Check storage locally first to avoid waking up the background service worker when disabled.
if (browser.storage?.local) {
  void browser.storage.local
    .get('arcable_hide_all_scrollbars')
    .then((stored) => {
      if (stored?.arcable_hide_all_scrollbars !== false) {
        return browser.runtime.sendMessage({ type: 'ARCABLE_APPLY_HIDE_SCROLLBARS' });
      }
      return undefined;
    })
    .catch(() => {});
} else {
  void browser.runtime.sendMessage({ type: 'ARCABLE_APPLY_HIDE_SCROLLBARS' }).catch(() => {
    // The extension may have been reloaded while this frame was starting.
  });
}
