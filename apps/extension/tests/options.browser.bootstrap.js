// Only loaded into the disposable browser-test copy; no real provider requests.
const originalAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
const fixtureTypes = new Set(['RAINDROP_GET_AUTH_STATE', 'RAINDROP_START_OAUTH', 'RAINDROP_LOGOUT']);
originalAddListener((message, _sender, respond) => {
  if (!fixtureTypes.has(message.type)) return false;
  void (async () => {
    if (message.type === 'RAINDROP_START_OAUTH') {
      await chrome.storage.local.set({ arcable_raindrop_auth: { isAuthenticated: true, authType: 'token', accessToken: 'test-only', user: { id: 1, name: 'Options test', email: 'test@example.test' } } });
    }
    if (message.type === 'RAINDROP_LOGOUT') await chrome.storage.local.remove('arcable_raindrop_auth');
    const state = await chrome.storage.local.get('arcable_raindrop_auth');
    respond({ success: true, data: state.arcable_raindrop_auth || { isAuthenticated: false } });
  })();
  return true;
});
chrome.runtime.onMessage.addListener = listener => originalAddListener((message, ...args) => fixtureTypes.has(message.type) ? false : listener(message, ...args));
// Exercise the real background sync and multipart transport against a disposable provider.
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (!['api.raindrop.io', 'up.raindrop.io'].includes(url.hostname)) throw new Error('Unexpected test request');
  const s = await chrome.storage.local.get(['optionsTestCloud', 'optionsTestFail']);
  if (s.optionsTestFail) return new Response('{}', { status: 503 });
  const cloud = s.optionsTestCloud || { items: {}, contents: {}, nextId: 100, uploads: 0, reads: 0 };
  const method = init.method || 'GET';
  const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  const save = async data => { await chrome.storage.local.set({ optionsTestCloud: cloud }); return json(data); };
  const pathname = url.pathname.replace('/rest/v1', '');
  if (url.hostname === 'up.raindrop.io') return new Response(cloud.contents[pathname.slice(1)], { headers: { 'Content-Type': 'text/plain' } });
  if (pathname === '/collections') { cloud.reads++; return save({ items: [{ _id: 1, title: 'Arcable snapshots' }] }); }
  if (pathname === '/collections/childrens') return json({ items: [] });
  if (pathname.startsWith('/raindrops/')) return json({ items: Object.values(cloud.items), count: Object.keys(cloud.items).length });
  if (pathname === '/raindrop/file') {
    const file = init.body.get('file'), id = ++cloud.nextId;
    const item = { _id: id, title: file.name, collection: { $id: 1 }, link: `https://up.raindrop.io/${id}`, file: { name: file.name, path: `https://up.raindrop.io/${id}` } };
    cloud.items[id] = item; cloud.contents[id] = await file.text(); cloud.uploads++;
    return save({ item });
  }
  const id = pathname.split('/').pop();
  if (pathname.startsWith('/raindrop/')) {
    if (method === 'PUT') { Object.assign(cloud.items[id], JSON.parse(init.body)); return save({ item: cloud.items[id] }); }
    if (method === 'DELETE') { delete cloud.items[id]; delete cloud.contents[id]; return save({ result: true }); }
    return json({ item: cloud.items[id] });
  }
  throw new Error('Unhandled test provider endpoint');
};
