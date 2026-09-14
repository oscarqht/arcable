import type { SupabaseSessionTokens } from '../types/sync';

/**
 * Firefox may emit storage.onChanged for a storage.set() call even when the
 * stored value did not change. Compare the complete JSON value before mirroring
 * a session back across storage boundaries.
 */
export function areSupabaseSessionsEquivalent(
  left: SupabaseSessionTokens | null | undefined,
  right: SupabaseSessionTokens | null | undefined
): boolean {
  if (left === right) return true;
  if (!left && !right) return true;
  if (!left || !right) return false;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Checks whether a session's access token is expired or expiring soon.
 * @param session The Supabase session object.
 * @param marginSeconds Number of seconds before actual expiration to consider "expiring soon" (default: 300s / 5 min).
 */
export function isSessionExpiringSoon(session: SupabaseSessionTokens | null | undefined, marginSeconds = 300): boolean {
  if (!session?.access_token) return true;
  if (!session.expires_at) return false;
  const expiresAtMs = session.expires_at > 1e11 ? session.expires_at : session.expires_at * 1000;
  return Date.now() + marginSeconds * 1000 >= expiresAtMs;
}
