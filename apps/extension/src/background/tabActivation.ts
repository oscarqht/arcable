import browser from 'webextension-polyfill';

// Run both API calls in the background: either one can dismiss a toolbar popup
// and destroy the caller's JavaScript context before its next await resumes.
export function handleTabActivationMessage(
  message: any,
  sender: browser.Runtime.MessageSender,
): Promise<{ success: boolean; error?: string }> | undefined {
  if (message?.type !== 'ARCABLE_ACTIVATE_BROWSER_TAB') return undefined;
  if (sender.id !== browser.runtime.id || !Number.isInteger(message.browserTabId) || message.browserTabId < 0) {
    return Promise.resolve({ success: false, error: 'Invalid tab activation request' });
  }
  return (async () => {
    try {
      const tab = await browser.tabs.update(message.browserTabId, { active: true });
      // Use the live tab's window; an association may predate a tab being moved.
      if (tab.windowId !== undefined) {
        await browser.windows.update(tab.windowId, { focused: true });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not activate browser tab' };
    }
  })();
}
