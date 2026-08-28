import {
  RaindropUserProfile,
  RaindropRawUser,
  RaindropCollectionItem,
  RaindropBookmarkItem,
  RaindropCreateItemInput,
  RaindropTokenResponse,
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

    const rawUser = data.user || data.item;
    if (!rawUser) {
      return null;
    }

    const avatarUrl = rawUser.avatar || (rawUser.email_MD5 ? `https://www.gravatar.com/avatar/${rawUser.email_MD5}?d=mp` : undefined);

    return {
      id: rawUser._id || 1,
      name: rawUser.fullName || rawUser.email || 'Raindrop User',
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
    pleaseParse: {},
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
  options?: { page?: number; perpage?: number; search?: string }
): Promise<{ items: RaindropBookmarkItem[]; count: number }> {
  const cleanToken = cleanRaindropToken(token);
  if (!cleanToken) {
    return { items: [], count: 0 };
  }

  const perpage = options?.perpage || 25;
  const page = options?.page || 0;
  const searchParam = options?.search ? `&search=${encodeURIComponent(options.search)}` : '';

  const url = `${RAINDROP_API_BASE}/raindrops/${collectionId}?perpage=${perpage}&page=${page}&sort=-lastUpdate${searchParam}`;

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
    title: item.title,
    excerpt: item.excerpt,
    link: item.link,
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
 */
export async function fetchRaindropFileContent(token: string, fileUrl: string): Promise<string> {
  const cleanToken = cleanRaindropToken(token);
  try {
    // Try fetching with auth header first
    const res = await fetch(fileUrl, {
      method: 'GET',
      headers: cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {},
    });

    if (res.ok) {
      return await res.text();
    }

    // Fallback: retry without auth header if 403/cors
    const fallbackRes = await fetch(fileUrl);
    if (fallbackRes.ok) {
      return await fallbackRes.text();
    }
  } catch (err) {
    console.warn('[RaindropClient] Error fetching file content:', err);
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
