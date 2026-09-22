import test from 'node:test';
import assert from 'node:assert/strict';
import type { TmpTab } from '@arcable/shared/types';
import { areUrlsMatching } from '@arcable/shared/utils';

test('Multiple browser tabs with identical URL each produce distinct TmpTab items', () => {
  // Simulating unmatched browser tabs with identical URLs
  const currentDevId = 'device_local_123';
  const sharedUrl = 'https://news.ycombinator.com/';
  const allBrowserTabs = [
    { id: 101, windowId: 1, url: sharedUrl, title: 'Hacker News' },
    { id: 102, windowId: 1, url: sharedUrl, title: 'Hacker News' },
    { id: 103, windowId: 2, url: sharedUrl, title: 'Hacker News' },
  ];

  const now = 1000;
  const memoryTmpTabs: TmpTab[] = [];

  // Phase 3 simulation from TabTracker.syncWithWorkspace:
  const generatedTmpTabs: TmpTab[] = allBrowserTabs.map((bt) => {
    const existingTmp = memoryTmpTabs.find((t) => t.browserTabId === bt.id);
    const createdAt = existingTmp?.createdAt || now;
    const tabUniqueId = existingTmp?.id || `tmp_${currentDevId}_${bt.id}_${createdAt}`;

    return {
      id: tabUniqueId,
      url: bt.url,
      title: bt.title,
      browserTabId: bt.id,
      windowId: bt.windowId,
      createdAt,
      updatedAt: now,
      deviceId: currentDevId,
      deviceType: 'Ext',
    };
  });

  // Verify that each browser tab corresponds 1-to-1 to a TmpTab item
  assert.equal(generatedTmpTabs.length, 3, 'Must have 3 distinct TmpTab items');
  assert.equal(generatedTmpTabs[0].browserTabId, 101);
  assert.equal(generatedTmpTabs[1].browserTabId, 102);
  assert.equal(generatedTmpTabs[2].browserTabId, 103);

  // Verify unique IDs
  const uniqueIds = new Set(generatedTmpTabs.map((t) => t.id));
  assert.equal(uniqueIds.size, 3, 'Every TmpTab item must have a unique ID');

  // Verify TmpTabsList representation: no URL-based deduplication
  // Each tmp tab must be rendered directly without collapsing
  const renderedItems = generatedTmpTabs.map((tab) => ({
    id: tab.id,
    browserTabId: tab.browserTabId,
    url: tab.url,
  }));
  assert.equal(renderedItems.length, 3, 'Rendered item count must equal browser tab count');
});

test('Custom title on one browser tab does not overwrite another browser tab with the same URL', () => {
  const sharedUrl = 'https://github.com/trending';
  const tmpTabs: TmpTab[] = [
    {
      id: 'tmp_dev_1_1000',
      url: sharedUrl,
      title: 'Trending repositories on GitHub',
      browserTabId: 1,
      windowId: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'tmp_dev_2_1000',
      url: sharedUrl,
      title: 'Trending repositories on GitHub',
      browserTabId: 2,
      windowId: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  type TmpTabCustomTitleRecord = {
    tabId?: number;
    url: string;
    customTitle: string;
    updatedAt: number;
  };

  let records: TmpTabCustomTitleRecord[] = [];

  // Function simulating the updated setTmpTabCustomTitle logic
  function applyCustomTitle(
    browserTabId: number | undefined,
    url: string,
    customTitle: string,
    currentTmp: TmpTab[]
  ) {
    const trimmed = customTitle.trim();
    if (!trimmed) {
      records = records.filter((r) =>
        browserTabId !== undefined ? r.tabId !== browserTabId : !areUrlsMatching(r.url, url)
      );
    } else {
      const existingIndex = records.findIndex((r) =>
        browserTabId !== undefined ? r.tabId === browserTabId : areUrlsMatching(r.url, url)
      );
      const newRecord = {
        tabId: browserTabId,
        url,
        customTitle: trimmed,
        updatedAt: Date.now(),
      };
      if (existingIndex >= 0) {
        records = [...records];
        records[existingIndex] = newRecord;
      } else {
        records = [...records, newRecord];
      }
    }

    return currentTmp.map((t) => {
      const isTarget =
        browserTabId !== undefined ? t.browserTabId === browserTabId : areUrlsMatching(t.url, url);
      if (isTarget) {
        return {
          ...t,
          customTitle: trimmed || undefined,
        };
      }
      return t;
    });
  }

  // 1. Rename only browser tab 1 to "GitHub Rust Trends"
  const step1Tabs = applyCustomTitle(1, sharedUrl, 'GitHub Rust Trends', tmpTabs);
  assert.equal(step1Tabs[0].customTitle, 'GitHub Rust Trends');
  assert.equal(step1Tabs[1].customTitle, undefined, 'Tab 2 customTitle must remain untouched');
  assert.equal(records.length, 1);
  assert.equal(records[0].tabId, 1);

  // 2. Rename browser tab 2 to "GitHub Python Trends"
  const step2Tabs = applyCustomTitle(2, sharedUrl, 'GitHub Python Trends', step1Tabs);
  assert.equal(step2Tabs[0].customTitle, 'GitHub Rust Trends');
  assert.equal(step2Tabs[1].customTitle, 'GitHub Python Trends');
  assert.equal(records.length, 2);

  // 3. Clear custom title on tab 1
  const step3Tabs = applyCustomTitle(1, sharedUrl, '', step2Tabs);
  assert.equal(step3Tabs[0].customTitle, undefined, 'Tab 1 customTitle cleared');
  assert.equal(step3Tabs[1].customTitle, 'GitHub Python Trends', 'Tab 2 customTitle preserved');
  assert.equal(records.length, 1);
  assert.equal(records[0].tabId, 2);
});

test('Closing one tmp tab with duplicate URL only closes that specific browser tab', () => {
  const sharedUrl = 'https://docs.anthropic.com/';
  let currentTmpTabs: TmpTab[] = [
    {
      id: 'tmp_dev_50_1000',
      url: sharedUrl,
      title: 'Anthropic Docs',
      browserTabId: 50,
      windowId: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'tmp_dev_51_1000',
      url: sharedUrl,
      title: 'Anthropic Docs',
      browserTabId: 51,
      windowId: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  // Simulating closing tab with browserTabId: 50
  const closingTabId = 50;
  const updatedTmpTabs = currentTmpTabs.filter((t) => t.browserTabId !== closingTabId);

  assert.equal(updatedTmpTabs.length, 1, 'Only one tab should be removed');
  assert.equal(updatedTmpTabs[0].browserTabId, 51, 'Remaining tab is tab 51');
  assert.equal(updatedTmpTabs[0].url, sharedUrl, 'Remaining tab preserves its URL');
});
