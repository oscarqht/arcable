import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExtensionOAuthCallbackUrl,
  isAllowedExtensionOAuthRedirect,
  parseExtensionOAuthCallback,
} from '../dist/utils/oauthRedirect.js';

test('allows browser identity callback origins and rejects normal web origins', () => {
  assert.equal(isAllowedExtensionOAuthRedirect('https://abc.extensions.allizom.org/supabase'), true);
  assert.equal(isAllowedExtensionOAuthRedirect('https://abc.chromiumapp.org/supabase'), true);
  assert.equal(isAllowedExtensionOAuthRedirect('http://127.0.0.1/mozoauth2/abc/raindrop'), true);
  assert.equal(isAllowedExtensionOAuthRedirect('https://evil.example/callback'), false);
});

test('round-trips OAuth tokens through the identity callback fragment', () => {
  const callback = createExtensionOAuthCallbackUrl(
    'https://abc.extensions.allizom.org/supabase',
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: 123456,
      expires_in: 3600,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        user_metadata: {
          full_name: 'Example User',
          avatar_url: 'https://example.com/avatar.png',
        },
      },
    }
  );

  assert.deepEqual(parseExtensionOAuthCallback(callback), {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: 123456,
    expires_in: 3600,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      user_metadata: {
        full_name: 'Example User',
        avatar_url: 'https://example.com/avatar.png',
      },
    },
  });
});
