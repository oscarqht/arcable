import assert from 'node:assert/strict';
import { ARCABLE_DATA_FILE_NAME, fetchRaindropWorkspace } from '../src/utils/raindropSync';

const calls: Array<{ url: string; method: string }> = [];
let hasArcableRoot = false;
let rootItems: any[] = [];
let metadataContent = '';

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  calls.push({ url, method });
  const pathname = new URL(url).pathname;

  if (pathname.endsWith('/raindrop/100')) {
    return new Response(JSON.stringify({ item: { _id: 100, title: 'data.json.txt' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.endsWith('/raindrop/100/file')) {
    return new Response(metadataContent, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathname.endsWith('/collections')) {
    return new Response(JSON.stringify({
      items: hasArcableRoot ? [{ _id: 1, title: 'Arcable v2', count: rootItems.length, sort: 0 }] : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (pathname.endsWith('/collections/childrens')) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.includes('/raindrops/')) {
    return new Response(JSON.stringify({ items: rootItems, count: rootItems.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  throw new Error(`Unexpected Raindrop request: ${url}`);
}) as typeof fetch;

async function main(): Promise<void> {
  assert.equal(ARCABLE_DATA_FILE_NAME, 'data.json.txt', 'Raindrop metadata must use the stable data.json.txt filename');

  const absentWorkspace = await fetchRaindropWorkspace('token');
  assert.equal(absentWorkspace.success, true, 'an account without an Arcable root should hydrate successfully');
  assert.deepEqual(absentWorkspace.data?.spaces, [], 'an absent root must replace stale local spaces with an empty remote workspace');
  assert.deepEqual(absentWorkspace.data?.tabs, [], 'an absent root must replace stale local favourites with an empty remote workspace');
  assert.equal(absentWorkspace.data?.raindropMetadataItemId, null,
    'an absent Arcable metadata file must be identified explicitly so local metadata is not treated as an intentional remote deletion');
  assert(calls.every((call) => call.method === 'GET'), 'initial hydration without a root must be read-only');

  calls.length = 0;
  hasArcableRoot = true;
  rootItems = [{
    _id: 99,
    title: 'sync-v4.json.txt',
    link: 'https://example.com/sync-v4.json.txt',
    collection: { $id: 1 },
    file: { name: 'sync-v4.json.txt' },
  }];

  const legacyWorkspace = await fetchRaindropWorkspace('token');
  assert.equal(legacyWorkspace.success, true, 'legacy snapshot files must not prevent hydration');
  assert(calls.every((call) => call.method === 'GET'), 'initial hydration must not delete legacy Raindrop files');

  calls.length = 0;
  rootItems = [{
    _id: 100,
    title: 'data.json.txt',
    collection: { $id: 1 },
    file: { name: 'data.json.txt' },
  }];
  metadataContent = JSON.stringify({
    widgets: [{ id: 'widget-1', style: 'combo', size: 'small' }],
  });

  const fileEndpointWorkspace = await fetchRaindropWorkspace('token');
  assert.deepEqual(fileEndpointWorkspace.data?.widgets, [{ id: 'widget-1', style: 'combo', size: 'small' }],
    'metadata widgets must load from Raindrop\'s file endpoint when the list response has no file URL');

  console.log('Raindrop initial hydration tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
