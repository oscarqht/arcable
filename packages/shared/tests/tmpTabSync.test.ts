import assert from 'node:assert/strict';
import {
  parseRaindropTmpTabsSnapshot,
  RAINDROP_TMP_TABS_TTL_MS,
  sanitizeRaindropTmpTabs,
} from '../src/utils/tmpTabSync';

const tabs = sanitizeRaindropTmpTabs([
  {
    id: 'remote-1', url: 'https://example.com/page', title: 'Example',
    spaceId: 'space-1', browserTabId: 42, windowId: 7, badge: '3',
    deviceId: 'local-device', deviceName: 'Local',
  },
  { id: 'internal', url: 'chrome://settings', browserTabId: 43 },
  { id: 'script', url: 'javascript:alert(1)' },
]);
assert.deepEqual(tabs, [{
  id: 'remote-1', url: 'https://example.com/page', title: 'Example', spaceId: 'space-1',
}]);

const now = Date.UTC(2026, 8, 24);
const snapshot = {
  version: 1,
  deviceId: 'device_abc-123',
  deviceName: 'Laptop',
  deviceType: 'Ext',
  updatedAt: now - 1000,
  tabs,
};
assert.deepEqual(parseRaindropTmpTabsSnapshot(snapshot, now), snapshot);
assert.equal(parseRaindropTmpTabsSnapshot({ ...snapshot, updatedAt: now - RAINDROP_TMP_TABS_TTL_MS - 1 }, now), null);
assert.equal(parseRaindropTmpTabsSnapshot({ ...snapshot, deviceId: '../other-device' }, now), null);
assert.deepEqual(parseRaindropTmpTabsSnapshot({ ...snapshot, tabs: [] }, now)?.tabs, []);
