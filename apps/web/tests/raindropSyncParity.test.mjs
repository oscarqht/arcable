import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../src/app/api/raindrop/sync/route.ts', import.meta.url), 'utf8');
const workspaceHook = await readFile(
  new URL('../../../packages/shared/src/hooks/useWorkspace.ts', import.meta.url),
  'utf8'
);

assert.match(page, /replayOperations\(res\.data, pending/,
  'web hydration must replay the local outbox over the remote snapshot');
assert.match(page, /deviceId:\s*syncParams\?\.deviceId/,
  'web sync requests must forward the stable client device ID');
assert.match(page, /deviceName:\s*getStoredDeviceName\([^)]*['"]Web App['"]/,
  'web sync requests must identify the web device');
assert.match(page, /pendingOps:\s*\[\][\s\S]*replaceBaseline:\s*true/,
  'web restores must replace the Raindrop baseline instead of merging stale history');

assert.match(route, /deviceId:\s*body\?\.deviceId/,
  'the route must forward the web device ID to the shared sync engine');
assert.match(route, /deviceName:\s*body\?\.deviceName/,
  'the route must forward the web device name to the shared sync engine');

assert.match(workspaceHook, /raindropMetadataItemId:\s*snapshot\.raindropMetadataItemId/,
  'hydrated snapshots must retain the metadata item identity used by incremental sync');

console.log('Web Raindrop sync parity tests passed.');
