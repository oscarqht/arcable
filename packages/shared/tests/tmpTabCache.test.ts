import assert from 'node:assert/strict';
import {
  getRemoteTmpTabsCacheKey,
  loadCachedRemoteTmpTabs,
  saveCachedRemoteTmpTabs,
  clearCachedRemoteTmpTabs,
  REMOTE_TMP_TABS_CACHE_PREFIX,
} from '../src/utils/tmpTabCache';
import { RAINDROP_TMP_TABS_TTL_MS } from '../src/utils/tmpTabSync';
import type { TmpTab } from '../src/types/workspace';

// In-memory localStorage mock for node test environment
const storage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
};
(globalThis as any).localStorage = storageMock;
(globalThis as any).window = { localStorage: storageMock };

// 1. Key naming and isolation
assert.equal(getRemoteTmpTabsCacheKey(12345), `${REMOTE_TMP_TABS_CACHE_PREFIX}12345`);
assert.equal(getRemoteTmpTabsCacheKey('user_abc'), `${REMOTE_TMP_TABS_CACHE_PREFIX}user_abc`);
assert.equal(getRemoteTmpTabsCacheKey(undefined), `${REMOTE_TMP_TABS_CACHE_PREFIX}default`);
assert.equal(getRemoteTmpTabsCacheKey(null), `${REMOTE_TMP_TABS_CACHE_PREFIX}default`);
assert.equal(getRemoteTmpTabsCacheKey(''), `${REMOTE_TMP_TABS_CACHE_PREFIX}default`);

// 2. Save and load
storage.clear();
const now = Date.UTC(2026, 8, 24, 12, 0, 0);
const testTabs: TmpTab[] = [
  {
    id: 'tab-1',
    url: 'https://example.com/one',
    title: 'One',
    deviceId: 'device-a',
    deviceName: 'MacBook',
    deviceType: 'Ext',
    spaceId: 'space-1',
  },
  {
    id: 'tab-2',
    url: 'https://example.com/two',
    title: 'Two',
    deviceId: 'device-b',
    deviceName: 'Desktop',
    deviceType: 'Web App',
  },
];
const testUpdatedAt = {
  'device-a': now - 60_000,
  'device-b': now - 120_000,
};

saveCachedRemoteTmpTabs('user-1', { tabs: testTabs, updatedAt: testUpdatedAt });
const loaded = loadCachedRemoteTmpTabs('user-1', now);
assert.ok(loaded);
assert.equal(loaded?.tabs.length, 2);
assert.deepEqual(loaded?.tabs, testTabs);
assert.deepEqual(loaded?.updatedAt, testUpdatedAt);

// Different user has empty cache
assert.equal(loadCachedRemoteTmpTabs('user-2', now), null);

// 3. 7-day TTL expiration
const staleDeviceTime = now - RAINDROP_TMP_TABS_TTL_MS - 1000;
const freshDeviceTime = now - 3600_000;
saveCachedRemoteTmpTabs('user-ttl', {
  tabs: [
    {
      id: 'tab-stale',
      url: 'https://example.com/stale',
      deviceId: 'stale-dev',
    },
    {
      id: 'tab-fresh',
      url: 'https://example.com/fresh',
      deviceId: 'fresh-dev',
    },
  ],
  updatedAt: {
    'stale-dev': staleDeviceTime,
    'fresh-dev': freshDeviceTime,
  },
});

const ttlLoaded = loadCachedRemoteTmpTabs('user-ttl', now);
assert.ok(ttlLoaded);
assert.equal(ttlLoaded?.tabs.length, 1);
assert.equal(ttlLoaded?.tabs[0].id, 'tab-fresh');
assert.equal(ttlLoaded?.updatedAt['stale-dev'], undefined);
assert.equal(ttlLoaded?.updatedAt['fresh-dev'], freshDeviceTime);

// 4. Clear cache
clearCachedRemoteTmpTabs('user-1');
assert.equal(loadCachedRemoteTmpTabs('user-1', now), null);
// Other accounts unaffected
assert.ok(loadCachedRemoteTmpTabs('user-ttl', now));

// 5. Malformed storage tolerance
storage.set(`${REMOTE_TMP_TABS_CACHE_PREFIX}corrupt`, 'not-valid-json{');
assert.equal(loadCachedRemoteTmpTabs('corrupt', now), null);

storage.set(`${REMOTE_TMP_TABS_CACHE_PREFIX}bad-shape`, JSON.stringify({ tabs: 'not an array' }));
assert.equal(loadCachedRemoteTmpTabs('bad-shape', now), null);

console.log('All tmpTabCache tests passed successfully!');
