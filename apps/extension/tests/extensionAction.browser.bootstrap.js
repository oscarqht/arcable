const originalAddActionListener = chrome.action.onClicked.addListener.bind(chrome.action.onClicked);
let toolbarListener;
chrome.action.onClicked.addListener = listener => {
  toolbarListener = listener;
  originalAddActionListener(listener);
};
const originalAddMessageListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
originalAddMessageListener((message, _sender, respond) => {
  if (message.type !== 'ARCABLE_TEST_TOOLBAR_CLICK') return;
  void chrome.tabs.get(message.tabId).then(tab => toolbarListener(tab)).then(() => respond({ success: true }), () => respond({ success: false }));
  return true;
});
chrome.runtime.onMessage.addListener = listener => originalAddMessageListener((message, ...args) => {
  if (message.type === 'ARCABLE_TEST_TOOLBAR_CLICK') return false;
  return listener(message, ...args);
});
const providerCalls = {};
const actualFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith('https://api.raindrop.io/')) return actualFetch(url, init);
  const pathname = new URL(String(url)).pathname;
  const reply = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (pathname === '/rest/v1/raindrop' && init.method === 'POST') {
    providerCalls.bookmark = JSON.parse(init.body);
    await chrome.storage.local.set({ arcable_action_test: providerCalls });
    return reply({ item: { _id: 456, ...providerCalls.bookmark } });
  }
  if (pathname === '/rest/v1/raindrop/456/cover' && init.method === 'PUT') {
    const cover = init.body.get('cover');
    const bytes = new Uint8Array(await cover.arrayBuffer());
    providerCalls.cover = { type: cover.type, length: bytes.length, header: [...bytes.slice(0, 8)] };
    await chrome.storage.local.set({ arcable_action_test: providerCalls });
    return reply({ item: { cover: 'https://example.test/screenshot-cover.png' } });
  }
  if (pathname === '/rest/v1/collections' || pathname === '/rest/v1/collections/childrens') return reply({ items: [] });
  throw new Error('Unexpected provider call in test');
};
