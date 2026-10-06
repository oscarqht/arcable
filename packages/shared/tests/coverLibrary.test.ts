import assert from 'node:assert/strict';
import { listUploadedCovers, uploadCoverToLibrary, validateCoverImage } from '../src/utils/coverLibrary';
import { fetchRaindropWorkspace, syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';

const collections: any[] = [{ _id: 1, title: 'Arcable v2', count: 2 }];
const items: any[] = [];
const mutations: Array<{ path: string; method: string; body: any }> = [];
let failUpload = false;

globalThis.fetch = (async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname;
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  if (method !== 'GET') mutations.push({ path, method, body });
  if (path.endsWith('/collections')) return reply({ items: collections.filter((c) => !c.parent) });
  if (path.endsWith('/collections/childrens')) return reply({ items: collections.filter((c) => c.parent) });
  if (path.endsWith('/collection') && method === 'POST') {
    const item = { _id: 2, ...body };
    collections.push(item);
    return reply({ item });
  }
  if (path.endsWith('/raindrop/file')) {
    assert(body instanceof FormData);
    assert.equal(body.get('collectionId'), '2');
    assert.equal(init?.headers && (init.headers as any)['Content-Type'], undefined, 'fetch must supply the multipart boundary');
    const file = body.get('file') as File;
    assert.equal(file.name, 'logo ||| reused.png');
    assert.equal(file.type, 'image/png');
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [137, 80, 78, 71]);
    if (failUpload) return reply({ result: false, errorMessage: 'Upload rejected' }, 400);
    const item = { _id: 20, link: 'https://up.raindrop.io/raindrop/20/file.png', title: file.name,
      file: { name: file.name, type: file.type }, collection: { $id: 2 }, created: '2026-10-06T00:00:00Z' };
    items.push(item);
    return reply({ result: true, item });
  }
  if (path.includes('/raindrops/') && method === 'GET') {
    const collectionId = Number(path.split('/').pop());
    const selected = items.filter((i) => url.searchParams.get('nested') === 'true' || i.collection.$id === collectionId);
    return reply({ items: selected, count: selected.length });
  }
  if (path.endsWith('/raindrops') && method === 'POST') return reply({ items: [] });
  if (method === 'PUT' && path.includes('/raindrop/')) {
    const item = items.find((i) => i._id === Number(path.split('/').pop()));
    if (item) Object.assign(item, body);
    return reply({ item });
  }
  if (method === 'DELETE' && path.includes('/raindrops/')) {
    for (const id of body.ids) {
      const index = items.findIndex((i) => i._id === id);
      if (index !== -1) items.splice(index, 1);
    }
    return reply({ result: true });
  }
  throw new Error(`Unexpected request ${method} ${path}`);
}) as typeof fetch;

async function main() {
  assert.deepEqual(await listUploadedCovers('test'), []);
  assert.equal(mutations.length, 0, 'opening an empty library must not create collections');
  assert.throws(() => validateCoverImage(new Blob(['x'], { type: 'image/svg+xml' })), /PNG/);
  assert.throws(() => validateCoverImage(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' })), /2 MB/);
  await assert.rejects(uploadCoverToLibrary('test', 'bad.png', 'data:image/png;base64,' + 'x'.repeat(3_000_000)), /2 MB/);
  const cover = await uploadCoverToLibrary('test', 'logo ||| reused.png', 'data:image/png;base64,iVBORw==');
  assert.equal(cover.url, 'https://up.raindrop.io/raindrop/20/file.png');
  assert.deepEqual(await listUploadedCovers('test'), [cover]);
  failUpload = true;
  await assert.rejects(uploadCoverToLibrary('test', 'logo ||| reused.png', 'data:image/png;base64,iVBORw=='), /Failed to upload/);
  assert.equal(collections.filter((c) => c.title === '_covers').length, 1, 'uploads reuse the existing library');
  items.push({ _id: 30, title: 'A', link: 'https://a.example', cover: cover.url, collection: { $id: 1 } },
    { _id: 31, title: 'B', link: 'https://b.example', cover: cover.url, collection: { $id: 1 } });
  const hydrated = await fetchRaindropWorkspace('test');
  assert(hydrated.success && hydrated.data);
  assert.equal(hydrated.data.tabs.length, 2, 'image assets must not appear as tabs');
  assert.equal(hydrated.data.spaces.length, 0, 'the library must not appear as a space');
  assert(hydrated.data.tabs.every((tab) => tab.favIconUrl === cover.url));
  const a = hydrated.data.tabs.find((tab) => tab.raindropId === 30)!;
  const result = await syncWorkspaceWithRaindrop('test', {
    localState: { ...hydrated.data, tabs: hydrated.data.tabs.filter((tab) => tab !== a) },
    replaceBaseline: true,
    pendingOps: [{ id: 'delete-a', type: 'TAB_DELETE', entityId: a.id, timestamp: Date.now(), deviceId: 'test', payload: { raindropId: 30, collectionId: 1 } }],
  });
  assert(result.success, result.error);
  assert(items.some((item) => item._id === 20), 'deleting A and pruning variant-like titles must preserve the library asset');
  assert(!items.some((item) => item._id === 30));
  assert.equal(items.find((item) => item._id === 31)?.cover, cover.url);
  assert.deepEqual(await listUploadedCovers('test'), [cover]);
  console.log('Cover library upload, reuse, hydration, failure, and deletion checks passed.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
