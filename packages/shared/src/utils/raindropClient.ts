import {
  RaindropUserProfile,
  RaindropRawUser,
  RaindropCollectionItem,
  RaindropBookmarkItem,
  RaindropCreateItemInput,
  RaindropTokenResponse,
  RaindropSearchItem,
  RaindropSearchResult,
} from '../types/raindrop';

export const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
export const RAINDROP_OAUTH_AUTH_URL = 'https://raindrop.io/oauth/authorize';
export const RAINDROP_OAUTH_TOKEN_URL = 'https://raindrop.io/oauth/access_token';

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
    const res = await fetch(`${RAINDROP_API_BASE}/user`, {
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
 */
export async function fetchRaindropCollections(token: string): Promise<RaindropCollectionItem[]> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) return [];

  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/json',
  };

  const results: RaindropCollectionItem[] = [];

  try {
    // 1. Fetch root collections
    const rootRes = await fetch(`${RAINDROP_API_BASE}/collections`, {
      method: 'GET',
      headers,
    });

    if (rootRes.ok) {
      const rootData = (await rootRes.json()) as { items?: RaindropCollectionItem[] };
      if (rootData.items && Array.isArray(rootData.items)) {
        results.push(...rootData.items);
      }
    }

    // 2. Fetch nested child collections
    const childRes = await fetch(`${RAINDROP_API_BASE}/collections/childrens`, {
      method: 'GET',
      headers,
    });

    if (childRes.ok) {
      const childData = (await childRes.json()) as { items?: RaindropCollectionItem[] };
      if (childData.items && Array.isArray(childData.items)) {
        results.push(...childData.items);
      }
    }
  } catch (error) {
    console.error('[RaindropClient] Error fetching collections:', error);
  }

  return results;
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

  if (input.cover) {
    payload.cover = input.cover;
  }

  const res = await fetch(`${RAINDROP_API_BASE}/raindrop`, {
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

  return {
    _id: created._id,
    title: created.title,
    excerpt: created.excerpt,
    link: created.link,
    cover: created.cover,
    tags: created.tags,
    collectionId: created.collection?.$id,
    created: created.created,
    lastUpdate: created.lastUpdate,
  };
}

/**
 * Searches or lists bookmarks from Raindrop.io.
 */
export async function fetchRaindropItems(
  token: string,
  collectionId: number = 0,
  options?: { page?: number; perpage?: number; search?: string; sort?: string }
): Promise<{ items: RaindropBookmarkItem[]; count: number }> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    return { items: [], count: 0 };
  }

  const perpage = options?.perpage || 25;
  const page = options?.page || 0;
  const sort = options?.sort || '-lastUpdate';
  const searchParam = options?.search ? `&search=${encodeURIComponent(options.search)}` : '';

  const url = `${RAINDROP_API_BASE}/raindrops/${collectionId}?perpage=${perpage}&page=${page}&sort=${encodeURIComponent(sort)}${searchParam}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
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
    const res = await fetch(`${RAINDROP_API_BASE}/raindrop/${raindropId}`, {
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
  parentId?: number
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

  const res = await fetch(`${RAINDROP_API_BASE}/collection`, {
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

/**
 * Deletes a raindrop item (bookmark/file) in Raindrop.io.
 */
export async function deleteRaindropBookmark(token: string, raindropId: number): Promise<boolean> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    throw new Error('Missing Raindrop authorization token.');
  }

  const res = await fetch(`${RAINDROP_API_BASE}/raindrop/${raindropId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
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
    const res = await fetch(`${RAINDROP_API_BASE}/raindrop/${itemId}`, {
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

/**
 * Uploads a file (e.g. data.json.txt) to a Raindrop collection using multipart/form-data.
 * Raindrop supports .txt, .md, .pdf document formats.
 */
export async function uploadRaindropFile(
  token: string,
  collectionId: number,
  fileName: string = 'data.json.txt',
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

  const res = await fetch(`${RAINDROP_API_BASE}/raindrop/file`, {
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

    const res = await fetch(normalizedUrl, {
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

      const redirectRes = await fetch(redirectTarget, {
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
    const fallbackRes = await fetch(normalizedUrl, {
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
      fetch(`${RAINDROP_API_BASE}/raindrops/0?search=${encodeURIComponent(query.trim())}&perpage=${perpage}&sort=score`, {
        method: 'GET',
        headers,
      }),
      fetch(`${RAINDROP_API_BASE}/collections`, {
        method: 'GET',
        headers,
      }),
      fetch(`${RAINDROP_API_BASE}/collections/childrens`, {
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
