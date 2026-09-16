import {
  RaindropUserProfile,
  RaindropRawUser,
  RaindropCollectionItem,
  RaindropBookmarkItem,
  RaindropCreateItemInput,
  RaindropTokenResponse,
  RaindropSearchItem,
  RaindropSearchResult,
  RaindropRequestFailureDetails,
} from '../types/raindrop';

export const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
export const RAINDROP_OAUTH_AUTH_URL = 'https://raindrop.io/oauth/authorize';
export const RAINDROP_OAUTH_TOKEN_URL = 'https://raindrop.io/oauth/access_token';

// OAuth API calls are limited to 120 requests per minute per user. Keep a
// little headroom rather than sending sync fan-outs in a burst.
const RAINDROP_API_ORIGIN = 'https://api.raindrop.io';
const MIN_REQUEST_INTERVAL_MS = 600;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_TRANSPORT_RETRIES = 2;
const TRANSPORT_RETRY_BASE_MS = 250;
let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RaindropTransportError extends Error {
  readonly details: RaindropRequestFailureDetails;

  constructor(operation: string, endpoint: string, retryCount: number, cause: unknown) {
    const errorName = cause instanceof Error ? cause.name : 'UnknownError';
    const errorMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Raindrop ${operation} request failed after ${retryCount} retries: ${errorMessage}`);
    this.name = 'RaindropTransportError';
    this.details = { operation, endpoint, retryCount, errorName, errorMessage };
  }
}

export function getRaindropRequestFailureDetails(error: unknown): RaindropRequestFailureDetails | undefined {
  return error instanceof RaindropTransportError ? error.details : undefined;
}

function getTransportRetryDelay(retryCount: number): number {
  const exponentialDelay = TRANSPORT_RETRY_BASE_MS * 2 ** (retryCount - 1);
  const jitter = Math.floor(Math.random() * TRANSPORT_RETRY_BASE_MS);
  return exponentialDelay + jitter;
}

function getRetryDelay(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(MIN_REQUEST_INTERVAL_MS, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(MIN_REQUEST_INTERVAL_MS, date - Date.now());
  }

  const resetAtSeconds = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(resetAtSeconds) && resetAtSeconds > 0) {
    return Math.max(MIN_REQUEST_INTERVAL_MS, resetAtSeconds * 1000 - Date.now());
  }

  return MIN_REQUEST_INTERVAL_MS;
}

function paceFromRateLimitHeaders(response: Response): void {
  const remaining = Number(response.headers.get('ratelimit-remaining'));
  const resetAtSeconds = Number(response.headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(remaining) || remaining <= 0 || !Number.isFinite(resetAtSeconds)) return;

  const remainingWindowMs = resetAtSeconds * 1000 - Date.now();
  if (remainingWindowMs <= 0) return;
  const interval = Math.ceil(remainingWindowMs / remaining);
  nextRequestAt = Math.max(nextRequestAt, Date.now() + Math.max(MIN_REQUEST_INTERVAL_MS, interval));
}

async function fetchRaindropApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(RAINDROP_API_ORIGIN)) return fetch(input, init);
  const operation = (init?.method || 'GET').toUpperCase();
  const endpoint = new URL(url).pathname;
  const canRetryTransportFailure = operation === 'GET';

  const request = async (): Promise<Response> => {
    for (let attempt = 0; ; attempt += 1) {
      const waitMs = Math.max(0, nextRequestAt - Date.now());
      nextRequestAt = Math.max(nextRequestAt, Date.now()) + MIN_REQUEST_INTERVAL_MS;
      if (waitMs > 0) await sleep(waitMs);

      let response: Response;
      try {
        response = await fetch(input, init);
      } catch (error) {
        if (!canRetryTransportFailure || attempt === MAX_TRANSPORT_RETRIES) {
          throw new RaindropTransportError(operation, endpoint, attempt, error);
        }
        const retryDelay = getTransportRetryDelay(attempt + 1);
        console.warn(`[RaindropClient] ${operation} ${endpoint} failed before a response; retrying in ${retryDelay}ms.`, {
          retryCount: attempt + 1,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        await sleep(retryDelay);
        continue;
      }
      paceFromRateLimitHeaders(response);
      if (response.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) return response;

      const retryDelay = getRetryDelay(response);
      nextRequestAt = Math.max(nextRequestAt, Date.now() + retryDelay);
      console.warn(`[RaindropClient] Rate limited; retrying request after ${Math.ceil(retryDelay / 1000)}s.`);
      await sleep(retryDelay);
    }
  };

  const queuedRequest = requestQueue.then(request, request);
  requestQueue = queuedRequest.then(() => undefined, () => undefined);
  return queuedRequest;
}

/**
 * Strips 'Bearer ' prefix and whitespace from token string.
 */
export function cleanRaindropToken(token: string): string {
  if (!token) return '';
  return token.replace(/^Bearer\s+/i, '').trim();
}

/**
 * Validates a Raindrop token and retrieves the current user profile.
 */
export async function fetchRaindropUser(token: string): Promise<RaindropUserProfile | null> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) return null;

  try {
    const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      result?: boolean;
      user?: RaindropRawUser;
      item?: RaindropRawUser;
    };

    const rawUser = data.user || data.item || (data as any);
    if (!rawUser || typeof rawUser !== 'object') {
      if (data.result || res.ok) {
        return {
          id: 1,
          name: 'Raindrop User',
          isPro: false,
        };
      }
      return null;
    }

    const avatarUrl = rawUser.avatar || (rawUser.email_MD5 ? `https://www.gravatar.com/avatar/${rawUser.email_MD5}?d=mp` : undefined);

    return {
      id: rawUser._id || rawUser.id || 1,
      name: rawUser.fullName || rawUser.name || rawUser.email || 'Raindrop User',
      email: rawUser.email,
      avatarUrl,
      isPro: Boolean(rawUser.pro),
    };
  } catch (error) {
    console.error('[RaindropClient] Error fetching user profile:', error);
    return null;
  }
}

/**
 * Fetches all user collections (both root and nested collections).
 *
 * The root collections request is treated as required: if it fails, this throws
 * instead of silently returning an empty list. Callers (notably
 * getOrCreateArcableCollection) rely on an empty result meaning "no such collection
 * exists yet", so swallowing a transient network/API failure here would make them
 * wrongly create a brand new duplicate "Arcable" collection instead of reusing the
 * existing one. Children are required too: returning a partial collection inventory
 * would make a caller overwrite its cache with an incomplete Arcable tree.
 */
export async function fetchRaindropCollections(
  token: string,
  options?: { cacheBust?: string }
): Promise<RaindropCollectionItem[]> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) return [];

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/json',
  };
  if (options?.cacheBust) headers['Cache-Control'] = 'no-cache';
  const query = options?.cacheBust ? `?cacheBust=${encodeURIComponent(options.cacheBust)}` : '';
  const requestInit: RequestInit = {
    method: 'GET',
    headers,
    cache: options?.cacheBust ? 'no-store' : undefined,
  };

  // Both endpoints are independent; fetching them together is important on
  // startup because callers reconstruct the entire Arcable subtree from this
  // single collection inventory.
  const [rootRes, childResult] = await Promise.allSettled([
    fetchRaindropApi(`${RAINDROP_API_BASE}/collections${query}`, requestInit),
    fetchRaindropApi(`${RAINDROP_API_BASE}/collections/childrens${query}`, requestInit),
  ]);

  if (rootRes.status === 'rejected') {
    throw rootRes.reason;
  }

  const rootResponse = rootRes.value;
  if (!rootResponse.ok) {
    throw new Error(`Failed to fetch Raindrop root collections (status ${rootResponse.status}).`);
  }

  const rootData = (await rootResponse.json()) as { items?: RaindropCollectionItem[] };
  const results: RaindropCollectionItem[] = [];
  if (rootData.items && Array.isArray(rootData.items)) {
    results.push(...rootData.items);
  }

  if (childResult.status === 'rejected') {
    throw childResult.reason;
  }
  if (!childResult.value.ok) {
    throw new Error(`Failed to fetch Raindrop child collections (status ${childResult.value.status}).`);
  }
  const childData = (await childResult.value.json()) as { items?: RaindropCollectionItem[] };
  if (childData.items && Array.isArray(childData.items)) {
    results.push(...childData.items);
  }

  return results;
}

/** Returns image URLs from Raindrop's collection cover/icon catalogue. */
export async function searchRaindropCollectionCovers(token: string, text: string): Promise<string[]> {
  const cleanToken = cleanRaindropToken(token);
  const query = text.trim();
  if (!cleanToken || !query) return [];

  try {
    const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/collections/covers/${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cleanToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      items?: Array<{ icons?: Array<{ png?: string; svg?: string }> }>;
    };
    const covers: string[] = [];
    for (const item of data.items || []) {
      for (const icon of item.icons || []) {
        const cover = icon.png || icon.svg;
        if (cover && !covers.includes(cover)) covers.push(cover);
        if (covers.length === 60) return covers;
      }
    }
    return covers;
  } catch (error) {
    console.warn('[RaindropClient] Failed to search collection covers:', error);
  }

  return [];
}

/** Finds the first relevance-ranked collection cover from Raindrop's catalogue. */
export async function searchRaindropCollectionCover(token: string, text: string): Promise<string | undefined> {
  return (await searchRaindropCollectionCovers(token, text))[0];
}

/**
 * Converts a data URL (e.g. "data:image/jpeg;base64,...") to a Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const base64Data = parts[1] || '';

  if (typeof atob === 'function') {
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const u8arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      u8arr[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
  } else if (typeof (globalThis as Record<string, unknown>).Buffer !== 'undefined') {
    const buffer = ((globalThis as Record<string, unknown>).Buffer as { from: (str: string, enc: string) => ArrayBuffer }).from(base64Data, 'base64');
    return new Blob([buffer], { type: mime });
  }

  throw new Error('Unable to convert dataUrl to Blob: neither atob nor Buffer available.');
}

/**
 * Uploads a cover image for an existing Raindrop bookmark.
 * Uses Raindrop's PUT /raindrop/{id}/cover endpoint with multipart/form-data.
 */
export async function uploadRaindropCover(
  token: string,
  raindropId: number,
  cover: Blob | string
): Promise<string | null> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    throw new Error('Missing Raindrop authorization token.');
  }

  let blob: Blob;
  if (typeof cover === 'string') {
    if (cover.startsWith('data:')) {
      blob = dataUrlToBlob(cover);
    } else {
      return null;
    }
  } else {
    blob = cover;
  }

  const formData = new FormData();
  const ext = blob.type.includes('png') ? 'png' : 'jpeg';
  formData.append('cover', blob, `cover.${ext}`);

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrop/${raindropId}/cover`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.warn(`[RaindropClient] Failed to upload cover (${res.status}): ${errorText}`);
    return null;
  }

  const data = (await res.json()) as { result?: boolean; item?: { cover?: string } };
  return data.item?.cover || null;
}

/**
 * Creates a bookmark in Raindrop.io.
 */
export async function createRaindropBookmark(
  token: string,
  input: RaindropCreateItemInput
): Promise<RaindropBookmarkItem> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    throw new Error('Missing Raindrop authorization token.');
  }

  if (!input.link) {
    throw new Error('Link is required to create a bookmark.');
  }

  const payload: Record<string, any> = {
    link: input.link,
    title: input.title || input.link,
    pleaseParse: input.pleaseParse ?? {},
  };

  if (input.excerpt) {
    payload.excerpt = input.excerpt;
  }

  if (input.tags && input.tags.length > 0) {
    payload.tags = input.tags;
  }

  if (input.collectionId !== undefined) {
    payload.collection = { $id: input.collectionId };
  }

  if (input.cover && !input.cover.startsWith('data:')) {
    payload.cover = input.cover;
  }

  if (input.note !== undefined) {
    payload.note = input.note;
  }

  if (input.order !== undefined) {
    payload.order = input.order;
  }

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to create Raindrop bookmark (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { item: any };
  const created = data.item;

  let finalCover = created.cover;
  const coverToUpload = input.coverDataUrl || (input.cover?.startsWith('data:') ? input.cover : undefined);

  if (coverToUpload && created._id) {
    try {
      const uploadedCover = await uploadRaindropCover(cleanToken, created._id, coverToUpload);
      if (uploadedCover) {
        finalCover = uploadedCover;
      }
    } catch (coverErr) {
      console.warn('[RaindropClient] Error uploading cover for bookmark:', coverErr);
    }
  }

  return {
    _id: created._id,
    title: created.title,
    excerpt: created.excerpt,
    link: created.link,
    cover: finalCover,
    tags: created.tags,
    collectionId: created.collection?.$id,
    created: created.created,
    lastUpdate: created.lastUpdate,
  };
}

/** Creates up to 100 bookmarks in one Raindrop API call. */
export async function createRaindropBookmarks(
  token: string,
  inputs: RaindropCreateItemInput[]
): Promise<RaindropBookmarkItem[]> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) throw new Error('Missing Raindrop authorization token.');
  if (inputs.length === 0) return [];
  if (inputs.length > 100) throw new Error('Raindrop batch creation accepts at most 100 bookmarks.');

  const items = inputs.map((input) => {
    if (!input.link) throw new Error('Link is required to create a bookmark.');
    const item: Record<string, unknown> = {
      link: input.link,
      title: input.title || input.link,
      pleaseParse: input.pleaseParse ?? {},
    };
    if (input.excerpt) item.excerpt = input.excerpt;
    if (input.tags?.length) item.tags = input.tags;
    if (input.collectionId !== undefined) item.collection = { $id: input.collectionId };
    if (input.cover && !input.cover.startsWith('data:')) item.cover = input.cover;
    if (input.note !== undefined) item.note = input.note;
    if (input.order !== undefined) item.order = input.order;
    return item;
  });

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrops`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to create Raindrop bookmarks (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { items?: any[] };
  return (data.items || []).map((item) => ({
    _id: item._id,
    title: item.title || '',
    excerpt: item.excerpt,
    note: item.note,
    link: item.link || '',
    cover: item.cover,
    tags: item.tags,
    collectionId: item.collection?.$id,
    created: item.created,
    lastUpdate: item.lastUpdate,
  }));
}

/**
 * Searches or lists bookmarks from Raindrop.io.
 */
export async function fetchRaindropItems(
  token: string,
  collectionId: number = 0,
  options?: { page?: number; perpage?: number; search?: string; sort?: string; nested?: boolean; cacheBust?: string }
): Promise<{ items: RaindropBookmarkItem[]; count: number }> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    return { items: [], count: 0 };
  }

  const perpage = options?.perpage || 25;
  const page = options?.page || 0;
  const sort = options?.sort || '-lastUpdate';
  const params = new URLSearchParams({
    perpage: String(perpage),
    page: String(page),
    sort,
  });
  if (options?.search) params.set('search', options.search);
  if (options?.nested) params.set('nested', 'true');
  if (options?.cacheBust) params.set('cacheBust', options.cacheBust);

  const url = `${RAINDROP_API_BASE}/raindrops/${collectionId}?${params.toString()}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/json',
  };
  if (options?.cacheBust) headers['Cache-Control'] = 'no-cache';

  const res = await fetchRaindropApi(url, {
    method: 'GET',
    headers,
    cache: options?.cacheBust ? 'no-store' : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Raindrop items (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { items?: any[]; count?: number };
  const items: RaindropBookmarkItem[] = (data.items || []).map((item) => ({
    _id: item._id,
    title: item.title || '',
    excerpt: item.excerpt,
    note: item.note,
    link: item.link || '',
    type: item.type,
    file: item.file
      ? {
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
          path: item.file.path,
        }
      : undefined,
    cover: item.cover,
    tags: item.tags,
    collectionId: item.collection?.$id,
    created: item.created,
    lastUpdate: item.lastUpdate,
  }));

  return {
    items,
    count: data.count || items.length,
  };
}

/**
 * Fetches a single raindrop bookmark/file item by ID.
 */
export async function fetchRaindropItem(
  token: string,
  raindropId: number
): Promise<RaindropBookmarkItem | null> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken || !raindropId) return null;

  try {
    const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrop/${raindropId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { item?: any };
    const item = data.item;
    if (!item) return null;

    return {
      _id: item._id,
      title: item.title || '',
      excerpt: item.excerpt,
      note: item.note,
      link: item.link || '',
      type: item.type,
      file: item.file
        ? {
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            path: item.file.path,
          }
        : undefined,
      cover: item.cover,
      tags: item.tags,
      collectionId: item.collection?.$id,
      created: item.created,
      lastUpdate: item.lastUpdate,
    };
  } catch (err) {
    console.warn(`[RaindropClient] Error fetching raindrop item ${raindropId}:`, err);
    return null;
  }
}

/**
 * Creates a collection in Raindrop.io.
 */
export async function createRaindropCollection(
  token: string,
  title: string,
  parentId?: number,
  options?: { color?: string; cover?: string[]; sort?: number }
): Promise<RaindropCollectionItem> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    throw new Error('Missing Raindrop authorization token.');
  }

  const payload: Record<string, any> = {
    title: title.trim() || 'Arcable',
    view: 'list',
  };

  if (parentId !== undefined && parentId !== null) {
    payload.parent = { $id: parentId };
  }

  if (options?.color) payload.color = options.color;
  if (options?.cover?.length) payload.cover = options.cover;
  if (options?.sort !== undefined) payload.sort = options.sort;

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/collection`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to create Raindrop collection (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { item: RaindropCollectionItem };
  return data.item;
}

/** Updates an Arcable-backed Raindrop collection, including hierarchy and cover. */
export async function updateRaindropCollection(
  token: string,
  collectionId: number,
  updates: { title?: string; parentId?: number | null; color?: string | null; cover?: string[]; sort?: number }
): Promise<RaindropCollectionItem | null> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken || !collectionId) return null;

  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.parentId !== undefined) payload.parent = updates.parentId === null ? {} : { $id: updates.parentId };
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.cover !== undefined) payload.cover = updates.cover;
  if (updates.sort !== undefined) payload.sort = updates.sort;

  try {
    const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/collection/${collectionId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { item?: RaindropCollectionItem };
    return data.item || null;
  } catch (error) {
    console.warn(`[RaindropClient] Failed to update collection ${collectionId}:`, error);
    return null;
  }
}

/** Removes a collection and its descendants from Raindrop. */
export async function deleteRaindropCollection(token: string, collectionId: number): Promise<boolean> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken || !collectionId) return false;
  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/collection/${collectionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${cleanToken}`, Accept: 'application/json' },
  });
  return res.ok;
}

/** Fetches every item under one collection, optionally including all descendants. */
export async function fetchAllRaindropItems(
  token: string,
  collectionId: number,
  options?: { nested?: boolean; cacheBust?: string }
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];
  if (!Number.isFinite(collectionId)) return items;

  const firstPage = await fetchRaindropItems(token, collectionId, {
    page: 0,
    perpage: 50,
    sort: 'order',
    nested: options?.nested,
    cacheBust: options?.cacheBust,
  });
  items.push(...firstPage.items);
  const pageCount = Math.ceil(firstPage.count / 50);
  for (let page = 1; page < pageCount; page += 1) {
    const result = await fetchRaindropItems(token, collectionId, {
      page,
      perpage: 50,
      sort: 'order',
      nested: options?.nested,
      cacheBust: options?.cacheBust,
    });
    items.push(...result.items);
  }
  return items;
}

/**
 * Deletes a raindrop item (bookmark/file) in Raindrop.io.
 */
export async function deleteRaindropBookmark(token: string, raindropId: number): Promise<boolean> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    throw new Error('Missing Raindrop authorization token.');
  }

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrop/${raindropId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
  });

  return res.ok;
}

/** Removes up to 100 bookmarks from one collection in a single API call. */
export async function deleteRaindropBookmarks(
  token: string,
  collectionId: number,
  raindropIds: number[]
): Promise<boolean> {
  const cleanToken = cleanRaindropToken(token);
  const ids = [...new Set(raindropIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!cleanToken) throw new Error('Missing Raindrop authorization token.');
  if (ids.length === 0) return true;
  if (ids.length > 100) throw new Error('Raindrop batch deletion accepts at most 100 bookmarks.');

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrops/${collectionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ids }),
  });
  return res.ok;
}

/**
 * Updates an existing Raindrop item's metadata (e.g. note, title, tags, excerpt).
 */
export async function updateRaindropItem(
  token: string,
  itemId: number,
  updates: Record<string, any>
): Promise<RaindropBookmarkItem | null> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken || !itemId) return null;

  try {
    const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrop/${itemId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { item?: any };
    const item = data.item;
    if (!item) return null;

    return {
      _id: item._id,
      title: item.title || '',
      excerpt: item.excerpt,
      note: item.note,
      link: item.link || '',
      type: item.type,
      file: item.file
        ? {
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            path: item.file.path,
          }
        : undefined,
      cover: item.cover,
      tags: item.tags,
      collectionId: item.collection?.$id,
      created: item.created,
      lastUpdate: item.lastUpdate,
    };
  } catch (err) {
    console.warn(`[RaindropClient] Failed to update raindrop item ${itemId}:`, err);
    return null;
  }
}

/** Uploads an explicitly named file to a Raindrop collection. */
export async function uploadRaindropFile(
  token: string,
  collectionId: number,
  fileName: string,
  content: string
): Promise<any> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    throw new Error('Missing Raindrop authorization token.');
  }

  // Ensure filename has a supported document extension (.txt) for Raindrop upload
  let safeFileName = fileName;
  if (!safeFileName.endsWith('.txt') && !safeFileName.endsWith('.md')) {
    safeFileName = `${safeFileName}.txt`;
  }

  const formData = new FormData();
  // IMPORTANT: Raindrop's streaming multipart parser requires collection metadata BEFORE the file field
  if (collectionId !== undefined && collectionId !== null) {
    formData.append('collectionId', String(collectionId));
    formData.append('collection', JSON.stringify({ $id: Number(collectionId) }));
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  formData.append('file', blob, safeFileName);

  const res = await fetchRaindropApi(`${RAINDROP_API_BASE}/raindrop/file`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      // Note: do not set Content-Type header so browser/fetch automatically supplies multipart boundary
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to upload file to Raindrop (${res.status}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Fetches text content from a file URL in Raindrop.
 * Correctly distinguishes between Raindrop API endpoints and CDN storage (up.raindrop.io / S3)
 * to avoid 400 Bad Request or HTML error pages.
 */
export async function fetchRaindropFileContent(token: string, fileUrl: string): Promise<string> {
  if (!fileUrl || !fileUrl.trim()) return '';

  let normalizedUrl = fileUrl.trim();
  if (normalizedUrl.startsWith('/')) {
    normalizedUrl = `https://api.raindrop.io${normalizedUrl}`;
  }

  const cleanToken = cleanRaindropToken(token);
  const isPresignedOrCdn =
    normalizedUrl.includes('up.raindrop.io') ||
    normalizedUrl.includes('s3.amazonaws.com') ||
    normalizedUrl.includes('X-Amz-') ||
    normalizedUrl.includes('signature=') ||
    normalizedUrl.includes('Expires=');

  // Helper to validate whether response text is valid payload rather than an HTML/XML error page
  const isValidContent = (text: string, contentType: string | null): boolean => {
    if (!text || !text.trim()) return false;
    const trimmed = text.trim();
    if (contentType && contentType.toLowerCase().includes('text/html')) {
      return false;
    }
    if (
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<?xml') ||
      trimmed.startsWith('<Error')
    ) {
      return false;
    }
    return true;
  };

  // Case 1: Direct CDN / S3 Presigned URL (DO NOT send Authorization header)
  if (isPresignedOrCdn) {
    try {
      const res = await fetch(normalizedUrl, {
        method: 'GET',
        headers: { Accept: 'text/plain, application/json, */*' },
      });
      if (res.ok) {
        const text = await res.text();
        if (isValidContent(text, res.headers.get('content-type'))) {
          return text;
        }
      }
    } catch (err) {
      console.warn('[RaindropClient] Error fetching CDN URL:', err);
    }
    return '';
  }

  // Case 2: Raindrop API URL (e.g. https://api.raindrop.io/v1/file/...)
  // We use redirect: 'manual' to intercept 301/302/307 redirects to S3 / Cloudflare CDN
  // so that the Authorization header is NOT leaked to S3 (which triggers S3 400 InvalidArgument).
  try {
    const authHeaders: Record<string, string> = {
      Accept: 'text/plain, application/json, */*',
    };
    if (cleanToken) {
      authHeaders['Authorization'] = `Bearer ${cleanToken}`;
    }

    const res = await fetchRaindropApi(normalizedUrl, {
      method: 'GET',
      headers: authHeaders,
      redirect: 'manual',
    });

    // Check for redirect location
    const location = res.headers.get('location');
    if (location && [301, 302, 303, 307, 308].includes(res.status)) {
      let redirectTarget = location.trim();
      if (redirectTarget.startsWith('/')) {
        redirectTarget = `https://api.raindrop.io${redirectTarget}`;
      }

      const targetIsCdn =
        redirectTarget.includes('up.raindrop.io') ||
        redirectTarget.includes('s3.amazonaws.com') ||
        redirectTarget.includes('X-Amz-') ||
        redirectTarget.includes('signature=') ||
        redirectTarget.includes('Expires=');

      const redirectHeaders: Record<string, string> = {
        Accept: 'text/plain, application/json, */*',
      };
      if (!targetIsCdn && cleanToken) {
        redirectHeaders['Authorization'] = `Bearer ${cleanToken}`;
      }

      const redirectRes = await fetchRaindropApi(redirectTarget, {
        method: 'GET',
        headers: redirectHeaders,
      });

      if (redirectRes.ok) {
        const text = await redirectRes.text();
        if (isValidContent(text, redirectRes.headers.get('content-type'))) {
          return text;
        }
      }
    } else if (res.ok) {
      const text = await res.text();
      if (isValidContent(text, res.headers.get('content-type'))) {
        return text;
      }
    }
  } catch (err) {
    console.warn('[RaindropClient] Error fetching API file URL with manual redirect:', err);
  }

  // Fallback: Try fetching with redirect: 'follow' without Authorization
  try {
    const fallbackRes = await fetchRaindropApi(normalizedUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/plain, application/json, */*',
      },
    });

    if (fallbackRes.ok) {
      const contentType = fallbackRes.headers.get('content-type');
      const text = await fallbackRes.text();
      if (isValidContent(text, contentType)) {
        return text;
      }
    }
  } catch (err) {
    console.warn('[RaindropClient] Error fetching file content fallback:', err);
  }

  return '';
}

/**
 * Constructs the Raindrop OAuth authorization URL.
 */
export function getRaindropOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  return `${RAINDROP_OAUTH_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges OAuth authorization code for Raindrop access and refresh tokens.
 */
export async function exchangeRaindropOAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<RaindropTokenResponse> {
  const res = await fetch(RAINDROP_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to exchange token (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as RaindropTokenResponse;
  if (!data.access_token) {
    throw new Error(data.errorMessage || data.error || 'No access token returned from Raindrop');
  }

  return data;
}

/**
 * Search Raindrop items and collections with ranking and mapping.
 * Mirrors the search implementation from nenya-ext.
 */
export async function searchRaindrop(
  token: string,
  query: string,
  options?: { perpage?: number }
): Promise<RaindropSearchResult> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken || !query.trim()) {
    return { items: [], collections: [] };
  }

  const perpage = options?.perpage || 50;
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/json',
  };

  try {
    const [itemsRes, rootColRes, childColRes] = await Promise.allSettled([
      fetchRaindropApi(`${RAINDROP_API_BASE}/raindrops/0?search=${encodeURIComponent(query.trim())}&perpage=${perpage}&sort=score`, {
        method: 'GET',
        headers,
      }),
      fetchRaindropApi(`${RAINDROP_API_BASE}/collections`, {
        method: 'GET',
        headers,
      }),
      fetchRaindropApi(`${RAINDROP_API_BASE}/collections/childrens`, {
        method: 'GET',
        headers,
      }),
    ]);

    let rawItems: any[] = [];
    if (itemsRes.status === 'fulfilled' && itemsRes.value.ok) {
      const data = await itemsRes.value.json().catch(() => ({}));
      if (Array.isArray(data.items)) {
        rawItems = data.items;
      }
    }

    const allCollections: RaindropCollectionItem[] = [];
    if (rootColRes.status === 'fulfilled' && rootColRes.value.ok) {
      const data = await rootColRes.value.json().catch(() => ({}));
      if (Array.isArray(data.items)) {
        allCollections.push(...data.items);
      }
    }

    if (childColRes.status === 'fulfilled' && childColRes.value.ok) {
      const data = await childColRes.value.json().catch(() => ({}));
      if (Array.isArray(data.items)) {
        allCollections.push(...data.items);
      }
    }

    const queryLower = query.toLowerCase().trim();
    const searchTerms = queryLower.split(/\s+/).filter(Boolean);

    // Excluded internal / sync collections
    const EXCLUDED_COLLECTIONS = ['nenya / options', 'arcable / sync'];
    const excludedCollectionIds = new Set<number>();
    allCollections.forEach((c) => {
      if (c.title && EXCLUDED_COLLECTIONS.includes(c.title.toLowerCase().trim())) {
        excludedCollectionIds.add(c._id);
      }
    });

    // Create maps
    const collectionIdTitleMap = new Map<number, string>();
    const collectionIdParentMap = new Map<number, number>();
    allCollections.forEach((c) => {
      if (c._id && c.title) {
        collectionIdTitleMap.set(c._id, c.title);
      }
      if (c._id && c.parent?.$id) {
        collectionIdParentMap.set(c._id, c.parent.$id);
      }
    });
    collectionIdTitleMap.set(-1, 'Unsorted');

    // Filter items
    const filteredItems: RaindropSearchItem[] = rawItems
      .filter((item) => {
        const colId = item.collection?.$id ?? item.collectionId;
        if (colId !== undefined && excludedCollectionIds.has(colId)) {
          return false;
        }

        const title = (item.title || '').toLowerCase();
        const link = (item.link || '').toLowerCase();
        const excerpt = (item.excerpt || '').toLowerCase();
        const tags = Array.isArray(item.tags)
          ? item.tags.map((t: any) => String(t).toLowerCase())
          : [];

        // If it's a Raindrop internal URL, only match against title
        if (
          link.startsWith('https://api.raindrop.io') ||
          link.startsWith('https://up.raindrop.io')
        ) {
          return searchTerms.every((term) => title.includes(term));
        }

        const linkWithoutDomain = link
          .replace('https://raindrop.io', '')
          .replace('http://raindrop.io', '');
        const searchableText = `${title} ${excerpt} ${tags.join(' ')} ${linkWithoutDomain}`;
        return searchTerms.every((term) => searchableText.includes(term));
      })
      .map((item) => {
        const colId = item.collection?.$id ?? item.collectionId;
        const colTitle = colId !== undefined ? collectionIdTitleMap.get(colId) : undefined;
        const parentId = colId !== undefined ? collectionIdParentMap.get(colId) : undefined;
        const parentTitle = parentId !== undefined ? collectionIdTitleMap.get(parentId) : undefined;

        return {
          _id: item._id,
          title: item.title || '',
          excerpt: item.excerpt,
          note: item.note,
          link: item.link || '',
          type: item.type,
          file: item.file,
          cover: item.cover,
          tags: item.tags,
          collectionId: colId,
          collectionTitle: colTitle,
          parentCollectionTitle: parentTitle,
          created: item.created,
          lastUpdate: item.lastUpdate,
        };
      });

    // Sort items: system URLs to bottom
    filteredItems.sort((a, b) => {
      const aLink = (a.link || '').toLowerCase();
      const bLink = (b.link || '').toLowerCase();
      const aIsSystem = aLink.startsWith('https://api.raindrop.io') || aLink.startsWith('https://up.raindrop.io');
      const bIsSystem = bLink.startsWith('https://api.raindrop.io') || bLink.startsWith('https://up.raindrop.io');

      if (aIsSystem && !bIsSystem) return 1;
      if (!aIsSystem && bIsSystem) return -1;
      return 0;
    });

    // Filter collections matching query
    const filteredCollections = allCollections.filter((c) => {
      const titleLower = (c.title || '').toLowerCase().trim();
      if (EXCLUDED_COLLECTIONS.includes(titleLower)) return false;
      return searchTerms.every((term) => titleLower.includes(term));
    });

    return {
      items: filteredItems,
      collections: filteredCollections,
    };
  } catch (error) {
    console.error('[RaindropClient] searchRaindrop error:', error);
    return { items: [], collections: [] };
  }
}
