import type { UploadedCover } from '../types/raindrop';

type CoverLoader = () => Promise<UploadedCover[]>;
const tokenCaches = new Map<string, UploadedCoverCache>();
const loaderCaches = new WeakMap<CoverLoader, UploadedCoverCache>();
export const EMPTY_UPLOADED_COVERS: UploadedCover[] = [];

export interface UploadedCoverCache {
  items?: UploadedCover[];
  pending?: Promise<UploadedCover[]>;
  revision: number;
  listeners: Set<() => void>;
}

const disconnectedCache: UploadedCoverCache = { revision: 0, listeners: new Set() };

/** Session-only cache; neither credentials nor images are written to browser storage. */
export function getUploadedCoverCache(token?: string, loader?: CoverLoader): UploadedCoverCache {
  if (!token && !loader) return disconnectedCache;
  const cache = token ? tokenCaches.get(token) : loaderCaches.get(loader!);
  if (cache) return cache;
  const created: UploadedCoverCache = { revision: 0, listeners: new Set() };
  if (token) tokenCaches.set(token, created);
  else loaderCaches.set(loader!, created);
  return created;
}

export function refreshUploadedCoverCache(cache: UploadedCoverCache, load: CoverLoader): Promise<UploadedCover[]> {
  if (cache.pending) return cache.pending;
  const revision = cache.revision;
  cache.pending = Promise.resolve().then(load).then((items) => {
    // A list fetched before an upload must not remove the newly uploaded image.
    if (cache.revision === revision) {
      cache.items = items;
      cache.listeners.forEach((listener) => listener());
    }
    return cache.items || EMPTY_UPLOADED_COVERS;
  }).finally(() => { cache.pending = undefined; });
  return cache.pending;
}

export function cacheUploadedCover(cache: UploadedCoverCache, item: UploadedCover): void {
  cache.revision += 1;
  cache.items = [item, ...(cache.items || []).filter((cover) => cover.id !== item.id)];
  cache.listeners.forEach((listener) => listener());
}
