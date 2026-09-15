import { ArcableWorkspaceData } from '../types/workspace';
import { ArcableSyncFile, SyncResult, WorkspaceOperation, DeviceSyncRecord } from '../types/sync';
import { RaindropCollectionItem, RaindropBookmarkItem, RaindropBackupRecord } from '../types/raindrop';
import {
  fetchRaindropCollections,
  createRaindropCollection,
  fetchRaindropItems,
  fetchRaindropItem,
  deleteRaindropBookmark,
  uploadRaindropFile,
  fetchRaindropFileContent,
  updateRaindropItem,
  cleanRaindropToken,
  RAINDROP_API_BASE,
} from './raindropClient';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  compactSyncFile,
  createInitialSyncFile,
  isPlaceholderSnapshot,
  recomputeSyncFileOnDeviceRemoval,
  recomputeSyncFileOnDeleteOtherDevices,
  setStoredDeviceName,
  sortDevicesByLastSync,
  replayOperations,
} from './syncEngine';

export const ARCABLE_COLLECTION_NAME = 'Arcable';
export const DATA_JSON_FILE_NAME = 'sync.json.txt';
export const V5_DATA_JSON_FILE_NAME = 'sync-v5.json.txt';
export const V4_DATA_JSON_FILE_NAME = 'sync-v4.json.txt';
export const V3_DATA_JSON_FILE_NAME = 'data-v3.json.txt';
export const V2_DATA_JSON_FILE_NAME = 'data-v2.json.txt';
export const LEGACY_DATA_JSON_FILE_NAME = 'data.json.txt';

/**
 * Checks if a Raindrop item corresponds to the current Arcable sync file (sync.json.txt).
 */
export function isSyncJsonItem(item: RaindropBookmarkItem): boolean {
  if (isSyncV5JsonItem(item) || isSyncV4JsonItem(item)) {
    return false;
  }
  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  return (
    title === 'sync.json.txt' ||
    title === 'sync.json' ||
    fileName === 'sync.json.txt' ||
    fileName === 'sync.json' ||
    title.includes('sync.json') ||
    fileName.includes('sync.json') ||
    link.includes('sync.json')
  );
}

/**
 * Checks if a Raindrop item corresponds to the previous Arcable v5 sync file.
 */
export function isSyncV5JsonItem(item: RaindropBookmarkItem): boolean {
  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  return (
    title.includes('sync-v5.json') ||
    title.includes('sync-v5.txt') ||
    fileName.includes('sync-v5.json') ||
    fileName.includes('sync-v5.txt') ||
    link.includes('sync-v5.json') ||
    link.includes('sync-v5.txt')
  );
}

/** Checks if a Raindrop item is the previous v4 sync file. */
export function isSyncV4JsonItem(item: RaindropBookmarkItem): boolean {
  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  return (
    title.includes('sync-v4.json') ||
    title.includes('sync-v4.txt') ||
    fileName.includes('sync-v4.json') ||
    fileName.includes('sync-v4.txt') ||
    link.includes('sync-v4.json') ||
    link.includes('sync-v4.txt')
  );
}

/**
 * Checks if a Raindrop item corresponds to the previous Arcable v3 data json file.
 */
export function isDataV3JsonItem(item: RaindropBookmarkItem): boolean {
  if (isSyncV5JsonItem(item) || isSyncV4JsonItem(item)) {
    return false;
  }

  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  return (
    title.includes('data-v3.json') ||
    title.includes('data-v3.txt') ||
    fileName.includes('data-v3.json') ||
    fileName.includes('data-v3.txt') ||
    link.includes('data-v3.json') ||
    link.includes('data-v3.txt')
  );
}

/**
 * Checks if a Raindrop item corresponds to the previous Arcable v2 data json file.
 */
export function isDataV2JsonItem(item: RaindropBookmarkItem): boolean {
  if (isSyncV5JsonItem(item) || isSyncV4JsonItem(item) || isDataV3JsonItem(item)) {
    return false;
  }

  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  return (
    title.includes('data-v2.json') ||
    title.includes('data-v2.txt') ||
    fileName.includes('data-v2.json') ||
    fileName.includes('data-v2.txt') ||
    link.includes('data-v2.json') ||
    link.includes('data-v2.txt')
  );
}

/**
 * Checks if a Raindrop item corresponds to the legacy Arcable v1 data json file.
 */
export function isLegacyDataJsonItem(item: RaindropBookmarkItem): boolean {
  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  if (isSyncV5JsonItem(item) || isSyncV4JsonItem(item) || isDataV3JsonItem(item) || isDataV2JsonItem(item)) {
    return false;
  }

  return (
    title.includes('data.json') ||
    title.includes('data.txt') ||
    fileName.includes('data.json') ||
    fileName.includes('data.txt') ||
    link.includes('data.json') ||
    link.includes('data.txt')
  );
}

/**
 * Checks if a Raindrop item corresponds to any Arcable data json file.
 */
export function isDataJsonItem(item: RaindropBookmarkItem): boolean {
  return (
    isSyncJsonItem(item) ||
    isSyncV5JsonItem(item) ||
    isSyncV4JsonItem(item) ||
    isDataV3JsonItem(item) ||
    isDataV2JsonItem(item) ||
    isLegacyDataJsonItem(item)
  );
}

/**
 * Finds all existing "sync.json.txt" raindrop items under the specified collection,
 * sorted so that the most recently updated item is always first.
 */
export async function findAllRaindropSyncJsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: 'sync.json',
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of searchRes.items) {
      if (isSyncJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for sync.json file failed, falling back to full list:', err);
  }

  try {
    const listRes = await fetchRaindropItems(token, collectionId, {
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of listRes.items) {
      if (isSyncJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.error('[RaindropSync] Error listing items in collection:', err);
  }

  return items.sort((a, b) => {
    const timeA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : a.created ? new Date(a.created).getTime() : 0;
    const timeB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : b.created ? new Date(b.created).getTime() : 0;
    return timeB - timeA;
  });
}

/**
 * Finds the root collection named "Arcable", or creates one if it does not exist.
 *
 * Note: fetchRaindropCollections throws rather than returning an empty list when the
 * lookup itself fails, so this never falls through to createRaindropCollection just
 * because of a transient fetch error — that used to silently spawn a duplicate
 * "Arcable" collection (e.g. during a sync data version upgrade, when many devices
 * reconnect at once and can hit rate limits).
 */
export async function getOrCreateArcableCollection(token: string): Promise<RaindropCollectionItem> {
  const collections = await fetchRaindropCollections(token);

  // Look for root collection(s) named "Arcable"
  const matches = collections.filter(
    (c) =>
      c.title.trim().toLowerCase() === ARCABLE_COLLECTION_NAME.toLowerCase() &&
      (!c.parent || !c.parent.$id)
  );

  if (matches.length > 0) {
    // If duplicates already exist (e.g. from before this safeguard existed), prefer
    // the one actually holding data, tie-broken by the oldest (lowest _id) so we
    // keep converging on the same collection instead of drifting between them.
    matches.sort((a, b) => (b.count || 0) - (a.count || 0) || a._id - b._id);
    return matches[0];
  }

  // Create new root collection
  const created = await createRaindropCollection(token, ARCABLE_COLLECTION_NAME);
  return created;
}

/**
 * Finds all existing "sync-v5.json.txt" raindrop items under the specified collection,
 * sorted so that the most recently updated item is always first.
 * Never relies on cached IDs, always queries Raindrop live.
 */
export async function findAllRaindropSyncV5JsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  // 1. Search by term 'sync-v5' with newest first
  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: 'sync-v5',
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of searchRes.items) {
      if (isSyncV5JsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for sync-v5 file failed, falling back to full list:', err);
  }

  // 2. Fallback: list items in the collection with newest first
  try {
    const listRes = await fetchRaindropItems(token, collectionId, {
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of listRes.items) {
      if (isSyncV5JsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.error('[RaindropSync] Error listing items in collection:', err);
  }

  // Guarantee descending sort by lastUpdate / created timestamp
  items.sort((a, b) => {
    const timeA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : (a.created ? new Date(a.created).getTime() : 0);
    const timeB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : (b.created ? new Date(b.created).getTime() : 0);
    return timeB - timeA;
  });

  return items;
}

/** Finds the previous sync-v4 file for a one-way migration to sync-v5. */
export async function findAllRaindropSyncV4JsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  for (const options of [
    { search: 'sync-v4', perpage: 50, sort: '-lastUpdate' },
    { perpage: 50, sort: '-lastUpdate' },
  ]) {
    try {
      const result = await fetchRaindropItems(token, collectionId, options);
      for (const item of result.items) {
        if (isSyncV4JsonItem(item) && !items.some((x) => x._id === item._id)) {
          items.push(item);
        }
      }
    } catch (err) {
      console.warn('[RaindropSync] Failed to find sync-v4 migration file:', err);
    }
  }

  items.sort((a, b) => {
    const timeA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : (a.created ? new Date(a.created).getTime() : 0);
    const timeB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : (b.created ? new Date(b.created).getTime() : 0);
    return timeB - timeA;
  });
  return items;
}

/**
 * Finds all existing previous-generation "data-v3.json.txt" raindrop items under the
 * specified collection (used to migrate forward into the current sync file).
 */
export async function findAllRaindropDataV3JsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  // 1. Search by term 'data-v3' with newest first
  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: 'data-v3',
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of searchRes.items) {
      if (isDataV3JsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for data-v3 file failed, falling back to full list:', err);
  }

  // 2. Fallback: list items in the collection with newest first
  try {
    const listRes = await fetchRaindropItems(token, collectionId, {
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of listRes.items) {
      if (isDataV3JsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.error('[RaindropSync] Error listing items in collection:', err);
  }

  // Guarantee descending sort by lastUpdate / created timestamp
  items.sort((a, b) => {
    const timeA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : (a.created ? new Date(a.created).getTime() : 0);
    const timeB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : (b.created ? new Date(b.created).getTime() : 0);
    return timeB - timeA;
  });

  return items;
}

/**
 * Finds all existing previous-generation "data-v2.json.txt" raindrop items under the
 * specified collection (used to migrate forward into data-v3.json.txt).
 */
export async function findAllRaindropDataV2JsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  // 1. Search by term 'data-v2' with newest first
  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: 'data-v2',
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of searchRes.items) {
      if (isDataV2JsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for data-v2 file failed, falling back to full list:', err);
  }

  // 2. Fallback: list items in the collection with newest first
  try {
    const listRes = await fetchRaindropItems(token, collectionId, {
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of listRes.items) {
      if (isDataV2JsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.error('[RaindropSync] Error listing items in collection:', err);
  }

  // Guarantee descending sort by lastUpdate / created timestamp
  items.sort((a, b) => {
    const timeA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : (a.created ? new Date(a.created).getTime() : 0);
    const timeB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : (b.created ? new Date(b.created).getTime() : 0);
    return timeB - timeA;
  });

  return items;
}

/**
 * Finds all existing legacy "data.json" / "data.json.txt" raindrop items under the specified collection.
 */
export async function findAllRaindropLegacyDataJsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  // 1. Search by term 'data' with newest first
  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: 'data',
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of searchRes.items) {
      if (isLegacyDataJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for legacy data file failed:', err);
  }

  // 2. Fallback: list items in the collection
  try {
    const listRes = await fetchRaindropItems(token, collectionId, {
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of listRes.items) {
      if (isLegacyDataJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.error('[RaindropSync] Error listing legacy items in collection:', err);
  }

  items.sort((a, b) => {
    const timeA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : (a.created ? new Date(a.created).getTime() : 0);
    const timeB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : (b.created ? new Date(b.created).getTime() : 0);
    return timeB - timeA;
  });

  return items;
}

/**
 * Finds all existing data json items across all supported versions (prioritizing sync.json.txt).
 */
export async function findAllRaindropDataJsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const syncItems = await findAllRaindropSyncJsonItems(token, collectionId);
  if (syncItems.length > 0) return syncItems;

  const v5Items = await findAllRaindropSyncV5JsonItems(token, collectionId);
  if (v5Items.length > 0) return v5Items;

  const v4Items = await findAllRaindropSyncV4JsonItems(token, collectionId);
  if (v4Items.length > 0) return v4Items;

  const v3Items = await findAllRaindropDataV3JsonItems(token, collectionId);
  if (v3Items.length > 0) return v3Items;

  const v2Items = await findAllRaindropDataV2JsonItems(token, collectionId);
  if (v2Items.length > 0) return v2Items;

  return findAllRaindropLegacyDataJsonItems(token, collectionId);
}

/**
 * Searches for the latest data json item under the specified collection.
 */
export async function findRaindropDataJsonItem(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem | null> {
  const all = await findAllRaindropDataJsonItems(token, collectionId);
  return all.length > 0 ? all[0] : null;
}

/**
 * Downloads and parses ArcableWorkspaceData from a Raindrop bookmark item.
 * Supports both modern full-JSON snapshots and legacy ArcableSyncFile structures.
 * Tmp tabs are strictly excluded (kept local only).
 */
export async function downloadAndParseWorkspaceData(
  token: string,
  item: RaindropBookmarkItem
): Promise<ArcableWorkspaceData> {
  const urlCandidates: string[] = [];

  if (item._id) {
    try {
      const fullItem = await fetchRaindropItem(token, item._id);
      if (fullItem?.file?.path) {
        urlCandidates.push(fullItem.file.path);
      }
      if (fullItem?.link && !urlCandidates.includes(fullItem.link)) {
        urlCandidates.push(fullItem.link);
      }
    } catch {
      // Non-blocking detail lookup
    }
  }

  if (item.file?.path && !urlCandidates.includes(item.file.path)) {
    urlCandidates.push(item.file.path);
  }
  if (item.link && !urlCandidates.includes(item.link)) {
    urlCandidates.push(item.link);
  }
  if (item._id) {
    urlCandidates.push(`${RAINDROP_API_BASE}/raindrop/${item._id}/file`);
    urlCandidates.push(`${RAINDROP_API_BASE}/file/${item._id}`);
  }

  let rawContent = '';
  for (const url of urlCandidates) {
    if (url && typeof url === 'string') {
      try {
        const content = await fetchRaindropFileContent(token, url);
        if (content && content.trim() && !content.trim().startsWith('<')) {
          rawContent = content.trim();
          break;
        }
      } catch {
        // Try next candidate
      }
    }
  }

  if (!rawContent || !rawContent.trim()) {
    throw new Error(
      `Found existing workspace sync file in Raindrop (Item ID ${item._id}), but failed to download its content.`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `Found existing workspace sync file in Raindrop (Item ID ${item._id}), but content is not valid JSON.`
    );
  }

  // Case 1: Legacy ArcableSyncFile format with baselineSnapshot & operations
  if (parsed && parsed.baselineSnapshot && Array.isArray(parsed.operations)) {
    let snapshot = parsed.baselineSnapshot as ArcableWorkspaceData;
    if (parsed.operations.length > 0) {
      snapshot = replayOperations(snapshot, parsed.operations);
    }
    return {
      version: snapshot.version || 1,
      activeSpaceId: snapshot.activeSpaceId || snapshot.spaces?.[0]?.id || 'space_personal',
      spaces: snapshot.spaces || [],
      folders: snapshot.folders || [],
      tabs: snapshot.tabs || [],
      tmpTabs: [], // Tmp tabs are local only
      widgets: snapshot.widgets || [],
      customCodeRules: snapshot.customCodeRules || [],
      runCodeInPageRules: snapshot.runCodeInPageRules || [],
      environmentVariables: snapshot.environmentVariables || [],
      environments: snapshot.environments,
    };
  }

  // Case 2: Full ArcableWorkspaceData JSON format
  if (parsed && Array.isArray(parsed.spaces)) {
    return {
      version: parsed.version || 1,
      activeSpaceId: parsed.activeSpaceId || parsed.spaces?.[0]?.id || 'space_personal',
      spaces: parsed.spaces || [],
      folders: parsed.folders || [],
      tabs: parsed.tabs || [],
      tmpTabs: [], // Tmp tabs are local only
      widgets: parsed.widgets || [],
      customCodeRules: parsed.customCodeRules || [],
      runCodeInPageRules: parsed.runCodeInPageRules || [],
      environmentVariables: parsed.environmentVariables || [],
      environments: parsed.environments,
    };
  }

  throw new Error(`Remote sync file structure in Raindrop is unrecognized.`);
}

/**
 * Downloads and parses an ArcableSyncFile from a Raindrop bookmark item (for backward compatibility).
 */
export async function downloadAndParseSyncFile(
  token: string,
  item: RaindropBookmarkItem,
  deviceId: string
): Promise<ArcableSyncFile> {
  const workspaceData = await downloadAndParseWorkspaceData(token, item);
  return createInitialSyncFile(workspaceData, deviceId);
}

/**
 * Uploads the sync file to Raindrop and ensures its title is explicitly set to DATA_JSON_FILE_NAME ("sync.json.txt").
 */
export async function uploadRaindropSyncFile(
  token: string,
  collectionId: number,
  content: string
): Promise<any> {
  const uploadResult = await uploadRaindropFile(token, collectionId, DATA_JSON_FILE_NAME, content);
  const itemId = uploadResult?.item?._id;
  if (itemId) {
    try {
      await updateRaindropItem(token, itemId, { title: DATA_JSON_FILE_NAME });
    } catch (updErr) {
      console.warn('[RaindropSync] Warning setting sync file title in Raindrop:', updErr);
    }
  }
  return uploadResult;
}

/**
 * Auto-fetches the workspace from Raindrop once on load to replace local data with remote data.
 * Checks for sync.json.txt first, then falls back to legacy files (sync-v5, sync-v4, data-v3, data-v2, data.json).
 */
export async function fetchRaindropWorkspace(
  token: string
): Promise<{ success: boolean; data?: ArcableWorkspaceData; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, error: 'Raindrop authorization token is missing or invalid.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      return { success: false, error: 'Failed to find or create root "Arcable" collection.' };
    }

    // 1. Check sync.json.txt
    const syncJsonItems = await findAllRaindropSyncJsonItems(clean, collection._id);
    if (syncJsonItems.length > 0) {
      const data = await downloadAndParseWorkspaceData(clean, syncJsonItems[0]);
      return { success: true, data };
    }

    // 2. Backward compatibility: check sync-v5.json.txt
    const syncV5Items = await findAllRaindropSyncV5JsonItems(clean, collection._id);
    if (syncV5Items.length > 0) {
      const data = await downloadAndParseWorkspaceData(clean, syncV5Items[0]);
      return { success: true, data };
    }

    // 3. Backward compatibility: check sync-v4.json.txt
    const syncV4Items = await findAllRaindropSyncV4JsonItems(clean, collection._id);
    if (syncV4Items.length > 0) {
      const data = await downloadAndParseWorkspaceData(clean, syncV4Items[0]);
      return { success: true, data };
    }

    // 4. Backward compatibility: check data-v3.json.txt
    const dataV3Items = await findAllRaindropDataV3JsonItems(clean, collection._id);
    if (dataV3Items.length > 0) {
      const data = await downloadAndParseWorkspaceData(clean, dataV3Items[0]);
      return { success: true, data };
    }

    // 5. Backward compatibility: check data-v2.json.txt
    const dataV2Items = await findAllRaindropDataV2JsonItems(clean, collection._id);
    if (dataV2Items.length > 0) {
      const data = await downloadAndParseWorkspaceData(clean, dataV2Items[0]);
      return { success: true, data };
    }

    // 6. Backward compatibility: check data.json.txt
    const legacyItems = await findAllRaindropLegacyDataJsonItems(clean, collection._id);
    if (legacyItems.length > 0) {
      const data = await downloadAndParseWorkspaceData(clean, legacyItems[0]);
      return { success: true, data };
    }

    // No remote data found
    return { success: true, data: undefined };
  } catch (err: any) {
    console.error('[RaindropSync] Failed to fetch workspace:', err);
    return { success: false, error: err?.message || 'Failed to fetch remote workspace.' };
  }
}

/**
 * Fetches and parses the ArcableSyncFile from Raindrop file content (backward compatibility helper).
 */
export async function fetchRaindropSyncFile(
  token: string,
  collectionId: number,
  localFallback: ArcableWorkspaceData,
  deviceId: string
): Promise<{ syncFile: ArcableSyncFile; existingItems: RaindropBookmarkItem[] }> {
  const syncItems = await findAllRaindropSyncJsonItems(token, collectionId);
  if (syncItems.length > 0) {
    const syncFile = await downloadAndParseSyncFile(token, syncItems[0], deviceId);
    return { syncFile, existingItems: syncItems };
  }

  const existingV5Items = await findAllRaindropSyncV5JsonItems(token, collectionId);
  if (existingV5Items.length > 0) {
    const syncFile = await downloadAndParseSyncFile(token, existingV5Items[0], deviceId);
    return { syncFile, existingItems: existingV5Items };
  }

  const existingV4Items = await findAllRaindropSyncV4JsonItems(token, collectionId);
  if (existingV4Items.length > 0) {
    const migratedSyncFile = await downloadAndParseSyncFile(token, existingV4Items[0], deviceId);
    return { syncFile: migratedSyncFile, existingItems: [] };
  }

  const existingV3Items = await findAllRaindropDataV3JsonItems(token, collectionId);
  if (existingV3Items.length > 0) {
    try {
      const migratedSyncFile = await downloadAndParseSyncFile(token, existingV3Items[0], deviceId);
      return { syncFile: migratedSyncFile, existingItems: [] };
    } catch {}
  }

  return {
    syncFile: createInitialSyncFile(localFallback, deviceId),
    existingItems: [],
  };
}

/**
 * Manual Raindrop Sync:
 * Saves full JSON only to "sync.json.txt", completely overriding remote data with local state.
 * Operations log and multiple devices tracking are deprecated.
 * Tmp tabs are strictly kept local only and never saved to Raindrop.
 */
export async function syncWorkspaceWithRaindrop(
  token: string,
  options?: {
    localState?: ArcableWorkspaceData;
    deviceId?: string;
    deviceName?: string;
    pendingOps?: WorkspaceOperation[];
    replaceBaseline?: boolean;
  }
): Promise<SyncResult> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return {
      success: false,
      error: 'Raindrop authorization token is missing or invalid.',
    };
  }

  try {
    // 1. Get or create root "Arcable" collection
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection in Raindrop.');
    }

    // 2. Prepare payload: full JSON only, tmp tabs excluded (local only)
    const localState: ArcableWorkspaceData = options?.localState || {
      activeSpaceId: 'space_personal',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
      tmpTabs: [],
      widgets: [],
      customCodeRules: [],
      runCodeInPageRules: [],
    };

    const fullJsonPayload: ArcableWorkspaceData = {
      version: localState.version || 1,
      activeSpaceId: localState.activeSpaceId || 'space_personal',
      spaces: localState.spaces || [],
      folders: localState.folders || [],
      tabs: localState.tabs || [],
      tmpTabs: [], // Tmp tabs are local only!
      widgets: localState.widgets || [],
      customCodeRules: localState.customCodeRules || [],
      runCodeInPageRules: localState.runCodeInPageRules || [],
      environmentVariables: localState.environmentVariables || [],
      environments: localState.environments,
    };

    // 3. Find existing sync items (sync.json.txt and sync-v5.json.txt) to delete them
    const existingSyncItems = await findAllRaindropSyncJsonItems(clean, collection._id);
    const existingV5Items = await findAllRaindropSyncV5JsonItems(clean, collection._id);
    const itemsToDelete = [...existingSyncItems, ...existingV5Items];

    for (const item of itemsToDelete) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning: Failed to delete previous sync item:', delErr);
        }
      }
    }

    // 4. Upload full JSON snapshot as sync.json.txt
    const fileContent = JSON.stringify(fullJsonPayload, null, 2);
    const uploadResult = await uploadRaindropSyncFile(
      clean,
      collection._id,
      fileContent
    );

    const uploadedItemId = uploadResult?.item?._id;

    // 5. Clear pending operations if in window context
    if (typeof window !== 'undefined') {
      clearStoredPendingOperations();
    }

    return {
      success: true,
      collectionId: collection._id,
      dataItemId: uploadedItemId,
      latestSnapshot: fullJsonPayload,
      syncedAt: Date.now(),
    };
  } catch (err: any) {
    console.error('[RaindropSync] Sync error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to sync workspace with Raindrop.',
    };
  }
}

/**
 * Devices management has been removed. Retained as stubs for backward compatibility.
 */
export async function fetchRaindropDevices(
  _token: string,
  _currentDeviceId?: string
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  return { success: true, devices: [] };
}

export async function renameRaindropDevice(
  _token: string,
  _deviceId: string,
  _newDeviceName: string,
  _localFallback?: ArcableWorkspaceData
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  return { success: true, devices: [] };
}

export async function deleteRaindropDevice(
  _token: string,
  _deviceId: string,
  _localFallback?: ArcableWorkspaceData
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; latestSnapshot?: ArcableWorkspaceData; error?: string }> {
  return { success: true, devices: [] };
}

export async function deleteAllOtherRaindropDevices(
  _token: string,
  _keepDeviceId: string,
  _localFallback?: ArcableWorkspaceData
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; latestSnapshot?: ArcableWorkspaceData; error?: string }> {
  return { success: true, devices: [] };
}

/**
 * Formats a Date object into 'YYYYMMDDHHmmss'.
 */
export function formatBackupTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

/**
 * Formats a backup file name: `backup-<device name>-<YYYYMMDDHHmmss>.json.txt`
 * Sanitizes slashes and special characters so multipart FormData doesn't treat device names as path components.
 */
export function formatBackupFileName(deviceName: string, date: Date = new Date()): string {
  const cleanDevice = (deviceName || 'Unknown Device')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
  const timestamp = formatBackupTimestamp(date);
  return `backup-${cleanDevice}-${timestamp}.json.txt`;
}

/**
 * Parses a backup file name or title into device name and timestamp.
 * Supports: `backup-<device name>-<YYYYMMDDHHmmss>.json.txt`, `.json`, `.txt`, or raw name.
 */
export function parseBackupFileName(fileNameOrTitle: string): {
  deviceName: string;
  timestampStr: string;
  date: Date | null;
} | null {
  if (!fileNameOrTitle) return null;
  const trimmed = fileNameOrTitle.trim();

  // 1. Standard format: backup-<device name>-<YYYYMMDDHHmmss>
  let match = trimmed.match(/^backup-(.+)-(\d{14})(?:\.json(?:\.txt)?|\.txt)?$/i);
  if (!match) {
    match = trimmed.match(/^backup-(.+)-(\d{8,14})(?:\.json(?:\.txt)?|\.txt)?$/i);
  }
  // 2. Fallback format (e.g. if previous upload stripped the backup- prefix): <device name>-<YYYYMMDDHHmmss>
  if (!match && !trimmed.toLowerCase().includes('data.json') && !trimmed.toLowerCase().includes('data.txt')) {
    match = trimmed.match(/^(.+)-(\d{14})(?:\.json(?:\.txt)?|\.txt)?$/i);
  }
  if (!match) return null;

  const deviceName = match[1].trim();
  const timestampStr = match[2];

  let date: Date | null = null;
  try {
    const yyyy = parseInt(timestampStr.slice(0, 4), 10);
    const MM = parseInt(timestampStr.slice(4, 6), 10) - 1;
    const dd = parseInt(timestampStr.slice(6, 8), 10);
    const HH = parseInt(timestampStr.slice(8, 10), 10);
    const mm = parseInt(timestampStr.slice(10, 12), 10);
    const ss = parseInt(timestampStr.slice(12, 14), 10);
    date = new Date(yyyy, MM, dd, HH, mm, ss);
  } catch {}

  return {
    deviceName,
    timestampStr,
    date,
  };
}

/**
 * Checks if a Raindrop bookmark/file item corresponds to an Arcable backup file.
 */
export function isBackupFileItem(item: RaindropBookmarkItem): boolean {
  if (isDataJsonItem(item)) {
    return false;
  }

  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  const isBackupTitle = title.startsWith('backup-') && (title.includes('.json') || title.includes('.txt'));
  const isBackupFile = fileName.startsWith('backup-') && (fileName.includes('.json') || fileName.includes('.txt'));
  const isBackupLink = link.includes('backup-') && (link.includes('.json') || link.includes('.txt'));
  const isTimestampedBackup = /\d{14}\.json(?:\.txt)?$/i.test(title) || /\d{14}\.json(?:\.txt)?$/i.test(fileName);

  return isBackupTitle || isBackupFile || isBackupLink || isTimestampedBackup;
}

/**
 * Creates a manual backup of current JSON data to the root "Arcable" collection.
 * Target file name format: `backup-<device name>-<YYYYMMDDHHmmss>.json.txt`
 */
export async function createRaindropBackup(
  token: string,
  options: {
    workspaceData: ArcableWorkspaceData;
    deviceName?: string;
    deviceType?: 'Web App' | 'Ext' | string;
  }
): Promise<{ success: boolean; backupItem?: RaindropBookmarkItem; fileName?: string; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, error: 'Raindrop authorization token is missing or invalid.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection in Raindrop.');
    }

    const deviceName = options.deviceName || getStoredDeviceName(undefined, options.deviceType);
    const fileName = formatBackupFileName(deviceName, new Date());
    const fileContent = JSON.stringify(options.workspaceData, null, 2);

    const uploadResult = await uploadRaindropFile(
      clean,
      collection._id,
      fileName,
      fileContent
    );

    const createdItem = uploadResult?.item;
    if (createdItem?._id) {
      // Explicitly set the title in Raindrop to ensure it matches fileName exactly
      try {
        await updateRaindropItem(clean, createdItem._id, { title: fileName });
      } catch (updErr) {
        console.warn('[RaindropSync] Warning updating backup title in Raindrop:', updErr);
      }
    }

    return {
      success: true,
      fileName,
      backupItem: createdItem,
    };
  } catch (err: any) {
    console.error('[RaindropSync] Error creating backup:', err);
    return { success: false, error: err?.message || 'Failed to create backup in Raindrop.' };
  }
}

/**
 * Fetches all backups from the root "Arcable" collection.
 * Returns the most recent backups on top, capped at the top 10.
 */
export async function fetchRaindropBackups(
  token: string
): Promise<{ success: boolean; backups: RaindropBackupRecord[]; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, backups: [], error: 'Raindrop authorization token is missing or invalid.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection in Raindrop.');
    }

    const items: RaindropBookmarkItem[] = [];

    // 1. Search by term 'backup' with newest first
    try {
      const searchRes = await fetchRaindropItems(clean, collection._id, {
        search: 'backup',
        perpage: 50,
        sort: '-lastUpdate',
      });
      for (const item of searchRes.items) {
        if (isBackupFileItem(item) && !items.some((x) => x._id === item._id)) {
          items.push(item);
        }
      }
    } catch (err) {
      console.warn('[RaindropSync] Search for backup files failed, falling back to full list:', err);
    }

    // 2. Fallback: list items in the collection
    try {
      const listRes = await fetchRaindropItems(clean, collection._id, {
        perpage: 50,
        sort: '-lastUpdate',
      });
      for (const item of listRes.items) {
        if (isBackupFileItem(item) && !items.some((x) => x._id === item._id)) {
          items.push(item);
        }
      }
    } catch (err) {
      console.error('[RaindropSync] Error listing items in collection:', err);
    }

    // Map items to RaindropBackupRecord
    const backupRecords: RaindropBackupRecord[] = items.map((item) => {
      const fileName = item.file?.name || item.title || 'backup.json.txt';
      const parsed = parseBackupFileName(fileName) || parseBackupFileName(item.title || '');

      let timestamp = 0;
      if (parsed?.date) {
        timestamp = parsed.date.getTime();
      } else if (item.created) {
        timestamp = new Date(item.created).getTime();
      } else if (item.lastUpdate) {
        timestamp = new Date(item.lastUpdate).getTime();
      }

      return {
        id: item._id,
        title: item.title || fileName,
        fileName,
        deviceName: parsed?.deviceName || 'Unknown Device',
        timestampStr: parsed?.timestampStr,
        timestamp,
        date: parsed?.date ? parsed.date.toLocaleString() : (item.created ? new Date(item.created).toLocaleString() : undefined),
        size: item.file?.size,
        link: item.link,
        created: item.created,
        lastUpdate: item.lastUpdate,
      };
    });

    // Guarantee descending sort: most recent backups first
    backupRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Cap at top 10
    const cappedBackups = backupRecords.slice(0, 10);

    return {
      success: true,
      backups: cappedBackups,
    };
  } catch (err: any) {
    console.error('[RaindropSync] Error fetching backups:', err);
    return { success: false, backups: [], error: err?.message || 'Failed to fetch backups from Raindrop.' };
  }
}

/**
 * Restores a backup from the root "Arcable" collection by backup item ID:
 * 1. Downloads the backup file content from Raindrop.
 * 2. Parses and validates the JSON data.
 * 3. Overrides local data.
 * 4. Overrides the remote "Arcable" root collection > data.json.txt file.
 */
export async function restoreRaindropBackup(
  token: string,
  backupId: number,
  options?: {
    deviceId?: string;
    deviceName?: string;
  }
): Promise<{ success: boolean; restoredSnapshot?: ArcableWorkspaceData; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, error: 'Raindrop authorization token is missing or invalid.' };
  }

  if (!backupId) {
    return { success: false, error: 'Backup ID is required.' };
  }

  const deviceId = options?.deviceId || (typeof window !== 'undefined' ? getOrCreateDeviceId() : 'device_restore');
  const deviceName = options?.deviceName || (typeof window !== 'undefined' ? getStoredDeviceName() : 'Restored Device');

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection in Raindrop.');
    }

    // 1. Fetch the backup item detail
    const backupItem = await fetchRaindropItem(clean, backupId);
    if (!backupItem) {
      throw new Error(`Backup item with ID ${backupId} not found in Raindrop.`);
    }

    // 2. Download backup content using candidate URLs
    const urlCandidates: string[] = [];
    if (backupItem.file?.path) {
      urlCandidates.push(backupItem.file.path);
    }
    if (backupItem.link && !urlCandidates.includes(backupItem.link)) {
      urlCandidates.push(backupItem.link);
    }
    urlCandidates.push(`${RAINDROP_API_BASE}/raindrop/${backupId}/file`);
    urlCandidates.push(`${RAINDROP_API_BASE}/file/${backupId}`);

    let rawContent = '';
    for (const url of urlCandidates) {
      if (url && typeof url === 'string') {
        try {
          const content = await fetchRaindropFileContent(clean, url);
          if (content && content.trim() && !content.trim().startsWith('<')) {
            rawContent = content.trim();
            break;
          }
        } catch {
          // Try next candidate
        }
      }
    }

    if (!rawContent || !rawContent.trim()) {
      throw new Error(`Failed to download backup file content for backup item ${backupId}.`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error('Backup file content is not valid JSON.');
    }

    // Extract valid ArcableWorkspaceData snapshot
    let snapshot: ArcableWorkspaceData;
    if (parsed && parsed.baselineSnapshot && Array.isArray(parsed.operations)) {
      // It's an ArcableSyncFile
      snapshot = replayOperations(parsed.baselineSnapshot, parsed.operations);
    } else if (parsed && Array.isArray(parsed.spaces)) {
      // It's a direct ArcableWorkspaceData snapshot
      snapshot = {
        spaces: parsed.spaces,
        folders: parsed.folders || [],
        tabs: parsed.tabs || [],
        activeSpaceId: parsed.activeSpaceId || parsed.spaces[0]?.id || 'space_personal',
        version: parsed.version || 1,
      };
    } else {
      throw new Error('Unrecognized backup file format: missing spaces data.');
    }

    // 3. Override local data & clear pending ops if in browser context
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('arcable_workspace_data', JSON.stringify(snapshot));
        clearStoredPendingOperations();
      } catch (storageErr) {
        console.warn('[RaindropSync] Warning saving restored data to localStorage:', storageErr);
      }
    }

    // 4. Override remote sync.json.txt in "Arcable" root collection
    // Find and delete existing sync.json.txt and sync-v5 items
    const existingSyncItems = await findAllRaindropSyncJsonItems(clean, collection._id);
    const existingV5Items = await findAllRaindropSyncV5JsonItems(clean, collection._id);
    const itemsToDelete = [...existingSyncItems, ...existingV5Items];
    for (const item of itemsToDelete) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning deleting previous sync item during restore:', delErr);
        }
      }
    }

    const payload: ArcableWorkspaceData = {
      ...snapshot,
      tmpTabs: [],
    };
    const newFileContent = JSON.stringify(payload, null, 2);
    await uploadRaindropSyncFile(clean, collection._id, newFileContent);

    return {
      success: true,
      restoredSnapshot: snapshot,
    };
  } catch (err: any) {
    console.error('[RaindropSync] Error restoring backup:', err);
    return { success: false, error: err?.message || 'Failed to restore backup from Raindrop.' };
  }
}
