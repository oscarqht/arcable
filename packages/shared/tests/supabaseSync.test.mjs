import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionExpiringSoon } from '../dist/utils/supabaseSession.js';

test('isSessionExpiringSoon identifies session with missing access token as expiring soon', () => {
  assert.equal(isSessionExpiringSoon({ access_token: '', refresh_token: 'abc' }), true);
});

test('isSessionExpiringSoon identifies fresh session far from expiry as not expiring', () => {
  const freshSession = {
    access_token: 'valid-token',
    refresh_token: 'valid-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour in future
  };
  assert.equal(isSessionExpiringSoon(freshSession, 300), false);
});

test('isSessionExpiringSoon identifies session within margin window as expiring soon', () => {
  const expiringSession = {
    access_token: 'valid-token',
    refresh_token: 'valid-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 120, // 2 minutes in future, within 5 min margin
  };
  assert.equal(isSessionExpiringSoon(expiringSession, 300), true);
});

test('isSessionExpiringSoon identifies already expired session as expiring soon', () => {
  const expiredSession = {
    access_token: 'valid-token',
    refresh_token: 'valid-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 10, // past
  };
  assert.equal(isSessionExpiringSoon(expiredSession, 300), true);
});

test('isSessionExpiringSoon handles millisecond timestamps properly', () => {
  const futureMs = Date.now() + 3600 * 1000;
  const sessionMs = {
    access_token: 'valid-token',
    refresh_token: 'valid-refresh',
    expires_at: futureMs,
  };
  assert.equal(isSessionExpiringSoon(sessionMs, 300), false);

  const expiringMs = Date.now() + 60 * 1000;
  const sessionExpiringMs = {
    access_token: 'valid-token',
    refresh_token: 'valid-refresh',
    expires_at: expiringMs,
  };
  assert.equal(isSessionExpiringSoon(sessionExpiringMs, 300), true);
});
