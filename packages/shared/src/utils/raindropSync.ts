import { ArcableWorkspaceData, Folder, Space, Tab } from '../types/workspace';
import { ArcableSyncFile, SyncResult, WorkspaceOperation, DeviceSyncRecord } from '../types/sync';
import { RaindropCollectionItem, RaindropBookmarkItem, RaindropBackupRecord, RaindropRequestFailureDetails } from '../types/raindrop';
import {
  fetchRaindropCollections,
  createRaindropCollection,
  createRaindropBookmarks,
  fetchRaindropItems,
  fetchRaindropItem,
  deleteRaindropBookmark,
  deleteRaindropBookmarks,
  deleteRaindropCollection,
  uploadRaindropFile,
  fetchRaindropFileContent,
  updateRaindropItem,
  updateRaindropCollection,
  fetchAllRaindropItems,
  searchRaindropCollectionCover,
  cleanRaindropToken,
  getRaindropRequestFailureDetails,
  RAINDROP_API_BASE,
} from './raindropClient';
import { ARCABLE_VERSION } from '../version';
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
  mergeIncrementalSyncSnapshot,
} from './syncEngine';

export const ARCABLE_COLLECTION_NAME = 'Arcable';
/** Canonical non-tree workspace metadata stored directly under the Arcable root. */
export const ARCABLE_DATA_FILE_NAME = 'data.json.txt';

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

interface ArcableMetadata {
  version: string;
  widgets?: ArcableWorkspaceData['widgets'];
  customCodeRules?: ArcableWorkspaceData['customCodeRules'];
  runCodeInPageRules?: ArcableWorkspaceData['runCodeInPageRules'];
}

interface RemoteArcableTree {
  root?: RaindropCollectionItem;
  collections: RaindropCollectionItem[];
  items: RaindropBookmarkItem[];
  metadata: ArcableMetadata;
  metadataItemId?: number;
}

const ARCABLE_NOTE_MARKER = 'arcable-bookmark-v1';

function numericRaindropId(id: string | undefined): number | undefined {
  if (!id || !/^\d+$/.test(id)) return undefined;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function timestamp(value?: string | number): number {
  if (typeof value === 'number') return value;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function emojiFromCover(cover?: string[]): string | undefined {
  const url = cover?.[0];
  const match = url?.match(/\/72x72\/([0-9a-f-]+)\.png(?:$|[?#])/i);
  if (!match) return undefined;
  try {
    return match[1].split('-').map((part) => String.fromCodePoint(parseInt(part, 16))).join('');
  } catch {
    return undefined;
  }
}

function parseBookmarkNote(note?: string): Record<string, any> {
  if (!note) return {};
  try {
    const parsed = JSON.parse(note);
    return parsed?.schema === ARCABLE_NOTE_MARKER ? parsed : {};
  } catch {
    return {};
  }
}

function bookmarkNote(tab: Tab): string {
  return JSON.stringify({
    schema: ARCABLE_NOTE_MARKER,
    arcableId: tab.id,
    urlVariants: tab.urlVariants,
    defaultVariantId: tab.defaultVariantId,
    pinned: Boolean(tab.pinned),
    favourite: Boolean(tab.favourite),
    customTitle: tab.customTitle,
    customEmojiIcon: tab.customEmojiIcon,
    order: tab.order,
    createdAt: tab.createdAt,
    updatedAt: tab.updatedAt,
  });
}

const INCREMENTAL_OPERATION_TYPES = new Set([
  'FOLDER_CREATE',
  'FOLDER_UPDATE',
  'FOLDER_DELETE',
  'TAB_CREATE',
  'TAB_UPDATE',
  'TAB_DELETE',
  'WIDGET_CREATE',
  'WIDGET_UPDATE',
  'WIDGET_DELETE',
  'CUSTOM_CODE_CREATE',
  'CUSTOM_CODE_UPDATE',
  'CUSTOM_CODE_DELETE',
  'RUN_CODE_CREATE',
  'RUN_CODE_UPDATE',
  'RUN_CODE_DELETE',
]);

function metadataFromWorkspace(workspace: ArcableWorkspaceData): ArcableMetadata {
  return {
    version: ARCABLE_VERSION,
    widgets: workspace.widgets || [],
    customCodeRules: workspace.customCodeRules || [],
    runCodeInPageRules: workspace.runCodeInPageRules || [],
  };
}

/**
 * Incremental writes require every affected parent to already have a Raindrop
 * identity, or to be created earlier in this same operation batch. Check that
 * invariant before issuing any request so recovery cannot leave partial writes.
 */
function needsIncrementalIdentityRebase(
  localState: ArcableWorkspaceData | undefined,
  pendingOps: WorkspaceOperation[] | undefined,
  replaceBaseline: boolean | undefined
): boolean {
  if (
    !localState ||
    !pendingOps?.length ||
    replaceBaseline ||
    pendingOps.some((operation) => !INCREMENTAL_OPERATION_TYPES.has(operation.type))
  ) return false;

  const collectionIds = new Set<string>();
  for (const collection of [...localState.spaces, ...localState.folders]) {
    if (remoteEntityId(collection)) collectionIds.add(collection.id);
  }

  const folderGroups = new Map<string, WorkspaceOperation[]>();
  for (const operation of pendingOps) {
    if (!operation.type.startsWith('FOLDER_') || operation.type === 'FOLDER_DELETE') continue;
    const operations = folderGroups.get(operation.entityId) || [];
    operations.push(operation);
    folderGroups.set(operation.entityId, operations);
  }

  const unresolvedFolders = new Map(folderGroups);
  while (unresolvedFolders.size > 0) {
    let progressed = false;
    for (const [folderId, operations] of unresolvedFolders) {
      const folder = localState.folders.find((candidate) => candidate.id === folderId);
      if (!folder || !collectionIds.has(folder.parentFolderId || folder.parentSpaceId)) continue;
      if (!operations.some((operation) => operation.type === 'FOLDER_CREATE') && !remoteEntityId(folder)) {
        return true;
      }
      collectionIds.add(folderId);
      unresolvedFolders.delete(folderId);
      progressed = true;
    }
    if (!progressed) return true;
  }

  for (const operation of pendingOps) {
    if (!operation.type.startsWith('TAB_') || operation.type === 'TAB_DELETE') continue;
    const tab = localState.tabs.find((candidate) => candidate.id === operation.entityId);
    if (!tab) return true;
    if (tab.favourite) {
      if (!localState.raindropRootCollectionId) return true;
    } else if (!collectionIds.has(tab.parentFolderId || tab.parentSpaceId || '')) {
      return true;
    }
  }

  return false;
}

/** Applies folder/bookmark CRUD directly without reading or rebuilding the remote tree. */
export async function syncIncrementalOperations(
  token: string,
  localState: ArcableWorkspaceData | undefined,
  pendingOps: WorkspaceOperation[] | undefined,
  replaceBaseline: boolean | undefined
): Promise<SyncResult | null> {
  if (
    !localState ||
    !pendingOps?.length ||
    replaceBaseline ||
    pendingOps.some((operation) => !INCREMENTAL_OPERATION_TYPES.has(operation.type))
  ) return null;

  const hasMetadataChanges = pendingOps.some((operation) =>
    operation.type.startsWith('WIDGET_') ||
    operation.type.startsWith('CUSTOM_CODE_') ||
    operation.type.startsWith('RUN_CODE_')
  );
  if (
    hasMetadataChanges &&
    (!localState.raindropRootCollectionId || localState.raindropMetadataItemId === undefined)
  ) return null;

  const groups = new Map<string, WorkspaceOperation[]>();
  for (const operation of pendingOps) {
    const kind = operation.type.startsWith('FOLDER_')
      ? 'folder'
      : operation.type.startsWith('WIDGET_')
        ? 'widget'
        : operation.type.startsWith('CUSTOM_CODE_') || operation.type.startsWith('RUN_CODE_')
          ? 'metadata'
        : 'tab';
    const key = `${kind}:${operation.entityId}`;
    const entityOps = groups.get(key) || [];
    entityOps.push(operation);
    groups.set(key, entityOps);
  }

  let latestSnapshot: ArcableWorkspaceData = {
    ...localState,
    folders: [...localState.folders],
    tabs: [...localState.tabs],
  };
  const collectionIds = new Map<string, number>();
  for (const collection of [...localState.spaces, ...localState.folders]) {
    const remoteId = remoteEntityId(collection);
    if (remoteId) collectionIds.set(collection.id, remoteId);
  }

  const folderUpserts = [...groups.entries()].filter(([key, operations]) =>
    key.startsWith('folder:') && !operations.some((operation) => operation.type === 'FOLDER_DELETE')
  );
  const unresolvedFolderUpserts = new Map(folderUpserts);
  while (unresolvedFolderUpserts.size > 0) {
    let progressed = false;
    for (const [key, operations] of unresolvedFolderUpserts) {
      const entityId = operations[0].entityId;
      const folder = latestSnapshot.folders.find((candidate) => candidate.id === entityId);
      if (!folder) throw new Error(`Cannot incrementally sync missing folder ${entityId}.`);
      const parentLocalId = folder.parentFolderId || folder.parentSpaceId;
      const parentId = collectionIds.get(parentLocalId);
      if (!parentId) continue;

      const isCreate = operations.some((operation) => operation.type === 'FOLDER_CREATE');
      if (isCreate) {
        const created = await createRaindropCollection(token, folder.name, parentId, {
          color: folder.colors,
          cover: folder.coverUrl ? [folder.coverUrl] : undefined,
          sort: folder.order,
        });
        collectionIds.set(entityId, created._id);
        latestSnapshot = {
          ...latestSnapshot,
          folders: latestSnapshot.folders.map((candidate) =>
            candidate.id === entityId ? { ...candidate, raindropId: created._id } : candidate
          ),
        };
      } else {
        const remoteId = remoteEntityId(folder);
        if (!remoteId) throw new Error(`Folder ${entityId} has no Raindrop ID for incremental update.`);
        const updated = await updateRaindropCollection(token, remoteId, {
          title: folder.name,
          parentId,
          color: folder.colors ?? null,
          cover: folder.coverUrl ? [folder.coverUrl] : [],
          sort: folder.order,
        });
        if (!updated) throw new Error(`Failed to update Raindrop folder ${remoteId}.`);
      }

      unresolvedFolderUpserts.delete(key);
      progressed = true;
    }
    if (!progressed) {
      throw new Error('Cannot resolve a Raindrop parent ID for an incremental folder update.');
    }
  }

  const tabCreates: Array<{
    entityId: string;
    input: Parameters<typeof createRaindropBookmarks>[1][number];
  }> = [];
  for (const [key, operations] of groups) {
    if (!key.startsWith('tab:') || operations.some((operation) => operation.type === 'TAB_DELETE')) continue;
    const entityId = operations[0].entityId;
    const tab = latestSnapshot.tabs.find((candidate) => candidate.id === entityId);
    if (!tab) throw new Error(`Cannot incrementally sync missing bookmark ${entityId}.`);
    const parentId = tab.favourite
      ? latestSnapshot.raindropRootCollectionId
      : collectionIds.get(tab.parentFolderId || tab.parentSpaceId || '');
    if (!parentId) throw new Error(`Bookmark ${entityId} has no synced Raindrop parent.`);

    const isCreate = operations.some((operation) => operation.type === 'TAB_CREATE');
    const payload = {
      title: tab.customTitle || tab.url,
      link: tab.url,
      cover: tab.favIconUrl,
      note: bookmarkNote(tab),
      collection: { $id: parentId },
      order: tab.order,
    };
    if (isCreate) {
      tabCreates.push({ entityId, input: {
        title: payload.title,
        link: payload.link,
        cover: payload.cover,
        note: payload.note,
        collectionId: parentId,
        order: payload.order,
        pleaseParse: { disabled: true },
      } });
    } else {
      const remoteId = remoteEntityId(tab);
      if (!remoteId) throw new Error(`Bookmark ${entityId} has no Raindrop ID for incremental update.`);
      const updated = await updateRaindropItem(token, remoteId, payload);
      if (!updated) throw new Error(`Failed to update Raindrop bookmark ${remoteId}.`);
    }
  }
  for (let start = 0; start < tabCreates.length; start += 100) {
    const batch = tabCreates.slice(start, start + 100);
    const createdItems = await createRaindropBookmarks(token, batch.map(({ input }) => input));
    if (createdItems.length !== batch.length) {
      throw new Error(`Raindrop created ${createdItems.length} of ${batch.length} requested bookmarks.`);
    }
    const createdIds = new Map(batch.map((entry, index) => [entry.entityId, createdItems[index]._id]));
    latestSnapshot = {
      ...latestSnapshot,
      tabs: latestSnapshot.tabs.map((candidate) => {
        const createdId = createdIds.get(candidate.id);
        return createdId ? { ...candidate, raindropId: createdId } : candidate;
      }),
    };
  }

  const batchDeletes = new Map<number, number[]>();
  const individualDeletes: number[] = [];
  for (const [key, operations] of groups) {
    if (!key.startsWith('tab:') || !operations.some((operation) => operation.type === 'TAB_DELETE')) continue;
    if (operations.some((operation) => operation.type === 'TAB_CREATE')) continue;
    const deleteOperation = [...operations].reverse().find((operation) => operation.type === 'TAB_DELETE')!;
    const remoteId = Number(deleteOperation.payload?.raindropId) || numericRaindropId(deleteOperation.entityId);
    if (!remoteId) throw new Error(`Bookmark ${deleteOperation.entityId} has no Raindrop ID for incremental delete.`);
    const collectionId = Number(deleteOperation.payload?.collectionId);
    if (Number.isSafeInteger(collectionId) && collectionId > 0) {
      const ids = batchDeletes.get(collectionId) || [];
      ids.push(remoteId);
      batchDeletes.set(collectionId, ids);
    } else {
      individualDeletes.push(remoteId);
    }
  }
  for (const [collectionId, ids] of batchDeletes) {
    for (let start = 0; start < ids.length; start += 100) {
      const deleted = await deleteRaindropBookmarks(token, collectionId, ids.slice(start, start + 100));
      if (!deleted) throw new Error(`Failed to delete bookmarks from Raindrop collection ${collectionId}.`);
    }
  }
  for (const remoteId of individualDeletes) {
    const deleted = await deleteRaindropBookmark(token, remoteId);
    if (!deleted) throw new Error(`Failed to delete Raindrop bookmark ${remoteId}.`);
  }

  for (const [key, operations] of groups) {
    if (!key.startsWith('folder:') || !operations.some((operation) => operation.type === 'FOLDER_DELETE')) continue;
    if (operations.some((operation) => operation.type === 'FOLDER_CREATE')) continue;
    const deleteOperation = [...operations].reverse().find((operation) => operation.type === 'FOLDER_DELETE')!;
    const remoteId = Number(deleteOperation.payload?.raindropId) || numericRaindropId(deleteOperation.entityId);
    if (!remoteId) throw new Error(`Folder ${deleteOperation.entityId} has no Raindrop ID for incremental delete.`);
    const deleted = await deleteRaindropCollection(token, remoteId);
    if (!deleted) throw new Error(`Failed to delete Raindrop folder ${remoteId}.`);
  }

  if (hasMetadataChanges) {
    const rootId = latestSnapshot.raindropRootCollectionId!;
    const previousMetadataItemId = latestSnapshot.raindropMetadataItemId;
    if (previousMetadataItemId) {
      const deleted = await deleteRaindropBookmarks(token, rootId, [previousMetadataItemId]);
      if (!deleted) throw new Error('Failed to remove the previous Arcable metadata item.');
    }

    const uploaded = await uploadRaindropFile(
      token,
      rootId,
      ARCABLE_DATA_FILE_NAME,
      JSON.stringify(metadataFromWorkspace(latestSnapshot), null, 2)
    );
    const metadataItemId = Number(uploaded?.item?._id);
    if (!Number.isSafeInteger(metadataItemId) || metadataItemId <= 0) {
      throw new Error('Raindrop did not return an ID for the updated Arcable metadata item.');
    }
    latestSnapshot = { ...latestSnapshot, raindropMetadataItemId: metadataItemId };
  }

  return {
    success: true,
    collectionId: latestSnapshot.raindropRootCollectionId,
    latestSnapshot,
    syncedAt: Date.now(),
  };
}

function remoteEntityId(entity: { id: string; raindropId?: number }): number | undefined {
  return entity.raindropId || numericRaindropId(entity.id);
}

function isArcableInternalItem(item: RaindropBookmarkItem): boolean {
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const title = (item.title || '').trim().toLowerCase();
  const name = fileName || title;
  return (
    name === ARCABLE_DATA_FILE_NAME.toLowerCase() ||
    /^sync(?:-v\d+)?\.json(?:\.txt)?$/i.test(name) ||
    /^data(?:-v?\d[\w.-]*)?\.json(?:\.txt)?$/i.test(name) ||
    /^backup-/i.test(name)
  );
}

/** Snapshot files belonged to the retired operation-log sync format. */
function isLegacySnapshotItem(item: RaindropBookmarkItem): boolean {
  const fileName = (item.file?.name || '').trim().toLowerCase();
  const title = (item.title || '').trim().toLowerCase();
  const link = (item.link || '').toLowerCase();
  // The stable data.json.txt metadata file is current, not a retired snapshot.
  // Versioned data files are retired on the next explicit write.
  if (
    fileName === ARCABLE_DATA_FILE_NAME.toLowerCase() ||
    title === ARCABLE_DATA_FILE_NAME.toLowerCase() ||
    /(?:^|\/)data\.json\.txt(?:$|[?#])/.test(link)
  ) {
    return false;
  }
  const legacyName = /(?:sync(?:-v[45])?|data-(?:v)?\d[\w.-]*|data)\.json(?:\.txt)?/i;
  return [item.title, item.file?.name, item.link].some((value) => legacyName.test(value || ''));
}

/** Permanently retires pre-tree snapshots and verifies Raindrop accepted every deletion. */
async function removeLegacySnapshots(
  token: string,
  tree: RemoteArcableTree
): Promise<RemoteArcableTree> {
  const legacySnapshots = tree.items.filter(isLegacySnapshotItem);
  if (legacySnapshots.length === 0) return tree;

  const results = await Promise.all(
    legacySnapshots.map(async (item) => ({
      item,
      deleted: await deleteRaindropBookmark(token, item._id),
    }))
  );
  const failed = results.filter((result) => !result.deleted);
  if (failed.length > 0) {
    throw new Error(
      `Raindrop refused to delete retired Arcable snapshot item(s): ${failed.map(({ item }) => item._id).join(', ')}`
    );
  }

  const refreshed = await fetchRemoteArcableTree(token);
  const remaining = refreshed.items.filter(isLegacySnapshotItem);
  if (remaining.length > 0) {
    throw new Error(
      `Retired Arcable snapshot item(s) still exist after deletion: ${remaining.map((item) => item._id).join(', ')}`
    );
  }
  return refreshed;
}

async function readMetadata(token: string, rootId: number, item: RaindropBookmarkItem | undefined): Promise<ArcableMetadata> {
  if (!item) return { version: ARCABLE_VERSION };
  const full = await fetchRaindropItem(token, item._id).catch(() => null);
  // Collection listings can omit a file URL even when the metadata item exists.
  // The API item/file endpoint remains available in that case, particularly for
  // server-side web hydration where there is no browser-cached file URL.
  const contentCandidates = [
    full?.file?.path,
    item.file?.path,
    item.link,
    `${RAINDROP_API_BASE}/raindrop/${item._id}/file`,
    `${RAINDROP_API_BASE}/file/${item._id}`,
  ].filter((value, index, values): value is string =>
    Boolean(value && value.trim()) && values.indexOf(value) === index
  );
  let content = '';
  for (const url of contentCandidates) {
    content = await fetchRaindropFileContent(token, url).catch(() => '');
    if (content.trim()) break;
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? { version: ARCABLE_VERSION, ...parsed } : { version: ARCABLE_VERSION };
  } catch {
    console.warn(`[RaindropSync] Could not parse ${ARCABLE_DATA_FILE_NAME} in collection ${rootId}.`);
    return { version: ARCABLE_VERSION };
  }
}

/** Fetches the complete Arcable subtree and only the items below its root. */
async function fetchRemoteArcableTree(token: string): Promise<RemoteArcableTree> {
  // Raindrop caches identical list URLs. A reload immediately after a batch
  // write must not hydrate the extension from the pre-write cached response.
  // Reuse one unique key across every page so the read remains a coherent
  // snapshot while still bypassing both Raindrop's and the browser's caches.
  const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const allCollections = await fetchRaindropCollections(token, { cacheBust });
  const roots = allCollections.filter((collection) => !collection.parent?.$id);
  const matchingRoots = roots
    .filter((collection) => collection.title.trim().toLowerCase() === ARCABLE_COLLECTION_NAME.toLowerCase())
    .sort((a, b) => (b.count || 0) - (a.count || 0) || a._id - b._id);
  const root = matchingRoots[0];
  if (!root) return { collections: [], items: [], metadata: { version: ARCABLE_VERSION } };

  const byId = new Map(allCollections.map((collection) => [collection._id, collection]));
  const descendantIds = new Set<number>([root._id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const collection of allCollections) {
      if (collection.parent?.$id && descendantIds.has(collection.parent.$id) && !descendantIds.has(collection._id)) {
        descendantIds.add(collection._id);
        changed = true;
      }
    }
  }
  const collections = [...descendantIds]
    .filter((id) => id !== root._id)
    .map((id) => byId.get(id))
    .filter((collection): collection is RaindropCollectionItem => Boolean(collection));
  const items = await fetchAllRaindropItems(token, root._id, { nested: true, cacheBust });
  const rootItems = items.filter((item) => item.collectionId === root._id);
  const metadataItem = rootItems.find((candidate) =>
    (candidate.file?.name || candidate.title || '').trim().toLowerCase() === ARCABLE_DATA_FILE_NAME.toLowerCase()
  );
  const metadata = await readMetadata(token, root._id, metadataItem);
  return { root, collections, items, metadata, metadataItemId: metadataItem?._id };
}

function createEmptyRemoteWorkspace(): ArcableWorkspaceData {
  return {
    raindropMetadataItemId: null,
    activeSpaceId: '',
    version: 1,
    spaces: [],
    folders: [],
    tabs: [],
    tmpTabs: [],
    widgets: [],
    customCodeRules: [],
    runCodeInPageRules: [],
  };
}

function reconstructWorkspace(tree: RemoteArcableTree): ArcableWorkspaceData {
  if (!tree.root) return createEmptyRemoteWorkspace();
  const collectionById = new Map(tree.collections.map((collection) => [collection._id, collection]));
  const arcableCollectionId = (collectionId: number) => String(collectionId);
  const spaceIds = new Set(
    tree.collections.filter((collection) => collection.parent?.$id === tree.root!._id).map((collection) => collection._id)
  );
  const spaces: Space[] = tree.collections
    .filter((collection) => spaceIds.has(collection._id))
    .map((collection) => ({
      id: arcableCollectionId(collection._id),
      raindropId: collection._id,
      name: collection.title,
      emojiIcon: emojiFromCover(collection.cover),
      coverUrl: collection.cover?.[0],
      order: collection.sort,
      createdAt: timestamp(collection.created),
      updatedAt: timestamp(collection.lastUpdate),
    }));
  const folders: Folder[] = tree.collections
    .filter((collection) => !spaceIds.has(collection._id))
    .map((collection) => {
      let cursor: RaindropCollectionItem | undefined = collection;
      while (cursor?.parent?.$id && !spaceIds.has(cursor.parent.$id)) cursor = collectionById.get(cursor.parent.$id);
      const spaceId = cursor?.parent?.$id;
      return {
        id: arcableCollectionId(collection._id),
        raindropId: collection._id,
        name: collection.title,
        customEmojiIcon: emojiFromCover(collection.cover),
        coverUrl: collection.cover?.[0],
        colors: collection.color,
        parentFolderId: collection.parent?.$id && spaceIds.has(collection.parent.$id) ? undefined : arcableCollectionId(collection.parent?.$id || 0),
        parentSpaceId: spaceId ? arcableCollectionId(spaceId) : '',
        order: collection.sort,
        createdAt: timestamp(collection.created),
        updatedAt: timestamp(collection.lastUpdate),
      };
    })
    .filter((folder) => Boolean(folder.parentSpaceId));
  const tabs: Tab[] = tree.items
    .filter((item) => !isArcableInternalItem(item))
    .map((item) => {
      const extra = parseBookmarkNote(item.note);
      const collectionId = item.collectionId;
      const favourite = collectionId === tree.root!._id || Boolean(extra.favourite);
      let parentSpaceId: string | undefined;
      let parentFolderId: string | undefined;
      if (!favourite && collectionId) {
        if (spaceIds.has(collectionId)) parentSpaceId = arcableCollectionId(collectionId);
        else {
          parentFolderId = arcableCollectionId(collectionId);
          let cursor = collectionById.get(collectionId);
          while (cursor?.parent?.$id && !spaceIds.has(cursor.parent.$id)) cursor = collectionById.get(cursor.parent.$id);
          parentSpaceId = cursor?.parent?.$id ? arcableCollectionId(cursor.parent.$id) : undefined;
        }
      }
      return {
        id: extra.arcableId || String(item._id),
        raindropId: item._id,
        url: item.link,
        urlVariants: extra.urlVariants,
        defaultVariantId: extra.defaultVariantId,
        pinned: Boolean(extra.pinned),
        favourite: favourite || undefined,
        customTitle: extra.customTitle || item.title,
        customEmojiIcon: extra.customEmojiIcon,
        favIconUrl: item.cover,
        parentFolderId,
        parentSpaceId,
        order: extra.order,
        createdAt: extra.createdAt || timestamp(item.created),
        updatedAt: extra.updatedAt || timestamp(item.lastUpdate),
      };
    });
  return {
    raindropRootCollectionId: tree.root._id,
    raindropMetadataItemId: tree.metadataItemId ?? null,
    version: 1,
    activeSpaceId: spaces[0]?.id || '',
    spaces,
    folders,
    tabs,
    tmpTabs: [],
    widgets: tree.metadata.widgets || [],
    customCodeRules: tree.metadata.customCodeRules || [],
    runCodeInPageRules: tree.metadata.runCodeInPageRules || [],
  };
}

/** Always rebuilds Arcable's local cache from the live Raindrop tree without mutating Raindrop. */
export async function fetchRaindropWorkspace(token: string): Promise<{ success: boolean; data?: ArcableWorkspaceData; error?: string; errorDetails?: RaindropRequestFailureDetails }> {
  const clean = cleanRaindropToken(token);
  if (!clean) return { success: false, error: 'Raindrop authorization token is missing or invalid.' };
  try {
    const tree = await fetchRemoteArcableTree(clean);
    return { success: true, data: reconstructWorkspace(tree) };
  } catch (err: any) {
    console.error('[RaindropSync] Failed to fetch Arcable tree:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch remote workspace.',
      errorDetails: getRaindropRequestFailureDetails(err),
    };
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
 * Reconciles a local optimistic cache with the live Arcable tree. Entity IDs become
 * Raindrop IDs after the first successful write; updates use timestamps so a newer
 * remote edit wins over a stale local cache, while local queued deletions are explicit.
 */
export async function syncWorkspaceWithRaindrop(
  token: string,
  options?: {
    localState?: ArcableWorkspaceData;
    deviceId?: string;
    deviceName?: string;
    pendingOps?: WorkspaceOperation[];
    replaceBaseline?: boolean;
    /** Freshly hydrated state used only to recover Raindrop-issued IDs from a stale UI payload. */
    identitySnapshot?: ArcableWorkspaceData;
    /** Explicitly marks initial device sync to enforce read-only hydration. */
    isInitialSync?: boolean;
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
    let syncLocalState = options?.localState && options.identitySnapshot
      ? mergeIncrementalSyncSnapshot(options.localState, options.identitySnapshot)
      : options?.localState;
    let authoritativeTree: RemoteArcableTree | undefined;

    const hasPendingOps = Array.isArray(options?.pendingOps) && options.pendingOps.length > 0;
    const isExplicitInitialSync = Boolean(options?.isInitialSync);
    const lacksRootCollectionId = !syncLocalState?.raindropRootCollectionId;

    // 1. If this is an initial sync or there are no pending operations to upload:
    // When not replacing baseline (e.g. restore backup), check the remote tree first.
    // If the Arcable collection already exists in Raindrop:
    // - On a new device (initial sync), we MUST ONLY fetch the authoritative remote tree
    //   and overwrite local cache, discarding any pre-sync local pending operations.
    // - With an empty outbox, refresh from the Arcable subtree without writing.
    if (!options?.replaceBaseline && (isExplicitInitialSync || lacksRootCollectionId || !hasPendingOps)) {
      const tree = await fetchRemoteArcableTree(clean);
      if (tree.root) {
        const isDeviceInitialSync = isExplicitInitialSync || lacksRootCollectionId || syncLocalState?.raindropRootCollectionId !== tree.root._id;
        if (isDeviceInitialSync || !hasPendingOps) {
          if (isDeviceInitialSync) {
            clearStoredPendingOperations();
          }
          return {
            success: true,
            collectionId: tree.root._id,
            dataItemId: tree.metadataItemId,
            latestSnapshot: reconstructWorkspace(tree),
            syncedAt: Date.now(),
          };
        }
      }
      authoritativeTree = tree;
    }

    if (needsIncrementalIdentityRebase(syncLocalState, options?.pendingOps, options?.replaceBaseline)) {
      authoritativeTree = await fetchRemoteArcableTree(clean);
      const authoritativeSnapshot = reconstructWorkspace(authoritativeTree);
      if (authoritativeSnapshot && options?.pendingOps) {
        syncLocalState = replayOperations(authoritativeSnapshot, options.pendingOps);
      }
    }

    if (!needsIncrementalIdentityRebase(syncLocalState, options?.pendingOps, options?.replaceBaseline)) {
      const incrementalResult = await syncIncrementalOperations(
        clean,
        syncLocalState,
        options?.pendingOps,
        options?.replaceBaseline
      );
      if (incrementalResult) return incrementalResult;
    }

    let tree = authoritativeTree || await fetchRemoteArcableTree(clean);
    let root = tree.root;
    if (!root) root = await createRaindropCollection(clean, ARCABLE_COLLECTION_NAME);
    if (!root?._id) throw new Error('Failed to create root "Arcable" collection in Raindrop.');

    // No migration is supported: remove retired snapshot files rather than
    // leaving two competing cloud representations under Arcable.
    tree = await removeLegacySnapshots(clean, tree);

    const localState: ArcableWorkspaceData = syncLocalState || {
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

    const pendingOps = options?.pendingOps || [];
    const deletedIds = new Set(pendingOps.filter((op) => /_(?:DELETE)$/.test(op.type)).map((op) => op.entityId));
    const changedIds = new Set(pendingOps.map((op) => op.entityId));
    const remoteCollections = new Map(tree.collections.map((collection) => [collection._id, collection]));
    const remoteItems = new Map(tree.items.map((item) => [item._id, item]));
    const remoteCollectionByArcableId = new Map(
      tree.collections.map((collection) => [String(collection._id), collection._id])
    );
    const remoteItemByArcableId = new Map(
      tree.items.map((item) => [parseBookmarkNote(item.note).arcableId || String(item._id), item._id])
    );
    const localCollectionToRemote = new Map<string, number>();
    const skippedCollectionIds = new Set<string>();
    for (const collection of [...(localState.spaces || []), ...(localState.folders || [])]) {
      const remoteId = remoteEntityId(collection);
      if (remoteId && remoteCollections.has(remoteId)) localCollectionToRemote.set(collection.id, remoteId);
    }

    const collections = [
      ...(localState.spaces || []).map((space) => ({ entity: space, kind: 'space' as const })),
      ...(localState.folders || []).map((folder) => ({ entity: folder, kind: 'folder' as const })),
    ];
    const unresolved = new Map(collections.map((entry) => [entry.entity.id, entry]));
    while (unresolved.size) {
      let progressed = false;
      for (const [id, entry] of unresolved) {
        const parentLocalId = entry.kind === 'space' ? undefined : (entry.entity as Folder).parentFolderId || (entry.entity as Folder).parentSpaceId;
        if (parentLocalId && skippedCollectionIds.has(parentLocalId)) {
          skippedCollectionIds.add(id);
          unresolved.delete(id);
          progressed = true;
          continue;
        }
        const parentRemoteId = entry.kind === 'space' ? root._id : localCollectionToRemote.get(parentLocalId || '');
        if (!parentRemoteId) continue;
        const remoteId = remoteEntityId(entry.entity);
        const existing = remoteId ? remoteCollections.get(remoteId) : undefined;
        // A numerical ID denotes a previously hydrated remote entity. If it
        // vanished on another device and this cache has no queued edit for it,
        // do not resurrect it from stale local state.
        if (remoteId && !existing && !changedIds.has(id)) {
          skippedCollectionIds.add(id);
          unresolved.delete(id);
          progressed = true;
          continue;
        }
        const shouldUpdate = Boolean(existing) && (changedIds.has(id) || (entry.entity.updatedAt || 0) > timestamp(existing?.lastUpdate));
        // Space and folder covers come from Raindrop's own icon catalogue. Only
        // search when creating or modifying the corresponding collection.
        const cover = !existing || shouldUpdate
          ? (entry.kind === 'space'
            ? (entry.entity as Space).coverUrl || await searchRaindropCollectionCover(clean, entry.entity.name)
            : (entry.entity as Folder).coverUrl || await searchRaindropCollectionCover(clean, entry.entity.name))
          : undefined;
        const color = entry.entity.colors;
        if (!existing) {
          const created = await createRaindropCollection(clean, entry.entity.name, parentRemoteId, {
            ...(entry.kind === 'folder' ? { color } : {}),
            cover: cover ? [cover] : undefined,
            sort: entry.entity.order,
          });
          localCollectionToRemote.set(id, created._id);
          remoteCollections.set(created._id, created);
        } else {
          localCollectionToRemote.set(id, existing._id);
          if (shouldUpdate) {
            await updateRaindropCollection(clean, existing._id, {
              title: entry.entity.name,
              parentId: parentRemoteId,
              ...(entry.kind === 'folder' ? { color } : {}),
              cover: cover ? [cover] : undefined,
              sort: entry.entity.order,
            });
          }
        }
        unresolved.delete(id);
        progressed = true;
      }
      if (!progressed) throw new Error('A folder references a missing parent; cannot build the Arcable collection tree.');
    }

    const deletedItemsByCollection = new Map<number, number[]>();
    for (const id of deletedIds) {
      const remoteId = numericRaindropId(id) || remoteItemByArcableId.get(id);
      const item = remoteId ? remoteItems.get(remoteId) : undefined;
      if (!item?.collectionId) continue;
      const ids = deletedItemsByCollection.get(item.collectionId) || [];
      ids.push(item._id);
      deletedItemsByCollection.set(item.collectionId, ids);
    }
    for (const [collectionId, ids] of deletedItemsByCollection) {
      for (let start = 0; start < ids.length; start += 100) {
        const deleted = await deleteRaindropBookmarks(clean, collectionId, ids.slice(start, start + 100));
        if (!deleted) throw new Error(`Failed to delete Raindrop bookmarks from collection ${collectionId}.`);
      }
    }
    // Delete collection roots last; Raindrop recursively removes descendants.
    for (const id of deletedIds) {
      const remoteId = numericRaindropId(id) || remoteCollectionByArcableId.get(id);
      if (remoteId && remoteCollections.has(remoteId)) await deleteRaindropCollection(clean, remoteId);
    }

    const bookmarksToCreate = [] as Parameters<typeof createRaindropBookmarks>[1];
    for (const tab of localState.tabs || []) {
      if (deletedIds.has(tab.id)) continue;
      const remoteId = remoteEntityId(tab);
      const existing = remoteId ? remoteItems.get(remoteId) : undefined;
      if (remoteId && !existing && !changedIds.has(tab.id)) continue;
      const parentId = tab.favourite ? root._id : localCollectionToRemote.get(tab.parentFolderId || tab.parentSpaceId || '');
      if (!parentId) continue;
      const payload = {
        title: tab.customTitle || tab.url,
        link: tab.url,
        cover: tab.favIconUrl,
        note: bookmarkNote(tab),
        collection: { $id: parentId },
        order: tab.order,
      };
      const shouldUpdate = Boolean(existing) && (changedIds.has(tab.id) || (tab.updatedAt || 0) > timestamp(existing?.lastUpdate));
      if (!existing) {
        bookmarksToCreate.push({
          title: payload.title,
          link: payload.link,
          cover: payload.cover,
          note: payload.note,
          collectionId: parentId,
          order: tab.order,
          pleaseParse: { disabled: true },
        });
      } else if (shouldUpdate) {
        await updateRaindropItem(clean, existing._id, payload);
      }
    }
    for (let start = 0; start < bookmarksToCreate.length; start += 100) {
      await createRaindropBookmarks(clean, bookmarksToCreate.slice(start, start + 100));
    }

    const metadata = metadataFromWorkspace(localState);
    // Raindrop's file endpoint creates immutable file items, so keep exactly one
    // current-version metadata item. Retired snapshot files were removed above.
    const oldMetadata = tree.items.filter((item) =>
      (item.file?.name || item.title || '').trim().toLowerCase() === ARCABLE_DATA_FILE_NAME.toLowerCase()
    );
    for (let start = 0; start < oldMetadata.length; start += 100) {
      const deleted = await deleteRaindropBookmarks(clean, root._id, oldMetadata.slice(start, start + 100).map((item) => item._id));
      if (!deleted) throw new Error('Failed to replace the previous Arcable metadata item.');
    }
    const uploaded = await uploadRaindropFile(clean, root._id, ARCABLE_DATA_FILE_NAME, JSON.stringify(metadata, null, 2));
    const uploadedItemId = uploaded?.item?._id;
    if (uploadedItemId) await updateRaindropItem(clean, uploadedItemId, { title: ARCABLE_DATA_FILE_NAME });

    tree = await fetchRemoteArcableTree(clean);
    const latestSnapshot = reconstructWorkspace(tree);

    return {
      success: true,
      collectionId: root._id,
      dataItemId: uploadedItemId,
      latestSnapshot,
      syncedAt: Date.now(),
    };
  } catch (err: any) {
    console.error('[RaindropSync] Sync error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to sync workspace with Raindrop.',
      errorDetails: getRaindropRequestFailureDetails(err),
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
 * 4. Materializes the restored snapshot as Arcable collections and items.
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

    // 4. Never recreate the retired snapshot file. Materialize the restored
    // workspace through the same collection/item sync used for normal edits.
    const syncResult = await syncWorkspaceWithRaindrop(clean, {
      localState: { ...snapshot, tmpTabs: [] },
      deviceId,
      deviceName,
      pendingOps: [],
      replaceBaseline: true,
    });
    if (!syncResult.success) {
      throw new Error(syncResult.error || 'Failed to sync restored workspace to Raindrop.');
    }

    return {
      success: true,
      restoredSnapshot: syncResult.latestSnapshot || snapshot,
    };
  } catch (err: any) {
    console.error('[RaindropSync] Error restoring backup:', err);
    return { success: false, error: err?.message || 'Failed to restore backup from Raindrop.' };
  }
}
