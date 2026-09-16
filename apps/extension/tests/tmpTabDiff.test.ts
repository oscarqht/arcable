import { reconcileTmpTabs } from '../src/utils/tmpTabDiff';
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

console.log('Temporary-tab diff tests passed.');
