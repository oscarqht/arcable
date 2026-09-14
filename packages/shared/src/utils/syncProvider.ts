import { SyncProvider } from '../types/sync';

/**
 * Strict sync provider resolution logic:
 * 1. if user has logged in to raindrop, use raindrop ('raindrop')!
 * 2. otherwise, don't sync ('local')!
 */
export function resolveSyncProvider(
  hasRaindrop: boolean
): SyncProvider {
  if (hasRaindrop) {
    return 'raindrop';
  }
  return 'local';
}

