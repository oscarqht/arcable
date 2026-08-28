import { ArcableWorkspaceData } from '../types/workspace';
import { ArcableSyncFile, SyncResult, WorkspaceOperation } from '../types/sync';
import { RaindropCollectionItem, RaindropBookmarkItem } from '../types/raindrop';
import {
  fetchRaindropCollections,
  createRaindropCollection,
  fetchRaindropItems,
  deleteRaindropBookmark,
  uploadRaindropFile,
  fetchRaindropFileContent,
  cleanRaindropToken,
} from './raindropClient';
import {
  getOrCreateDeviceId,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  compactSyncFile,
  createInitialSyncFile,
  isPlaceholderSnapshot,
} from './syncEngine';

export const ARCABLE_COLLECTION_NAME = 'Arcable';
export const DATA_JSON_FILE_NAME = 'data.json.txt';

/**
 * Checks if a Raindrop item corresponds to the Arcable data json file.
 */
export function isDataJsonItem(item: RaindropBookmarkItem): boolean {
  const title = (item.title || '').trim().toLowerCase();
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();

  return (
    title === 'data.json' ||
    title === 'data.json.txt' ||
    title === 'data.txt' ||
    fileName === 'data.json' ||
    fileName === 'data.json.txt' ||
    fileName === 'data.txt' ||
    link.includes('data.json.txt') ||
    link.includes('data.json') ||
    link.includes('data.txt')
  );
}

/**
 * Finds the root collection named "Arcable", or creates one if it does not exist.
 */
export async function getOrCreateArcableCollection(token: string): Promise<RaindropCollectionItem> {
  const collections = await fetchRaindropCollections(token);

  // Look for root collection named "Arcable"
  const existing = collections.find(
    (c) =>
      c.title.trim().toLowerCase() === ARCABLE_COLLECTION_NAME.toLowerCase() &&
      (!c.parent || !c.parent.$id)
  );

  if (existing) {
    return existing;
  }

  // Create new root collection
  const created = await createRaindropCollection(token, ARCABLE_COLLECTION_NAME);
  return created;
}

/**
 * Finds all existing "data.json" / "data.json.txt" raindrop items under the specified collection.
 */
export async function findAllRaindropDataJsonItems(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem[]> {
  const items: RaindropBookmarkItem[] = [];

  // 1. Search by term 'data'
  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: 'data',
      perpage: 50,
    });
    for (const item of searchRes.items) {
      if (isDataJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for data file failed, falling back to full list:', err);
  }

  // 2. Fallback: list items in the collection
  try {
    const listRes = await fetchRaindropItems(token, collectionId, { perpage: 50 });
    for (const item of listRes.items) {
      if (isDataJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.error('[RaindropSync] Error listing items in collection:', err);
  }

  return items;
}

/**
 * Searches for an existing "data.json" / "data.json.txt" raindrop item under the specified collection.
 */
export async function findRaindropDataJsonItem(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem | null> {
  const all = await findAllRaindropDataJsonItems(token, collectionId);
  return all.length > 0 ? all[0] : null;
}

/**
 * Fetches and parses the ArcableSyncFile from Raindrop.
 * If data.json does not exist or contains legacy/empty placeholder data, bootstraps a valid ArcableSyncFile from local state.
 */
export async function fetchRaindropSyncFile(
  token: string,
  collectionId: number,
  localFallback: ArcableWorkspaceData,
  deviceId: string
): Promise<{ syncFile: ArcableSyncFile; existingItems: RaindropBookmarkItem[] }> {
  const existingItems = await findAllRaindropDataJsonItems(token, collectionId);

  if (existingItems.length === 0) {
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItems: [],
    };
  }

  // Use the first (or most recently updated) data item
  const latestItem = existingItems[0];
  const fileUrl = latestItem.file?.path || latestItem.link;

  try {
    let rawContent = fileUrl ? await fetchRaindropFileContent(token, fileUrl) : '';

    // Fallback: check item note or excerpt if remote file download was empty or not plain text
    if (!rawContent || !rawContent.trim()) {
      if (latestItem.note && latestItem.note.trim().startsWith('{')) {
        rawContent = latestItem.note;
      } else if (latestItem.excerpt && latestItem.excerpt.trim().startsWith('{')) {
        rawContent = latestItem.excerpt;
      }
    }

    if (!rawContent || !rawContent.trim()) {
      return {
        syncFile: createInitialSyncFile(localFallback, deviceId),
        existingItems,
      };
    }

    const trimmed = rawContent.trim();
    if (trimmed.startsWith('<')) {
      console.warn('[RaindropSync] Remote data item returned HTML/XML error instead of JSON, bootstrapping from local state.');
      return {
        syncFile: createInitialSyncFile(localFallback, deviceId),
        existingItems,
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch (parseErr) {
      console.warn('[RaindropSync] Failed to parse remote data.json, bootstrapping from local state:', parseErr);
      return {
        syncFile: createInitialSyncFile(localFallback, deviceId),
        existingItems,
      };
    }

    // Case 1: Already an ArcableSyncFile format
    if (parsed && parsed.baselineSnapshot && Array.isArray(parsed.operations)) {
      // If remote snapshot is just an empty placeholder (e.g. space_default with 0 operations)
      // and localFallback has actual user data, adopt localFallback to restore the real workspace state.
      if (
        isPlaceholderSnapshot(parsed.baselineSnapshot) &&
        parsed.operations.length === 0 &&
        !isPlaceholderSnapshot(localFallback)
      ) {
        return {
          syncFile: createInitialSyncFile(localFallback, deviceId),
          existingItems,
        };
      }

      return {
        syncFile: {
          version: parsed.version || 1,
          devices: parsed.devices || {},
          baselineSnapshot: parsed.baselineSnapshot,
          operations: parsed.operations,
        },
        existingItems,
      };
    }

    // Case 2: Legacy single ArcableWorkspaceData snapshot ({ spaces, folders, tabs })
    if (parsed && Array.isArray(parsed.spaces)) {
      if (
        isPlaceholderSnapshot(parsed as ArcableWorkspaceData) &&
        !isPlaceholderSnapshot(localFallback)
      ) {
        return {
          syncFile: createInitialSyncFile(localFallback, deviceId),
          existingItems,
        };
      }

      return {
        syncFile: createInitialSyncFile(parsed as ArcableWorkspaceData, deviceId),
        existingItems,
      };
    }

    // Case 3: Empty object or unrecognized structure
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItems,
    };
  } catch (err) {
    console.warn('[RaindropSync] Unexpected error reading remote data.json, using local state:', err);
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItems,
    };
  }
}

/**
 * Core multi-device sync function:
 * 1. Finds/creates root "Arcable" collection in Raindrop.
 * 2. Fetches remote "data.json" sync file (or initializes if missing/legacy/placeholder).
 * 3. Appends local pending operations.
 * 4. Compacts baseline snapshot with 7-day inactive device TTL and Lamport ordering.
 * 5. Deletes existing "data.json" raindrop item(s).
 * 6. Uploads the updated sync file to the Arcable root collection.
 * 7. Clears local pending operations and returns latest resolved snapshot.
 */
export async function syncWorkspaceWithRaindrop(
  token: string,
  options?: {
    localState?: ArcableWorkspaceData;
    deviceId?: string;
    deviceName?: string;
    pendingOps?: WorkspaceOperation[];
  }
): Promise<SyncResult> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return {
      success: false,
      error: 'Raindrop authorization token is missing or invalid.',
    };
  }

  const deviceId = options?.deviceId || getOrCreateDeviceId();
  const deviceName = options?.deviceName;

  try {
    // 1. Get or create root "Arcable" collection
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection in Raindrop.');
    }

    // Default fallback state if creating from scratch
    const localState: ArcableWorkspaceData = options?.localState || {
      activeSpaceId: 'space_personal',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    };

    // 2. Fetch remote sync file & existing items
    const { syncFile: remoteSyncFile, existingItems } = await fetchRaindropSyncFile(
      clean,
      collection._id,
      localState,
      deviceId
    );

    // 3. Read local pending operations (prefer passed-in options.pendingOps if provided)
    const pendingOps = options?.pendingOps !== undefined
      ? options.pendingOps
      : getStoredPendingOperations();

    // 4. Compact sync file & compute latest snapshot
    const compacted = compactSyncFile(
      remoteSyncFile,
      deviceId,
      pendingOps,
      deviceName,
      Date.now()
    );

    // 5. Delete existing data.json items if present
    for (const item of existingItems) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning: Failed to delete previous data.json item:', delErr);
        }
      }
    }

    // 6. Upload updated ArcableSyncFile as data.json
    const fileContent = JSON.stringify(compacted.syncFile, null, 2);
    const uploadResult = await uploadRaindropFile(
      clean,
      collection._id,
      DATA_JSON_FILE_NAME,
      fileContent
    );

    const uploadedItemId = uploadResult?.item?._id;

    // 7. Clear pending operations if on client and not managed by caller
    if (typeof window !== 'undefined' && options?.pendingOps === undefined) {
      clearStoredPendingOperations();
    }

    return {
      success: true,
      collectionId: collection._id,
      dataItemId: uploadedItemId,
      latestSnapshot: compacted.latestSnapshot,
      syncFile: compacted.syncFile,
      opsAppliedCount: pendingOps.length,
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
