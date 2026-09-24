import type { TmpTab } from '../types/workspace';
import type { RaindropBookmarkItem, RaindropCollectionItem } from '../types/raindrop';
import {
  cleanRaindropToken,
  createRaindropCollection,
  deleteRaindropBookmark,
  fetchAllRaindropItems,
  fetchRaindropCollections,
  fetchRaindropFileContent,
  uploadRaindropFile,
  RAINDROP_API_BASE,
} from './raindropClient';
import { getOrCreateArcableCollection } from './raindropSync';

export const RAINDROP_TMP_TABS_COLLECTION_NAME = '_tmp_tabs';
export const RAINDROP_TMP_TABS_COLLECTION_COLOR = 'red';
export const RAINDROP_TMP_TABS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TMP_TABS_VERSION = 1;
const FILE_PREFIX = 'tmp-tabs-v1-';
const FILE_SUFFIX = '.json.txt';

/** Browser-local IDs are deliberately omitted from the remote copy. */
export type RaindropSyncedTmpTab = Pick<
  TmpTab,
  'id' | 'url' | 'title' | 'customTitle' | 'favIconUrl' | 'spaceId' | 'createdAt' | 'updatedAt'
>;

export interface RaindropTmpTabsSnapshot {
  version: 1;
  deviceId: string;
  deviceName: string;
  deviceType: 'Web App' | 'Ext';
  updatedAt: number;
  tabs: RaindropSyncedTmpTab[];
}

export interface PublishRaindropTmpTabsInput {
  deviceId: string;
  deviceName: string;
  deviceType: 'Web App' | 'Ext';
  tabs: TmpTab[];
}

function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function fileNameForDevice(deviceId: string): string {
  return `${FILE_PREFIX}${deviceId}${FILE_SUFFIX}`;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Filters private browser metadata and URLs that cannot open on another device. */
export function sanitizeRaindropTmpTabs(tabs: TmpTab[]): RaindropSyncedTmpTab[] {
  if (!Array.isArray(tabs)) return [];
  return tabs.filter((tab) => tab && typeof tab.id === 'string' && isHttpUrl(tab.url)).map((tab) => ({
    id: tab.id,
    url: tab.url,
    ...(typeof tab.title === 'string' ? { title: tab.title } : {}),
    ...(typeof tab.customTitle === 'string' ? { customTitle: tab.customTitle } : {}),
    ...(isHttpUrl(tab.favIconUrl) ? { favIconUrl: tab.favIconUrl } : {}),
    ...(typeof tab.spaceId === 'string' ? { spaceId: tab.spaceId } : {}),
    ...(Number.isFinite(tab.createdAt) ? { createdAt: tab.createdAt } : {}),
    ...(Number.isFinite(tab.updatedAt) ? { updatedAt: tab.updatedAt } : {}),
  }));
}

export function parseRaindropTmpTabsSnapshot(value: unknown, now: number = Date.now()): RaindropTmpTabsSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<RaindropTmpTabsSnapshot>;
  if (data.version !== TMP_TABS_VERSION || !validDeviceId(data.deviceId) ||
      typeof data.deviceName !== 'string' ||
      (data.deviceType !== 'Web App' && data.deviceType !== 'Ext') ||
      typeof data.updatedAt !== 'number' || !Number.isFinite(data.updatedAt) ||
      data.updatedAt > now + 5 * 60 * 1000 || now - data.updatedAt > RAINDROP_TMP_TABS_TTL_MS ||
      !Array.isArray(data.tabs)) return null;
  return {
    version: TMP_TABS_VERSION,
    deviceId: data.deviceId,
    deviceName: data.deviceName,
    deviceType: data.deviceType,
    updatedAt: data.updatedAt,
    tabs: sanitizeRaindropTmpTabs(data.tabs as TmpTab[]),
  };
}

async function findTmpTabsCollections(token: string, rootId: number): Promise<RaindropCollectionItem[]> {
  const collections = await fetchRaindropCollections(token);
  return collections.filter((item) => item.parent?.$id === rootId &&
    item.title.trim().toLowerCase() === RAINDROP_TMP_TABS_COLLECTION_NAME)
    .sort((a, b) => a._id - b._id);
}

function isDeviceFile(item: RaindropBookmarkItem, fileName: string): boolean {
  return item.file?.name === fileName || item.title === fileName;
}

function isRaindropFileUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === 'api.raindrop.io' ||
      url.hostname === 'up.raindrop.io' ||
      url.hostname === 's3.amazonaws.com'
    );
  } catch {
    return false;
  }
}

/** Publishes an authoritative snapshot, including an empty array when all tabs close. */
export async function publishRaindropTmpTabs(
  token: string,
  input: PublishRaindropTmpTabsInput
): Promise<{ success: boolean; snapshot?: RaindropTmpTabsSnapshot; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) return { success: false, error: 'Raindrop authorization token is missing or invalid.' };
  if (!validDeviceId(input.deviceId) || !Array.isArray(input.tabs) ||
      typeof input.deviceName !== 'string' ||
      (input.deviceType !== 'Web App' && input.deviceType !== 'Ext')) {
    return { success: false, error: 'Invalid temporary tab snapshot input.' };
  }

  try {
    const root = await getOrCreateArcableCollection(clean);
    const collection = (await findTmpTabsCollections(clean, root._id))[0] ||
      await createRaindropCollection(clean, RAINDROP_TMP_TABS_COLLECTION_NAME, root._id, {
        color: RAINDROP_TMP_TABS_COLLECTION_COLOR,
      });
    const fileName = fileNameForDevice(input.deviceId);
    const previous = (await fetchAllRaindropItems(clean, collection._id))
      .filter((item) => isDeviceFile(item, fileName));
    const snapshot: RaindropTmpTabsSnapshot = {
      version: TMP_TABS_VERSION,
      deviceId: input.deviceId,
      deviceName: input.deviceName.trim() || 'Unknown Device',
      deviceType: input.deviceType,
      updatedAt: Date.now(),
      tabs: sanitizeRaindropTmpTabs(input.tabs),
    };
    const uploaded = await uploadRaindropFile(clean, collection._id, fileName, JSON.stringify(snapshot));
    const uploadedId = uploaded?.item?._id;
    if (!uploadedId) throw new Error('Raindrop did not confirm the temporary tab snapshot upload.');
    for (const item of previous) {
      if (item._id !== uploadedId) {
        const deleted = await deleteRaindropBookmark(clean, item._id);
        if (!deleted) console.warn('[TmpTabSync] Could not remove an older snapshot for this device.');
      }
    }
    return { success: true, snapshot };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to publish temporary tabs.' };
  }
}

/** Returns the newest valid snapshot per device. Stale files stay untouched in Raindrop. */
export async function fetchRaindropTmpTabs(
  token: string
): Promise<{ success: boolean; snapshots: RaindropTmpTabsSnapshot[]; error?: string }> {
  const clean = cleanRaindropToken(token);
  if (!clean) return { success: false, snapshots: [], error: 'Raindrop authorization token is missing or invalid.' };
  try {
    const root = await getOrCreateArcableCollection(clean);
    const collections = await findTmpTabsCollections(clean, root._id);
    if (collections.length === 0) return { success: true, snapshots: [] };
    const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const items = (await Promise.all(collections.map((collection) =>
      fetchAllRaindropItems(clean, collection._id, { cacheBust })
    ))).flat().filter((item) => {
      const name = item.file?.name || item.title;
      return typeof name === 'string' && /^tmp-tabs-v1-[a-z0-9_-]+\.json\.txt$/i.test(name);
    });
    const byDevice = new Map<string, RaindropTmpTabsSnapshot>();
    for (const item of items) {
      const urls = [
        `${RAINDROP_API_BASE}/raindrop/${item._id}/file`,
        ...(isRaindropFileUrl(item.file?.path) ? [item.file.path] : []),
        ...(isRaindropFileUrl(item.link) ? [item.link] : []),
      ];
      for (const url of urls) {
        try {
          const raw = await fetchRaindropFileContent(clean, url);
          const snapshot = parseRaindropTmpTabsSnapshot(JSON.parse(raw));
          if (!snapshot || !isDeviceFile(item, fileNameForDevice(snapshot.deviceId))) continue;
          const previous = byDevice.get(snapshot.deviceId);
          if (!previous || snapshot.updatedAt > previous.updatedAt) byDevice.set(snapshot.deviceId, snapshot);
          break;
        } catch {
          // A malformed or temporarily unavailable URL does not hide other devices.
        }
      }
    }
    return { success: true, snapshots: [...byDevice.values()].sort((a, b) => b.updatedAt - a.updatedAt) };
  } catch (error) {
    return { success: false, snapshots: [], error: error instanceof Error ? error.message : 'Failed to fetch temporary tabs.' };
  }
}
