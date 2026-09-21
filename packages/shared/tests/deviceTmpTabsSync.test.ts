import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncDeviceTmpTabs,
  fetchDevicesWithTmpTabs,
  renameRaindropDevice,
  deleteRaindropDevice,
  ARCABLE_COLLECTION_NAME,
  ARCABLE_DEVICES_COLLECTION_NAME,
  isSystemCollection,
} from '../src/utils/raindropSync';
import type { TmpTab } from '../src/types/workspace';

interface MockCollection {
  _id: number;
  title: string;
  parent?: { $id: number };
  created?: string;
  lastUpdate?: string;
}

interface MockBookmark {
  _id: number;
  title: string;
  link: string;
  collection: { $id: number };
  collectionId: number;
  cover?: string;
  created?: string;
  lastUpdate?: string;
}

let nextId = 1000;
let collections: MockCollection[] = [];
let bookmarks: MockBookmark[] = [];

// Mock fetch
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

  // GET /collections
  if (url.includes('/collections') && !url.includes('/childrens') && !url.includes('/covers') && method === 'GET') {
    const roots = collections.filter((c) => !c.parent?.$id);
    return new Response(JSON.stringify({ result: true, items: roots }), { status: 200 });
  }

  // GET /collections/childrens
  if (url.includes('/collections/childrens') && method === 'GET') {
    const children = collections.filter((c) => Boolean(c.parent?.$id));
    return new Response(JSON.stringify({ result: true, items: children }), { status: 200 });
  }

  // POST /collection
  if (url.endsWith('/collection') && method === 'POST') {
    const newId = ++nextId;
    const coll: MockCollection = {
      _id: newId,
      title: body.title,
      parent: body.parent,
      created: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
    };
    collections.push(coll);
    return new Response(JSON.stringify({ result: true, item: coll }), { status: 200 });
  }

  // PUT /collection/:id
  const putCollMatch = url.match(/\/collection\/(\d+)$/);
  if (putCollMatch && method === 'PUT') {
    const id = Number(putCollMatch[1]);
    const coll = collections.find((c) => c._id === id);
    if (coll) {
      if (body.title) coll.title = body.title;
      coll.lastUpdate = new Date().toISOString();
      return new Response(JSON.stringify({ result: true, item: coll }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: false }), { status: 404 });
  }

  // DELETE /collection/:id
  const delCollMatch = url.match(/\/collection\/(\d+)$/);
  if (delCollMatch && method === 'DELETE') {
    const id = Number(delCollMatch[1]);
    collections = collections.filter((c) => c._id !== id);
    bookmarks = bookmarks.filter((b) => b.collectionId !== id);
    return new Response(JSON.stringify({ result: true }), { status: 200 });
  }

  // GET /raindrops/:collectionId
  const getItemsMatch = url.match(/\/raindrops\/(-?\d+)/);
  if (getItemsMatch && method === 'GET') {
    const collId = Number(getItemsMatch[1]);
    const items = bookmarks.filter((b) => b.collectionId === collId);
    return new Response(JSON.stringify({ result: true, items, count: items.length }), { status: 200 });
  }

  // POST /raindrops (batch create)
  if (url.endsWith('/raindrops') && method === 'POST') {
    const createdItems: MockBookmark[] = [];
    for (const item of body.items || []) {
      const b: MockBookmark = {
        _id: ++nextId,
        title: item.title,
        link: item.link,
        collection: item.collection,
        collectionId: item.collection?.$id || item.collectionId,
        cover: item.cover,
        created: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
      };
      bookmarks.push(b);
      createdItems.push(b);
    }
    return new Response(JSON.stringify({ result: true, items: createdItems }), { status: 200 });
  }

  // DELETE /raindrops/:collectionId (batch delete)
  if (getItemsMatch && method === 'DELETE') {
    const idsToDelete: number[] = body.ids || [];
    bookmarks = bookmarks.filter((b) => !idsToDelete.includes(b._id));
    return new Response(JSON.stringify({ result: true }), { status: 200 });
  }

  // DELETE /raindrop/:id
  const delSingleItemMatch = url.match(/\/raindrop\/(\d+)$/);
  if (delSingleItemMatch && method === 'DELETE') {
    const id = Number(delSingleItemMatch[1]);
    bookmarks = bookmarks.filter((b) => b._id !== id);
    return new Response(JSON.stringify({ result: true }), { status: 200 });
  }

  // PUT /raindrop/:id
  if (delSingleItemMatch && method === 'PUT') {
    const id = Number(delSingleItemMatch[1]);
    const b = bookmarks.find((item) => item._id === id);
    if (b) {
      if (body.title) b.title = body.title;
      b.lastUpdate = new Date().toISOString();
      return new Response(JSON.stringify({ result: true, item: b }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: false }), { status: 404 });
  }

  return new Response(JSON.stringify({ result: true }), { status: 200 });
}) as any;

describe('Device and Tmp Tabs Raindrop Sync', () => {
  beforeEach(() => {
    collections = [
      {
        _id: 1,
        title: ARCABLE_COLLECTION_NAME,
        created: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
      },
    ];
    bookmarks = [];
    nextId = 1000;
  });

  it('correctly identifies _devices as system collection', () => {
    assert.equal(isSystemCollection({ _id: 99, title: '_devices' }), true);
    assert.equal(isSystemCollection({ _id: 100, title: '_devices_something' }), true);
    assert.equal(isSystemCollection({ _id: 101, title: 'Personal Space' }), false);
  });

  it('creates _devices and device collection and syncs tmp tabs', async () => {
    const tabs: TmpTab[] = [
      { id: 't1', url: 'https://example.com/page1', title: 'Page 1' },
      { id: 't2', url: 'https://example.com/page2', title: 'Page 2' },
    ];

    const result = await syncDeviceTmpTabs('test-token', 'device_123', 'macOS / Chrome', tabs);
    assert.equal(result.success, true);
    assert.equal(result.count, 2);

    // Verify _devices collection created under root
    const devicesRoot = collections.find((c) => c.title === ARCABLE_DEVICES_COLLECTION_NAME && c.parent?.$id === 1);
    assert.ok(devicesRoot);

    // Verify device collection created under _devices
    const devColl = collections.find((c) => c.title === 'macOS / Chrome' && c.parent?.$id === devicesRoot._id);
    assert.ok(devColl);

    // Verify bookmarks were created
    const devBookmarks = bookmarks.filter((b) => b.collectionId === devColl._id);
    assert.equal(devBookmarks.length, 2);
    assert.equal(devBookmarks[0].link, 'https://example.com/page1');
    assert.equal(devBookmarks[1].link, 'https://example.com/page2');
  });

  it('updates diff when tabs are closed and added', async () => {
    // Initial sync
    await syncDeviceTmpTabs('test-token', 'device_123', 'macOS / Chrome', [
      { id: 't1', url: 'https://example.com/page1', title: 'Page 1' },
      { id: 't2', url: 'https://example.com/page2', title: 'Page 2' },
    ]);

    // Second sync: page1 closed, page3 opened
    const result = await syncDeviceTmpTabs('test-token', 'device_123', 'macOS / Chrome', [
      { id: 't2', url: 'https://example.com/page2', title: 'Page 2 Updated' },
      { id: 't3', url: 'https://example.com/page3', title: 'Page 3' },
    ]);
    assert.equal(result.success, true);
    assert.equal(result.count, 2);

    const devColl = collections.find((c) => c.title === 'macOS / Chrome');
    assert.ok(devColl);

    const devBookmarks = bookmarks.filter((b) => b.collectionId === devColl._id);
    assert.equal(devBookmarks.length, 2);
    assert.ok(devBookmarks.some((b) => b.link === 'https://example.com/page2'));
    assert.ok(devBookmarks.some((b) => b.link === 'https://example.com/page3'));
    assert.ok(!devBookmarks.some((b) => b.link === 'https://example.com/page1'));
  });

  it('fetches devices and their tmp tabs, marking current device', async () => {
    // Sync device 1
    await syncDeviceTmpTabs('test-token', 'dev1', 'macOS / Chrome', [
      { id: 't1', url: 'https://example.com/page1', title: 'Page 1' },
    ]);
    // Sync device 2
    await syncDeviceTmpTabs('test-token', 'dev2', 'Windows / Firefox', [
      { id: 't2', url: 'https://example.com/page2', title: 'Page 2' },
      { id: 't3', url: 'https://example.com/page3', title: 'Page 3' },
    ]);

    const res = await fetchDevicesWithTmpTabs('test-token', 'macOS / Chrome');
    assert.equal(res.success, true);
    assert.equal(res.devices.length, 2);

    // Current device should be first
    assert.equal(res.devices[0].deviceName, 'macOS / Chrome');
    assert.equal(res.devices[0].isCurrent, true);
    assert.equal(res.devices[0].tabs.length, 1);

    // Other device
    assert.equal(res.devices[1].deviceName, 'Windows / Firefox');
    assert.equal(res.devices[1].isCurrent, false);
    assert.equal(res.devices[1].tabs.length, 2);
  });

  it('renames a device collection', async () => {
    await syncDeviceTmpTabs('test-token', 'dev1', 'macOS / Chrome', [
      { id: 't1', url: 'https://example.com/page1', title: 'Page 1' },
    ]);

    const renameRes = await renameRaindropDevice('test-token', 'macOS / Chrome', 'Tang MacBook Pro');
    assert.equal(renameRes.success, true);

    const devColl = collections.find((c) => c.title === 'Tang MacBook Pro');
    assert.ok(devColl);
  });

  it('deletes a device collection', async () => {
    await syncDeviceTmpTabs('test-token', 'dev1', 'macOS / Chrome', [
      { id: 't1', url: 'https://example.com/page1', title: 'Page 1' },
    ]);
    await syncDeviceTmpTabs('test-token', 'dev2', 'Windows / Firefox', [
      { id: 't2', url: 'https://example.com/page2', title: 'Page 2' },
    ]);

    const dev2 = collections.find((c) => c.title === 'Windows / Firefox');
    assert.ok(dev2);

    const delRes = await deleteRaindropDevice('test-token', String(dev2._id));
    assert.equal(delRes.success, true);

    assert.equal(collections.some((c) => c.title === 'Windows / Firefox'), false);
    assert.equal(bookmarks.some((b) => b.collectionId === dev2._id), false);
  });
});
