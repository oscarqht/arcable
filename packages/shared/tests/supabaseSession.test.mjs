import test from 'node:test';
import assert from 'node:assert/strict';
import { areSupabaseSessionsEquivalent } from '../dist/utils/supabaseSession.js';

test('treats Firefox storage events with unchanged sessions as equivalent', () => {
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: 123456,
    user: { id: 'user-1', email: 'user@example.com' },
  };

  assert.equal(areSupabaseSessionsEquivalent(session, { ...session, user: { ...session.user } }), true);
});

test('detects a genuinely changed Supabase session', () => {
  assert.equal(
    areSupabaseSessionsEquivalent(
      { access_token: 'old-token', refresh_token: 'refresh-token' },
      { access_token: 'new-token', refresh_token: 'refresh-token' }
    ),
    false
  );
});

test('treats cleared nullish session values as equivalent', () => {
  assert.equal(areSupabaseSessionsEquivalent(null, undefined), true);
});

test('distinguishes distinct sessions from different devices for the same user', () => {
  const deviceASession = {
    access_token: 'device-a-jwt',
    refresh_token: 'device-a-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-123', email: 'test@example.com' },
  };
  const deviceBSession = {
    access_token: 'device-b-jwt',
    refresh_token: 'device-b-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-123', email: 'test@example.com' },
  };

  assert.equal(areSupabaseSessionsEquivalent(deviceASession, deviceBSession), false);
});
