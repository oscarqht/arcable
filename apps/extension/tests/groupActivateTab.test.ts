import { Tab, TabUrlVariant, TabAssociationMap } from '@arcable/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running groupActivateTab tests...');

// Mock implementation of the selection & cycling logic used in sidepanel handleActivateGroup
interface GroupActivationContext {
  tabAssociations: TabAssociationMap;
  highlightedTabId: string | null;
  lastActivatedTimestamps: Map<string, number>;
  activatedBrowserTabId: number | null;
}

function resolveGroupTargetVariant(
  groupTab: Tab,
  ctx: GroupActivationContext
): { targetVariant: TabUrlVariant | null; shouldActivate: boolean } {
  const variants = (groupTab.urlVariants || []).filter((v) => Boolean(v.url));
  if (variants.length === 0) {
    return { targetVariant: null, shouldActivate: false };
  }

  const openVariants = variants.filter((v) => v.id && Boolean(ctx.tabAssociations[v.id]));
  if (openVariants.length === 0) {
    return { targetVariant: null, shouldActivate: false };
  }

  const currentActiveId = ctx.highlightedTabId;
  const currentActiveIndex = openVariants.findIndex((v) => v.id === currentActiveId);

  let targetVariant: TabUrlVariant;
  if (currentActiveIndex !== -1 && openVariants.length > 1) {
    // Cycle to next open tab in the group if the active tab is already in the group
    targetVariant = openVariants[(currentActiveIndex + 1) % openVariants.length];
  } else {
    // Sort open variants by last activated timestamp descending
    const sorted = [...openVariants].sort((a, b) => {
      const timeA = a.id ? ctx.lastActivatedTimestamps.get(a.id) || 0 : 0;
      const timeB = b.id ? ctx.lastActivatedTimestamps.get(b.id) || 0 : 0;
      return timeB - timeA;
    });
    targetVariant = sorted[0];
  }

  if (!targetVariant?.id || !ctx.tabAssociations[targetVariant.id]) {
    return { targetVariant: null, shouldActivate: false };
  }

  return { targetVariant, shouldActivate: true };
}

// -------------------------------------------------------------
// Test 1: No open tabs in group -> shouldActivate is false
// -------------------------------------------------------------
{
  const groupTab: Tab = {
    id: 'grp-1',
    customTitle: 'Dev Docs',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'v1', name: 'React', url: 'https://react.dev' },
      { id: 'v2', name: 'Vite', url: 'https://vite.dev' },
    ],
  };

  const ctx: GroupActivationContext = {
    tabAssociations: {},
    highlightedTabId: null,
    lastActivatedTimestamps: new Map(),
    activatedBrowserTabId: null,
  };

  const result = resolveGroupTargetVariant(groupTab, ctx);
  assert(!result.shouldActivate, 'Should not activate when no tabs are open');
  assert(result.targetVariant === null, 'Target variant should be null');
  console.log('✓ Group with no open tabs does not activate and returns false');
}

// -------------------------------------------------------------
// Test 2: Exactly one open tab in group -> activates that tab
// -------------------------------------------------------------
{
  const groupTab: Tab = {
    id: 'grp-1',
    customTitle: 'Dev Docs',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'v1', name: 'React', url: 'https://react.dev' },
      { id: 'v2', name: 'Vite', url: 'https://vite.dev' },
    ],
  };

  const ctx: GroupActivationContext = {
    tabAssociations: {
      v2: {
        tabItemId: 'v2',
        browserTabId: 202,
        windowId: 1,
        currentUrl: 'https://vite.dev',
        originalUrl: 'https://vite.dev',
        isDiverted: false,
      },
    },
    highlightedTabId: 'other-tab',
    lastActivatedTimestamps: new Map([['v2', 1000]]),
    activatedBrowserTabId: null,
  };

  const result = resolveGroupTargetVariant(groupTab, ctx);
  assert(result.shouldActivate, 'Should activate the only open tab');
  assert(result.targetVariant?.id === 'v2', 'Target variant should be v2');
  console.log('✓ Group with single open tab correctly activates it');
}

// -------------------------------------------------------------
// Test 3: Multiple open tabs -> activates the one with highest lastActivatedTimestamp
// -------------------------------------------------------------
{
  const groupTab: Tab = {
    id: 'grp-1',
    customTitle: 'Dev Docs',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'v1', name: 'React', url: 'https://react.dev' },
      { id: 'v2', name: 'Vite', url: 'https://vite.dev' },
      { id: 'v3', name: 'Next', url: 'https://nextjs.org' },
    ],
  };

  const ctx: GroupActivationContext = {
    tabAssociations: {
      v1: {
        tabItemId: 'v1',
        browserTabId: 101,
        windowId: 1,
        currentUrl: 'https://react.dev',
        originalUrl: 'https://react.dev',
        isDiverted: false,
      },
      v2: {
        tabItemId: 'v2',
        browserTabId: 102,
        windowId: 1,
        currentUrl: 'https://vite.dev',
        originalUrl: 'https://vite.dev',
        isDiverted: false,
      },
    },
    highlightedTabId: 'some-other-tab',
    lastActivatedTimestamps: new Map([
      ['v1', 5000],
      ['v2', 8000], // v2 was active more recently than v1
    ]),
    activatedBrowserTabId: null,
  };

  const result = resolveGroupTargetVariant(groupTab, ctx);
  assert(result.shouldActivate, 'Should activate open tab');
  assert(result.targetVariant?.id === 'v2', 'Should activate v2 because it has higher timestamp');
  console.log('✓ Group with multiple open tabs activates the most recently active one');
}

// -------------------------------------------------------------
// Test 4: Currently active tab is ALREADY in the group -> cycles to next open tab
// -------------------------------------------------------------
{
  const groupTab: Tab = {
    id: 'grp-1',
    customTitle: 'Dev Docs',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'v1', name: 'React', url: 'https://react.dev' },
      { id: 'v2', name: 'Vite', url: 'https://vite.dev' },
      { id: 'v3', name: 'Next', url: 'https://nextjs.org' },
    ],
  };

  // v1 and v3 are open (v2 is closed). Currently active is v1.
  const ctx: GroupActivationContext = {
    tabAssociations: {
      v1: {
        tabItemId: 'v1',
        browserTabId: 101,
        windowId: 1,
        currentUrl: 'https://react.dev',
        originalUrl: 'https://react.dev',
        isDiverted: false,
      },
      v3: {
        tabItemId: 'v3',
        browserTabId: 103,
        windowId: 1,
        currentUrl: 'https://nextjs.org',
        originalUrl: 'https://nextjs.org',
        isDiverted: false,
      },
    },
    highlightedTabId: 'v1',
    lastActivatedTimestamps: new Map([
      ['v1', 9000],
      ['v3', 4000],
    ]),
    activatedBrowserTabId: null,
  };

  const result1 = resolveGroupTargetVariant(groupTab, ctx);
  assert(result1.shouldActivate, 'Should activate');
  assert(result1.targetVariant?.id === 'v3', 'Should cycle from v1 to v3');

  // Next cycle: when v3 is active, cycle back to v1
  ctx.highlightedTabId = 'v3';
  const result2 = resolveGroupTargetVariant(groupTab, ctx);
  assert(result2.shouldActivate, 'Should activate');
  assert(result2.targetVariant?.id === 'v1', 'Should cycle from v3 back to v1');

  console.log('✓ Group cycling correctly cycles through open tabs when active tab is in the group');
}

console.log('All groupActivateTab tests passed successfully!');
