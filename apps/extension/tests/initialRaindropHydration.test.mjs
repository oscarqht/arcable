import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidepanel = await readFile(new URL('../src/sidepanel/App.tsx', import.meta.url), 'utf8');
const popup = await readFile(new URL('../src/popup/App.tsx', import.meta.url), 'utf8');
const background = await readFile(new URL('../src/background/index.ts', import.meta.url), 'utf8');

assert.match(sidepanel, /type:\s*'RAINDROP_FETCH_WORKSPACE'/,
  'the side panel must fetch the authoritative Raindrop tree at startup');
assert.doesNotMatch(sidepanel, /replayOperations\(res\.data, pending\)/,
  'side-panel startup must not replay the stale local outbox over Raindrop data');
assert.match(sidepanel, /clearStoredPendingOperations\(\);[\s\S]*applySidepanelActiveSpace\(res\.data/,
  'side-panel startup must clear the local outbox before applying Raindrop data');

assert.match(popup, /void hydrateWorkspaceFromRaindrop\(\);/,
  'the popup must hydrate from Raindrop instead of starting with a write-sync');
assert.match(popup, /type:\s*'RAINDROP_FETCH_WORKSPACE'/,
  'popup startup must fetch the authoritative Raindrop tree');
assert.match(popup, /clearStoredPendingOperations\(\);[\s\S]*window\.localStorage\.setItem\('arcable_workspace_data'/,
  'popup startup must replace its local workspace only after clearing the stale local outbox');

assert.match(background, /arcable_workspace_snapshot:\s*result\.data,[\s\S]*arcable_pending_ops:\s*\[\]/,
  'the extension fetch handler must replace the persisted snapshot and clear its persisted outbox together');
assert.match(background, /\[CUSTOM_CODE_STORAGE_KEY\]:\s*result\.data\.customCodeRules \|\| \[\],[\s\S]*\[RUN_CODE_IN_PAGE_STORAGE_KEY\]:\s*result\.data\.runCodeInPageRules \|\| \[\]/,
  'the extension fetch handler must replace its dedicated custom JS/CSS and Run Code stores, including with empty remote lists');
const onInstalled = background.slice(background.indexOf('browser.runtime.onInstalled'), background.indexOf('if (browser.runtime?.onStartup)'));
assert.match(onInstalled, /fetchAndCacheRaindropWorkspace\(\)/,
  'extension install/update startup must hydrate from Raindrop before any later sync');
assert.doesNotMatch(onInstalled, /triggerBackgroundSync\(\)/,
  'extension install/update startup must not write the stale cache before hydration');
assert.match(sidepanel, /hasAppliedAuthoritativeSnapshotRef\.current/,
  'the side panel must prevent an earlier asynchronous cache read from overwriting its fetched snapshot');

console.log('Extension initial Raindrop hydration tests passed.');
