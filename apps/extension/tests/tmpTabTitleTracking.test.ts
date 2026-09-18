import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTmpTabs } from '../src/utils/tmpTabDiff';
import type { TmpTab } from '@arcable/shared/types';

test('TmpTab title tracking: initial title is set on tab.title, customTitle remains undefined', () => {
  const browserTabId = 101;
  const initialUrl = 'https://github.com/oscarqht/arcable';
  const initialTitle = 'GitHub - arcable';

  // Simulating registerInitialTmpTab logic
  const now = Date.now();
  const tmpTab: TmpTab = {
    id: `tmp_dev_${browserTabId}_${now}`,
    url: initialUrl,
    title: initialTitle,
    customTitle: undefined,
    browserTabId,
    windowId: 1,
    createdAt: now,
    updatedAt: now,
    deviceType: 'Ext',
  };

  assert.equal(tmpTab.title, 'GitHub - arcable');
  assert.equal(tmpTab.customTitle, undefined, 'Opening tmp tab must not set customTitle');
});

test('TmpTab title tracking: browser tab title update updates tmp tab title when no customTitle is set', () => {
  const browserTabId = 102;
  const initialUrl = 'https://news.ycombinator.com';
  const initialTitle = 'Hacker News';

  let currentTmpTab: TmpTab = {
    id: `tmp_dev_${browserTabId}_1000`,
    url: initialUrl,
    title: initialTitle,
    customTitle: undefined,
    browserTabId,
    windowId: 1,
    createdAt: 1000,
    updatedAt: 1000,
    deviceType: 'Ext',
  };

  // Simulating tabs.onUpdated firing with a new page title
  const updatedBrowserTitle = 'Hacker News | New Links and Comments';
  const rawTitle = updatedBrowserTitle.trim();
  const isMeaningful = Boolean(rawTitle && rawTitle !== 'about:blank' && rawTitle !== currentTmpTab.url);

  assert.ok(isMeaningful, 'Title should be considered meaningful');
  currentTmpTab = {
    ...currentTmpTab,
    title: rawTitle,
    updatedAt: 2000,
  };

  assert.equal(currentTmpTab.title, 'Hacker News | New Links and Comments');
  assert.equal(currentTmpTab.customTitle, undefined);

  // Reconcile diff detection
  const diff = reconcileTmpTabs([
    { ...currentTmpTab, title: initialTitle, updatedAt: 1000 }
  ], [currentTmpTab], 2000);

  assert.ok(diff.changed, 'reconcileTmpTabs must detect title change');
  assert.equal(diff.tabs[0].title, 'Hacker News | New Links and Comments');
});

test('TmpTab title tracking: when user manually sets customTitle, browser title updates in background while customTitle sticks', () => {
  const browserTabId = 103;
  const initialUrl = 'https://youtube.com/watch?v=123';
  const initialTitle = 'YouTube';

  let currentTmpTab: TmpTab = {
    id: `tmp_dev_${browserTabId}_1000`,
    url: initialUrl,
    title: initialTitle,
    customTitle: undefined,
    browserTabId,
    windowId: 1,
    createdAt: 1000,
    updatedAt: 1000,
    deviceType: 'Ext',
  };

  // 1. User manually renames the tab to "Focus Music"
  const manualTitle = 'Focus Music';
  currentTmpTab = {
    ...currentTmpTab,
    customTitle: manualTitle,
    updatedAt: 1500,
  };

  assert.equal(currentTmpTab.customTitle, 'Focus Music');

  // 2. Browser tab document title updates dynamically (e.g. video title loaded by SPA)
  const newBrowserTabTitle = 'Lofi Hip Hop Radio - Beats to Relax/Study to';
  currentTmpTab = {
    ...currentTmpTab,
    title: newBrowserTabTitle,
    updatedAt: 2000,
  };

  // 3. Verify underlying title tracked browser title, but customTitle remains intact
  assert.equal(currentTmpTab.title, 'Lofi Hip Hop Radio - Beats to Relax/Study to');
  assert.equal(currentTmpTab.customTitle, 'Focus Music');

  // Display title resolution (matching TmpTabRow display logic)
  const displayTitle = currentTmpTab.customTitle || currentTmpTab.title || 'Untitled';
  assert.equal(displayTitle, 'Focus Music', 'Display title must prioritize manual customTitle');

  // 4. User clears customTitle (renames to "")
  currentTmpTab = {
    ...currentTmpTab,
    customTitle: undefined,
    updatedAt: 2500,
  };

  const clearedDisplayTitle = currentTmpTab.customTitle || currentTmpTab.title || 'Untitled';
  assert.equal(clearedDisplayTitle, 'Lofi Hip Hop Radio - Beats to Relax/Study to', 'Clearing custom title must reveal live browser title');
});

test('TmpTab title tracking: empty or blank titles do not overwrite meaningful titles', () => {
  const initialTitle = 'Important Document';
  let tabTitle = initialTitle;

  const handleTitleUpdate = (candidateTitle?: string) => {
    const trimmed = candidateTitle?.trim();
    if (trimmed && trimmed !== 'about:blank') {
      tabTitle = trimmed;
    }
  };

  handleTitleUpdate('');
  assert.equal(tabTitle, 'Important Document', 'Empty string must not overwrite title');

  handleTitleUpdate('   ');
  assert.equal(tabTitle, 'Important Document', 'Whitespace must not overwrite title');

  handleTitleUpdate('about:blank');
  assert.equal(tabTitle, 'Important Document', 'about:blank must not overwrite title');

  handleTitleUpdate('Updated Document Title');
  assert.equal(tabTitle, 'Updated Document Title', 'Valid title must update title');
});
