import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../src/app/api/raindrop/sync/route.ts', import.meta.url), 'utf8');
const workspaceHook = await readFile(
  new URL('../../../packages/shared/src/hooks/useWorkspace.ts', import.meta.url),
  'utf8'
);
const workspaceManager = await readFile(
  new URL('../../../packages/shared/src/components/workspace/WorkspaceManager.tsx', import.meta.url),
  'utf8'
);

assert.doesNotMatch(page, /replayOperations\(res\.data, pending/,
  'page-load hydration must never replay the stale local outbox over Raindrop data');
assert.match(page, /clearStoredPendingOperations\(\);[\s\S]*workspaceRef\.current\?\.applySnapshot\?\.\(res\.data\)/,
  'a successful page-load hydration must discard the local outbox before applying Raindrop data');
assert.match(page, /deviceId:\s*syncParams\?\.deviceId/,
  'web sync requests must forward the stable client device ID');
assert.match(page, /deviceName:\s*getStoredDeviceName\([^)]*['"]Web App['"]/,
  'web sync requests must identify the web device');
assert.match(page, /pendingOps:\s*\[\][\s\S]*replaceBaseline:\s*true/,
  'web restores must replace the Raindrop baseline instead of merging stale history');
assert.match(page, /const \[isInitialSyncing, setIsInitialSyncing\] = useState\(false\);[\s\S]*const \[isWorkspaceSyncing, setIsWorkspaceSyncing\] = useState\(false\);[\s\S]*const isSyncing = isInitialSyncing \|\| isWorkspaceSyncing/,
  'the header must combine page-load and workspace-manager sync state');
assert.match(page, /setIsInitialSyncing\(true\)[\s\S]*handleFetchWorkspace\(\)[\s\S]*\.finally\(\(\)\s*=>\s*\{\s*setIsInitialSyncing\(false\)/,
  'page load must trigger the initial Raindrop sync and keep its header state active until it settles');
assert.match(page, /onSyncStateChange=\{setIsWorkspaceSyncing\}/,
  'manual and background workspace syncs must update the same header state');
assert.match(page, /animation: isSyncing \? 'spin 1s linear infinite' : 'none'/,
  'the header Raindrop icon must rotate whenever either sync is active');

assert.match(route, /deviceId:\s*body\?\.deviceId/,
  'the route must forward the web device ID to the shared sync engine');
assert.match(route, /deviceName:\s*body\?\.deviceName/,
  'the route must forward the web device name to the shared sync engine');

assert.match(workspaceHook, /raindropMetadataItemId:\s*snapshot\.raindropMetadataItemId/,
  'hydrated snapshots must retain the metadata item identity used by incremental sync');
assert.match(workspaceHook, /const hasGlobalWorkspaceData = Boolean\(/,
  'a workspace with only global favourites or widgets must not be discarded for having no spaces');
assert.match(workspaceHook, /parsed\.spaces\.length === 0 && !hasGlobalWorkspaceData/,
  'only an entirely empty workspace may be reset when it has no spaces');
assert.match(workspaceHook, /const remoteMetadataMissing = snapshot\.raindropMetadataItemId === null/,
  'hydration must distinguish an absent metadata file from an explicit empty metadata payload');
assert.match(workspaceHook, /widgets:\s*remoteMetadataMissing \? \(prev\.widgets \|\| \[\]\) : \(snapshot\.widgets \|\| \[\]\)/,
  'hydration must retain widgets when Raindrop has no canonical metadata file');
assert.match(workspaceHook, /customCodeRules:\s*remoteMetadataMissing \? \(prev\.customCodeRules \|\| \[\]\) : \(snapshot\.customCodeRules \|\| \[\]\)/,
  'hydration must retain Custom JS/CSS when Raindrop has no canonical metadata file');
assert.match(workspaceHook, /runCodeInPageRules:\s*remoteMetadataMissing \? \(prev\.runCodeInPageRules \|\| \[\]\) : \(snapshot\.runCodeInPageRules \|\| \[\]\)/,
  'hydration must retain Run Code when Raindrop has no canonical metadata file');

assert.match(
  workspaceManager,
  /applySnapshot:\s*\(snapshot: ArcableWorkspaceData\)\s*=>\s*\{[\s\S]*?snapshot\.raindropMetadataItemId === null[\s\S]*?latestWorkspaceDataRef\.current = hydratedSnapshot;[\s\S]*?applyLatestSnapshot\(hydratedSnapshot\);/,
  'a metadata-less hydration must retain local metadata in the manager\'s synchronous workspace reference'
);

console.log('Web Raindrop sync parity tests passed.');
