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

    // 3. Load local pending operations (including offline edits) to push and reconcile
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
    const deviceList = sortDevicesByLastSync(Object.values(devicesMap));

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

    const deviceList = sortDevicesByLastSync(Object.values(updatedSyncFile.devices));
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

    const deviceList = sortDevicesByLastSync(Object.values(updatedSyncFile.devices));
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

    const deviceList = sortDevicesByLastSync(Object.values(updatedSyncFile.devices));
    return { success: true, devices: deviceList, latestSnapshot };
  } catch (err: any) {
    console.error('[RaindropSync] Error deleting other devices:', err);
    return { success: false, devices: [], error: err?.message || 'Failed to delete other devices.' };
  }
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

    // 4. Override remote data.json.txt in "Arcable" root collection
    // Find and delete existing data.json.txt items
    const existingDataItems = await findAllRaindropDataJsonItems(clean, collection._id);
    for (const item of existingDataItems) {
      if (item._id) {
        try {
          await deleteRaindropBookmark(clean, item._id);
        } catch (delErr) {
          console.warn('[RaindropSync] Warning deleting previous data.json during restore:', delErr);
        }
      }
    }

    // Construct fresh initial sync file from restored snapshot
    const initialSyncFile = createInitialSyncFile(snapshot, deviceId);
    initialSyncFile.devices[deviceId] = {
      deviceId,
      deviceName,
      lastSyncAt: Date.now(),
    };

    const newFileContent = JSON.stringify(initialSyncFile, null, 2);
    await uploadRaindropFile(clean, collection._id, DATA_JSON_FILE_NAME, newFileContent);

    return {
      success: true,
      restoredSnapshot: snapshot,
    };
  } catch (err: any) {
    console.error('[RaindropSync] Error restoring backup:', err);
    return { success: false, error: err?.message || 'Failed to restore backup from Raindrop.' };
  }
}

