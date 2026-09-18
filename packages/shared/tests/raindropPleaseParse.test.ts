import assert from 'node:assert/strict';
import { createRaindropBookmark, createRaindropBookmarks } from '../src/utils/raindropClient';
import { syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';
import type { ArcableWorkspaceData } from '../src/types/workspace';

const calls: Array<{ url: string; method: string; body?: any }> = [];
let nextId = 500;

let mockState = {
  collections: [
    { _id: 10, title: 'Arcable v2', count: 0, sort: 0 },
    { _id: 20, title: 'Space 1', parent: { $id: 10 }, count: 0, sort: 0 },
  ] as any[],
  bookmarks: [] as any[],
};

// Mock localStorage
const mockStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => { mockStorage.set(key, value); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
};
(globalThis as any).localStorage = storageMock;
(globalThis as any).window = {
  localStorage: storageMock,
  dispatchEvent: () => true,
};

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  let body: any;
  if (init?.body) {
    try {
      body = JSON.parse(String(init.body));
    } catch {
      body = String(init.body);
    }
  }
  calls.push({ url, method, body });

  const pathname = new URL(url).pathname;

  if (method === 'GET' && pathname.endsWith('/collections')) {
    return new Response(JSON.stringify({
      items: mockState.collections.filter((c) => !c.parent?.$id),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'GET' && pathname.endsWith('/collections/childrens')) {
    return new Response(JSON.stringify({
      items: mockState.collections.filter((c) => c.parent?.$id),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'GET' && pathname.includes('/raindrops/')) {
    return new Response(JSON.stringify({
      items: mockState.bookmarks,
      count: mockState.bookmarks.length,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'POST' && pathname.endsWith('/collection')) {
    const created = {
      _id: nextId++,
      title: body.title,
      parent: body.parent,
      sort: body.sort ?? 0,
      color: body.color,
      cover: body.cover,
    };
    mockState.collections.push(created);
    return new Response(JSON.stringify({ item: created }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'POST' && pathname.endsWith('/raindrop')) {
    const created = { _id: nextId++, ...body };
    mockState.bookmarks.push(created);
    return new Response(JSON.stringify({ item: created }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'POST' && pathname.endsWith('/raindrops')) {
    const items = (body.items || []).map((it: any) => ({ _id: nextId++, ...it }));
    mockState.bookmarks.push(...items);
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT' && pathname.includes('/raindrop/')) {
    return new Response(JSON.stringify({ item: { _id: 1, ...body } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as any;

async function runTests() {
  // Test 1: createRaindropBookmark without pleaseParse does NOT send pleaseParse
  calls.length = 0;
  await createRaindropBookmark('mock-token', {
    link: 'https://example.com/tab1',
    title: 'Tab 1',
    collectionId: -1,
  });

  const singleCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/raindrop'));
  assert(singleCall, 'createRaindropBookmark must call POST /raindrop');
  assert.equal(
    Object.prototype.hasOwnProperty.call(singleCall.body, 'pleaseParse'),
    false,
    'createRaindropBookmark payload must NOT contain pleaseParse parameter when not provided'
  );

  // Test 2: createRaindropBookmarks without pleaseParse does NOT send pleaseParse
  calls.length = 0;
  await createRaindropBookmarks('mock-token', [
    { link: 'https://example.com/tab1', title: 'Tab 1' },
    { link: 'https://example.com/tab2', title: 'Tab 2' },
  ]);

  const batchCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/raindrops'));
  assert(batchCall, 'createRaindropBookmarks must call POST /raindrops');
  for (const item of batchCall.body.items) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(item, 'pleaseParse'),
      false,
      'createRaindropBookmarks item must NOT contain pleaseParse parameter when not provided'
    );
  }

  // Test 3: Workspace sync saving tab item and widget
  calls.length = 0;
  const workspace: ArcableWorkspaceData = {
    spaces: [
      { id: 'space-1', name: 'Space 1', raindropId: 20, order: 0 },
    ],
    folders: [],
    tabs: [
      {
        id: 'tab-1',
        url: 'https://example.com/my-tab',
        customTitle: 'My Tab',
        parentSpaceId: 'space-1',
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    widgets: [
      {
        id: 'clock-1',
        style: 'clock',
        size: '1x1',
        config: {},
        order: 0,
      },
    ],
  };

  const syncRes = await syncWorkspaceWithRaindrop('mock-token', {
    localState: workspace,
    pendingOps: [],
    replaceBaseline: true,
  });
  const batchCalls = calls.filter((c) => c.method === 'POST' && c.url.includes('/raindrops'));
  assert(batchCalls.length > 0, 'Sync must batch create bookmarks');

  let foundTabItem = false;
  let foundWidgetItem = false;

  for (const call of batchCalls) {
    for (const item of call.body.items) {
      if (item.link === 'https://example.com/my-tab') {
        foundTabItem = true;
        assert.equal(
          Object.prototype.hasOwnProperty.call(item, 'pleaseParse'),
          false,
          'Tab item saved to Raindrop must NOT include pleaseParse'
        );
      }
      if (typeof item.link === 'string' && item.link.includes('widget')) {
        foundWidgetItem = true;
        assert.deepEqual(
          item.pleaseParse,
          { disabled: true },
          'Non-tab widget item should retain pleaseParse: { disabled: true }'
        );
      }
    }
  }

  assert(foundTabItem, 'Must have synced tab item to Raindrop');
  assert(foundWidgetItem, 'Must have synced widget item to Raindrop');

  console.log('✓ Verified: saving tab items to Raindrop does not include pleaseParse parameter');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
