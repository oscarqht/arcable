import { ArcableWorkspaceData } from '../types/workspace';
import { ArcableSyncFile, SyncResult } from '../types/sync';
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
} from './syncEngine';

export const ARCABLE_COLLECTION_NAME = 'Arcable';
export const DATA_JSON_FILE_NAME = 'data.json';

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
 * Searches for an existing "data.json" raindrop item under the specified collection.
 */
export async function findRaindropDataJsonItem(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem | null> {
  // First search by term
  try {
    const searchRes = await fetchRaindropItems(token, collectionId, {
      search: DATA_JSON_FILE_NAME,
      perpage: 20,
    });

    const foundInSearch = searchRes.items.find(
      (item) =>
        item.title?.toLowerCase() === DATA_JSON_FILE_NAME.toLowerCase() ||
        (item as any).file?.name?.toLowerCase() === DATA_JSON_FILE_NAME.toLowerCase() ||
        item.link?.toLowerCase().endsWith(DATA_JSON_FILE_NAME.toLowerCase())
    );

    if (foundInSearch) {
      return foundInSearch;
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for data.json failed, falling back to full list:', err);
  }

  // Fallback: list items in the collection
  try {
    const listRes = await fetchRaindropItems(token, collectionId, { perpage: 50 });
    const foundInList = listRes.items.find(
      (item) =>
        item.title?.toLowerCase() === DATA_JSON_FILE_NAME.toLowerCase() ||
        (item as any).file?.name?.toLowerCase() === DATA_JSON_FILE_NAME.toLowerCase() ||
        item.link?.toLowerCase().endsWith(DATA_JSON_FILE_NAME.toLowerCase())
    );

    return foundInList || null;
  } catch (err) {
    console.error('[RaindropSync] Error listing items in collection:', err);
    return null;
  }
}

/**
 * Fetches and parses the ArcableSyncFile from Raindrop.
 * If data.json does not exist or contains legacy/empty data, bootstraps a valid ArcableSyncFile.
 */
export async function fetchRaindropSyncFile(
  token: string,
  collectionId: number,
  localFallback: ArcableWorkspaceData,
  deviceId: string
): Promise<{ syncFile: ArcableSyncFile; existingItem: RaindropBookmarkItem | null }> {
  const existingItem = await findRaindropDataJsonItem(token, collectionId);

  if (!existingItem || !existingItem.link) {
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItem: null,
    };
  }

  try {
    const rawContent = await fetchRaindropFileContent(token, existingItem.link);
    if (!rawContent || !rawContent.trim()) {
      return {
        syncFile: createInitialSyncFile(localFallback, deviceId),
        existingItem,
      };
    }

    const parsed = JSON.parse(rawContent);

    // Case 1: Already an ArcableSyncFile format
    if (parsed && parsed.baselineSnapshot && Array.isArray(parsed.operations)) {
      return {
        syncFile: {
          version: parsed.version || 1,
          devices: parsed.devices || {},
          baselineSnapshot: parsed.baselineSnapshot,
          operations: parsed.operations,
        },
        existingItem,
      };
    }

    // Case 2: Legacy single ArcableWorkspaceData snapshot ({ spaces, folders, tabs })
    if (parsed && Array.isArray(parsed.spaces)) {
      return {
        syncFile: createInitialSyncFile(parsed as ArcableWorkspaceData, deviceId),
        existingItem,
      };
    }

    // Case 3: Empty object or unrecognized structure
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItem,
    };
  } catch (err) {
    console.warn('[RaindropSync] Failed to parse remote data.json, using local state:', err);
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItem,
    };
  }
}

/**
 * Core multi-device sync function:
 * 1. Finds/creates root "Arcable" collection in Raindrop.
 * 2. Fetches remote "data.json" sync file (or initializes if missing/legacy).
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

    // 2. Fetch remote sync file & existing item
    const { syncFile: remoteSyncFile, existingItem } = await fetchRaindropSyncFile(
      clean,
      collection._id,
      localState,
      deviceId
    );

    // 3. Read local pending operations
    const pendingOps = getStoredPendingOperations();

    // 4. Compact sync file & compute latest snapshot
    const compacted = compactSyncFile(
      remoteSyncFile,
      deviceId,
      pendingOps,
      deviceName,
      Date.now()
    );

    // 5. Delete existing data.json item if present
    if (existingItem && existingItem._id) {
      try {
        await deleteRaindropBookmark(clean, existingItem._id);
      } catch (delErr) {
        console.warn('[RaindropSync] Warning: Failed to delete previous data.json item:', delErr);
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

    // 7. Clear pending operations now that they are persisted in the cloud log
    clearStoredPendingOperations();

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
