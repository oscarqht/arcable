import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSyncProvider } from '../dist/utils/syncProvider.js';

test('1. if user has logged in to google oauth, use arcable cloud (supabase)', () => {
  assert.equal(resolveSyncProvider(true, false), 'supabase');
  // Even if user also logged into raindrop, google oauth takes precedence
  assert.equal(resolveSyncProvider(true, true), 'supabase');
});

test('2. otherwise, if user has logged in to raindrop, use raindrop', () => {
  assert.equal(resolveSyncProvider(false, true), 'raindrop');
});

test('3. otherwise, if user has logged in to none, don\'t sync (local)', () => {
  assert.equal(resolveSyncProvider(false, false), 'local');
});
