import test from 'node:test';
import assert from 'node:assert/strict';
import { Tab } from '../src/types';

test('favourite group hover state machine: immediate open and grace transition to popover', async () => {
  // Model state machine of FavouriteTabsShelf group hover logic
  let groupPopoverTab: { tabId: string } | null = null;
  let groupLeaveTimer: NodeJS.Timeout | null = null;
  let isMouseOverGroup: string | null = null;
  let isMouseOverGroupPopover = false;

  const clearGroupLeaveTimer = () => {
    if (groupLeaveTimer) {
      clearTimeout(groupLeaveTimer);
      groupLeaveTimer = null;
    }
  };

  const scheduleGroupPopoverClose = (delay = 80) => {
    clearGroupLeaveTimer();
    groupLeaveTimer = setTimeout(() => {
      if (!isMouseOverGroup && !isMouseOverGroupPopover) {
        groupPopoverTab = null;
      }
    }, delay);
  };

  const onGroupMouseEnter = (tabId: string) => {
    clearGroupLeaveTimer();
    isMouseOverGroup = tabId;
    groupPopoverTab = { tabId };
  };

  const onGroupMouseLeave = (tabId: string) => {
    if (isMouseOverGroup === tabId) {
      isMouseOverGroup = null;
    }
    scheduleGroupPopoverClose(80);
  };

  const onPopoverMouseEnter = () => {
    clearGroupLeaveTimer();
    isMouseOverGroupPopover = true;
  };

  const onPopoverMouseLeave = () => {
    isMouseOverGroupPopover = false;
    scheduleGroupPopoverClose(80);
  };

  // 1. Initial state: popover closed
  assert.equal(groupPopoverTab, null);

  // 2. Mouse enters group card: popover opens immediately
  onGroupMouseEnter('grp-1');
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' });

  // 3. Mouse leaves group card to travel to popover:
  onGroupMouseLeave('grp-1');
  assert.equal(isMouseOverGroup, null);
  // Still open immediately because grace timer has not elapsed
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' });

  // 4. Mouse enters popover during grace period (e.g. 20ms later)
  await new Promise((r) => setTimeout(r, 20));
  onPopoverMouseEnter();
  assert.equal(isMouseOverGroupPopover, true);
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' });

  // 5. Wait past the original 80ms: popover is still open because mouse is in popover
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' });

  // 6. Mouse leaves popover: closes after 80ms
  onPopoverMouseLeave();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(groupPopoverTab, null);
});

test('favourite group click: webapp toggles popover', () => {
  let groupPopoverTab: { tabId: string } | null = null;

  const handleGroupClickWebapp = (tabId: string) => {
    // Toggles popover open/closed
    if (groupPopoverTab?.tabId === tabId) {
      groupPopoverTab = null;
    } else {
      groupPopoverTab = { tabId };
    }
  };

  handleGroupClickWebapp('grp-1');
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' }, 'First click opens/pins popover');

  handleGroupClickWebapp('grp-1');
  assert.equal(groupPopoverTab, null, 'Second click toggles popover closed');
});

test('favourite group click: extension activates open tab and closes popover, or stays open if none open', async () => {
  let groupPopoverTab: { tabId: string } | null = { tabId: 'grp-1' };

  const handleGroupClickExtension = async (
    tab: Tab,
    onActivateGroup: (tab: Tab) => Promise<boolean>
  ) => {
    const activated = await onActivateGroup(tab);
    if (activated) {
      groupPopoverTab = null;
    }
  };

  // Case A: No open tabs -> onActivateGroup returns false -> popover stays open
  await handleGroupClickExtension({ id: 'grp-1' } as Tab, async () => false);
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' }, 'Popover stays open when no tabs were activated');

  // Case B: Has open tab -> onActivateGroup returns true -> popover closes immediately
  await handleGroupClickExtension({ id: 'grp-1' } as Tab, async () => true);
  assert.equal(groupPopoverTab, null, 'Popover closes immediately upon successful tab activation');
});
