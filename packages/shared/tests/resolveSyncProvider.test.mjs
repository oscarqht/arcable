import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSyncProvider } from '../dist/utils/syncProvider.js';

test('1. if user has logged in to raindrop, use raindrop', () => {
  assert.equal(resolveSyncProvider(true), 'raindrop');
});

test('2. otherwise, if user has not logged in, don\'t sync (local)', () => {
  assert.equal(resolveSyncProvider(false), 'local');
  assert.equal(resolveSyncProvider(undefined), 'local');
});
