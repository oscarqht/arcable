import assert from 'node:assert/strict';
import { getUploadedCoverCache, refreshUploadedCoverCache, cacheUploadedCover } from '../src/utils/uploadedCoverCache';
import type { UploadedCover } from '../src/types/raindrop';

async function main() {
  const first: UploadedCover = { id: 1, name: 'first.png', url: 'https://example.com/first.png', createdAt: '' };
  const second = { ...first, id: 2, name: 'second.png' };
  const cache = getUploadedCoverCache('account-a');
  await refreshUploadedCoverCache(cache, async () => [first]);
  assert.deepEqual(getUploadedCoverCache('account-a').items, [first], 'reopening reads cached covers synchronously');
  let resolve!: (items: UploadedCover[]) => void;
  let requests = 0;
  const delayed = () => { requests++; return new Promise<UploadedCover[]>((done) => { resolve = done; }); };
  const refresh = refreshUploadedCoverCache(cache, delayed);
  assert.strictEqual(refreshUploadedCoverCache(cache, delayed), refresh, 'concurrent pickers share one request');
  assert.deepEqual(cache.items, [first], 'background refresh leaves cached images selectable');
  await Promise.resolve();
  assert.equal(requests, 1);
  let notifications = 0;
  cache.listeners.add(() => { notifications++; });
  cacheUploadedCover(cache, second);
  resolve([first]);
  await refresh;
  assert.deepEqual(cache.items, [second, first], 'a stale refresh must preserve an upload that finished in the meantime');
  assert.equal(notifications, 1);
  await assert.rejects(refreshUploadedCoverCache(cache, async () => { throw new Error('offline'); }), /offline/);
  assert.deepEqual(cache.items, [second, first], 'failed refresh preserves the last successful list');
  assert.equal(cache.pending, undefined, 'failed requests can be retried');
  await refreshUploadedCoverCache(cache, async () => []);
  assert.deepEqual(cache.items, [], 'a successful empty response removes stale covers');
  assert.equal(notifications, 2);
  assert.equal(getUploadedCoverCache('account-b').items, undefined, 'accounts cannot see one another\'s cached covers');
  const loader = async () => [first];
  const callbackCache = getUploadedCoverCache(undefined, loader);
  await refreshUploadedCoverCache(callbackCache, loader);
  assert.strictEqual(getUploadedCoverCache(undefined, loader), callbackCache);
  assert.notStrictEqual(getUploadedCoverCache(undefined, async () => []), callbackCache, 'callback-only sessions remain separate');
  console.log('Uploaded-cover cache reopen, refresh, upload race, failure, empty list, and account isolation checks passed.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
