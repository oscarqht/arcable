import { ArcableWorkspaceData, Folder, Space, SpaceScheme, ZenThemeConfig, Tab, TabUrlVariant, WorkspaceWidget, VIRTUAL_SYNCED_TABS_SPACE_ID } from '../types/workspace';
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
  uploadRaindropFile,
  fetchRaindropFileContent,
  updateRaindropItem,
  updateRaindropCollection,
  fetchAllRaindropItems,
  searchRaindropCollectionCover,
  cleanRaindropToken,
  getRaindropRequestFailureDetails,
  RAINDROP_API_BASE,
  encodeRaindropTitle,
  decodeRaindropTitle,
} from './raindropClient';
export { encodeRaindropTitle, decodeRaindropTitle } from './raindropClient';
import { ARCABLE_VERSION } from '../version';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  compactSyncFile,
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
export const ARCABLE_CUSTOM_CSS_COLLECTION_NAME = '_custom_css';
export const ARCABLE_RUN_CODE_COLLECTION_NAME = '_run_code';
export const ARCABLE_SPACE_THEME_COLLECTION_NAME = '_space_themes';
export const ARCABLE_WIDGET_TAG = 'arcable-widget';
export const ARCABLE_SPACE_THEME_TAG = 'arcable-space-theme';
export const ARCABLE_WIDGET_LINK_PREFIX = 'https://arcable.app/widget/';
export const ARCABLE_CUSTOM_CSS_LINK_PREFIX = 'https://arcable.app/custom-css/';
export const ARCABLE_RUN_CODE_LINK_PREFIX = 'https://arcable.app/run-code/';
export const ARCABLE_SPACE_THEME_LINK_PREFIX = 'https://arcable.app/space-theme/';
export const ARCABLE_VARIANT_DELIMITER = ' ||| ';
export const ARCABLE_GROUP_META_START = '<!--arcable-group:';
export const ARCABLE_GROUP_META_END = '-->';

export interface GroupVariantMeta {
  variants?: Array<{ id?: string; url?: string; name?: string }>;
  defaultVariantId?: string;
  firstName?: string;
}

export function serializeGroupMeta(tab: Tab): string {
  if (!tab.urlVariants || tab.urlVariants.length <= 1) return '';
  const defaultVar =
    (tab.defaultVariantId && tab.urlVariants.find((v) => v.id === tab.defaultVariantId)) ||
    tab.urlVariants[0];
  const meta: GroupVariantMeta = {
    variants: tab.urlVariants.map((v) => ({ id: v.id, url: v.url, name: v.name })),
    defaultVariantId: tab.defaultVariantId || tab.urlVariants[0]?.id,
    firstName: defaultVar?.name || tab.urlVariants[0]?.name,
  };
  return `${ARCABLE_GROUP_META_START}${JSON.stringify(meta)}${ARCABLE_GROUP_META_END}`;
}

export function parseGroupMeta(note?: string): GroupVariantMeta | null {
  if (!note) return null;
  const start = note.indexOf(ARCABLE_GROUP_META_START);
  if (start === -1) return null;
  const contentStart = start + ARCABLE_GROUP_META_START.length;
  const end = note.indexOf(ARCABLE_GROUP_META_END, contentStart);
  if (end === -1) return null;
  try {
    return JSON.parse(note.slice(contentStart, end)) as GroupVariantMeta;
  } catch {
    return null;
  }
}

export function attachGroupMetaToNote(existingNote: string | undefined, tab: Tab): string {
  const metaStr = serializeGroupMeta(tab);
  if (!existingNote) return metaStr;
  const cleaned = existingNote.replace(/<!--arcable-group:[\s\S]*?-->/g, '').trim();
  if (!metaStr) return cleaned;
  return cleaned ? `${cleaned}\n${metaStr}` : metaStr;
}

/** Legacy canonical non-tree workspace metadata stored directly under the Arcable root. */
export const ARCABLE_DATA_FILE_NAME = 'data.json.txt';

export function isSystemCollection(collection: RaindropCollectionItem): boolean {
  const title = (collection.title || '').trim().toLowerCase();
  return (
    title === ARCABLE_CUSTOM_CSS_COLLECTION_NAME.toLowerCase() ||
    title === ARCABLE_RUN_CODE_COLLECTION_NAME.toLowerCase() ||
    title === ARCABLE_SPACE_THEME_COLLECTION_NAME.toLowerCase() ||
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

export function isSpaceThemeItem(item: RaindropBookmarkItem, spaceThemeCollectionId?: number): boolean {
  const link = (item.link || '').toLowerCase();
  return (
    (spaceThemeCollectionId !== undefined && item.collectionId === spaceThemeCollectionId) ||
    link.startsWith(ARCABLE_SPACE_THEME_LINK_PREFIX.toLowerCase()) ||
    Boolean(item.tags?.includes(ARCABLE_SPACE_THEME_TAG))
  );
}

/**
 * Finds the root collection named ARCABLE_COLLECTION_NAME ("Arcable v2"), or creates one if it does not exist.
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

  // Create new root collection
  const created = await createRaindropCollection(token, ARCABLE_COLLECTION_NAME);
  return created;
}

interface RemoteArcableTree {
  root?: RaindropCollectionItem;
  collections: RaindropCollectionItem[];
  items: RaindropBookmarkItem[];
}

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
  if (tab.pinned) {
    const siblings = allTabs
      .filter((t) => !t.favourite && t.pinned && t.parentSpaceId === tab.parentSpaceId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
    let slot = 0;
    for (const sibling of siblings) {
      if (sibling.id === tab.id) return slot;
      slot += getTabRaindropBookmarkCount(sibling);
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

export function spaceThemeToRaindropItemInput(
  space: Space,
  collectionId: number
): Parameters<typeof createRaindropBookmarks>[1][number] {
  return {
    title: `[Theme] ${space.name}`,
    link: `${ARCABLE_SPACE_THEME_LINK_PREFIX}${space.id}`,
    excerpt: JSON.stringify({
      spaceId: space.id,
      spaceRaindropId: space.raindropId,
      colors: space.colors,
      themeNoise: space.themeNoise,
      themeScheme: space.themeScheme,
      themeConfig: space.themeConfig,
    }),
    tags: [ARCABLE_SPACE_THEME_TAG],
    collectionId,
    pleaseParse: { disabled: true },
  };
}

export const INCREMENTAL_OPERATION_TYPES = new Set([
  'SPACE_UPDATE',
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
    if (operation.type === 'SPACE_UPDATE') {
      const space = localState.spaces.find((candidate) => candidate.id === operation.entityId);
      if (!space || !remoteEntityId(space)) return true;
    }
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
    operation.type.startsWith('RUN_CODE_') ||
    operation.type.startsWith('SPACE_')
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
            : operation.type.startsWith('SPACE_')
              ? 'space'
              : 'tab';
    const key = `${kind}:${operation.entityId}`;
    const entityOps = groups.get(key) || [];
    entityOps.push(operation);
    groups.set(key, entityOps);
  }

  let latestSnapshot: ArcableWorkspaceData = {
    ...localState,
    spaces: [...localState.spaces],
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
        const created = await createRaindropCollection(token, encodeRaindropTitle(folder.name), parentId, {
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
          title: encodeRaindropTitle(folder.name),
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

    const defaultVar =
      (tab.defaultVariantId && tab.urlVariants?.find((v) => v.id === tab.defaultVariantId)) ||
      tab.urlVariants?.[0];
    const isCreate = operations.some((operation) => operation.type === 'TAB_CREATE');
    const targetOrder = calculateTabTargetOrder(tab, latestSnapshot.tabs, latestSnapshot.widgets);
    const rawTitle = tab.customTitle || tab.url;
    const tabNote = attachGroupMetaToNote(tab.note, tab);
    const payload = {
      title: encodeRaindropTitle(rawTitle),
      link: defaultVar ? defaultVar.url : tab.url,
      cover: (defaultVar && defaultVar.favIconUrl) || tab.favIconUrl,
      note: tabNote,
      collection: { $id: parentId },
      order: targetOrder,
      sort: targetOrder,
    };
    const secondaryVariants = getTabSecondaryVariants(tab);
    if (isCreate) {
      tabCreates.push({
        entityId,
        input: {
          title: payload.title,
          link: payload.link,
          cover: payload.cover,
          note: tabNote,
          collectionId: parentId,
          order: targetOrder,
          sort: targetOrder,
        },
      });
      // Extra URL variants
      secondaryVariants.forEach((variant, vIdx) => {
        const variantOrder = targetOrder + 1 + vIdx;
        tabCreates.push({
          entityId: `${entityId}:::variant:::${variant.id}`,
          input: {
            title: `${payload.title}${ARCABLE_VARIANT_DELIMITER}${encodeRaindropTitle(variant.name)}`,
            link: variant.url,
            cover: variant.favIconUrl || payload.cover,
            note: '',
            collectionId: parentId,
            order: variantOrder,
            sort: variantOrder,
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
        const varTitle = `${payload.title}${ARCABLE_VARIANT_DELIMITER}${encodeRaindropTitle(variant.name)}`;
        if (varRemoteId) {
          tabUpdates.push({
            entityId: `${entityId}:::variant:::${variant.id}`,
            remoteId: varRemoteId,
            payload: {
              title: varTitle,
              link: variant.url,
              cover: variant.favIconUrl || payload.cover,
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
              cover: variant.favIconUrl || payload.cover,
              note: '',
              collectionId: parentId,
              order: variantOrder,
              sort: variantOrder,
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

    // Raindrop batch creation defaults new bookmarks to index 0 (top of collection).
    // Reposition created items that have a positive targetOrder so manual ordering is respected.
    const createdWithOrder = batch
      .map((entry, index) => ({
        createdId: createdItems[index]._id,
        targetOrder: entry.input.order !== undefined ? entry.input.order : entry.input.sort,
      }))
      .filter((entry): entry is { createdId: number; targetOrder: number } =>
        entry.targetOrder !== undefined && entry.targetOrder > 0
      )
      .sort((a, b) => a.targetOrder - b.targetOrder);

    for (const { createdId, targetOrder } of createdWithOrder) {
      await updateRaindropItem(token, createdId, { order: targetOrder, sort: targetOrder });
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

  const retainedRemoteIds = new Set<number>();
  for (const tab of latestSnapshot.tabs || []) {
    const rId = remoteEntityId(tab);
    if (rId) retainedRemoteIds.add(rId);
    if (tab.urlVariants) {
      for (const v of tab.urlVariants) {
        const vId = numericRaindropId(v.id);
        if (vId) retainedRemoteIds.add(vId);
      }
    }
  }

  for (const [key, operations] of groups) {
    if (!key.startsWith('tab:') || !operations.some((operation) => operation.type === 'TAB_DELETE')) continue;
    if (operations.some((operation) => operation.type === 'TAB_CREATE')) continue;
    const deleteOperation = [...operations].reverse().find((operation) => operation.type === 'TAB_DELETE')!;
    const remoteId = Number(deleteOperation.payload?.raindropId) || numericRaindropId(deleteOperation.entityId);
    if (!remoteId && (!Array.isArray(deleteOperation.payload?.variantRaindropIds) || deleteOperation.payload.variantRaindropIds.length === 0)) {
      continue;
    }
    const collectionId = Number(deleteOperation.payload?.collectionId);

    const deleteIds: number[] = [];
    if (remoteId && !retainedRemoteIds.has(remoteId)) deleteIds.push(remoteId);
    if (Array.isArray(deleteOperation.payload?.variantRaindropIds)) {
      for (const vid of deleteOperation.payload.variantRaindropIds) {
        const numId = numericRaindropId(vid);
        if (numId && !retainedRemoteIds.has(numId) && !deleteIds.includes(numId)) {
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

    // Raindrop batch creation defaults new bookmarks to index 0 (top of collection).
    // Reposition created widgets that have a positive targetOrder so manual ordering is respected.
    const widgetsWithOrder = batch
      .map((entry, index) => ({
        createdId: createdItems[index]._id,
        targetOrder: entry.input.order !== undefined ? entry.input.order : entry.input.sort,
      }))
      .filter((entry): entry is { createdId: number; targetOrder: number } => entry.targetOrder !== undefined && entry.targetOrder > 0)
      .sort((a, b) => a.targetOrder - b.targetOrder);

    for (const { createdId, targetOrder } of widgetsWithOrder) {
      await updateRaindropItem(token, createdId, { order: targetOrder, sort: targetOrder });
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
  const widgetDeleteIds = new Set<string>();
  for (const [key, operations] of groups) {
    if (!key.startsWith('widget:') || !operations.some((op) => op.type === 'WIDGET_DELETE')) continue;
    if (operations.some((op) => op.type === 'WIDGET_CREATE')) continue;
    const deleteOp = [...operations].reverse().find((op) => op.type === 'WIDGET_DELETE')!;
    widgetDeleteIds.add(deleteOp.entityId);
    const remoteId = Number(deleteOp.payload?.raindropId) || numericRaindropId(deleteOp.entityId);
    if (remoteId) await deleteRaindropBookmark(token, remoteId);
  }
  if (widgetDeleteIds.size > 0) {
    latestSnapshot = {
      ...latestSnapshot,
      widgets: (latestSnapshot.widgets || []).filter((w) => !widgetDeleteIds.has(w.id)),
    };
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

    const customCodeDeletes: Array<{ entityId: string; raindropId?: number }> = [];
    for (const [key, operations] of groups) {
      if (!key.startsWith('custom_code:') || !operations.some((op) => op.type === 'CUSTOM_CODE_DELETE')) continue;
      if (operations.some((op) => op.type === 'CUSTOM_CODE_CREATE')) continue;
      const deleteOp = [...operations].reverse().find((op) => op.type === 'CUSTOM_CODE_DELETE')!;
      const remoteId = Number(deleteOp.payload?.raindropId) || numericRaindropId(deleteOp.entityId);
      customCodeDeletes.push({ entityId: deleteOp.entityId, raindropId: remoteId });
    }
    const unresolvedCustomDeletes = customCodeDeletes.filter((d) => !d.raindropId);
    if (unresolvedCustomDeletes.length > 0) {
      const remoteBookmarks = await fetchAllRaindropItems(token, customCssCollId);
      for (const item of remoteBookmarks) {
        let ruleId = item.link?.startsWith(ARCABLE_CUSTOM_CSS_LINK_PREFIX)
          ? item.link.slice(ARCABLE_CUSTOM_CSS_LINK_PREFIX.length)
          : undefined;
        if (!ruleId && item.excerpt) {
          try {
            const parsed = JSON.parse(item.excerpt);
            if (parsed && typeof parsed.id === 'string') ruleId = parsed.id;
          } catch {}
        }
        if (ruleId) {
          const match = unresolvedCustomDeletes.find((d) => d.entityId === ruleId);
          if (match) match.raindropId = item._id;
        }
      }
    }
    for (const d of customCodeDeletes) {
      if (d.raindropId) await deleteRaindropBookmark(token, d.raindropId);
    }
    const deletedCustomCodeIds = new Set(customCodeDeletes.map((d) => d.entityId));
    if (deletedCustomCodeIds.size > 0) {
      latestSnapshot = {
        ...latestSnapshot,
        customCodeRules: (latestSnapshot.customCodeRules || []).filter((r) => !deletedCustomCodeIds.has(r.id)),
      };
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

    const runCodeDeletes: Array<{ entityId: string; raindropId?: number }> = [];
    for (const [key, operations] of groups) {
      if (!key.startsWith('run_code:') || !operations.some((op) => op.type === 'RUN_CODE_DELETE')) continue;
      if (operations.some((op) => op.type === 'RUN_CODE_CREATE')) continue;
      const deleteOp = [...operations].reverse().find((op) => op.type === 'RUN_CODE_DELETE')!;
      const remoteId = Number(deleteOp.payload?.raindropId) || numericRaindropId(deleteOp.entityId);
      runCodeDeletes.push({ entityId: deleteOp.entityId, raindropId: remoteId });
    }
    const unresolvedRunDeletes = runCodeDeletes.filter((d) => !d.raindropId);
    if (unresolvedRunDeletes.length > 0) {
      const remoteBookmarks = await fetchAllRaindropItems(token, runCodeCollId);
      for (const item of remoteBookmarks) {
        let ruleId = item.link?.startsWith(ARCABLE_RUN_CODE_LINK_PREFIX)
          ? item.link.slice(ARCABLE_RUN_CODE_LINK_PREFIX.length)
          : undefined;
        if (!ruleId && item.excerpt) {
          try {
            const parsed = JSON.parse(item.excerpt);
            if (parsed && typeof parsed.id === 'string') ruleId = parsed.id;
          } catch {}
        }
        if (ruleId) {
          const match = unresolvedRunDeletes.find((d) => d.entityId === ruleId);
          if (match) match.raindropId = item._id;
        }
      }
    }
    for (const d of runCodeDeletes) {
      if (d.raindropId) await deleteRaindropBookmark(token, d.raindropId);
    }
    const deletedRunCodeIds = new Set(runCodeDeletes.map((d) => d.entityId));
    if (deletedRunCodeIds.size > 0) {
      latestSnapshot = {
        ...latestSnapshot,
        runCodeInPageRules: (latestSnapshot.runCodeInPageRules || []).filter((r) => !deletedRunCodeIds.has(r.id)),
      };
    }
  }

  // Process Space operations
  const hasSpaceOps = [...groups.keys()].some((k) => k.startsWith('space:'));
  if (hasSpaceOps) {
    let spaceThemeCollId = latestSnapshot.raindropSpaceThemeCollectionId;
    const ensureSpaceThemeColl = async () => {
      if (spaceThemeCollId) return spaceThemeCollId;
      const allCollections = await fetchRaindropCollections(token);
      let spaceThemeColl = allCollections.find(
        (c) => c.parent?.$id === rootId && c.title.trim().toLowerCase() === ARCABLE_SPACE_THEME_COLLECTION_NAME.toLowerCase()
      );
      if (!spaceThemeColl) {
        spaceThemeColl = await createRaindropCollection(token, ARCABLE_SPACE_THEME_COLLECTION_NAME, rootId);
      }
      spaceThemeCollId = spaceThemeColl._id;
      latestSnapshot = {
        ...latestSnapshot,
        raindropSpaceThemeCollectionId: spaceThemeCollId,
      };
      return spaceThemeCollId;
    };

    for (const [key, operations] of groups) {
      if (!key.startsWith('space:')) continue;
      const entityId = operations[0].entityId;
      const space = latestSnapshot.spaces.find((s) => s.id === entityId);
      if (!space) continue;

      const hasCollectionChange = operations.some(
        (op) =>
          op.payload &&
          ('name' in op.payload || 'emojiIcon' in op.payload || 'coverUrl' in op.payload || 'order' in op.payload)
      );
      const hasThemeChange = operations.some(
        (op) =>
          op.payload &&
          ('colors' in op.payload || 'themeNoise' in op.payload)
      );

      // If name, icon, cover, or order changed, update Raindrop Space collection
      if (hasCollectionChange) {
        const remoteSpaceId = remoteEntityId(space);
        if (remoteSpaceId) {
          const targetOrder = calculateSpaceTargetOrder(space, latestSnapshot.spaces);
          const updated = await updateRaindropCollection(token, remoteSpaceId, {
            title: encodeRaindropTitle(space.name),
            cover: space.coverUrl ? [space.coverUrl] : (space.emojiIcon ? [space.emojiIcon] : []),
            sort: targetOrder,
            order: targetOrder,
          });
          if (!updated) throw new Error(`Failed to update Raindrop space ${remoteSpaceId}.`);
        }
      }

      const hasTheme = Boolean(space.colors) || Boolean(space.themeNoise);
      const shouldUpdateTheme = hasThemeChange || (hasCollectionChange && hasTheme);

      if (shouldUpdateTheme) {
        let themeUpdated = false;

        if (space.themeRaindropId) {
          if (hasTheme) {
            const input = spaceThemeToRaindropItemInput(space, spaceThemeCollId || 0);
            const res = await updateRaindropItem(token, space.themeRaindropId, {
              title: input.title,
              excerpt: input.excerpt,
              tags: input.tags,
            });
            if (res) {
              themeUpdated = true;
            }
          } else {
            // Theme was cleared
            await deleteRaindropBookmark(token, space.themeRaindropId);
            latestSnapshot = {
              ...latestSnapshot,
              spaces: latestSnapshot.spaces.map((s) =>
                s.id === space.id ? { ...s, themeRaindropId: undefined } : s
              ),
            };
            themeUpdated = true;
          }
        }

        if (!themeUpdated) {
          const collId = await ensureSpaceThemeColl();
          const existingThemeItems = await fetchAllRaindropItems(token, collId);
          const existing = existingThemeItems.find((item) => {
            if (item.link === `${ARCABLE_SPACE_THEME_LINK_PREFIX}${space.id}`) return true;
            try {
              if (item.excerpt) {
                const parsed = JSON.parse(item.excerpt);
                if (parsed.spaceId === space.id) return true;
                if (space.raindropId && parsed.spaceRaindropId === space.raindropId) return true;
              }
            } catch {}
            return false;
          });

          if (hasTheme) {
            const input = spaceThemeToRaindropItemInput(space, collId);
            if (existing) {
              await updateRaindropItem(token, existing._id, {
                title: input.title,
                excerpt: input.excerpt,
                tags: input.tags,
              });
              latestSnapshot = {
                ...latestSnapshot,
                spaces: latestSnapshot.spaces.map((s) =>
                  s.id === space.id ? { ...s, themeRaindropId: existing._id } : s
                ),
              };
            } else {
              const created = await createRaindropBookmarks(token, [input]);
              if (created[0]?._id) {
                latestSnapshot = {
                  ...latestSnapshot,
                  spaces: latestSnapshot.spaces.map((s) =>
                    s.id === space.id ? { ...s, themeRaindropId: created[0]._id } : s
                  ),
                };
              }
            }
          } else if (existing) {
            await deleteRaindropBookmark(token, existing._id);
            latestSnapshot = {
              ...latestSnapshot,
              spaces: latestSnapshot.spaces.map((s) =>
                s.id === space.id ? { ...s, themeRaindropId: undefined } : s
              ),
            };
          }
        }
      }
    }
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

  if (!root) return { collections: [], items: [] };

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
  return { root, collections, items };
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

export function reconstructWorkspace(
  tree: RemoteArcableTree,
  targetActiveSpaceId?: string
): ArcableWorkspaceData {
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
  const spaceThemeCollection = tree.collections.find(
    (c) => c.title.trim().toLowerCase() === ARCABLE_SPACE_THEME_COLLECTION_NAME.toLowerCase() && c.parent?.$id === root._id
  );

  const spaceThemeItems = spaceThemeCollection
    ? tree.items.filter((item) => item.collectionId === spaceThemeCollection._id || isSpaceThemeItem(item, spaceThemeCollection._id))
    : tree.items.filter((item) => isSpaceThemeItem(item));

  const spaceThemesMap = new Map<string, { colors?: string; themeNoise?: number; themeScheme?: SpaceScheme; themeConfig?: ZenThemeConfig; raindropItemId?: number }>();
  for (const item of spaceThemeItems) {
    let parsedExcerpt: any = {};
    try {
      if (item.excerpt) parsedExcerpt = JSON.parse(item.excerpt);
    } catch {}

    const colors = typeof parsedExcerpt.colors === 'string' ? parsedExcerpt.colors : undefined;
    const themeNoise = typeof parsedExcerpt.themeNoise === 'number'
      ? parsedExcerpt.themeNoise
      : (typeof parsedExcerpt.noise === 'number' ? parsedExcerpt.noise : undefined);
    const themeScheme = parsedExcerpt.themeScheme === 'auto' || parsedExcerpt.themeScheme === 'light' || parsedExcerpt.themeScheme === 'dark'
      ? parsedExcerpt.themeScheme
      : undefined;
    const themeConfig = parsedExcerpt.themeConfig && typeof parsedExcerpt.themeConfig === 'object'
      ? parsedExcerpt.themeConfig
      : undefined;
    const themeData = { colors, themeNoise, themeScheme, themeConfig, raindropItemId: item._id };

    if (parsedExcerpt.spaceRaindropId !== undefined) {
      spaceThemesMap.set(String(parsedExcerpt.spaceRaindropId), themeData);
    }
    if (parsedExcerpt.spaceId !== undefined) {
      spaceThemesMap.set(String(parsedExcerpt.spaceId), themeData);
    }
    if (item.link?.startsWith(ARCABLE_SPACE_THEME_LINK_PREFIX)) {
      const linkId = item.link.slice(ARCABLE_SPACE_THEME_LINK_PREFIX.length);
      if (linkId) {
        spaceThemesMap.set(linkId, themeData);
      }
    }
  }

  const spaceIds = new Set(
    tree.collections
      .filter((collection) => collection.parent?.$id === root._id && !isSystemCollection(collection))
      .map((collection) => collection._id)
  );

  const spaces: Space[] = tree.collections
    .filter((collection) => spaceIds.has(collection._id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((collection, index) => {
      const theme = spaceThemesMap.get(String(collection._id)) || spaceThemesMap.get(arcableCollectionId(collection._id));
      return {
        id: arcableCollectionId(collection._id),
        raindropId: collection._id,
        themeRaindropId: theme?.raindropItemId,
        name: decodeRaindropTitle(collection.title),
        emojiIcon: emojiFromCover(collection.cover),
        coverUrl: collection.cover?.[0],
        colors: theme?.colors,
        themeNoise: theme?.themeNoise,
        themeScheme: theme?.themeScheme,
        themeConfig: theme?.themeConfig,
        order: (index + 1) * 1000,
        createdAt: timestamp(collection.created),
        updatedAt: timestamp(collection.lastUpdate),
      };
    });

  const rawFolders: Folder[] = tree.collections
    .filter((collection) => !spaceIds.has(collection._id) && !isSystemCollection(collection))
    .map((collection) => {
      let cursor: RaindropCollectionItem | undefined = collection;
      while (cursor?.parent?.$id && !spaceIds.has(cursor.parent.$id)) cursor = collectionById.get(cursor.parent.$id);
      const spaceId = cursor?.parent?.$id;
      return {
        id: arcableCollectionId(collection._id),
        raindropId: collection._id,
        name: decodeRaindropTitle(collection.title),
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

  runCodeInPageRules = sortRunCodeRules(runCodeInPageRules);

  // Identify placeholder / internal item IDs to exclude from tabs
  const nonTabItemIds = new Set<number>([
    ...widgetItems.map((w) => w._id),
    ...customCssItems.map((c) => c._id),
    ...runCodeItems.map((r) => r._id),
    ...spaceThemeItems.map((s) => s._id),
  ]);

  const rawTabItems = tree.items.filter(
    (item) => !isArcableInternalItem(item) && !nonTabItemIds.has(item._id) && !isWidgetItem(item) && !isSpaceThemeItem(item)
  );

  // Group URL variants by title delimiter: "<name> ||| <variant name>"
  const variantItemsByBaseTitle = new Map<string, RaindropBookmarkItem[]>();
  const baseTabItems: RaindropBookmarkItem[] = [];

  for (const item of rawTabItems) {
    const rawTitle = decodeRaindropTitle(item.title || '');
    const delimiterIndex = rawTitle.indexOf(ARCABLE_VARIANT_DELIMITER);
    if (delimiterIndex !== -1) {
      const baseTitle = rawTitle.slice(0, delimiterIndex).trim();
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

    const decodedTitle = decodeRaindropTitle(item.title || '');
    const groupKey = `${collectionId || 0}:::${decodedTitle.trim()}`;
    const variantItems = variantItemsByBaseTitle.get(groupKey);
    let urlVariants: TabUrlVariant[] | undefined;
    let defaultVariantId: string | undefined;

    const groupMeta = parseGroupMeta(item.note);

    if (variantItems && variantItems.length > 0) {
      processedVariantGroupKeys.add(groupKey);
      const defaultId = String(item._id);
      const findMetaName = (id: string, url: string, fallback: string) => {
        if (!groupMeta?.variants) return fallback;
        const match = groupMeta.variants.find((mv) => (mv.id && mv.id === id) || (mv.url && mv.url.trim().toLowerCase() === url.trim().toLowerCase()));
        return match?.name || fallback;
      };

      const rawAllVariants: TabUrlVariant[] = [
        {
          id: defaultId,
          name: findMetaName(defaultId, item.link, groupMeta?.firstName || decodedTitle || 'Default'),
          url: item.link,
          favIconUrl: item.cover,
        },
        ...variantItems.map((v) => {
          const vTitle = decodeRaindropTitle(v.title || '');
          const delimIdx = vTitle.indexOf(ARCABLE_VARIANT_DELIMITER);
          const variantName = delimIdx !== -1 ? vTitle.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim() : 'Variant';
          return {
            id: String(v._id),
            name: findMetaName(String(v._id), v.link, variantName),
            url: v.link,
            favIconUrl: v.cover,
          };
        }),
      ];

      if (groupMeta?.variants && groupMeta.variants.length > 0) {
        const getRank = (v: TabUrlVariant) => {
          const idxById = groupMeta.variants!.findIndex((mv) => mv.id && mv.id === v.id);
          if (idxById !== -1) return idxById;
          const idxByUrl = groupMeta.variants!.findIndex((mv) => mv.url && mv.url.trim().toLowerCase() === v.url.trim().toLowerCase());
          if (idxByUrl !== -1) return idxByUrl;
          const idxByName = groupMeta.variants!.findIndex((mv) => mv.name && mv.name.trim().toLowerCase() === v.name.trim().toLowerCase());
          if (idxByName !== -1) return idxByName;
          return 9999;
        };
        rawAllVariants.sort((a, b) => getRank(a) - getRank(b));
      } else {
        const [baseVar, ...secVars] = rawAllVariants;
        secVars.sort((a, b) => {
          const itemA = variantItems.find((vi) => String(vi._id) === a.id);
          const itemB = variantItems.find((vi) => String(vi._id) === b.id);
          const sortA = itemA ? (itemA.sort ?? itemA.order) : undefined;
          const sortB = itemB ? (itemB.sort ?? itemB.order) : undefined;
          if (sortA !== undefined && sortB !== undefined && sortA !== sortB) {
            return sortA - sortB;
          }
          const orderA = itemOrderMap.get(Number(a.id)) ?? 0;
          const orderB = itemOrderMap.get(Number(b.id)) ?? 0;
          return orderA - orderB || Number(a.id) - Number(b.id);
        });
        rawAllVariants.splice(1, rawAllVariants.length - 1, ...secVars);
      }

      urlVariants = rawAllVariants;
      defaultVariantId = groupMeta?.defaultVariantId || rawAllVariants[0]?.id || defaultId;
    }

    const effectiveUrl = (urlVariants && urlVariants[0]?.url) || item.link;
    const effectiveCover = (urlVariants && urlVariants[0]?.favIconUrl) || item.cover;

    tabs.push({
      id: String(item._id),
      raindropId: item._id,
      url: effectiveUrl,
      urlVariants,
      defaultVariantId,
      pinned: false,
      favourite: favourite || undefined,
      customTitle: decodedTitle,
      favIconUrl: effectiveCover,
      note: item.note || undefined,
      parentFolderId,
      parentSpaceId,
      order: itemOrderMap.get(item._id) ?? (item.order ?? 0),
      createdAt: timestamp(item.created),
      updatedAt: timestamp(item.lastUpdate),
      isGroup: Boolean(favourite && urlVariants && urlVariants.length > 1) || undefined,
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
    const baseTitle = groupKey.split(':::')[1] || decodeRaindropTitle(first.title);
    variantItems.sort((a, b) => {
      const orderA = itemOrderMap.get(a._id) ?? (a.sort ?? a.order ?? 0);
      const orderB = itemOrderMap.get(b._id) ?? (b.sort ?? b.order ?? 0);
      return orderA - orderB || a._id - b._id;
    });

    // Deduplicate orphan variant items by URL
    const seenVariantUrls = new Set<string>();
    const deduplicatedVariantItems: RaindropBookmarkItem[] = [];
    for (const item of variantItems) {
      const urlKey = (item.link || '').trim().toLowerCase();
      if (urlKey && seenVariantUrls.has(urlKey)) continue;
      if (urlKey) seenVariantUrls.add(urlKey);
      deduplicatedVariantItems.push(item);
    }
    const finalItems = deduplicatedVariantItems.length > 0 ? deduplicatedVariantItems : variantItems;

    // Check if an existing tab in the same scope already matches this base title OR contains matching variant URLs
    const orphanUrls = new Set(finalItems.map((item) => (item.link || '').trim().toLowerCase()).filter(Boolean));
    const matchingTab = tabs.find((t) => {
      const sameScope = favourite
        ? Boolean(t.favourite)
        : t.parentFolderId === parentFolderId && t.parentSpaceId === parentSpaceId;
      if (!sameScope) return false;
      const tabTitle = (t.customTitle || '').trim().toLowerCase();
      const targetBase = baseTitle.trim().toLowerCase();
      if (tabTitle && tabTitle === targetBase) return true;
      if (t.urlVariants && t.urlVariants.some((v) => (v.name || '').trim().toLowerCase() === targetBase)) return true;
      if (t.url && orphanUrls.has(t.url.trim().toLowerCase())) return true;
      if (t.urlVariants && t.urlVariants.some((v) => v.url && orphanUrls.has(v.url.trim().toLowerCase()))) return true;
      return false;
    });

    if (matchingTab) {
      // Merge orphan variants into the existing matching tab instead of creating a duplicate group
      const existingUrls = new Set((matchingTab.urlVariants || []).map((v) => (v.url || '').trim().toLowerCase()));
      const addedVariants: TabUrlVariant[] = [];
      for (const v of finalItems) {
        const vUrl = (v.link || '').trim().toLowerCase();
        if (vUrl && !existingUrls.has(vUrl)) {
          existingUrls.add(vUrl);
          const vTitle = decodeRaindropTitle(v.title || '');
          const delimIdx = vTitle.indexOf(ARCABLE_VARIANT_DELIMITER);
          const variantName = delimIdx !== -1 ? vTitle.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim() : 'Variant';
          addedVariants.push({ id: String(v._id), name: variantName, url: v.link, favIconUrl: v.cover });
        }
      }
      if (addedVariants.length > 0) {
        matchingTab.urlVariants = [...(matchingTab.urlVariants || []), ...addedVariants];
        if (favourite) {
          matchingTab.isGroup = true;
        }
      }
      continue;
    }

    const urlVariants: TabUrlVariant[] = finalItems.map((v) => {
      const vTitle = decodeRaindropTitle(v.title || '');
      const delimIdx = vTitle.indexOf(ARCABLE_VARIANT_DELIMITER);
      const variantName = delimIdx !== -1 ? vTitle.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim() : 'Variant';
      return { id: String(v._id), name: variantName, url: v.link, favIconUrl: v.cover };
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
      isGroup: favourite ? true : undefined,
    });
  }

  tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const activeSpaceStillExists = Boolean(
    targetActiveSpaceId &&
    (targetActiveSpaceId === VIRTUAL_SYNCED_TABS_SPACE_ID || spaces.some((s) => s.id === targetActiveSpaceId))
  );
  const activeSpaceId = activeSpaceStillExists
    ? targetActiveSpaceId!
    : (spaces[0]?.id || '');

  return {
    raindropRootCollectionId: root._id,
    raindropSpaceThemeCollectionId: spaceThemeCollection?._id,
    raindropMetadataItemId: null,
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
            latestSnapshot: reconstructWorkspace(tree, syncLocalState?.activeSpaceId),
            syncedAt: Date.now(),
          };
        }
      }
      authoritativeTree = tree;
    }

    if (needsIncrementalIdentityRebase(syncLocalState, options?.pendingOps, options?.replaceBaseline)) {
      authoritativeTree = await fetchRemoteArcableTree(clean);
      const authoritativeSnapshot = reconstructWorkspace(authoritativeTree, syncLocalState?.activeSpaceId);
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
      tree.items.map((item) => [String(item._id), item._id])
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
        const titleChanged = existing !== undefined && existing.title !== encodeRaindropTitle(entry.entity.name);
        const shouldUpdate = Boolean(existing) && (changedIds.has(id) || orderChanged || titleChanged || (entry.entity.updatedAt || 0) > timestamp(existing?.lastUpdate));
        // Space and folder covers come from Raindrop's own icon catalogue. Only
        // search when creating or modifying the corresponding collection.
        const cover = !existing || shouldUpdate
          ? (entry.kind === 'space'
            ? (entry.entity as Space).coverUrl || await searchRaindropCollectionCover(clean, entry.entity.name)
            : (entry.entity as Folder).coverUrl || await searchRaindropCollectionCover(clean, entry.entity.name))
          : undefined;
        const color = entry.entity.colors;
        if (!existing) {
          const created = await createRaindropCollection(clean, encodeRaindropTitle(entry.entity.name), parentRemoteId, {
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
              title: encodeRaindropTitle(entry.entity.name),
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

    const retainedRemoteIds = new Set<number>();
    for (const tab of localState.tabs || []) {
      const rId = remoteEntityId(tab);
      if (rId) retainedRemoteIds.add(rId);
      if (tab.urlVariants) {
        for (const v of tab.urlVariants) {
          const vId = numericRaindropId(v.id);
          if (vId) retainedRemoteIds.add(vId);
        }
      }
    }

    const deletedItemsByCollection = new Map<number, number[]>();
    const enqueueItemDelete = (itemId: number, colId?: number) => {
      if (retainedRemoteIds.has(itemId)) return;
      const collectionId = colId || remoteItems.get(itemId)?.collectionId;
      if (!collectionId) return;
      const ids = deletedItemsByCollection.get(collectionId) || [];
      if (!ids.includes(itemId)) ids.push(itemId);
      deletedItemsByCollection.set(collectionId, ids);
    };

    // Collect remote item deletions from pending operations (TAB_DELETE, TAB_UPDATE deletedVariantIds)
    for (const op of pendingOps) {
      if (op.type === 'TAB_DELETE') {
        const payloadRemoteId = Number(op.payload?.raindropId) || numericRaindropId(op.payload?.raindropId);
        const entityRemoteId = numericRaindropId(op.entityId) || remoteItemByArcableId.get(op.entityId);
        const targetRemoteId = payloadRemoteId || entityRemoteId;
        const colId = Number(op.payload?.collectionId) || undefined;
        if (targetRemoteId) {
          enqueueItemDelete(targetRemoteId, colId);
          const item = remoteItems.get(targetRemoteId);
          if (item?.title) {
            const prefix = `${item.title}${ARCABLE_VARIANT_DELIMITER}`;
            for (const candidate of tree.items) {
              if (candidate.collectionId === (colId || item.collectionId) && candidate.title?.startsWith(prefix)) {
                enqueueItemDelete(candidate._id, candidate.collectionId);
              }
            }
          }
        }
        if (Array.isArray(op.payload?.variantRaindropIds)) {
          for (const vid of op.payload.variantRaindropIds) {
            const numId = numericRaindropId(vid);
            if (numId) enqueueItemDelete(numId, colId);
          }
        }
      } else if (op.type === 'TAB_UPDATE') {
        if (Array.isArray(op.payload?.deletedVariantIds)) {
          const colId = Number(op.payload?.collectionId) || undefined;
          for (const vid of op.payload.deletedVariantIds) {
            const numId = numericRaindropId(vid);
            if (numId) enqueueItemDelete(numId, colId);
          }
        }
      }
    }

    // Also process any entity in deletedIds (e.g. widgets or direct deletes)
    for (const id of deletedIds) {
      const remoteId = numericRaindropId(id) || remoteItemByArcableId.get(id);
      const item = remoteId ? remoteItems.get(remoteId) : undefined;
      if (!item?.collectionId) continue;
      enqueueItemDelete(item._id, item.collectionId);
      // Also delete any secondary variants belonging to this deleted item
      const prefix = `${item.title}${ARCABLE_VARIANT_DELIMITER}`;
      for (const candidate of tree.items) {
        if (candidate.collectionId === item.collectionId && candidate.title?.startsWith(prefix)) {
          enqueueItemDelete(candidate._id, candidate.collectionId);
        }
      }
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

    const hasAnySpaceThemes = (localState.spaces || []).some(
      (s) => !deletedIds.has(s.id) && (Boolean(s.colors) || Boolean(s.themeNoise))
    );
    let spaceThemeColl = tree.collections.find(
      (c) => c.parent?.$id === root._id && c.title.trim().toLowerCase() === ARCABLE_SPACE_THEME_COLLECTION_NAME.toLowerCase()
    );
    if (!spaceThemeColl && hasAnySpaceThemes) {
      spaceThemeColl = await createRaindropCollection(clean, ARCABLE_SPACE_THEME_COLLECTION_NAME, root._id);
      tree.collections.push(spaceThemeColl);
      remoteCollections.set(spaceThemeColl._id, spaceThemeColl);
    }

    // Widgets, custom code rules, and run code rules live outside the space/folder
    // collection tree and their bookmark items don't carry an arcableId in `note`
    // (they encode their local id in `excerpt`/`link` instead), so they can't be
    // resolved via remoteItemByArcableId like tabs above. Their WIDGET_DELETE /
    // CUSTOM_CODE_DELETE / RUN_CODE_DELETE operations carry the raindropId
    // directly in the payload - use that to delete them explicitly, or resolve from tree.items.
    for (const op of pendingOps) {
      if (op.type !== 'WIDGET_DELETE' && op.type !== 'CUSTOM_CODE_DELETE' && op.type !== 'RUN_CODE_DELETE') continue;
      let remoteId = Number(op.payload?.raindropId) || numericRaindropId(op.entityId);
      if (!remoteId) {
        if (op.type === 'CUSTOM_CODE_DELETE') {
          const match = tree.items.find((item) => {
            if (!isCustomCssItem(item, customCssColl?._id)) return false;
            if (item.link?.startsWith(ARCABLE_CUSTOM_CSS_LINK_PREFIX) && item.link.slice(ARCABLE_CUSTOM_CSS_LINK_PREFIX.length) === op.entityId) return true;
            if (item.excerpt) {
              try {
                const parsed = JSON.parse(item.excerpt);
                if (parsed?.id === op.entityId) return true;
              } catch {}
            }
            return String(item._id) === op.entityId;
          });
          if (match) remoteId = match._id;
        } else if (op.type === 'RUN_CODE_DELETE') {
          const match = tree.items.find((item) => {
            if (!isRunCodeItem(item, runCodeColl?._id)) return false;
            if (item.link?.startsWith(ARCABLE_RUN_CODE_LINK_PREFIX) && item.link.slice(ARCABLE_RUN_CODE_LINK_PREFIX.length) === op.entityId) return true;
            if (item.excerpt) {
              try {
                const parsed = JSON.parse(item.excerpt);
                if (parsed?.id === op.entityId) return true;
              } catch {}
            }
            return String(item._id) === op.entityId;
          });
          if (match) remoteId = match._id;
        }
      }
      if (remoteId && remoteItems.has(remoteId)) {
        await deleteRaindropBookmark(clean, remoteId);
        remoteItems.delete(remoteId);
      }
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
      let remoteId = remoteEntityId(tab);
      const defaultVar =
        (tab.defaultVariantId && tab.urlVariants?.find((v) => v.id === tab.defaultVariantId)) ||
        tab.urlVariants?.[0];
      const defaultVarRemoteId = defaultVar ? numericRaindropId(defaultVar.id) : undefined;
      const origRemoteId = remoteId;

      if (defaultVarRemoteId && defaultVarRemoteId !== remoteId && remoteItems.has(defaultVarRemoteId)) {
        remoteId = defaultVarRemoteId;
      }

      const existing = remoteId ? remoteItems.get(remoteId) : undefined;
      if (remoteId && !existing && !changedIds.has(tab.id)) continue;
      const parentId = tab.favourite ? root._id : localCollectionToRemote.get(tab.parentFolderId || tab.parentSpaceId || '');
      if (!parentId) continue;
      const targetOrder = calculateTabTargetOrder(tab, localState.tabs || [], localState.widgets || []);
      const rawTitle = tab.customTitle || tab.url;
      const tabNote = attachGroupMetaToNote(existing?.note || tab.note, tab);
      const payload = {
        title: encodeRaindropTitle(rawTitle),
        link: defaultVar ? defaultVar.url : tab.url,
        cover: (defaultVar && defaultVar.favIconUrl) || tab.favIconUrl,
        note: tabNote,
        collection: { $id: parentId },
        order: targetOrder,
        sort: targetOrder,
      };
      const orderChanged = existing !== undefined && (existing.sort !== targetOrder && existing.order !== targetOrder);
      const titleChanged = existing !== undefined && existing.title !== payload.title;
      const linkChanged = existing !== undefined && existing.link !== payload.link;
      const noteChanged = existing !== undefined && (existing.note || '') !== payload.note;
      const shouldUpdate = Boolean(existing) && (changedIds.has(tab.id) || orderChanged || titleChanged || linkChanged || noteChanged || (tab.updatedAt || 0) > timestamp(existing?.lastUpdate));

      const secondaryVariants = getTabSecondaryVariants(tab);

      if (!existing) {
        bookmarksToCreate.push({
          title: payload.title,
          link: payload.link,
          cover: payload.cover,
          note: tabNote,
          collectionId: parentId,
          order: targetOrder,
          sort: targetOrder,
        });
        // Extra URL variants
        secondaryVariants.forEach((variant, vIdx) => {
          const variantOrder = targetOrder + 1 + vIdx;
          let varRemoteId = numericRaindropId(variant.id);
          if (varRemoteId === remoteId) {
            varRemoteId = origRemoteId;
          }
          const varExisting = varRemoteId ? remoteItems.get(varRemoteId) : undefined;
          const varTitle = `${payload.title}${ARCABLE_VARIANT_DELIMITER}${encodeRaindropTitle(variant.name)}`;
          if (varExisting) {
            tabUpdatesToPerform.push({
              remoteId: varExisting._id,
              payload: {
                title: varTitle,
                link: variant.url,
                cover: variant.favIconUrl || payload.cover,
                collection: { $id: parentId },
                order: variantOrder,
                sort: variantOrder,
              },
              targetOrder: variantOrder,
            });
          } else {
            bookmarksToCreate.push({
              title: varTitle,
              link: variant.url,
              cover: variant.favIconUrl || payload.cover,
              note: '',
              collectionId: parentId,
              order: variantOrder,
              sort: variantOrder,
            });
          }
        });

        // Purge any orphan remote variants in this collection matching the new title prefix
        const orphanVariants = tree.items.filter((item) => {
          if (item.collectionId !== parentId) return false;
          if (!item.title?.startsWith(`${payload.title}${ARCABLE_VARIANT_DELIMITER}`)) return false;
          return !secondaryVariants.some((v) => {
            const vNum = numericRaindropId(v.id);
            return item._id === vNum || (vNum === remoteId && item._id === origRemoteId);
          });
        });
        for (const ov of orphanVariants) {
          extraVariantsToDelete.push(ov);
        }
      } else {
        if (shouldUpdate) {
          tabUpdatesToPerform.push({ remoteId: existing._id, payload, targetOrder });
        }

        // Reconcile secondary variants for existing tab
        const existingRemoteVariants = tree.items.filter((item) => {
          if (item._id === existing._id) return false;
          const matchesCollection = item.collectionId === existing.collectionId || item.collectionId === parentId;
          if (!matchesCollection) return false;
          const hasVariantId = secondaryVariants.some((v) => {
            const vNum = numericRaindropId(v.id);
            return item._id === vNum || (vNum === remoteId && item._id === origRemoteId);
          });
          const hasOldTitlePrefix = existing.title ? item.title?.startsWith(`${existing.title}${ARCABLE_VARIANT_DELIMITER}`) : false;
          const hasNewTitlePrefix = payload.title ? item.title?.startsWith(`${payload.title}${ARCABLE_VARIANT_DELIMITER}`) : false;
          return hasVariantId || hasOldTitlePrefix || hasNewTitlePrefix;
        });

        secondaryVariants.forEach((variant, vIdx) => {
          const variantOrder = targetOrder + 1 + vIdx;
          const expectedTitle = `${payload.title}${ARCABLE_VARIANT_DELIMITER}${encodeRaindropTitle(variant.name)}`;
          const varNumId = numericRaindropId(variant.id);
          const effectiveVarId = varNumId === remoteId ? origRemoteId : varNumId;
          const matchIdx = existingRemoteVariants.findIndex((rv) => {
            if (effectiveVarId && rv._id === effectiveVarId) return true;
            if (String(rv._id) === variant.id) return true;
            const delimIdx = (rv.title || '').indexOf(ARCABLE_VARIANT_DELIMITER);
            const rvName = delimIdx !== -1 ? decodeRaindropTitle(rv.title.slice(delimIdx + ARCABLE_VARIANT_DELIMITER.length).trim()) : '';
            return rvName === variant.name;
          });

          if (matchIdx >= 0) {
            const matchedItem = existingRemoteVariants.splice(matchIdx, 1)[0];
            const variantOrderChanged = matchedItem.sort !== variantOrder && matchedItem.order !== variantOrder;
            const expectedCover = variant.favIconUrl || payload.cover;
            const variantChanged =
              matchedItem.title !== expectedTitle ||
              matchedItem.link !== variant.url ||
              matchedItem.collectionId !== parentId ||
              matchedItem.cover !== expectedCover ||
              variantOrderChanged;
            if (variantChanged || shouldUpdate) {
              tabUpdatesToPerform.push({
                remoteId: matchedItem._id,
                payload: {
                  title: expectedTitle,
                  link: variant.url,
                  cover: expectedCover,
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
              cover: variant.favIconUrl || payload.cover,
              note: '',
              collectionId: parentId,
              order: variantOrder,
              sort: variantOrder,
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

    // Collect any orphan variant bookmarks whose prefix doesn't match any active tab and are not retained
    const activeTabTitles = new Set(
      (localState.tabs || [])
        .map((t) => encodeRaindropTitle(t.customTitle || t.url).toLowerCase())
        .filter(Boolean)
    );
    for (const item of tree.items) {
      if (retainedRemoteIds.has(item._id)) continue;
      const delimIdx = (item.title || '').indexOf(ARCABLE_VARIANT_DELIMITER);
      if (delimIdx !== -1) {
        const prefix = item.title.slice(0, delimIdx).trim().toLowerCase();
        if (!activeTabTitles.has(prefix)) {
          if (!extraVariantsToDelete.some((ov) => ov._id === item._id)) {
            extraVariantsToDelete.push(item);
          }
        }
      }
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

    // Sync Space Themes to _space_themes collection
    if (spaceThemeColl) {
      const existingThemeItems = tree.items.filter(
        (item) => item.collectionId === spaceThemeColl._id || isSpaceThemeItem(item, spaceThemeColl._id)
      );
      const themeItemBySpaceId = new Map<string, RaindropBookmarkItem>();
      for (const item of existingThemeItems) {
        let spaceId: string | undefined;
        let spaceRaindropId: string | undefined;
        try {
          if (item.excerpt) {
            const parsed = JSON.parse(item.excerpt);
            if (parsed.spaceId) spaceId = String(parsed.spaceId);
            if (parsed.spaceRaindropId !== undefined) spaceRaindropId = String(parsed.spaceRaindropId);
          }
        } catch {}
        if (spaceId) {
          themeItemBySpaceId.set(spaceId, item);
        }
        if (spaceRaindropId) {
          themeItemBySpaceId.set(spaceRaindropId, item);
        }
        if (item.link?.startsWith(ARCABLE_SPACE_THEME_LINK_PREFIX)) {
          const linkId = item.link.slice(ARCABLE_SPACE_THEME_LINK_PREFIX.length);
          if (linkId) {
            themeItemBySpaceId.set(linkId, item);
          }
        }
      }

      for (const space of localState.spaces || []) {
        if (deletedIds.has(space.id)) {
          const existing = themeItemBySpaceId.get(space.id) || (space.raindropId ? themeItemBySpaceId.get(String(space.raindropId)) : undefined);
          if (existing) {
            await deleteRaindropBookmark(clean, existing._id);
          }
          continue;
        }

        const remoteSpaceRaindropId = localCollectionToRemote.get(space.id) || space.raindropId;
        const spaceWithRemoteId: Space = { ...space, raindropId: remoteSpaceRaindropId };
        const existing = themeItemBySpaceId.get(space.id) || (remoteSpaceRaindropId ? themeItemBySpaceId.get(String(remoteSpaceRaindropId)) : undefined);
        const hasTheme = Boolean(space.colors) || Boolean(space.themeNoise);

        if (hasTheme) {
          const input = spaceThemeToRaindropItemInput(spaceWithRemoteId, spaceThemeColl._id);
          if (!existing) {
            bookmarksToCreate.push(input);
          } else {
            const existingExcerpt = existing.excerpt;
            const newExcerpt = input.excerpt;
            if (existingExcerpt !== newExcerpt || existing.title !== input.title) {
              await updateRaindropItem(clean, existing._id, {
                title: input.title,
                excerpt: input.excerpt,
                tags: input.tags,
              });
            }
          }
        } else if (existing) {
          await deleteRaindropBookmark(clean, existing._id);
        }
      }

      // Clean up orphan theme bookmarks whose space no longer exists
      const activeSpaceIds = new Set((localState.spaces || []).map((s) => s.id));
      const activeSpaceRemoteIds = new Set(
        (localState.spaces || [])
          .map((s) => localCollectionToRemote.get(s.id) || s.raindropId)
          .filter(Boolean)
          .map(String)
      );

      const deletedThemeBookmarkIds = new Set<number>();
      for (const item of existingThemeItems) {
        let spaceId: string | undefined;
        let spaceRaindropId: string | undefined;
        try {
          if (item.excerpt) {
            const parsed = JSON.parse(item.excerpt);
            if (parsed.spaceId) spaceId = String(parsed.spaceId);
            if (parsed.spaceRaindropId !== undefined) spaceRaindropId = String(parsed.spaceRaindropId);
          }
        } catch {}
        let linkId: string | undefined;
        if (item.link?.startsWith(ARCABLE_SPACE_THEME_LINK_PREFIX)) {
          linkId = item.link.slice(ARCABLE_SPACE_THEME_LINK_PREFIX.length);
        }
        const belongsToActiveSpace =
          Boolean(spaceId && (activeSpaceIds.has(spaceId) || activeSpaceRemoteIds.has(spaceId))) ||
          Boolean(spaceRaindropId && (activeSpaceIds.has(spaceRaindropId) || activeSpaceRemoteIds.has(spaceRaindropId))) ||
          Boolean(linkId && (activeSpaceIds.has(linkId) || activeSpaceRemoteIds.has(linkId)));

        if (!belongsToActiveSpace && !deletedThemeBookmarkIds.has(item._id)) {
          deletedThemeBookmarkIds.add(item._id);
          await deleteRaindropBookmark(clean, item._id);
        }
      }
    }

    // Create all new bookmark items in batches of 100
    for (let start = 0; start < bookmarksToCreate.length; start += 100) {
      const batch = bookmarksToCreate.slice(start, start + 100);
      const createdItems = await createRaindropBookmarks(clean, batch);
      if (createdItems.length !== batch.length) {
        throw new Error(`Raindrop created ${createdItems.length} of ${batch.length} requested bookmarks.`);
      }

      // Raindrop batch creation defaults new bookmarks to index 0 (top of collection).
      // Reposition created items that have a positive targetOrder so manual ordering is respected.
      const bookmarksWithOrder = batch
        .map((entry, index) => ({
          createdId: createdItems[index]._id,
          targetOrder: entry.order !== undefined ? entry.order : entry.sort,
        }))
        .filter((entry): entry is { createdId: number; targetOrder: number } =>
          entry.targetOrder !== undefined && entry.targetOrder > 0
        )
        .sort((a, b) => a.targetOrder - b.targetOrder);

      for (const { createdId, targetOrder } of bookmarksWithOrder) {
        await updateRaindropItem(clean, createdId, { order: targetOrder, sort: targetOrder });
      }
    }

    tree = await fetchRemoteArcableTree(clean);
    const latestSnapshot = reconstructWorkspace(tree, localState.activeSpaceId);

    return {
      success: true,
      collectionId: root._id,
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
