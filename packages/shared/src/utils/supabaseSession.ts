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
