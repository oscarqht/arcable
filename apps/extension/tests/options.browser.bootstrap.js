// Only loaded into the disposable browser-test copy; no real provider requests.
const originalAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
const fixtureTypes = new Set(['RAINDROP_GET_AUTH_STATE', 'RAINDROP_START_OAUTH', 'RAINDROP_LOGOUT', 'ARCABLE_SAVE_SNAPSHOT', 'ARCABLE_LOAD_SNAPSHOT']);
originalAddListener((message, _sender, respond) => {
  if (!fixtureTypes.has(message.type)) return false;
  void (async () => {
    if (message.type === 'RAINDROP_START_OAUTH') {
      await chrome.storage.local.set({ arcable_raindrop_auth: { isAuthenticated: true, authType: 'token', accessToken: 'test-only', user: { name: 'Options test', email: 'test@example.test' } } });
    }
    if (message.type === 'RAINDROP_LOGOUT') await chrome.storage.local.remove('arcable_raindrop_auth');
    if (message.type.startsWith('ARCABLE_')) {
      await new Promise(resolve => setTimeout(resolve, 600));
      const { optionsTestFail } = await chrome.storage.local.get('optionsTestFail');
      respond(optionsTestFail ? { success: false, error: 'Test snapshot failure' } : { success: true, data: { savedAt: new Date().toISOString() } });
    } else {
      const state = await chrome.storage.local.get('arcable_raindrop_auth');
      respond({ success: true, data: state.arcable_raindrop_auth || { isAuthenticated: false } });
    }
  })();
  return true;
});
chrome.runtime.onMessage.addListener = listener => originalAddListener((message, ...args) => fixtureTypes.has(message.type) ? false : listener(message, ...args));
