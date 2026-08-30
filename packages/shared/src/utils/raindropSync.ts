import { ArcableWorkspaceData } from '../types/workspace';
import { ArcableSyncFile, SyncResult, WorkspaceOperation, DeviceSyncRecord } from '../types/sync';
import { RaindropCollectionItem, RaindropBookmarkItem } from '../types/raindrop';
import {
  fetchRaindropCollections,
  createRaindropCollection,
  fetchRaindropItems,
  fetchRaindropItem,
  deleteRaindropBookmark,
  uploadRaindropFile,
  fetchRaindropFileContent,
  cleanRaindropToken,
  RAINDROP_API_BASE,
} from './raindropClient';
import {
  getOrCreateDeviceId,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  compactSyncFile,
  createInitialSyncFile,
  isPlaceholderSnapshot,
  recomputeSyncFileOnDeviceRemoval,
  recomputeSyncFileOnDeleteOtherDevices,
  setStoredDeviceName,
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
    title.includes('data.json') ||
    title.includes('data.txt') ||
    fileName.includes('data.json') ||
    fileName.includes('data.txt') ||
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
 * Finds all existing "data.json" / "data.json.txt" raindrop items under the specified collection,
 * sorted so that the most recently updated item is always first.
 * Never relies on cached IDs, always queries Raindrop live.
 */
export async function findAllRaindropDataJsonItems(
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
      if (isDataJsonItem(item) && !items.some((x) => x._id === item._id)) {
        items.push(item);
      }
    }
  } catch (err) {
    console.warn('[RaindropSync] Search for data file failed, falling back to full list:', err);
  }

  // 2. Fallback: list items in the collection with newest first
  try {
    const listRes = await fetchRaindropItems(token, collectionId, {
      perpage: 50,
      sort: '-lastUpdate',
    });
    for (const item of listRes.items) {
      if (isDataJsonItem(item) && !items.some((x) => x._id === item._id)) {
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
 * Searches for the latest "data.json" / "data.json.txt" raindrop item under the specified collection.
 */
export async function findRaindropDataJsonItem(
  token: string,
  collectionId: number
): Promise<RaindropBookmarkItem | null> {
  const all = await findAllRaindropDataJsonItems(token, collectionId);
  return all.length > 0 ? all[0] : null;
}

/**
 * Fetches and parses the ArcableSyncFile from Raindrop file content.
 * If data.json does not exist, bootstraps a valid ArcableSyncFile from local state.
 * If data.json exists but cannot be downloaded/parsed, aborts with an error to prevent overwriting remote data.
 */
export async function fetchRaindropSyncFile(
  token: string,
  collectionId: number,
  localFallback: ArcableWorkspaceData,
  deviceId: string
): Promise<{ syncFile: ArcableSyncFile; existingItems: RaindropBookmarkItem[] }> {
  const existingItems = await findAllRaindropDataJsonItems(token, collectionId);

  // If no data item exists in Raindrop, bootstrap initial sync file from local state
  if (existingItems.length === 0) {
    return {
      syncFile: createInitialSyncFile(localFallback, deviceId),
      existingItems: [],
    };
  }

  // Use the most recently updated data item
  const latestItem = existingItems[0];

  // Gather candidate URLs for downloading the attached data file
  const urlCandidates: string[] = [];

  // Candidate 1: Query single item detail (GET /raindrop/{id}) which contains exact file.path
  if (latestItem._id) {
    try {
      const fullItem = await fetchRaindropItem(token, latestItem._id);
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

  if (latestItem.file?.path && !urlCandidates.includes(latestItem.file.path)) {
    urlCandidates.push(latestItem.file.path);
  }
  if (latestItem.link && !urlCandidates.includes(latestItem.link)) {
    urlCandidates.push(latestItem.link);
  }
  if (latestItem._id) {
    urlCandidates.push(`${RAINDROP_API_BASE}/raindrop/${latestItem._id}/file`);
    urlCandidates.push(`${RAINDROP_API_BASE}/file/${latestItem._id}`);
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

  // CRITICAL SAFETY PROTECTION:
  // An existing sync file was found in Raindrop. If download failed, DO NOT silently wipe remote data with localFallback!
  if (!rawContent || !rawContent.trim()) {
    throw new Error(
      `Found existing workspace sync file in Raindrop (Item ID ${latestItem._id}), but failed to download its content. Aborting sync to prevent overwriting remote changes.`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch (parseErr) {
    throw new Error(
      `Found existing workspace sync file in Raindrop (Item ID ${latestItem._id}), but content is not valid JSON. Aborting sync to prevent data loss.`
    );
  }

  // Case 1: Standard ArcableSyncFile format
  if (parsed && parsed.baselineSnapshot && Array.isArray(parsed.operations)) {
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
    return {
      syncFile: createInitialSyncFile(parsed as ArcableWorkspaceData, deviceId),
      existingItems,
    };
  }

  throw new Error(
    `Remote sync file structure in Raindrop is unrecognized. Aborting sync to prevent data loss.`
  );
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

    // 3. Check if this device is recognized in remote syncFile.
    // If remote syncFile exists with registered devices, but this deviceId is NOT among them,
    // this device was previously deleted (or is a reconnecting device).
    // Discard all local pending records and recreate latest state directly from remote baselineSnapshot + operations.
    const hasExistingDevices = remoteSyncFile.devices && Object.keys(remoteSyncFile.devices).length > 0;
    const isDeletedOrReconnectingDevice = hasExistingDevices && !remoteSyncFile.devices[deviceId];

    let pendingOps = options?.pendingOps !== undefined
      ? options.pendingOps
      : getStoredPendingOperations();

    if (isDeletedOrReconnectingDevice) {
      pendingOps = [];
      if (typeof window !== 'undefined') {
        clearStoredPendingOperations();
      }
    }

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

/**
 * Fetches all registered devices from the Raindrop data.json sync file.
 */
export async function fetchRaindropDevices(
  token: string,
  currentDeviceId?: string
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, devices: [], error: 'Raindrop authorization token is missing or invalid.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection.');
    }

    const currId = currentDeviceId || (typeof window !== 'undefined' ? getOrCreateDeviceId() : 'device_curr');
    const { syncFile } = await fetchRaindropSyncFile(
      clean,
      collection._id,
      { activeSpaceId: 'space_personal', version: 1, spaces: [], folders: [], tabs: [] },
      currId
    );

    const devicesMap = syncFile.devices || {};
    const deviceList = Object.values(devicesMap);

    // Sort: current device first (if any), then newest lastSyncAt first
    deviceList.sort((a, b) => {
      if (currId && a.deviceId === currId) return -1;
      if (currId && b.deviceId === currId) return 1;
      return (b.lastSyncAt || 0) - (a.lastSyncAt || 0);
    });

    return { success: true, devices: deviceList };
  } catch (err: any) {
    console.error('[RaindropSync] Error fetching devices:', err);
    return { success: false, devices: [], error: err?.message || 'Failed to fetch devices from Raindrop.' };
  }
}

/**
 * Renames a device in the Raindrop data.json sync file.
 */
export async function renameRaindropDevice(
  token: string,
  deviceId: string,
  newDeviceName: string,
  localFallback?: ArcableWorkspaceData
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, devices: [], error: 'Raindrop authorization token is missing or invalid.' };
  }

  const trimmedName = (newDeviceName || '').trim();
  if (!trimmedName) {
    return { success: false, devices: [], error: 'Device name cannot be empty.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection.');
    }

    const localState: ArcableWorkspaceData = localFallback || {
      activeSpaceId: 'space_personal',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    };

    const { syncFile, existingItems } = await fetchRaindropSyncFile(
      clean,
      collection._id,
      localState,
      deviceId
    );

    const devices = { ...(syncFile.devices || {}) };
    if (devices[deviceId]) {
      devices[deviceId] = {
        ...devices[deviceId],
        deviceName: trimmedName,
      };
    } else {
      devices[deviceId] = {
        deviceId,
        deviceName: trimmedName,
        lastSyncAt: Date.now(),
      };
    }

    const updatedSyncFile: ArcableSyncFile = {
      ...syncFile,
      version: (syncFile.version || 1) + 1,
      devices,
    };

    // Delete existing data.json bookmarks
    for (const item of existingItems) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning deleting previous data.json:', delErr);
        }
      }
    }

    // Upload updated syncFile
    const fileContent = JSON.stringify(updatedSyncFile, null, 2);
    await uploadRaindropFile(clean, collection._id, DATA_JSON_FILE_NAME, fileContent);

    // If this is the current device, update local storage
    if (typeof window !== 'undefined' && deviceId === getOrCreateDeviceId()) {
      setStoredDeviceName(trimmedName);
    }

    const deviceList = Object.values(updatedSyncFile.devices);
    return { success: true, devices: deviceList };
  } catch (err: any) {
    console.error('[RaindropSync] Error renaming device:', err);
    return { success: false, devices: [], error: err?.message || 'Failed to rename device.' };
  }
}

/**
 * Deletes a device from the Raindrop data.json sync file and re-compacts
 * baselineSnapshot + operations based on the remaining devices list.
 */
export async function deleteRaindropDevice(
  token: string,
  deviceId: string,
  localFallback?: ArcableWorkspaceData
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; latestSnapshot?: ArcableWorkspaceData; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, devices: [], error: 'Raindrop authorization token is missing or invalid.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection.');
    }

    const localState: ArcableWorkspaceData = localFallback || {
      activeSpaceId: 'space_personal',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    };

    const { syncFile, existingItems } = await fetchRaindropSyncFile(
      clean,
      collection._id,
      localState,
      deviceId
    );

    // Recompute sync file and re-compact baselineSnapshot + operations based on updated devices list
    const { syncFile: updatedSyncFile, latestSnapshot } = recomputeSyncFileOnDeviceRemoval(
      syncFile,
      deviceId,
      Date.now()
    );

    // Delete existing data.json bookmarks
    for (const item of existingItems) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning deleting previous data.json:', delErr);
        }
      }
    }

    // Upload updated syncFile
    const fileContent = JSON.stringify(updatedSyncFile, null, 2);
    await uploadRaindropFile(clean, collection._id, DATA_JSON_FILE_NAME, fileContent);

    const deviceList = Object.values(updatedSyncFile.devices);
    return { success: true, devices: deviceList, latestSnapshot };
  } catch (err: any) {
    console.error('[RaindropSync] Error deleting device:', err);
    return { success: false, devices: [], error: err?.message || 'Failed to delete device.' };
  }
}

/**
 * Deletes all registered devices from the Raindrop data.json sync file except `keepDeviceId`,
 * and re-compacts baselineSnapshot + operations.
 */
export async function deleteAllOtherRaindropDevices(
  token: string,
  keepDeviceId: string,
  localFallback?: ArcableWorkspaceData
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; latestSnapshot?: ArcableWorkspaceData; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) {
    return { success: false, devices: [], error: 'Raindrop authorization token is missing or invalid.' };
  }

  try {
    const collection = await getOrCreateArcableCollection(clean);
    if (!collection || !collection._id) {
      throw new Error('Failed to find or create root "Arcable" collection.');
    }

    const localState: ArcableWorkspaceData = localFallback || {
      activeSpaceId: 'space_personal',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    };

    const { syncFile, existingItems } = await fetchRaindropSyncFile(
      clean,
      collection._id,
      localState,
      keepDeviceId
    );

    // Recompute sync file and re-compact baselineSnapshot + operations retaining only keepDeviceId
    const { syncFile: updatedSyncFile, latestSnapshot } = recomputeSyncFileOnDeleteOtherDevices(
      syncFile,
      keepDeviceId,
      Date.now()
    );

    // Delete existing data.json bookmarks
    for (const item of existingItems) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning deleting previous data.json:', delErr);
        }
      }
    }

    // Upload updated syncFile
    const fileContent = JSON.stringify(updatedSyncFile, null, 2);
    await uploadRaindropFile(clean, collection._id, DATA_JSON_FILE_NAME, fileContent);

    const deviceList = Object.values(updatedSyncFile.devices);
    return { success: true, devices: deviceList, latestSnapshot };
  } catch (err: any) {
    console.error('[RaindropSync] Error deleting other devices:', err);
    return { success: false, devices: [], error: err?.message || 'Failed to delete other devices.' };
  }
}

