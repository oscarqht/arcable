import { reconcileTmpTabs, reconcileTmpTabsWithBrowserTabs } from '../src/utils/tmpTabDiff';
import type { TmpTab } from '@arcable/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const previous: TmpTab[] = [{
  id: 'tmp-device-1',
  url: 'https://example.com',
  title: 'Example',
  browserTabId: 1,
  windowId: 1,
  createdAt: 10,
  updatedAt: 20,
}];

const unchangedCandidate: TmpTab[] = previous.map((tab) => ({ ...tab, updatedAt: 999 }));
const unchanged = reconcileTmpTabs(previous, unchangedCandidate, 1_000);
assert(!unchanged.changed, 'timestamp-only temporary-tab changes should be ignored');
assert(unchanged.tabs[0] === previous[0], 'unchanged temporary tabs should retain their existing object and timestamp');

const changedCandidate: TmpTab[] = previous.map((tab) => ({ ...tab, title: 'Updated', updatedAt: 999 }));
const changed = reconcileTmpTabs(previous, changedCandidate, 1_000);
assert(changed.changed, 'meaningful temporary-tab changes should be detected');
assert(changed.tabs[0].updatedAt === 1_000, 'meaningful changes should receive the current timestamp');

const spaceChangedCandidate: TmpTab[] = previous.map((tab) => ({ ...tab, spaceId: 'space-new', updatedAt: 999 }));
const spaceChanged = reconcileTmpTabs(previous, spaceChangedCandidate, 1_000);
assert(spaceChanged.changed, 'spaceId change should be detected as meaningful');
assert(spaceChanged.tabs[0].spaceId === 'space-new', 'updated spaceId should be preserved');

const navigated = reconcileTmpTabsWithBrowserTabs([
  {
    ...previous[0],
    url: 'https://www.reddit.com/',
    title: 'Reddit',
    customTitle: 'My reading',
    spaceId: 'space-reading',
    deviceId: 'device-a',
    deviceName: 'Laptop',
    deviceType: 'Ext',
  },
], [{
  id: 1,
  url: 'https://www.reddit.com/r/subreddit_1/',
  title: 'Subreddit 1 : Reddit',
  favIconUrl: 'https://www.redditstatic.com/favicon.ico',
  status: 'complete',
}], 2_000);
assert(navigated.changed, 'navigation metadata should be detected');
assert(navigated.tabs[0].url === 'https://www.reddit.com/r/subreddit_1/', 'the destination URL should replace the previous URL');
assert(navigated.tabs[0].title === 'Subreddit 1 : Reddit', 'the destination title should replace the previous title');
assert(navigated.tabs[0].favIconUrl === 'https://www.redditstatic.com/favicon.ico', 'the destination favicon should be saved');
assert(navigated.tabs[0].updatedAt === 2_000, 'navigation should update the timestamp');
assert(navigated.tabs[0].id === previous[0].id, 'navigation should preserve the tmp tab ID');
assert(navigated.tabs[0].spaceId === 'space-reading', 'navigation should preserve the space');
assert(navigated.tabs[0].customTitle === 'My reading', 'navigation should preserve the custom title');
assert(navigated.tabs[0].deviceId === 'device-a', 'navigation should preserve the device');

const sameSnapshot = reconcileTmpTabsWithBrowserTabs(navigated.tabs, [{
  id: 1,
  url: 'https://www.reddit.com/r/subreddit_1/',
  title: 'Subreddit 1 : Reddit',
  favIconUrl: 'https://www.redditstatic.com/favicon.ico',
  status: 'complete',
}], 3_000);
assert(!sameSnapshot.changed, 'an unchanged browser snapshot should not trigger a write');
assert(sameSnapshot.tabs[0] === navigated.tabs[0], 'an unchanged snapshot should retain the same object');

const loading = reconcileTmpTabsWithBrowserTabs(navigated.tabs, [{
  id: 1,
  url: 'https://www.reddit.com/r/subreddit_1/',
  pendingUrl: 'https://www.reddit.com/r/subreddit_2/',
  title: 'Subreddit 1 : Reddit',
  favIconUrl: 'https://www.redditstatic.com/favicon.ico',
  status: 'loading',
}], 4_000);
assert(loading.tabs[0].url === 'https://www.reddit.com/r/subreddit_2/', 'pending URL should be used during navigation');
assert(loading.tabs[0].title !== 'Subreddit 1 : Reddit', 'stale loading title should not be published with the new URL');
assert(loading.tabs[0].favIconUrl === undefined, 'a stale favicon should be cleared during navigation');

const loaded = reconcileTmpTabsWithBrowserTabs(loading.tabs, [{
  id: 1,
  url: 'https://www.reddit.com/r/subreddit_2/',
  title: 'Subreddit 2 : Reddit',
  status: 'complete',
}], 4_500);
assert(loaded.changed, 'the destination title should be detected after loading');
assert(loaded.tabs[0].title === 'Subreddit 2 : Reddit', 'the loaded title should be saved');

const unbound: TmpTab = { id: 'tmp-unbound', url: 'https://example.org', title: 'Unbound' };
const removed = reconcileTmpTabsWithBrowserTabs([navigated.tabs[0], unbound], [], 5_000);
assert(removed.changed, 'closed browser tabs should be removed');
assert(removed.tabs.length === 1 && removed.tabs[0] === unbound, 'tabs without a browser ID should be preserved');

console.log('Temporary-tab diff tests passed.');
