/**
 * Action badge management for Arcable extension.
 */

let badgeAnimationSequence = 0;

/**
 * Set a transient badge on the extension icon.
 */
export function setActionBadge(text: string, color = '#3b82f6', clearAfterMs = 2000): void {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    if (clearAfterMs > 0) {
      const token = ++badgeAnimationSequence;
      setTimeout(() => {
        if (badgeAnimationSequence !== token) return;
        chrome.action.setBadgeText({ text: '' });
      }, clearAfterMs);
    }
  } catch (err) {
    console.warn('[badge] Failed to set badge:', err);
  }
}

/**
 * Set a success badge for clipboard copy operations.
 */
export function setCopySuccessBadge(): void {
  setActionBadge('📋', '#10b981', 2000);
}

/**
 * Set a failure badge for clipboard copy operations.
 */
export function setCopyFailureBadge(): void {
  setActionBadge('❌', '#ef4444', 2000);
}
