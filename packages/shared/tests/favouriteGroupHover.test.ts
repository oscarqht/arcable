import test from 'node:test';
import assert from 'node:assert/strict';
import type { Tab } from '../src/types/workspace';

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

test('favourite group hover state machine: mouse leave side panel page dismisses popover after 150ms', async () => {
  let groupPopoverTab: { tabId: string } | null = null;
  let groupLeaveTimer: NodeJS.Timeout | null = null;
  let isMouseOverGroup: string | null = null;
  let isMouseOverGroupPopover = false;
  let isMouseOutsidePage = false;

  const clearGroupLeaveTimer = () => {
    if (groupLeaveTimer) {
      clearTimeout(groupLeaveTimer);
      groupLeaveTimer = null;
    }
  };

  const scheduleGroupPopoverClose = (delay = 80) => {
    clearGroupLeaveTimer();
    const effectiveDelay = isMouseOutsidePage ? 150 : delay;
    groupLeaveTimer = setTimeout(() => {
      if (!isMouseOverGroup && !isMouseOverGroupPopover) {
        groupPopoverTab = null;
      }
    }, effectiveDelay);
  };

  const onGroupMouseEnter = (tabId: string) => {
    isMouseOutsidePage = false;
    clearGroupLeaveTimer();
    isMouseOverGroup = tabId;
    groupPopoverTab = { tabId };
  };

  const onPopoverMouseEnter = () => {
    isMouseOutsidePage = false;
    clearGroupLeaveTimer();
    isMouseOverGroupPopover = true;
  };

  const onPopoverMouseLeave = () => {
    isMouseOverGroupPopover = false;
    scheduleGroupPopoverClose(80);
  };

  const onMouseLeavePage = () => {
    isMouseOutsidePage = true;
    isMouseOverGroup = null;
    isMouseOverGroupPopover = false;
    if (groupPopoverTab) {
      scheduleGroupPopoverClose(150);
    } else {
      clearGroupLeaveTimer();
    }
  };

  // Case 1: Popover shown, mouse leaves side panel page -> dismisses after 150ms
  onGroupMouseEnter('grp-1');
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' }, 'Popover is shown on group hover');

  onMouseLeavePage();
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' }, 'Popover is still open immediately upon mouse leave');

  // After 90ms (past standard 80ms delay), it should still be open because delay is 150ms
  await new Promise((r) => setTimeout(r, 90));
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-1' }, 'Popover still open at 90ms');

  // Past 150ms total (e.g. +90ms more = 180ms total), it should be dismissed
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(groupPopoverTab, null, 'Popover dismissed after 150ms');

  // Case 2: Popover shown, mouse in popover, leaves side panel page
  onGroupMouseEnter('grp-2');
  onPopoverMouseEnter();
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-2' });

  onPopoverMouseLeave();
  onMouseLeavePage();
  await new Promise((r) => setTimeout(r, 90));
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-2' }, 'Popover still open at 90ms');

  await new Promise((r) => setTimeout(r, 90));
  assert.equal(groupPopoverTab, null, 'Popover dismissed after 150ms');

  // Case 3: Mouse leaves side panel page, but returns and enters group within 150ms
  onGroupMouseEnter('grp-3');
  onMouseLeavePage();
  await new Promise((r) => setTimeout(r, 50));
  // User moves cursor back to group within 150ms
  onGroupMouseEnter('grp-3');
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-3' }, 'Popover stays open if mouse re-enters within 150ms');
});

test('mobile browser: groups in favorite section open popover on single click without double click requirement', () => {
  // Model state machine for mobile vs desktop interaction
  let groupPopoverTab: { tabId: string } | null = null;
  let lastTouchTime = 0;

  const isMobileOrTouch = (isMobileEnv: boolean) => {
    return isMobileEnv || Date.now() - lastTouchTime < 1000;
  };

  const handleTouchStart = () => {
    lastTouchTime = Date.now();
  };

  const handleMouseEnter = (tabId: string, isMobileEnv: boolean) => {
    if (isMobileOrTouch(isMobileEnv)) {
      // In mobile/touch environment, do NOT open popover on synthesized mouseenter
      return;
    }
    groupPopoverTab = { tabId };
  };

  const handleMouseLeave = (tabId: string, isMobileEnv: boolean) => {
    if (isMobileOrTouch(isMobileEnv)) {
      return;
    }
    if (groupPopoverTab?.tabId === tabId) {
      groupPopoverTab = null;
    }
  };

  const handleClick = (tabId: string) => {
    if (groupPopoverTab?.tabId === tabId) {
      groupPopoverTab = null;
    } else {
      groupPopoverTab = { tabId };
    }
  };

  // Scenario 1: Desktop browser with mouse (isMobileEnv = false, no touch)
  // Hover opens popover
  assert.equal(groupPopoverTab, null);
  handleMouseEnter('grp-desktop', false);
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-desktop' }, 'Desktop hover opens popover');
  handleMouseLeave('grp-desktop', false);
  assert.equal(groupPopoverTab, null, 'Desktop mouseleave closes popover');

  // Scenario 2: Mobile browser (isMobileEnv = true)
  // When user taps on mobile browser:
  // Step 1: touchstart fires
  handleTouchStart();
  // Step 2: browser synthesizes mouseenter
  handleMouseEnter('grp-mobile', true);
  // Popover must NOT have been opened by synthesized mouseenter!
  assert.equal(groupPopoverTab, null, 'Synthesized mouseenter on mobile does not open popover');
  // Step 3: browser fires click
  handleClick('grp-mobile');
  // First click successfully opens popover!
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-mobile' }, 'Single click on mobile opens the group items popover');

  // Step 4: Second click on the same group toggles it closed
  handleClick('grp-mobile');
  assert.equal(groupPopoverTab, null, 'Second click toggles popover closed');

  // Step 5: Tapping a different group opens it on a single click
  handleTouchStart();
  handleMouseEnter('grp-mobile-2', true);
  handleClick('grp-mobile-2');
  assert.deepEqual(groupPopoverTab, { tabId: 'grp-mobile-2' }, 'Single click opens another group');
});

