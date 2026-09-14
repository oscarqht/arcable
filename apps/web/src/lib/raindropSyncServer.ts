import {
  ArcableWorkspaceData,
  ArcableSyncFile,
  WorkspaceOperation,
  WorkspaceSyncRequest,
  WorkspaceSyncResponse,
  DeviceSyncRecord,
  RaindropBookmarkItem,
} from '@arcable/shared/types';
import {
  cleanRaindropToken,
  getOrCreateArcableCollection,
  fetchRaindropSyncFile,
  uploadRaindropFile,
  deleteRaindropBookmark,
  compactSyncFile,
  recomputeSyncFileOnDeviceRemoval,
  recomputeSyncFileOnDeleteOtherDevices,
  replayOperations,
  DATA_JSON_FILE_NAME,
} from '@arcable/shared/utils';
import {
  ACCESS_TOKEN_COOKIE,
  getRaindropTokenFromEnv,
} from './raindrop';

// CORS Headers for Extension and Web App
export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// In-memory read cache to prevent Raindrop rate limits on rapid polling
interface UserSyncCache {
  syncFile: ArcableSyncFile;
  collectionId: number;
  existingItems: RaindropBookmarkItem[];
  cachedAt: number;
}

const syncCache = new Map<string, UserSyncCache>();
const CACHE_TTL_MS = 5000; // 5 seconds read-cache TTL

/**
 * Extracts Bearer token from incoming request headers, cookies, or environment fallback.
 */
export async function authenticateRaindropUserFromRequest(request: Request): Promise<{
  token: string | null;
  error?: string;
}> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  let token: string | undefined;

  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  // Fallback to cookie if present
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ACCESS_TOKEN_COOKIE}=([^;]+)`));
    if (match) {
      token = decodeURIComponent(match[1].trim());
    }
  }

  // Fallback to environment variable
  if (!token) {
    token = getRaindropTokenFromEnv();
  }

  const clean = token ? cleanRaindropToken(token) : '';
  if (!clean) {
    return { token: null, error: 'Unauthorized: Missing or invalid Raindrop access token.' };
  }

  return { token: clean };
}

/**
 * Loads the current ArcableSyncFile from Raindrop or fresh in-memory cache.
 */
export async function loadSyncFile(
  token: string,
  deviceId: string = 'server',
  localFallback?: ArcableWorkspaceData,
  bypassCache: boolean = false
): Promise<{
  syncFile: ArcableSyncFile;
  collectionId: number;
  existingItems: RaindropBookmarkItem[];
}> {
  const now = Date.now();
  const cached = syncCache.get(token);

  if (!bypassCache && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return {
      syncFile: cached.syncFile,
      collectionId: cached.collectionId,
      existingItems: cached.existingItems,
    };
  }

  const collection = await getOrCreateArcableCollection(token);
  if (!collection || !collection._id) {
    throw new Error('Failed to access root "Arcable" collection in Raindrop.');
  }

  const defaultFallback: ArcableWorkspaceData = localFallback || {
    spaces: [
      {
        id: 'space_personal',
        name: 'Personal',
        emojiIcon: '🌟',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    folders: [],
    tabs: [],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
    activeSpaceId: 'space_personal',
    version: 1,
  };

  const { syncFile, existingItems } = await fetchRaindropSyncFile(
    token,
    collection._id,
    defaultFallback,
    deviceId
  );

  syncCache.set(token, {
    syncFile,
    collectionId: collection._id,
    existingItems,
    cachedAt: now,
  });

  return {
    syncFile,
    collectionId: collection._id,
    existingItems,
  };
}

/**
 * Persists an updated ArcableSyncFile to Raindrop.
 */
export async function persistSyncFileToRaindrop(
  token: string,
  collectionId: number,
  syncFile: ArcableSyncFile,
  previousItems: RaindropBookmarkItem[]
): Promise<RaindropBookmarkItem[]> {
  const payload = JSON.stringify(syncFile);
  const newItem = await uploadRaindropFile(token, collectionId, DATA_JSON_FILE_NAME, payload);

  // Clean up previous data file items
  for (const item of previousItems) {
    if (item._id && item._id !== newItem._id) {
      try {
        await deleteRaindropBookmark(token, item._id);
      } catch (delErr) {
        console.warn('[RaindropSyncServer] Warning: Failed to prune previous sync item:', delErr);
      }
    }
  }

  const newItems = [newItem];
  syncCache.set(token, {
    syncFile,
    collectionId,
    existingItems: newItems,
    cachedAt: Date.now(),
  });

  return newItems;
}

/**
 * Core reconcile function called by POST /api/sync/operations.
 */
export async function reconcileAndPersistWorkspace(
  token: string,
  body: WorkspaceSyncRequest
): Promise<WorkspaceSyncResponse> {
  const {
    baseVersion = 0,
    deviceId = 'unknown_device',
    deviceName,
    operations = [],
    initialState,
  } = body;

  const hasOperations = operations.length > 0;
  // If pushing operations, bypass cache to ensure we reconcile against remote source of truth
  const { syncFile: currentSyncFile, collectionId, existingItems } = await loadSyncFile(
    token,
    deviceId,
    initialState,
    hasOperations
  );

  const currentServerVersion = currentSyncFile.version || 1;
  const currentOperations = currentSyncFile.operations || [];

  // Determine diffs if baseVersion is behind
  let diffs: WorkspaceOperation[] | undefined = undefined;
  let clientNeedsFullState = false;

  if (baseVersion > 0 && baseVersion < currentServerVersion) {
    const versionGap = currentServerVersion - baseVersion;
    // Check if operations log covers this gap
    if (versionGap <= currentOperations.length && versionGap <= 100) {
      // Return operations that happened since baseVersion
      diffs = currentOperations.slice(currentOperations.length - versionGap);
    } else {
      clientNeedsFullState = true;
    }
  } else if (baseVersion === 0) {
    clientNeedsFullState = true;
  }

  // Case 1: Read-only check / poll (no new operations to push)
  if (!hasOperations) {
    // Update device's lastSyncAt in cache
    const devices = { ...(currentSyncFile.devices || {}) };
    devices[deviceId] = {
      deviceId,
      deviceName: deviceName || devices[deviceId]?.deviceName || 'Device',
      lastSyncAt: Date.now(),
    };
    currentSyncFile.devices = devices;

    const latestSnapshot = replayOperations(
      currentSyncFile.baselineSnapshot,
      currentSyncFile.operations || []
    );

    return {
      success: true,
      serverVersion: currentServerVersion,
      diffs: diffs || [],
      fullState: clientNeedsFullState ? latestSnapshot : undefined,
    };
  }

  // Case 2: Client pushed 1 or more operations
  const { syncFile: updatedSyncFile, latestSnapshot } = compactSyncFile(
    currentSyncFile,
    deviceId,
    operations,
    deviceName,
    Date.now(),
    initialState?.tmpTabs
  );

  // Set new server version
  const newServerVersion = currentServerVersion + operations.length;
  updatedSyncFile.version = newServerVersion;
  latestSnapshot.version = newServerVersion;

  // Persist updated sync file to Raindrop
  await persistSyncFileToRaindrop(token, collectionId, updatedSyncFile, existingItems);

  return {
    success: true,
    serverVersion: newServerVersion,
    diffs: clientNeedsFullState ? undefined : diffs || [],
    fullState: clientNeedsFullState ? latestSnapshot : undefined,
  };
}

/**
 * Gets consolidated workspace state for GET /api/sync/state.
 */
export async function getWorkspaceState(
  token: string,
  deviceId?: string,
  deviceName?: string
): Promise<{ success: boolean; version?: number; state?: ArcableWorkspaceData; error?: string }> {
  try {
    const { syncFile } = await loadSyncFile(token, deviceId || 'server');
    const latestSnapshot = replayOperations(
      syncFile.baselineSnapshot,
      syncFile.operations || []
    );

    if (deviceId) {
      syncFile.devices = syncFile.devices || {};
      syncFile.devices[deviceId] = {
        deviceId,
        deviceName: deviceName || syncFile.devices[deviceId]?.deviceName || 'Device',
        lastSyncAt: Date.now(),
      };
    }

    return {
      success: true,
      version: syncFile.version || 1,
      state: latestSnapshot,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to get workspace state',
    };
  }
}

/**
 * Gets registered devices for GET /api/sync/devices.
 */
export async function getWorkspaceDevices(
  token: string,
  deviceId?: string,
  deviceName?: string
): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  try {
    const { syncFile, collectionId, existingItems } = await loadSyncFile(token, deviceId || 'server');
    const devices = { ...(syncFile.devices || {}) };

    if (deviceId) {
      devices[deviceId] = {
        deviceId,
        deviceName: deviceName || devices[deviceId]?.deviceName || 'Device',
        lastSyncAt: Date.now(),
      };
      syncFile.devices = devices;
    }

    return {
      success: true,
      devices: Object.values(devices),
    };
  } catch (err: any) {
    return {
      success: false,
      devices: [],
      error: err?.message || 'Failed to fetch devices',
    };
  }
}

/**
 * Renames a device for PATCH /api/sync/devices.
 */
export async function renameWorkspaceDevice(
  token: string,
  deviceId: string,
  newName: string
): Promise<{ success: boolean; devices?: DeviceSyncRecord[]; error?: string }> {
  try {
    const { syncFile, collectionId, existingItems } = await loadSyncFile(token, deviceId, undefined, true);
    const devices = { ...(syncFile.devices || {}) };

    if (!devices[deviceId]) {
      devices[deviceId] = {
        deviceId,
        deviceName: newName,
        lastSyncAt: Date.now(),
      };
    } else {
      devices[deviceId] = {
        ...devices[deviceId],
        deviceName: newName,
      };
    }

    syncFile.devices = devices;
    await persistSyncFileToRaindrop(token, collectionId, syncFile, existingItems);

    return {
      success: true,
      devices: Object.values(devices),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to rename device',
    };
  }
}

/**
 * Deletes a device or all other devices for DELETE /api/sync/devices.
 */
export async function deleteWorkspaceDevice(
  token: string,
  options: {
    deviceId?: string;
    allOther?: boolean;
    keepDeviceId?: string;
  }
): Promise<{ success: boolean; devices?: DeviceSyncRecord[]; error?: string }> {
  try {
    const { syncFile, collectionId, existingItems } = await loadSyncFile(
      token,
      options.keepDeviceId || options.deviceId || 'server',
      undefined,
      true
    );

    let updatedSyncFile: ArcableSyncFile;
    if (options.allOther && options.keepDeviceId) {
      const result = recomputeSyncFileOnDeleteOtherDevices(syncFile, options.keepDeviceId);
      updatedSyncFile = result.syncFile;
    } else if (options.deviceId) {
      const result = recomputeSyncFileOnDeviceRemoval(syncFile, options.deviceId);
      updatedSyncFile = result.syncFile;
    } else {
      return { success: false, error: 'deviceId or keepDeviceId required' };
    }

    await persistSyncFileToRaindrop(token, collectionId, updatedSyncFile, existingItems);

    return {
      success: true,
      devices: Object.values(updatedSyncFile.devices || {}),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to delete device',
    };
  }
}
