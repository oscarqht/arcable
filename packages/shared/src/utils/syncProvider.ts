import { SyncProvider } from '../types/sync';

/**
 * Strict sync provider resolution logic:
 * 1. if user has logged in to google oauth, use arcable cloud ('supabase')!
 * 2. otherwise, if user has logged in to raindrop, use raindrop ('raindrop')!
 * 3. otherwise, if user has logged in to none, don't sync ('local')!
 */
export function resolveSyncProvider(
  hasGoogleOAuth: boolean,
  hasRaindrop: boolean
): SyncProvider {
  if (hasGoogleOAuth) {
    return 'supabase';
  }
  if (hasRaindrop) {
    return 'raindrop';
  }
  return 'local';
}
