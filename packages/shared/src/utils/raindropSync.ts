import { ArcableWorkspaceData, Folder, Space, Tab, TabUrlVariant, WorkspaceWidget } from '../types/workspace';
import { CustomCodeRule, RunCodeRule } from '../types/customCode';
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
  moveRaindropBookmarks,
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
import {
  sortCustomCodeRules,
  sortRunCodeRules,
} from './customCodeUtils';

export const ARCABLE_COLLECTION_NAME = 'Arcable v2';
export const LEGACY_ROOT_COLLECTION_NAMES = ['Arcable'];
export const ARCABLE_CUSTOM_CSS_COLLECTION_NAME = '_custom_css';
export const ARCABLE_RUN_CODE_COLLECTION_NAME = '_run_code';
export const ARCABLE_WIDGET_TAG = 'arcable-widget';
export const ARCABLE_WIDGET_LINK_PREFIX = 'https://arcable.app/widget/';
export const ARCABLE_CUSTOM_CSS_LINK_PREFIX = 'https://arcable.app/custom-css/';
export const ARCABLE_RUN_CODE_LINK_PREFIX = 'https://arcable.app/run-code/';
export const ARCABLE_VARIANT_DELIMITER = ' ||| ';
/** Legacy canonical non-tree workspace metadata stored directly under the Arcable root. */
export const ARCABLE_DATA_FILE_NAME = 'data.json.txt';

export function isSystemCollection(collection: RaindropCollectionItem): boolean {
  const title = (collection.title || '').trim().toLowerCase();
  return (
    title === ARCABLE_CUSTOM_CSS_COLLECTION_NAME.toLowerCase() ||
    title === ARCABLE_RUN_CODE_COLLECTION_NAME.toLowerCase() ||
    title.startsWith('_')
  );
}

export function isWidgetItem(item: RaindropBookmarkItem): boolean {
  const link = (item.link || '').toLowerCase();
  return link.startsWith(ARCABLE_WIDGET_LINK_PREFIX.toLowerCase()) || Boolean(item.tags?.includes(ARCABLE_WIDGET_TAG));
}

export function isCustomCssItem(item: RaindropBookmarkItem, customCssCollectionId?: number): boolean {
  const link = (item.link || '').toLowerCase();
  return (
    (customCssCollectionId !== undefined && item.collectionId === customCssCollectionId) ||
    link.startsWith(ARCABLE_CUSTOM_CSS_LINK_PREFIX.toLowerCase())
  );
}

export function isRunCodeItem(item: RaindropBookmarkItem, runCodeCollectionId?: number): boolean {
  const link = (item.link || '').toLowerCase();
  return (
    (runCodeCollectionId !== undefined && item.collectionId === runCodeCollectionId) ||
    link.startsWith(ARCABLE_RUN_CODE_LINK_PREFIX.toLowerCase())
  );
}

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
 * Finds the root collection named ARCABLE_COLLECTION_NAME ("Arcable v2"), or creates one if it does not exist.
 * If a legacy root collection (e.g. "Arcable") is found, triggers migration so the new root is initialized.
 */
export async function getOrCreateArcableCollection(token: string): Promise<RaindropCollectionItem> {
  const collections = await fetchRaindropCollections(token);

  // Look for root collection(s) named ARCABLE_COLLECTION_NAME ("Arcable v2")
  const matches = collections.filter(
    (c) =>
      c.title.trim().toLowerCase() === ARCABLE_COLLECTION_NAME.toLowerCase() &&
      (!c.parent || !c.parent.$id)
  );

  if (matches.length > 0) {
    matches.sort((a, b) => (b.count || 0) - (a.count || 0) || a._id - b._id);
    return matches[0];
  }

  // Check if legacy root collection exists to migrate
  const legacyMatches = collections.filter(
    (c) =>
      (!c.parent || !c.parent.$id) &&
      LEGACY_ROOT_COLLECTION_NAMES.some((name) => c.title.trim().toLowerCase() === name.toLowerCase())
  );

  if (legacyMatches.length > 0) {
    const tree = await fetchRemoteArcableTree(token);
    if (tree.root) return tree.root;
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

export function numericRaindropId(id: string | undefined): number | undefined {
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

function bookmarkNote(_tab: Tab): string {
  // Arcable bookmark items no longer store metadata in note.
  return '';
}

export function calculateSpaceTargetOrder(space: Space, allSpaces: Space[]): number {
  const sorted = [...allSpaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const idx = sorted.findIndex((s) => s.id === space.id);
  return idx >= 0 ? idx : 0;
}

export function calculateFolderTargetOrder(folder: Folder, allFolders: Folder[]): number {
  const parentKey = folder.parentFolderId || folder.parentSpaceId;
  const siblings = allFolders
    .filter((f) => (f.parentFolderId || f.parentSpaceId) === parentKey)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  const idx = siblings.findIndex((f) => f.id === folder.id);
  return idx >= 0 ? idx : 0;
}

export function getTabSecondaryVariants(tab: Tab): TabUrlVariant[] {
  if (!tab.urlVariants || tab.urlVariants.length <= 1) return [];
  const defaultVar =
    (tab.defaultVariantId && tab.urlVariants.find((v) => v.id === tab.defaultVariantId)) ||
    tab.urlVariants[0];
  return tab.urlVariants.filter((v) => v.id !== defaultVar?.id);
}

export function getTabRaindropBookmarkCount(tab: Tab): number {
  return 1 + getTabSecondaryVariants(tab).length;
}

export function calculateTabTargetOrder(tab: Tab, allTabs: Tab[], allWidgets?: WorkspaceWidget[]): number {
  if (tab.favourite) {
    const favTabs = allTabs.filter((t) => Boolean(t.favourite));
    const widgets = allWidgets || [];
    type RootItem = { id: string; type: 'tab' | 'widget'; tab?: Tab; order?: number; createdAt?: number };
    const rootItems: RootItem[] = [
      ...favTabs.map((t) => ({ id: t.id, type: 'tab' as const, tab: t, order: t.order, createdAt: t.createdAt })),
      ...widgets.map((w) => ({ id: w.id, type: 'widget' as const, order: w.order, createdAt: w.createdAt })),
    ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
    let slot = 0;
    for (const item of rootItems) {
      if (item.id === tab.id) return slot;
      if (item.type === 'widget') {
        slot += 1;
      } else if (item.tab) {
        slot += getTabRaindropBookmarkCount(item.tab);
      } else {
        slot += 1;
      }
    }
    return slot;
  }
  const parentKey = tab.parentFolderId || tab.parentSpaceId;
  const siblings = allTabs
    .filter((t) => !t.favourite && !t.pinned && (t.parentFolderId || t.parentSpaceId) === parentKey)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  let slot = 0;
  for (const sibling of siblings) {
    if (sibling.id === tab.id) return slot;
    slot += getTabRaindropBookmarkCount(sibling);
  }
  return slot;
}

export function calculateWidgetTargetOrder(
  widget: WorkspaceWidget,
  allTabs: Tab[],
  allWidgets: WorkspaceWidget[]
): number {
  const favTabs = allTabs.filter((t) => Boolean(t.favourite));
  type RootItem = { id: string; type: 'tab' | 'widget'; tab?: Tab; order?: number; createdAt?: number };
  const rootItems: RootItem[] = [
    ...favTabs.map((t) => ({ id: t.id, type: 'tab' as const, tab: t, order: t.order, createdAt: t.createdAt })),
    ...allWidgets.map((w) => ({ id: w.id, type: 'widget' as const, order: w.order, createdAt: w.createdAt })),
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  let slot = 0;
  for (const item of rootItems) {
    if (item.id === widget.id) return slot;
    if (item.type === 'widget') {
      slot += 1;
    } else if (item.tab) {
      slot += getTabRaindropBookmarkCount(item.tab);
    } else {
      slot += 1;
    }
  }
  return slot;
}

function widgetToRaindropItemInput(
  widget: WorkspaceWidget,
  rootId: number,
  targetOrder?: number
): Parameters<typeof createRaindropBookmarks>[1][number] {
  const order = targetOrder !== undefined ? targetOrder : widget.order;
  return {
    title: `[Widget] ${widget.style}`,
    link: `${ARCABLE_WIDGET_LINK_PREFIX}${widget.id}`,
    tags: [ARCABLE_WIDGET_TAG],
    excerpt: JSON.stringify({
      id: widget.id,
      style: widget.style,
      size: widget.size,
      config: widget.config,
    }),
    order,
    sort: order,
    collectionId: rootId,
    pleaseParse: { disabled: true },
  };
}

/**
 * Safely base64 encodes string payloads (such as custom code and CSS) so that
 * Raindrop's backend HTML/text sanitizers (which strip '<', '>', etc.) cannot alter code content.
 */
export function encodeSafePayload(text: string): string {
  if (!text) return '';
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(text, 'utf-8').toString('base64');
    }
    if (typeof TextEncoder !== 'undefined' && typeof btoa !== 'undefined') {
      const bytes = new TextEncoder().encode(text);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
    return encodeURIComponent(text);
  } catch (err) {
    console.warn('[RaindropSync] Failed to base64 encode payload, fallback to encodeURIComponent:', err);
    return encodeURIComponent(text);
  }
}

/**
 * Decodes a safe payload from base64 (with fallback to decodeURIComponent or raw text).
 */
export function decodeSafePayload(encoded: string): string {
  if (!encoded) return '';
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    }
    if (typeof TextDecoder !== 'undefined' && typeof atob !== 'undefined') {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(encoded);
  } catch {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
}

function customCodeToRaindropItemInput(
  rule: CustomCodeRule,
  collectionId: number
): Parameters<typeof createRaindropBookmarks>[1][number] {
  const cssB64 = encodeSafePayload(rule.css || '');
  const jsB64 = encodeSafePayload(rule.js || '');
  return {
    title: rule.pattern || 'Custom CSS',
    link: `${ARCABLE_CUSTOM_CSS_LINK_PREFIX}${rule.id}`,
    excerpt: JSON.stringify({
      id: rule.id,
      pattern: rule.pattern,
      css: rule.css,
      css_b64: cssB64,
      js: rule.js,
      js_b64: jsB64,
      disabled: rule.disabled,
    }),
    note: JSON.stringify({ css_b64: cssB64, js_b64: jsB64 }),
    collectionId,
    pleaseParse: { disabled: true },
  };
}

function runCodeToRaindropItemInput(
  rule: RunCodeRule,
  collectionId: number
): Parameters<typeof createRaindropBookmarks>[1][number] {
  const codeB64 = encodeSafePayload(rule.code || '');
  return {
    title: rule.title || 'Run Code',
    link: `${ARCABLE_RUN_CODE_LINK_PREFIX}${rule.id}`,
    excerpt: JSON.stringify({
      id: rule.id,
      title: rule.title,
      patterns: rule.patterns,
      code: rule.code,
      code_b64: codeB64,
      disabled: rule.disabled,
    }),
    note: codeB64,
    collectionId,
    pleaseParse: { disabled: true },
  };
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
    if (operation.type === 'TAB_UPDATE' && !remoteEntityId(tab)) {
      return true;
    }
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
    !localState.raindropRootCollectionId
  ) return null;

  const groups = new Map<string, WorkspaceOperation[]>();
  for (const operation of pendingOps) {
    const kind = operation.type.startsWith('FOLDER_')
      ? 'folder'
      : operation.type.startsWith('WIDGET_')
        ? 'widget'
        : operation.type.startsWith('CUSTOM_CODE_')
          ? 'custom_code'
          : operation.type.startsWith('RUN_CODE_')
            ? 'run_code'
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
    widgets: [...(localState.widgets || [])],
    customCodeRules: [...(localState.customCodeRules || [])],
    runCodeInPageRules: [...(localState.runCodeInPageRules || [])],
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
      const targetOrder = calculateFolderTargetOrder(folder, latestSnapshot.folders);
      if (isCreate) {
        const created = await createRaindropCollection(token, folder.name, parentId, {
          color: folder.colors,
          cover: folder.coverUrl ? [folder.coverUrl] : undefined,
          sort: targetOrder,
          order: targetOrder,
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
          sort: targetOrder,
          order: targetOrder,
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

  const batchDeletes = new Map<number, number[]>();
  const individualDeletes: number[] = [];

  const tabCreates: Array<{
    entityId: string;
    input: Parameters<typeof createRaindropBookmarks>[1][number];
  }> = [];
  const tabUpdates: Array<{
    entityId: string;
    remoteId: number;
    payload: Record<string, unknown>;
    targetOrder: number;
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

    // Collect any deleted variant IDs from TAB_UPDATE operations
    for (const op of operations) {
      if (Array.isArray(op.payload?.deletedVariantIds)) {
        for (const vid of op.payload.deletedVariantIds) {
          const numId = numericRaindropId(vid);
          if (numId) {
            if (parentId) {
              const ids = batchDeletes.get(parentId) || [];
              if (!ids.includes(numId)) ids.push(numId);
              batchDeletes.set(parentId, ids);
            } else {
              if (!individualDeletes.includes(numId)) individualDeletes.push(numId);
            }
          }
        }
      }
    }

    const isCreate = operations.some((operation) => operation.type === 'TAB_CREATE');
    const targetOrder = calculateTabTargetOrder(tab, latestSnapshot.tabs, latestSnapshot.widgets);
    const payload = {
      title: tab.customTitle || tab.url,
      link: tab.url,
      cover: tab.favIconUrl,
      note: '',
      collection: { $id: parentId },
      order: targetOrder,
      sort: targetOrder,
    };
    const secondaryVariants = getTabSecondaryVariants(tab);
    if (isCreate) {
      tabCreates.push({ entityId, input: {
        title: payload.title,
        link: payload.link,
        cover: payload.cover,
        note: '',
        collectionId: parentId,
        order: targetOrder,
        sort: targetOrder,
        pleaseParse: { disabled: true },
      } });
      // Extra URL variants
      secondaryVariants.forEach((variant, vIdx) => {
        const variantOrder = targetOrder + 1 + vIdx;
        tabCreates.push({
          entityId: `${entityId}:::variant:::${variant.id}`,
          input: {
            title: `${tab.customTitle || tab.url}${ARCABLE_VARIANT_DELIMITER}${variant.name}`,
            link: variant.url,
            cover: payload.cover,
            note: '',
            collectionId: parentId,
            order: variantOrder,
            sort: variantOrder,
            pleaseParse: { disabled: true },
          },
        });
      });
    } else {
      let mainRemoteId = remoteEntityId(tab);
      if (!mainRemoteId) throw new Error(`Bookmark ${entityId} has no Raindrop ID for incremental update.`);

      const defaultVar =
        (tab.defaultVariantId && tab.urlVariants?.find((v) => v.id === tab.defaultVariantId)) ||
        tab.urlVariants?.[0];
      const defaultVarRemoteId = defaultVar ? numericRaindropId(defaultVar.id) : undefined;
      const origRemoteId = mainRemoteId;

      if (defaultVarRemoteId && defaultVarRemoteId !== mainRemoteId) {
        mainRemoteId = defaultVarRemoteId;
        latestSnapshot = {
          ...latestSnapshot,
          tabs: latestSnapshot.tabs.map((candidate) =>
            candidate.id === entityId ? { ...candidate, raindropId: mainRemoteId } : candidate
          ),
        };
      }

      tabUpdates.push({ entityId, remoteId: mainRemoteId, payload, targetOrder });
      secondaryVariants.forEach((variant, vIdx) => {
        const variantOrder = targetOrder + 1 + vIdx;
        let varRemoteId = numericRaindropId(variant.id);
        if (varRemoteId === mainRemoteId) {
          varRemoteId = origRemoteId;
        }
        const varTitle = `${tab.customTitle || tab.url}${ARCABLE_VARIANT_DELIMITER}${variant.name}`;
        if (varRemoteId) {
          tabUpdates.push({
            entityId: `${entityId}:::variant:::${variant.id}`,
            remoteId: varRemoteId,
            payload: {
              title: varTitle,
              link: variant.url,
              cover: payload.cover,
              collection: { $id: parentId },
              order: variantOrder,
              sort: variantOrder,
            },
            targetOrder: variantOrder,
          });
        } else {
          tabCreates.push({
            entityId: `${entityId}:::variant:::${variant.id}`,
            input: {
              title: varTitle,
              link: variant.url,
              cover: payload.cover,
              note: '',
              collectionId: parentId,
              order: variantOrder,
              sort: variantOrder,
              pleaseParse: { disabled: true },
            },
          });
        }
      });
    }
  }

  // Sort tab updates in ascending targetOrder so moving bookmarks executes sequentially
  tabUpdates.sort((a, b) => a.targetOrder - b.targetOrder);
  for (const { remoteId, payload } of tabUpdates) {
    const updated = await updateRaindropItem(token, remoteId, payload);
    if (!updated) throw new Error(`Failed to update Raindrop bookmark ${remoteId}.`);
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
        const nextVariants = candidate.urlVariants?.map((v) => {
          const varKey = `${candidate.id}:::variant:::${v.id}`;
          const varCreatedId = createdIds.get(varKey);
          if (varCreatedId) {
            return { ...v, id: String(varCreatedId) };
          }
          if (createdId && (v.id === candidate.defaultVariantId || v.url === candidate.url)) {
            return { ...v, id: String(createdId) };
          }
          return v;
        });
        const nextDefaultVariantId = createdId && candidate.defaultVariantId === candidate.urlVariants?.[0]?.id
          ? String(createdId)
          : candidate.defaultVariantId;
        return {
          ...candidate,
          ...(createdId ? { raindropId: createdId } : {}),
          ...(nextVariants ? { urlVariants: nextVariants } : {}),
          ...(nextDefaultVariantId ? { defaultVariantId: nextDefaultVariantId } : {}),
        };
      }),
    };
  }

  for (const [key, operations] of groups) {
    if (!key.startsWith('tab:') || !operations.some((operation) => operation.type === 'TAB_DELETE')) continue;
    if (operations.some((operation) => operation.type === 'TAB_CREATE')) continue;
    const deleteOperation = [...operations].reverse().find((operation) => operation.type === 'TAB_DELETE')!;
    const remoteId = Number(deleteOperation.payload?.raindropId) || numericRaindropId(deleteOperation.entityId);
    if (!remoteId) throw new Error(`Bookmark ${deleteOperation.entityId} has no Raindrop ID for incremental delete.`);
    const collectionId = Number(deleteOperation.payload?.collectionId);

    const deleteIds: number[] = [remoteId];
    if (Array.isArray(deleteOperation.payload?.variantRaindropIds)) {
      for (const vid of deleteOperation.payload.variantRaindropIds) {
        const numId = numericRaindropId(vid);
        if (numId && !deleteIds.includes(numId)) {
          deleteIds.push(numId);
        }
      }
    }

    if (Number.isSafeInteger(collectionId) && collectionId > 0) {
      const ids = batchDeletes.get(collectionId) || [];
      for (const id of deleteIds) {
        if (!ids.includes(id)) ids.push(id);
      }
      batchDeletes.set(collectionId, ids);
    } else {
      for (const id of deleteIds) {
        if (!individualDeletes.includes(id)) individualDeletes.push(id);
      }
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

  // Process Widget operations
  const rootId = latestSnapshot.raindropRootCollectionId!;
  const widgetCreates: Array<{ entityId: string; input: Parameters<typeof createRaindropBookmarks>[1][number] }> = [];
  for (const [key, operations] of groups) {
    if (!key.startsWith('widget:') || operations.some((operation) => operation.type === 'WIDGET_DELETE')) continue;
    const entityId = operations[0].entityId;
    const widget = latestSnapshot.widgets?.find((w) => w.id === entityId);
    if (!widget) continue;
    const isCreate = operations.some((operation) => operation.type === 'WIDGET_CREATE');
    const targetOrder = calculateWidgetTargetOrder(widget, latestSnapshot.tabs, latestSnapshot.widgets || []);
    const input = widgetToRaindropItemInput(widget, rootId, targetOrder);
    if (isCreate) {
      widgetCreates.push({ entityId, input });
    } else {
      const remoteId = widget.raindropId || numericRaindropId(widget.id);
      if (remoteId) {
        const updated = await updateRaindropItem(token, remoteId, {
          title: input.title,
          excerpt: input.excerpt,
          order: targetOrder,
          sort: targetOrder,
        });
        if (!updated) throw new Error(`Failed to update Raindrop widget ${remoteId}.`);
      }
    }
  }
  for (let start = 0; start < widgetCreates.length; start += 100) {
    const batch = widgetCreates.slice(start, start + 100);
    const createdItems = await createRaindropBookmarks(token, batch.map(({ input }) => input));
    if (createdItems.length !== batch.length) {
      throw new Error(`Raindrop created ${createdItems.length} of ${batch.length} requested widgets.`);
    }
    const createdIds = new Map(batch.map((entry, index) => [entry.entityId, createdItems[index]._id]));
    latestSnapshot = {
      ...latestSnapshot,
      widgets: (latestSnapshot.widgets || []).map((w) => {
        const createdId = createdIds.get(w.id);
        return createdId ? { ...w, raindropId: createdId } : w;
      }),
    };
  }
  for (const [key, operations] of groups) {
    if (!key.startsWith('widget:') || !operations.some((op) => op.type === 'WIDGET_DELETE')) continue;
    if (operations.some((op) => op.type === 'WIDGET_CREATE')) continue;
    const deleteOp = [...operations].reverse().find((op) => op.type === 'WIDGET_DELETE')!;
    const remoteId = Number(deleteOp.payload?.raindropId) || numericRaindropId(deleteOp.entityId);
    if (remoteId) await deleteRaindropBookmark(token, remoteId);
  }

  // Process Custom Code operations
  const hasCustomCodeOps = [...groups.keys()].some((k) => k.startsWith('custom_code:'));
  if (hasCustomCodeOps) {
    const allCollections = await fetchRaindropCollections(token);
    let customCssColl = allCollections.find(
      (c) => c.parent?.$id === rootId && c.title.trim().toLowerCase() === ARCABLE_CUSTOM_CSS_COLLECTION_NAME.toLowerCase()
    );
    if (!customCssColl) {
      customCssColl = await createRaindropCollection(token, ARCABLE_CUSTOM_CSS_COLLECTION_NAME, rootId);
    }
    const customCssCollId = customCssColl._id;

    const customCodeCreates: Array<{ entityId: string; input: Parameters<typeof createRaindropBookmarks>[1][number] }> = [];
    for (const [key, operations] of groups) {
      if (!key.startsWith('custom_code:') || operations.some((op) => op.type === 'CUSTOM_CODE_DELETE')) continue;
      const entityId = operations[0].entityId;
      const rule = latestSnapshot.customCodeRules?.find((r) => r.id === entityId);
      if (!rule) continue;
      const isCreate = operations.some((op) => op.type === 'CUSTOM_CODE_CREATE');
      const input = customCodeToRaindropItemInput(rule, customCssCollId);
      if (isCreate) {
        customCodeCreates.push({ entityId, input });
      } else {
        const remoteId = rule.raindropId || numericRaindropId(rule.id);
        if (remoteId) {
          const updated = await updateRaindropItem(token, remoteId, {
            title: input.title,
            excerpt: input.excerpt,
            note: input.note,
          });
          if (!updated) throw new Error(`Failed to update Raindrop custom code rule ${remoteId}.`);
        }
      }
    }
    for (let start = 0; start < customCodeCreates.length; start += 100) {
      const batch = customCodeCreates.slice(start, start + 100);
      const createdItems = await createRaindropBookmarks(token, batch.map(({ input }) => input));
      const createdIds = new Map(batch.map((entry, index) => [entry.entityId, createdItems[index]._id]));
      latestSnapshot = {
        ...latestSnapshot,
        customCodeRules: (latestSnapshot.customCodeRules || []).map((r) => {
          const createdId = createdIds.get(r.id);
          return createdId ? { ...r, raindropId: createdId } : r;
        }),
      };
    }
    for (const [key, operations] of groups) {
      if (!key.startsWith('custom_code:') || !operations.some((op) => op.type === 'CUSTOM_CODE_DELETE')) continue;
      if (operations.some((op) => op.type === 'CUSTOM_CODE_CREATE')) continue;
      const deleteOp = [...operations].reverse().find((op) => op.type === 'CUSTOM_CODE_DELETE')!;
      const remoteId = Number(deleteOp.payload?.raindropId) || numericRaindropId(deleteOp.entityId);
      if (remoteId) await deleteRaindropBookmark(token, remoteId);
    }
  }

  // Process Run Code operations
  const hasRunCodeOps = [...groups.keys()].some((k) => k.startsWith('run_code:'));
  if (hasRunCodeOps) {
    const allCollections = await fetchRaindropCollections(token);
    let runCodeColl = allCollections.find(
      (c) => c.parent?.$id === rootId && c.title.trim().toLowerCase() === ARCABLE_RUN_CODE_COLLECTION_NAME.toLowerCase()
    );
    if (!runCodeColl) {
      runCodeColl = await createRaindropCollection(token, ARCABLE_RUN_CODE_COLLECTION_NAME, rootId);
    }
    const runCodeCollId = runCodeColl._id;

    const runCodeCreates: Array<{ entityId: string; input: Parameters<typeof createRaindropBookmarks>[1][number] }> = [];
    for (const [key, operations] of groups) {
      if (!key.startsWith('run_code:') || operations.some((op) => op.type === 'RUN_CODE_DELETE')) continue;
      const entityId = operations[0].entityId;
      const rule = latestSnapshot.runCodeInPageRules?.find((r) => r.id === entityId);
      if (!rule) continue;
      const isCreate = operations.some((op) => op.type === 'RUN_CODE_CREATE');
      const input = runCodeToRaindropItemInput(rule, runCodeCollId);
      if (isCreate) {
        runCodeCreates.push({ entityId, input });
      } else {
        const remoteId = rule.raindropId || numericRaindropId(rule.id);
        if (remoteId) {
          const updated = await updateRaindropItem(token, remoteId, {
            title: input.title,
            excerpt: input.excerpt,
            note: input.note,
          });
          if (!updated) throw new Error(`Failed to update Raindrop run code rule ${remoteId}.`);
        }
      }
    }
    for (let start = 0; start < runCodeCreates.length; start += 100) {
      const batch = runCodeCreates.slice(start, start + 100);
      const createdItems = await createRaindropBookmarks(token, batch.map(({ input }) => input));
      const createdIds = new Map(batch.map((entry, index) => [entry.entityId, createdItems[index]._id]));
      latestSnapshot = {
        ...latestSnapshot,
        runCodeInPageRules: (latestSnapshot.runCodeInPageRules || []).map((r) => {
          const createdId = createdIds.get(r.id);
          return createdId ? { ...r, raindropId: createdId } : r;
        }),
      };
    }
    for (const [key, operations] of groups) {
      if (!key.startsWith('run_code:') || !operations.some((op) => op.type === 'RUN_CODE_DELETE')) continue;
      if (operations.some((op) => op.type === 'RUN_CODE_CREATE')) continue;
      const deleteOp = [...operations].reverse().find((op) => op.type === 'RUN_CODE_DELETE')!;
      const remoteId = Number(deleteOp.payload?.raindropId) || numericRaindropId(deleteOp.entityId);
      if (remoteId) await deleteRaindropBookmark(token, remoteId);
    }
  }

  // Remove previous legacy data.json.txt if it was tracked
  if (latestSnapshot.raindropMetadataItemId) {
    await deleteRaindropBookmarks(token, rootId, [latestSnapshot.raindropMetadataItemId]).catch(() => null);
    latestSnapshot = { ...latestSnapshot, raindropMetadataItemId: null };
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
    return true;
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

/**
 * Migrates child collections and bookmark items from a legacy root collection
 * (e.g. "Arcable") to the new root collection ("Arcable v2"), then deletes the legacy root.
 */
async function migrateLegacyRootCollection(
  token: string,
  legacyRoot: RaindropCollectionItem,
  targetRoot: RaindropCollectionItem,
  allCollections: RaindropCollectionItem[]
): Promise<void> {
  console.log(
    `[RaindropSync] Migrating legacy root collection "${legacyRoot.title}" (${legacyRoot._id}) to "${targetRoot.title}" (${targetRoot._id})...`
  );

  // 1. Move all immediate child collections to targetRoot
  const childCollections = allCollections.filter((c) => c.parent?.$id === legacyRoot._id);
  for (const child of childCollections) {
    try {
      await updateRaindropCollection(token, child._id, { parentId: targetRoot._id });
      child.parent = { $id: targetRoot._id };
    } catch (err) {
      console.warn(`[RaindropSync] Failed to reparent child collection ${child.title} (${child._id}):`, err);
    }
  }

  // 2. Move all bookmark items directly under legacyRoot to targetRoot
  try {
    const legacyItems = await fetchAllRaindropItems(token, legacyRoot._id);
    if (legacyItems.length > 0) {
      const itemIds = legacyItems.map((item) => item._id);
      await moveRaindropBookmarks(token, legacyRoot._id, targetRoot._id, itemIds);
    }
  } catch (err) {
    console.warn(`[RaindropSync] Failed to move items from legacy root ${legacyRoot._id}:`, err);
  }

  // 3. Delete the legacy root collection to prevent confusion and conflicts with older clients
  try {
    await deleteRaindropCollection(token, legacyRoot._id);
    console.log(`[RaindropSync] Deleted legacy root collection "${legacyRoot.title}" (${legacyRoot._id}).`);
  } catch (err) {
    console.warn(`[RaindropSync] Failed to delete legacy root collection ${legacyRoot._id}:`, err);
  }
}

/** Fetches the complete Arcable subtree and only the items below its root. */
async function fetchRemoteArcableTree(token: string): Promise<RemoteArcableTree> {
  // Raindrop caches identical list URLs. A reload immediately after a batch
  // write must not hydrate the extension from the pre-write cached response.
  // Reuse one unique key across every page so the read remains a coherent
  // snapshot while still bypassing both Raindrop's and the browser's caches.
  const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let allCollections = await fetchRaindropCollections(token, { cacheBust });
  const roots = allCollections.filter((collection) => !collection.parent?.$id);
  const matchingRoots = roots
    .filter((collection) => collection.title.trim().toLowerCase() === ARCABLE_COLLECTION_NAME.toLowerCase())
    .sort((a, b) => (b.count || 0) - (a.count || 0) || a._id - b._id);
  let root = matchingRoots[0];

  // Check if any legacy root collections exist (e.g. "Arcable")
  const legacyRoots = roots.filter(
    (collection) =>
      collection._id !== root?._id &&
      LEGACY_ROOT_COLLECTION_NAMES.some((name) => collection.title.trim().toLowerCase() === name.toLowerCase())
  );

  if (legacyRoots.length > 0) {
    if (!root) {
      root = await createRaindropCollection(token, ARCABLE_COLLECTION_NAME);
      allCollections.push(root);
    }
    for (const legacyRoot of legacyRoots) {
      await migrateLegacyRootCollection(token, legacyRoot, root, allCollections);
      allCollections = allCollections.filter((c) => c._id !== legacyRoot._id);
    }
  }

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

function reconstructWorkspace(
  tree: RemoteArcableTree,
  targetActiveSpaceId?: string,
  options?: { allowLegacyMetadataFallback?: boolean }
): ArcableWorkspaceData {
  // The tree.metadata.widgets/customCodeRules/runCodeInPageRules fallback below exists
  // only to hydrate a device that has never synced this workspace before (pre-migration
  // installs that still keep everything inside the legacy data.json.txt blob). Once a
  // device has already established a root collection for this workspace, an empty list
  // of live items is a legitimate deletion, not evidence of un-migrated data — the legacy
  // blob can otherwise resurrect items that were deleted after it was last written (its
  // deletion on push is best-effort and can silently fail, leaving stale data behind).
  const allowLegacyMetadataFallback = options?.allowLegacyMetadataFallback ?? true;
  if (!tree.root) return createEmptyRemoteWorkspace();
  const root = tree.root;
  const collectionById = new Map(tree.collections.map((collection) => [collection._id, collection]));
  const arcableCollectionId = (collectionId: number) => String(collectionId);

  const customCssCollection = tree.collections.find(
    (c) => c.title.trim().toLowerCase() === ARCABLE_CUSTOM_CSS_COLLECTION_NAME.toLowerCase() && c.parent?.$id === root._id
  );
  const runCodeCollection = tree.collections.find(
    (c) => c.title.trim().toLowerCase() === ARCABLE_RUN_CODE_COLLECTION_NAME.toLowerCase() && c.parent?.$id === root._id
  );

  const spaceIds = new Set(
    tree.collections
      .filter((collection) => collection.parent?.$id === root._id && !isSystemCollection(collection))
      .map((collection) => collection._id)
  );

  const spaces: Space[] = tree.collections
    .filter((collection) => spaceIds.has(collection._id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((collection, index) => ({
      id: arcableCollectionId(collection._id),
      raindropId: collection._id,
      name: collection.title,
      emojiIcon: emojiFromCover(collection.cover),
      coverUrl: collection.cover?.[0],
      order: (index + 1) * 1000,
      createdAt: timestamp(collection.created),
      updatedAt: timestamp(collection.lastUpdate),
    }));

  const rawFolders: Folder[] = tree.collections
    .filter((collection) => !spaceIds.has(collection._id) && !isSystemCollection(collection))
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
        order: collection.sort ?? 0,
        createdAt: timestamp(collection.created),
        updatedAt: timestamp(collection.lastUpdate),
      };
    })
    .filter((folder) => Boolean(folder.parentSpaceId));

  const foldersByParent = new Map<string, Folder[]>();
  for (const f of rawFolders) {
    const parentKey = f.parentFolderId || f.parentSpaceId;
    const group = foldersByParent.get(parentKey) || [];
    group.push(f);
    foldersByParent.set(parentKey, group);
  }
  const folders: Folder[] = [];
  for (const [, group] of foldersByParent) {
    group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    group.forEach((f, idx) => {
      folders.push({ ...f, order: (idx + 1) * 1000 });
    });
  }

  // In Raindrop, manual order is retrieved via sort=-sort which returns items
  // top-to-bottom in array order. Establish a reliable ascending order per collection
  // so Arcable's ascending sort (a.order - b.order) precisely mirrors Raindrop's visual display order.
  const itemOrderMap = new Map<number, number>();
  const collectionCounters = new Map<number, number>();

  for (const item of tree.items) {
    const collId = item.collectionId ?? 0;
    const nextOrder = (collectionCounters.get(collId) ?? 0) + 1000;
    collectionCounters.set(collId, nextOrder);
    itemOrderMap.set(item._id, nextOrder);
  }

  // Reconstruct widgets from Arcable root collection
  const widgetItems = tree.items.filter(
    (item) => item.collectionId === root._id && isWidgetItem(item)
  );
  let widgets: WorkspaceWidget[] = widgetItems.map((item) => {
    let parsedExcerpt: any = {};
    try {
      if (item.excerpt) parsedExcerpt = JSON.parse(item.excerpt);
    } catch {}
    const widgetId =
      parsedExcerpt.id ||
      (item.link?.startsWith(ARCABLE_WIDGET_LINK_PREFIX)
        ? item.link.slice(ARCABLE_WIDGET_LINK_PREFIX.length)
        : String(item._id));
    return {
      id: widgetId,
      raindropId: item._id,
      style: parsedExcerpt.style || 'combo',
      size: parsedExcerpt.size || 'small',
      config: parsedExcerpt.config || {},
      order: itemOrderMap.get(item._id) ?? (item.order ?? 0),
      createdAt: timestamp(item.created),
      updatedAt: timestamp(item.lastUpdate),
    };
  }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (allowLegacyMetadataFallback && widgets.length === 0 && tree.metadata.widgets?.length) {
    widgets = tree.metadata.widgets;
  }

  // Reconstruct custom code rules from _custom_css
  const customCssItems = customCssCollection
    ? tree.items.filter((item) => item.collectionId === customCssCollection._id || isCustomCssItem(item, customCssCollection._id))
    : tree.items.filter((item) => isCustomCssItem(item));
  let customCodeRules: CustomCodeRule[] = customCssItems.map((item) => {
    let parsedExcerpt: any = {};
    try {
      if (item.excerpt) parsedExcerpt = JSON.parse(item.excerpt);
    } catch {}

    let parsedNote: any = {};
    if (typeof item.note === 'string' && item.note.trim().startsWith('{')) {
      try {
        parsedNote = JSON.parse(item.note.trim());
      } catch {}
    }

    const ruleId =
      parsedExcerpt.id ||
      (item.link?.startsWith(ARCABLE_CUSTOM_CSS_LINK_PREFIX)
        ? item.link.slice(ARCABLE_CUSTOM_CSS_LINK_PREFIX.length)
        : String(item._id));

    let css = '';
    if (typeof parsedExcerpt.css_b64 === 'string' && parsedExcerpt.css_b64) {
      css = decodeSafePayload(parsedExcerpt.css_b64);
    } else if (typeof parsedNote.css_b64 === 'string' && parsedNote.css_b64) {
      css = decodeSafePayload(parsedNote.css_b64);
    } else if (typeof parsedExcerpt.css === 'string') {
      css = parsedExcerpt.css;
    }

    let js = '';
    if (typeof parsedExcerpt.js_b64 === 'string' && parsedExcerpt.js_b64) {
      js = decodeSafePayload(parsedExcerpt.js_b64);
    } else if (typeof parsedNote.js_b64 === 'string' && parsedNote.js_b64) {
      js = decodeSafePayload(parsedNote.js_b64);
    } else if (typeof parsedExcerpt.js === 'string') {
      js = parsedExcerpt.js;
    }

    return {
      id: ruleId,
      raindropId: item._id,
      pattern: parsedExcerpt.pattern || item.title || '',
      css,
      js,
      disabled: Boolean(parsedExcerpt.disabled),
      createdAt: parsedExcerpt.createdAt || item.created,
      updatedAt: parsedExcerpt.updatedAt || item.lastUpdate,
    };
  });

  if (allowLegacyMetadataFallback && customCodeRules.length === 0 && tree.metadata.customCodeRules?.length) {
    customCodeRules = tree.metadata.customCodeRules;
  }
  customCodeRules = sortCustomCodeRules(customCodeRules);

  // Reconstruct run code rules from _run_code
  const runCodeItems = runCodeCollection
    ? tree.items.filter((item) => item.collectionId === runCodeCollection._id || isRunCodeItem(item, runCodeCollection._id))
    : tree.items.filter((item) => isRunCodeItem(item));
  let runCodeInPageRules: RunCodeRule[] = runCodeItems.map((item) => {
    let parsedExcerpt: any = {};
    try {
      if (item.excerpt) parsedExcerpt = JSON.parse(item.excerpt);
    } catch {}
    const ruleId =
      parsedExcerpt.id ||
      (item.link?.startsWith(ARCABLE_RUN_CODE_LINK_PREFIX)
        ? item.link.slice(ARCABLE_RUN_CODE_LINK_PREFIX.length)
        : String(item._id));

    let code = '';
    if (typeof parsedExcerpt.code_b64 === 'string' && parsedExcerpt.code_b64) {
      code = decodeSafePayload(parsedExcerpt.code_b64);
    } else if (typeof item.note === 'string' && item.note.trim()) {
      try {
        code = decodeSafePayload(item.note.trim());
      } catch {
        code = typeof parsedExcerpt.code === 'string' ? parsedExcerpt.code : '';
      }
    } else if (typeof parsedExcerpt.code === 'string') {
      code = parsedExcerpt.code;
    }

    return {
      id: ruleId,
      raindropId: item._id,
      title: parsedExcerpt.title || item.title || '',
      patterns: parsedExcerpt.patterns || [],
      code,
      disabled: Boolean(parsedExcerpt.disabled),
      createdAt: parsedExcerpt.createdAt || item.created,
      updatedAt: parsedExcerpt.updatedAt || item.lastUpdate,
    };
  });

  if (allowLegacyMetadataFallback && runCodeInPageRules.length === 0 && tree.metadata.runCodeInPageRules?.length) {
    runCodeInPageRules = tree.metadata.runCodeInPageRules;
  }
  runCodeInPageRules = sortRunCodeRules(runCodeInPageRules);

  // Identify placeholder / internal item IDs to exclude from tabs
  const nonTabItemIds = new Set<number>([
    ...widgetItems.map((w) => w._id),
    ...customCssItems.map((c) => c._id),
    ...runCodeItems.map((r) => r._id),
  ]);

  const rawTabItems = tree.items.filter(
    (item) => !isArcableInternalItem(item) && !nonTabItemIds.has(item._id) && !isWidgetItem(item)
  );

  // Group URL variants by title delimiter: "<name> ||| <variant name>"
  const variantItemsByBaseTitle = new Map<string, RaindropBookmarkItem[]>();
  const baseTabItems: RaindropBookmarkItem[] = [];

  for (const item of rawTabItems) {
    const title = item.title || '';
    const delimiterIndex = title.indexOf(ARCABLE_VARIANT_DELIMITER);
    if (delimiterIndex !== -1) {
      const baseTitle = title.slice(0, delimiterIndex).trim();
      const groupKey = `${item.collectionId || 0}:::${baseTitle}`;
      const group = variantItemsByBaseTitle.get(groupKey) || [];
      group.push(item);
      variantItemsByBaseTitle.set(groupKey, group);
    } else {
      baseTabItems.push(item);
    }
  }

  const tabs: Tab[] = [];
  const processedVariantGroupKeys = new Set<string>();

  for (const item of baseTabItems) {
    const collectionId = item.collectionId;
    const favourite = collectionId === root._id;
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

    const groupKey = `${collectionId || 0}:::${(item.title || '').trim()}`;
    const variantItems = variantItemsByBaseTitle.get(groupKey);
    let urlVariants: TabUrlVariant[] | undefined;
    let defaultVariantId: string | undefined;

    if (variantItems && variantItems.length > 0) {
      processedVariantGroupKeys.add(groupKey);
      const defaultId = String(item._id);
      variantItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a._id - b._id);
      urlVariants = [
        { id: defaultId, name: item.title || 'Default', url: item.link },
        ...variantItems.map((v) => {
          const delimIdx = (v.title || '').indexOf(ARCABLE_VARIANT_DELIMITER);
          const variantName = delimIdx !== -1 ? v.title.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim() : 'Variant';
          return { id: String(v._id), name: variantName, url: v.link };
        }),
      ];
      defaultVariantId = defaultId;
    }

    tabs.push({
      id: String(item._id),
      raindropId: item._id,
      url: item.link,
      urlVariants,
      defaultVariantId,
      pinned: false,
      favourite: favourite || undefined,
      customTitle: item.title,
      favIconUrl: item.cover,
      parentFolderId,
      parentSpaceId,
      order: itemOrderMap.get(item._id) ?? (item.order ?? 0),
      createdAt: timestamp(item.created),
      updatedAt: timestamp(item.lastUpdate),
    });
  }

  // Handle any orphan variant items whose base title had no standalone item
  for (const [groupKey, variantItems] of variantItemsByBaseTitle) {
    if (processedVariantGroupKeys.has(groupKey) || variantItems.length === 0) continue;
    const first = variantItems[0];
    const collectionId = first.collectionId;
    const favourite = collectionId === root._id;
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
    const baseTitle = groupKey.split(':::')[1] || first.title;
    variantItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a._id - b._id);
    const urlVariants: TabUrlVariant[] = variantItems.map((v) => {
      const delimIdx = (v.title || '').indexOf(ARCABLE_VARIANT_DELIMITER);
      const variantName = delimIdx !== -1 ? v.title.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim() : 'Variant';
      return { id: String(v._id), name: variantName, url: v.link };
    });
    tabs.push({
      id: String(first._id),
      raindropId: first._id,
      url: first.link,
      urlVariants,
      defaultVariantId: String(first._id),
      pinned: false,
      favourite: favourite || undefined,
      customTitle: baseTitle,
      favIconUrl: first.cover,
      parentFolderId,
      parentSpaceId,
      order: itemOrderMap.get(first._id) ?? (first.order ?? 0),
      createdAt: timestamp(first.created),
      updatedAt: timestamp(first.lastUpdate),
    });
  }

  tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const activeSpaceStillExists = Boolean(targetActiveSpaceId && spaces.some((s) => s.id === targetActiveSpaceId));
  const activeSpaceId = activeSpaceStillExists
    ? targetActiveSpaceId!
    : (spaces[0]?.id || '');

  return {
    raindropRootCollectionId: root._id,
    raindropMetadataItemId: tree.metadataItemId ?? null,
    version: 1,
    activeSpaceId,
    spaces,
    folders,
    tabs,
    tmpTabs: [],
    widgets,
    customCodeRules,
    runCodeInPageRules,
  };
}

/** Always rebuilds Arcable's local cache from the live Raindrop tree without mutating Raindrop. */
export async function fetchRaindropWorkspace(
  token: string,
  targetActiveSpaceId?: string
): Promise<{ success: boolean; data?: ArcableWorkspaceData; error?: string; errorDetails?: RaindropRequestFailureDetails }> {
  const clean = cleanRaindropToken(token);
  if (!clean) return { success: false, error: 'Raindrop authorization token is missing or invalid.' };
  try {
    const tree = await fetchRemoteArcableTree(clean);
    return { success: true, data: reconstructWorkspace(tree, targetActiveSpaceId) };
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
            latestSnapshot: reconstructWorkspace(tree, syncLocalState?.activeSpaceId, {
              allowLegacyMetadataFallback: !syncLocalState?.raindropRootCollectionId,
            }),
            syncedAt: Date.now(),
          };
        }
      }
      authoritativeTree = tree;
    }

    if (needsIncrementalIdentityRebase(syncLocalState, options?.pendingOps, options?.replaceBaseline)) {
      authoritativeTree = await fetchRemoteArcableTree(clean);
      const authoritativeSnapshot = reconstructWorkspace(authoritativeTree, syncLocalState?.activeSpaceId, {
        allowLegacyMetadataFallback: !syncLocalState?.raindropRootCollectionId,
      });
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
    if (!root?._id) throw new Error(`Failed to create root "${ARCABLE_COLLECTION_NAME}" collection in Raindrop.`);

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
        const targetOrder = entry.kind === 'space'
          ? calculateSpaceTargetOrder(entry.entity as Space, localState.spaces || [])
          : calculateFolderTargetOrder(entry.entity as Folder, localState.folders || []);
        const orderChanged = existing !== undefined && (existing.sort !== targetOrder && existing.order !== targetOrder);
        const shouldUpdate = Boolean(existing) && (changedIds.has(id) || orderChanged || (entry.entity.updatedAt || 0) > timestamp(existing?.lastUpdate));
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
            sort: targetOrder,
            order: targetOrder,
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
              sort: targetOrder,
              order: targetOrder,
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
      // Also delete any secondary variants belonging to this deleted item
      const prefix = `${item.title}${ARCABLE_VARIANT_DELIMITER}`;
      for (const candidate of tree.items) {
        if (candidate.collectionId === item.collectionId && candidate.title?.startsWith(prefix)) {
          ids.push(candidate._id);
        }
      }
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

    // Widgets, custom code rules, and run code rules live outside the space/folder
    // collection tree and their bookmark items don't carry an arcableId in `note`
    // (they encode their local id in `excerpt`/`link` instead), so they can't be
    // resolved via remoteItemByArcableId like tabs above. Their WIDGET_DELETE /
    // CUSTOM_CODE_DELETE / RUN_CODE_DELETE operations carry the raindropId
    // directly in the payload - use that to delete them explicitly, otherwise
    // they're silently skipped and resurrect on the next sync.
    for (const op of pendingOps) {
      if (op.type !== 'WIDGET_DELETE' && op.type !== 'CUSTOM_CODE_DELETE' && op.type !== 'RUN_CODE_DELETE') continue;
      const remoteId = Number(op.payload?.raindropId) || numericRaindropId(op.entityId);
      if (remoteId && remoteItems.has(remoteId)) await deleteRaindropBookmark(clean, remoteId);
    }

    // Find or create special collections for Custom CSS and Run Code
    let customCssColl = tree.collections.find(
      (c) => c.parent?.$id === root._id && c.title.trim().toLowerCase() === ARCABLE_CUSTOM_CSS_COLLECTION_NAME.toLowerCase()
    );
    if (!customCssColl && (localState.customCodeRules || []).length > 0) {
      customCssColl = await createRaindropCollection(clean, ARCABLE_CUSTOM_CSS_COLLECTION_NAME, root._id);
      tree.collections.push(customCssColl);
      remoteCollections.set(customCssColl._id, customCssColl);
    }

    let runCodeColl = tree.collections.find(
      (c) => c.parent?.$id === root._id && c.title.trim().toLowerCase() === ARCABLE_RUN_CODE_COLLECTION_NAME.toLowerCase()
    );
    if (!runCodeColl && (localState.runCodeInPageRules || []).length > 0) {
      runCodeColl = await createRaindropCollection(clean, ARCABLE_RUN_CODE_COLLECTION_NAME, root._id);
      tree.collections.push(runCodeColl);
      remoteCollections.set(runCodeColl._id, runCodeColl);
    }

    const bookmarksToCreate = [] as Parameters<typeof createRaindropBookmarks>[1];
    const tabUpdatesToPerform: Array<{
      remoteId: number;
      payload: Record<string, unknown>;
      targetOrder: number;
    }> = [];

    const extraVariantsToDelete: RaindropBookmarkItem[] = [];

    // Sync tabs
    for (const tab of localState.tabs || []) {
      if (deletedIds.has(tab.id)) continue;
      const remoteId = remoteEntityId(tab);
      const existing = remoteId ? remoteItems.get(remoteId) : undefined;
      if (remoteId && !existing && !changedIds.has(tab.id)) continue;
      const parentId = tab.favourite ? root._id : localCollectionToRemote.get(tab.parentFolderId || tab.parentSpaceId || '');
      if (!parentId) continue;
      const targetOrder = calculateTabTargetOrder(tab, localState.tabs || [], localState.widgets || []);
      const payload = {
        title: tab.customTitle || tab.url,
        link: tab.url,
        cover: tab.favIconUrl,
        note: '',
        collection: { $id: parentId },
        order: targetOrder,
        sort: targetOrder,
      };
      const orderChanged = existing !== undefined && (existing.sort !== targetOrder && existing.order !== targetOrder);
      const shouldUpdate = Boolean(existing) && (changedIds.has(tab.id) || orderChanged || (tab.updatedAt || 0) > timestamp(existing?.lastUpdate));

      const secondaryVariants = getTabSecondaryVariants(tab);

      if (!existing) {
        bookmarksToCreate.push({
          title: payload.title,
          link: payload.link,
          cover: payload.cover,
          note: '',
          collectionId: parentId,
          order: targetOrder,
          sort: targetOrder,
          pleaseParse: { disabled: true },
        });
        // Extra URL variants
        secondaryVariants.forEach((variant, vIdx) => {
          const variantOrder = targetOrder + 1 + vIdx;
          bookmarksToCreate.push({
            title: `${payload.title}${ARCABLE_VARIANT_DELIMITER}${variant.name}`,
            link: variant.url,
            cover: payload.cover,
            note: '',
            collectionId: parentId,
            order: variantOrder,
            sort: variantOrder,
            pleaseParse: { disabled: true },
          });
        });
      } else {
        if (shouldUpdate) {
          tabUpdatesToPerform.push({ remoteId: existing._id, payload, targetOrder });
        }

        // Reconcile secondary variants for existing tab
        const existingRemoteVariants = tree.items.filter((item) => {
          if (item._id === existing._id) return false;
          const matchesCollection = item.collectionId === existing.collectionId || item.collectionId === parentId;
          if (!matchesCollection) return false;
          const hasVariantId = secondaryVariants.some((v) => String(item._id) === v.id);
          const hasOldTitlePrefix = existing.title ? item.title?.startsWith(`${existing.title}${ARCABLE_VARIANT_DELIMITER}`) : false;
          const hasNewTitlePrefix = payload.title ? item.title?.startsWith(`${payload.title}${ARCABLE_VARIANT_DELIMITER}`) : false;
          return hasVariantId || hasOldTitlePrefix || hasNewTitlePrefix;
        });

        secondaryVariants.forEach((variant, vIdx) => {
          const variantOrder = targetOrder + 1 + vIdx;
          const expectedTitle = `${payload.title}${ARCABLE_VARIANT_DELIMITER}${variant.name}`;
          const matchIdx = existingRemoteVariants.findIndex((rv) => {
            if (String(rv._id) === variant.id) return true;
            const delimIdx = (rv.title || '').indexOf(ARCABLE_VARIANT_DELIMITER);
            const rvName = delimIdx !== -1 ? rv.title.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim() : '';
            return rvName === variant.name;
          });

          if (matchIdx >= 0) {
            const matchedItem = existingRemoteVariants.splice(matchIdx, 1)[0];
            const variantOrderChanged = matchedItem.sort !== variantOrder && matchedItem.order !== variantOrder;
            const variantChanged =
              matchedItem.title !== expectedTitle ||
              matchedItem.link !== variant.url ||
              matchedItem.collectionId !== parentId ||
              matchedItem.cover !== payload.cover ||
              variantOrderChanged;
            if (variantChanged || shouldUpdate) {
              tabUpdatesToPerform.push({
                remoteId: matchedItem._id,
                payload: {
                  title: expectedTitle,
                  link: variant.url,
                  cover: payload.cover,
                  collection: { $id: parentId },
                  order: variantOrder,
                  sort: variantOrder,
                },
                targetOrder: variantOrder,
              });
            }
          } else {
            bookmarksToCreate.push({
              title: expectedTitle,
              link: variant.url,
              cover: payload.cover,
              note: '',
              collectionId: parentId,
              order: variantOrder,
              sort: variantOrder,
              pleaseParse: { disabled: true },
            });
          }
        });

        // Any leftover remote variants for this tab were removed locally
        for (const orphan of existingRemoteVariants) {
          extraVariantsToDelete.push(orphan);
        }
      }
    }

    tabUpdatesToPerform.sort((a, b) => a.targetOrder - b.targetOrder);
    for (const { remoteId, payload } of tabUpdatesToPerform) {
      await updateRaindropItem(clean, remoteId, payload);
    }

    if (extraVariantsToDelete.length > 0) {
      const extraDeletesByColl = new Map<number, number[]>();
      for (const orphan of extraVariantsToDelete) {
        const collId = orphan.collectionId || root._id;
        const ids = extraDeletesByColl.get(collId) || [];
        ids.push(orphan._id);
        extraDeletesByColl.set(collId, ids);
      }
      for (const [collId, ids] of extraDeletesByColl) {
        for (let start = 0; start < ids.length; start += 100) {
          await deleteRaindropBookmarks(clean, collId, ids.slice(start, start + 100));
        }
      }
    }

    // Sync Widgets directly to Arcable root collection
    for (const widget of localState.widgets || []) {
      if (deletedIds.has(widget.id)) continue;
      const remoteId = widget.raindropId || numericRaindropId(widget.id);
      const existing = remoteId ? remoteItems.get(remoteId) : undefined;
      const targetOrder = calculateWidgetTargetOrder(widget, localState.tabs || [], localState.widgets || []);
      const input = widgetToRaindropItemInput(widget, root._id, targetOrder);
      if (!existing) {
        bookmarksToCreate.push(input);
      } else {
        const orderChanged = existing.sort !== targetOrder && existing.order !== targetOrder;
        const shouldUpdate = changedIds.has(widget.id) || orderChanged || (widget.updatedAt || 0) > timestamp(existing.lastUpdate);
        if (shouldUpdate) {
          await updateRaindropItem(clean, existing._id, {
            title: input.title,
            excerpt: input.excerpt,
            order: targetOrder,
            sort: targetOrder,
          });
        }
      }
    }

    // Sync Custom CSS rules to _custom_css collection
    if (customCssColl) {
      for (const rule of localState.customCodeRules || []) {
        if (deletedIds.has(rule.id)) continue;
        const remoteId = rule.raindropId || numericRaindropId(rule.id);
        const existing = remoteId ? remoteItems.get(remoteId) : undefined;
        const input = customCodeToRaindropItemInput(rule, customCssColl._id);
        if (!existing) {
          bookmarksToCreate.push(input);
        } else {
          await updateRaindropItem(clean, existing._id, {
            title: input.title,
            excerpt: input.excerpt,
            note: input.note,
          });
        }
      }
    }

    // Sync Run Code rules to _run_code collection
    if (runCodeColl) {
      for (const rule of localState.runCodeInPageRules || []) {
        if (deletedIds.has(rule.id)) continue;
        const remoteId = rule.raindropId || numericRaindropId(rule.id);
        const existing = remoteId ? remoteItems.get(remoteId) : undefined;
        const input = runCodeToRaindropItemInput(rule, runCodeColl._id);
        if (!existing) {
          bookmarksToCreate.push(input);
        } else {
          await updateRaindropItem(clean, existing._id, {
            title: input.title,
            excerpt: input.excerpt,
            note: input.note,
          });
        }
      }
    }

    // Create all new bookmark items in batches of 100
    for (let start = 0; start < bookmarksToCreate.length; start += 100) {
      await createRaindropBookmarks(clean, bookmarksToCreate.slice(start, start + 100));
    }

    // Clean up legacy data.json.txt if present (it is retired)
    const oldMetadata = tree.items.filter((item) =>
      (item.file?.name || item.title || '').trim().toLowerCase() === ARCABLE_DATA_FILE_NAME.toLowerCase()
    );
    for (let start = 0; start < oldMetadata.length; start += 100) {
      await deleteRaindropBookmarks(clean, root._id, oldMetadata.slice(start, start + 100).map((item) => item._id));
    }

    // Clean up legacy note metadata on existing bookmarks
    const bookmarksWithLegacyNotes = tree.items.filter((item) =>
      !isArcableInternalItem(item) &&
      !isWidgetItem(item) &&
      !isCustomCssItem(item) &&
      !isRunCodeItem(item) &&
      Boolean(item.note && (item.note.includes(ARCABLE_NOTE_MARKER) || item.note.includes('"schema"')))
    );
    for (const item of bookmarksWithLegacyNotes) {
      await updateRaindropItem(clean, item._id, { note: '' });
    }

    tree = await fetchRemoteArcableTree(clean);
    const latestSnapshot = reconstructWorkspace(tree, localState.activeSpaceId);

    return {
      success: true,
      collectionId: root._id,
      dataItemId: undefined,
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
      throw new Error(`Failed to find or create root "${ARCABLE_COLLECTION_NAME}" collection in Raindrop.`);
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
      throw new Error(`Failed to find or create root "${ARCABLE_COLLECTION_NAME}" collection in Raindrop.`);
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
      throw new Error(`Failed to find or create root "${ARCABLE_COLLECTION_NAME}" collection in Raindrop.`);
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
