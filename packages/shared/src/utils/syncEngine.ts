import { ArcableWorkspaceData, Space, Folder, Tab, TmpTab, WorkspaceWidget, CustomCodeRule, RunCodeRule } from '../types/workspace';
import { WorkspaceOperation, OperationType, ArcableSyncFile, DeviceSyncRecord } from '../types/sync';
import { generateId } from './format';
import { getDescendantFolderIds } from './treeUtils';
import { sortCustomCodeRules, sortRunCodeRules } from './customCodeUtils';

export const ONLINE_DEVICE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes (online compaction threshold)
export const DEVICE_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (device registry retention)
export const PENDING_OPS_STORAGE_KEY = 'arcable_pending_ops';
export const DEVICE_ID_STORAGE_KEY = 'arcable_device_id';
export const DEVICE_NAME_STORAGE_KEY = 'arcable_device_name';
export const LAMPORT_SEQ_STORAGE_KEY = 'arcable_lamport_seq';

/**
 * Checks if a device is considered online based on its lastSyncAt timestamp (within 10 minutes).
 */
export function isDeviceOnline(lastSyncAt?: number, now: number = Date.now()): boolean {
  if (!lastSyncAt || typeof lastSyncAt !== 'number') return false;
  return now - lastSyncAt <= ONLINE_DEVICE_THRESHOLD_MS;
}

/**
 * Retrieves the persistent local device ID or generates a new one.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'device_ssr_' + generateId('dev');
  }

  try {
    let deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId = 'device_' + generateId('dev');
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'device_fallback_' + generateId('dev');
  }
}

/**
 * Detects whether the current execution context is the browser extension or web app.
 */
export function detectDeviceType(fallback?: 'Web App' | 'Ext'): 'Web App' | 'Ext' {
  if (fallback) return fallback;
  if (typeof window !== 'undefined') {
    const proto = window.location?.protocol;
    if (proto === 'chrome-extension:' || proto === 'moz-extension:') {
      return 'Ext';
    }
  }
  // Check Chrome / WebExtensions runtime in background worker or extension page
  try {
    const globalAny = (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {}) as any;
    if (
      (typeof globalAny.chrome !== 'undefined' && globalAny.chrome?.runtime?.id) ||
      (typeof globalAny.browser !== 'undefined' && globalAny.browser?.runtime?.id)
    ) {
      return 'Ext';
    }
  } catch {}

  return 'Web App';
}

/**
 * Detects the browser name from the environment (userAgent / navigator).
 */
export function detectBrowserName(): string {
  if (typeof navigator === 'undefined') {
    return 'Chrome';
  }

  const ua = navigator.userAgent || '';

  // 1. Zen Browser (Zen/x.x in userAgent)
  if (/Zen\/|zen/i.test(ua)) {
    return 'Zen';
  }

  // 2. Arc Browser
  if (
    /(?:Arc|ArcBrowser)\//i.test(ua) ||
    (typeof window !== 'undefined' &&
      Boolean(
        (window as any).arc ||
        (typeof document !== 'undefined' &&
          getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title'))
      ))
  ) {
    return 'Arc';
  }

  // 3. Brave Browser
  if (
    /Brave\//i.test(ua) ||
    Boolean((navigator as any).brave?.isBrave) ||
    ((navigator as any).userAgentData?.brands?.some((b: { brand: string }) => /Brave/i.test(b.brand)))
  ) {
    return 'Brave';
  }

  // 4. Vivaldi Browser
  if (/Vivaldi\//i.test(ua)) {
    return 'Vivaldi';
  }

  // 5. Comet Browser
  if (/Comet\//i.test(ua)) {
    return 'Comet';
  }

  // 6. Dia Browser
  if (/Dia\//i.test(ua)) {
    return 'Dia';
  }

  // 7. Microsoft Edge
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) {
    return 'Edge';
  }

  // 8. Opera
  if (/OPR\/|Opera\//i.test(ua)) {
    return 'Opera';
  }

  // 9. Firefox
  if (/Firefox\//i.test(ua)) {
    return 'Firefox';
  }

  // 10. Chrome / Chromium
  if (/Chrome\/|CriOS\//i.test(ua)) {
    return 'Chrome';
  }

  // 11. Safari
  if (/Safari\//i.test(ua) && !/Chrome\/|CriOS\//i.test(ua)) {
    return 'Safari';
  }

  return 'Chrome';
}

/**
 * Detects the operating system from the environment (userAgent / navigator).
 */
export function detectOsName(): string {
  if (typeof navigator === 'undefined') {
    return 'macOS';
  }

  const ua = navigator.userAgent || '';
  const platform = ((navigator as any).userAgentData?.platform || navigator.platform || '');

  // 1. iOS (iPhone, iPad, iPod)
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  ) {
    return 'iOS';
  }

  // 2. macOS
  if (/Macintosh|Mac OS X|MacIntel|MacPPC|Mac68K/i.test(ua) || /Mac/i.test(platform)) {
    return 'macOS';
  }

  // 3. Windows
  if (/Windows|Win32|Win64|WOW64/i.test(ua) || /Win/i.test(platform)) {
    return 'Windows';
  }

  // 4. Android
  if (/Android/i.test(ua) || /Android/i.test(platform)) {
    return 'Android';
  }

  // 5. ChromeOS
  if (/CrOS/i.test(ua)) {
    return 'ChromeOS';
  }

  // 6. Linux
  if (/Linux|X11/i.test(ua) || /Linux/i.test(platform)) {
    return 'Linux';
  }

  return 'macOS';
}

/**
 * Generates the default device name in the format: `type + browser name + os name`
 * e.g., 'Web App / Chrome / macOS' or 'Ext / Zen / Windows'
 */
export function getDefaultDeviceName(type?: 'Web App' | 'Ext' | string): string {
  const resolvedType = (type === 'Web App' || type === 'Ext') ? type : detectDeviceType();
  const browser = detectBrowserName();
  const os = detectOsName();
  return `${resolvedType} / ${browser} / ${os}`;
}

/**
 * Gets the stored custom device name, or a default fallback formatted as:
 * `type + browser name + os name` (e.g. 'Web App / Chrome / macOS' or 'Ext / Zen / Windows')
 */
export function getStoredDeviceName(defaultName?: string, type?: 'Web App' | 'Ext' | string): string {
  const fallback = defaultName || getDefaultDeviceName(type);
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const name = window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY);
    return name && name.trim() ? name.trim() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Updates the stored local device name.
 */
export function setStoredDeviceName(name: string): void {
  if (typeof window === 'undefined') return;

  try {
    if (name && name.trim()) {
      window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, name.trim());
    } else {
      window.localStorage.removeItem(DEVICE_NAME_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Failed to save device name to localStorage:', err);
  }
}

/**
 * Increments and returns the next local Lamport sequence number.
 */
export function getNextLamportSeq(remoteSeq?: number): number {
  if (typeof window === 'undefined') {
    return (remoteSeq || 0) + 1;
  }

  try {
    const raw = window.localStorage.getItem(LAMPORT_SEQ_STORAGE_KEY);
    const current = Math.max(Number(raw) || 0, remoteSeq || 0);
    const next = current + 1;
    window.localStorage.setItem(LAMPORT_SEQ_STORAGE_KEY, String(next));
    return next;
  } catch {
    return (remoteSeq || 0) + 1;
  }
}

/**
 * Creates a WorkspaceOperation with deterministic ID, timestamp, and Lamport sequence.
 */
export function createWorkspaceOperation(
  type: OperationType,
  entityId: string,
  payload?: any,
  deviceId?: string,
  timestamp: number = Date.now(),
  lamportSeq?: number
): WorkspaceOperation {
  const devId = deviceId || getOrCreateDeviceId();
  const seq = lamportSeq !== undefined ? lamportSeq : getNextLamportSeq();

  return {
    id: `op_${timestamp}_${generateId('op')}`,
    type,
    entityId,
    payload,
    deviceId: devId,
    timestamp,
    lamportSeq: seq,
  };
}

/**
 * Loads pending un-synced operations from localStorage.
 */
export function getStoredPendingOperations(): WorkspaceOperation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_OPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Appends an operation to the local pending operations queue.
 */
export function savePendingOperation(op: WorkspaceOperation): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredPendingOperations();
    existing.push(op);
    window.localStorage.setItem(PENDING_OPS_STORAGE_KEY, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent('arcable_pending_op_saved', { detail: op }));
  } catch (err) {
    console.error('Failed to save pending operation:', err);
  }
}

/**
 * Clears the local pending operations queue.
 */
export function clearStoredPendingOperations(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_OPS_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear pending operations:', err);
  }
}

/**
 * Removes specific synced operations by their IDs from the local pending operations queue,
 * preserving any newly added operations that arrived while sync was in-flight.
 */
export function removeStoredPendingOperations(syncedOpIds: string[]): void {
  if (typeof window === 'undefined' || !syncedOpIds || syncedOpIds.length === 0) return;
  try {
    const existing = getStoredPendingOperations();
    const syncedSet = new Set(syncedOpIds);
    const remaining = existing.filter((op) => !syncedSet.has(op.id));
    if (remaining.length === 0) {
      window.localStorage.removeItem(PENDING_OPS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PENDING_OPS_STORAGE_KEY, JSON.stringify(remaining));
    }
  } catch (err) {
    console.error('Failed to remove synced pending operations:', err);
  }
}

/**
 * Applies a single operation to a mutable/cloned workspace state.
 */
export function applyOperation(
  state: ArcableWorkspaceData,
  op: WorkspaceOperation
): ArcableWorkspaceData {
  const cloned: ArcableWorkspaceData = {
    spaces: [...state.spaces],
    folders: [...state.folders],
    tabs: [...state.tabs],
    tmpTabs: [...(state.tmpTabs || [])],
    widgets: [...(state.widgets || [])],
    customCodeRules: [...(state.customCodeRules || [])],
    runCodeInPageRules: [...(state.runCodeInPageRules || [])],
    activeSpaceId: state.activeSpaceId,
    version: (state.version || 1) + 1,
  };

  switch (op.type) {

    // ================= Space Operations =================
    case 'SPACE_CREATE': {
      const existingIdx = cloned.spaces.findIndex((s) => s.id === op.entityId);
      const spaceData: Space = {
        id: op.entityId,
        name: op.payload?.name || 'New Space',
        emojiIcon: op.payload?.emojiIcon || '📁',
        colors: op.payload?.colors || undefined,
        order: op.payload?.order !== undefined ? op.payload.order : undefined,
        createdAt: op.payload?.createdAt || op.timestamp,
        updatedAt: op.timestamp,
      };

      if (existingIdx >= 0) {
        cloned.spaces[existingIdx] = { ...cloned.spaces[existingIdx], ...spaceData };
      } else {
        cloned.spaces.push(spaceData);
      }
      break;
    }

    case 'SPACE_UPDATE': {
      const existingIdx = cloned.spaces.findIndex((s) => s.id === op.entityId);
      if (existingIdx >= 0) {
        const current = cloned.spaces[existingIdx];
        const updated: Space = {
          ...current,
          ...op.payload,
          updatedAt: op.timestamp,
        };

        if (op.payload) {
          if ('emojiIcon' in op.payload) updated.emojiIcon = op.payload.emojiIcon || undefined;
          if ('colors' in op.payload) updated.colors = op.payload.colors || undefined;
        }

        cloned.spaces[existingIdx] = updated;
      }
      break;
    }

    case 'SPACE_DELETE': {
      cloned.spaces = cloned.spaces.filter((s) => s.id !== op.entityId);
      // Fallback active space if deleted
      if (cloned.activeSpaceId === op.entityId) {
        cloned.activeSpaceId = cloned.spaces[0]?.id || 'space_fallback';
      }
      // Reparent or remove orphaned folders & tabs
      const fallbackSpaceId = cloned.spaces[0]?.id || 'space_fallback';
      cloned.folders = cloned.folders.map((f) =>
        f.parentSpaceId === op.entityId ? { ...f, parentSpaceId: fallbackSpaceId } : f
      );
      cloned.tabs = cloned.tabs.map((t) =>
        t.parentSpaceId === op.entityId ? { ...t, parentSpaceId: fallbackSpaceId } : t
      );
      break;
    }

    // ================= Folder Operations =================
    case 'FOLDER_CREATE': {
      const existingIdx = cloned.folders.findIndex((f) => f.id === op.entityId);
      const folderData: Folder = {
        id: op.entityId,
        name: op.payload?.name || 'New Folder',
        parentSpaceId: op.payload?.parentSpaceId || cloned.activeSpaceId,
        parentFolderId: op.payload?.parentFolderId || undefined,
        customEmojiIcon: op.payload?.customEmojiIcon || '📁',
        colors: op.payload?.colors || undefined,
        isExpanded: op.payload?.isExpanded !== undefined ? op.payload.isExpanded : true,
        order: op.payload?.order !== undefined ? op.payload.order : undefined,
        createdAt: op.payload?.createdAt || op.timestamp,
        updatedAt: op.timestamp,
      };

      if (existingIdx >= 0) {
        cloned.folders[existingIdx] = { ...cloned.folders[existingIdx], ...folderData };
      } else {
        cloned.folders.push(folderData);
      }
      break;
    }

    case 'FOLDER_UPDATE': {
      const existingIdx = cloned.folders.findIndex((f) => f.id === op.entityId);
      if (existingIdx >= 0) {
        const current = cloned.folders[existingIdx];
        const updated: Folder = {
          ...current,
          ...op.payload,
          updatedAt: op.timestamp,
        };

        if (op.payload) {
          if ('customEmojiIcon' in op.payload) updated.customEmojiIcon = op.payload.customEmojiIcon || undefined;
          if ('parentFolderId' in op.payload) updated.parentFolderId = op.payload.parentFolderId || undefined;
          if ('colors' in op.payload) updated.colors = op.payload.colors || undefined;
        }

        cloned.folders[existingIdx] = updated;

        // If parentSpaceId changed, cascade space change to all descendant folders and tabs
        if (op.payload?.parentSpaceId && op.payload.parentSpaceId !== current.parentSpaceId) {
          const newSpaceId = op.payload.parentSpaceId;
          const descendantFolderIds = getDescendantFolderIds(op.entityId, cloned.folders);

          cloned.folders = cloned.folders.map((f) =>
            descendantFolderIds.has(f.id) ? { ...f, parentSpaceId: newSpaceId, updatedAt: op.timestamp } : f
          );

          cloned.tabs = cloned.tabs.map((t) =>
            !t.favourite && (t.parentFolderId === op.entityId || (t.parentFolderId && descendantFolderIds.has(t.parentFolderId)))
              ? { ...t, parentSpaceId: newSpaceId, updatedAt: op.timestamp }
              : t
          );
        }
      }
      break;
    }

    case 'FOLDER_DELETE': {
      const descendantFolderIds = getDescendantFolderIds(op.entityId, cloned.folders);
      const folderIdsToDelete = new Set<string>([op.entityId, ...descendantFolderIds]);

      cloned.folders = cloned.folders.filter((f) => !folderIdsToDelete.has(f.id));
      cloned.tabs = cloned.tabs.filter(
        (t) => !t.parentFolderId || !folderIdsToDelete.has(t.parentFolderId)
      );
      break;
    }

    // ================= Tab Operations =================
    case 'TAB_CREATE': {
      const existingIdx = cloned.tabs.findIndex((t) => t.id === op.entityId);
      const isFav = Boolean(op.payload?.favourite);
      const isPinned = !isFav && Boolean(op.payload?.pinned);

      const tabData: Tab = {
        id: op.entityId,
        url: op.payload?.url || 'https://arcable.dev',
        pinned: isPinned,
        favourite: isFav || undefined,
        customTitle: op.payload?.customTitle,
        customEmojiIcon: op.payload?.customEmojiIcon,
        parentSpaceId: isFav ? undefined : (op.payload?.parentSpaceId || cloned.activeSpaceId),
        parentFolderId: (isFav || isPinned) ? undefined : (op.payload?.parentFolderId || undefined),
        order: op.payload?.order !== undefined ? op.payload.order : undefined,
        createdAt: op.payload?.createdAt || op.timestamp,
        updatedAt: op.timestamp,
      };

      if (existingIdx >= 0) {
        cloned.tabs[existingIdx] = { ...cloned.tabs[existingIdx], ...tabData };
      } else {
        cloned.tabs.push(tabData);
      }
      break;
    }

    case 'TAB_UPDATE': {
      const existingIdx = cloned.tabs.findIndex((t) => t.id === op.entityId);
      if (existingIdx >= 0) {
        const current = cloned.tabs[existingIdx];
        const updated: Tab = {
          ...current,
          ...op.payload,
          updatedAt: op.timestamp,
        };

        if (op.payload) {
          if ('customEmojiIcon' in op.payload) {
            updated.customEmojiIcon = op.payload.customEmojiIcon || undefined;
          }
          if ('customTitle' in op.payload) {
            updated.customTitle = op.payload.customTitle || undefined;
          }
          if ('parentFolderId' in op.payload) {
            updated.parentFolderId = op.payload.parentFolderId || undefined;
          }
          if ('parentSpaceId' in op.payload) {
            updated.parentSpaceId = op.payload.parentSpaceId || undefined;
          }
        }

        if (updated.favourite) {
          updated.parentSpaceId = undefined;
          updated.parentFolderId = undefined;
          updated.pinned = false;
        } else if (op.payload?.favourite === false && !updated.parentSpaceId) {
          updated.parentSpaceId = cloned.activeSpaceId || cloned.spaces[0]?.id;
        }

        if (updated.pinned) {
          updated.parentFolderId = undefined;
          updated.favourite = false;
        }

        cloned.tabs[existingIdx] = updated;
      }
      break;
    }

    case 'TAB_DELETE': {
      cloned.tabs = cloned.tabs.filter((t) => t.id !== op.entityId);
      break;
    }

    // ================= Tmp Tab Operations =================
    case 'TMP_TAB_CREATE': {
      const tmpTabs = cloned.tmpTabs || (cloned.tmpTabs = []);
      const existingIdx = tmpTabs.findIndex((t) => t.id === op.entityId);
      const tmpData: TmpTab = {
        id: op.entityId,
        url: op.payload?.url || 'about:blank',
        title: op.payload?.title,
        customTitle: op.payload?.customTitle,
        favIconUrl: op.payload?.favIconUrl,
        browserTabId: op.payload?.browserTabId,
        windowId: op.payload?.windowId,
        badge: op.payload?.badge,
        deviceId: op.payload?.deviceId || op.deviceId,
        deviceName: op.payload?.deviceName,
        deviceType: op.payload?.deviceType,
        createdAt: op.payload?.createdAt || op.timestamp,
        updatedAt: op.timestamp,
      };

      if (existingIdx >= 0) {
        tmpTabs[existingIdx] = { ...tmpTabs[existingIdx], ...tmpData };
      } else {
        tmpTabs.push(tmpData);
      }
      break;
    }

    case 'TMP_TAB_UPDATE': {
      const tmpTabs = cloned.tmpTabs || (cloned.tmpTabs = []);
      const existingIdx = tmpTabs.findIndex((t) => t.id === op.entityId);
      if (existingIdx >= 0) {
        const current = tmpTabs[existingIdx];
        tmpTabs[existingIdx] = {
          ...current,
          ...op.payload,
          updatedAt: op.timestamp,
        };
      }
      break;
    }

    case 'TMP_TAB_DELETE': {
      const tmpTabs = cloned.tmpTabs || (cloned.tmpTabs = []);
      cloned.tmpTabs = tmpTabs.filter((t) => t.id !== op.entityId);
      break;
    }

    // ================= Widget Operations =================
    case 'WIDGET_CREATE': {
      const widgets = cloned.widgets || (cloned.widgets = []);
      const existingIdx = widgets.findIndex((w) => w.id === op.entityId);
      const widgetData: WorkspaceWidget = {
        id: op.entityId,
        style: op.payload?.style || 'digital',
        size: op.payload?.size || 'medium',
        order: op.payload?.order !== undefined ? op.payload.order : undefined,
        config: op.payload?.config,
        createdAt: op.payload?.createdAt || op.timestamp,
        updatedAt: op.timestamp,
      };

      if (existingIdx >= 0) {
        widgets[existingIdx] = { ...widgets[existingIdx], ...widgetData };
      } else {
        widgets.push(widgetData);
      }
      break;
    }

    case 'WIDGET_UPDATE': {
      const widgets = cloned.widgets || (cloned.widgets = []);
      const existingIdx = widgets.findIndex((w) => w.id === op.entityId);
      if (existingIdx >= 0) {
        widgets[existingIdx] = {
          ...widgets[existingIdx],
          ...op.payload,
          updatedAt: op.timestamp,
        };
      }
      break;
    }

    case 'WIDGET_DELETE': {
      const widgets = cloned.widgets || (cloned.widgets = []);
      cloned.widgets = widgets.filter((w) => w.id !== op.entityId);
      break;
    }

    // ================= Custom Code Operations =================
    case 'CUSTOM_CODE_CREATE': {
      const rules = cloned.customCodeRules || (cloned.customCodeRules = []);
      const existingIdx = rules.findIndex((r) => r.id === op.entityId);
      const ruleData: CustomCodeRule = {
        id: op.entityId,
        pattern: op.payload?.pattern || '*://*/*',
        css: typeof op.payload?.css === 'string' ? op.payload.css : '',
        js: typeof op.payload?.js === 'string' ? op.payload.js : '',
        disabled: Boolean(op.payload?.disabled),
        createdAt: op.payload?.createdAt || new Date(op.timestamp).toISOString(),
        updatedAt: new Date(op.timestamp).toISOString(),
      };

      if (existingIdx >= 0) {
        rules[existingIdx] = { ...rules[existingIdx], ...ruleData };
      } else {
        rules.push(ruleData);
      }
      break;
    }

    case 'CUSTOM_CODE_UPDATE': {
      const rules = cloned.customCodeRules || (cloned.customCodeRules = []);
      const existingIdx = rules.findIndex((r) => r.id === op.entityId);
      if (existingIdx >= 0) {
        const current = rules[existingIdx];
        rules[existingIdx] = {
          ...current,
          ...op.payload,
          updatedAt: new Date(op.timestamp).toISOString(),
        };
      }
      break;
    }

    case 'CUSTOM_CODE_DELETE': {
      const rules = cloned.customCodeRules || (cloned.customCodeRules = []);
      cloned.customCodeRules = rules.filter((r) => r.id !== op.entityId);
      break;
    }

    // ================= Run Code Operations =================
    case 'RUN_CODE_CREATE': {
      const rules = cloned.runCodeInPageRules || (cloned.runCodeInPageRules = []);
      const existingIdx = rules.findIndex((r) => r.id === op.entityId);
      const ruleData: RunCodeRule = {
        id: op.entityId,
        title: op.payload?.title || 'Untitled Snippet',
        patterns: Array.isArray(op.payload?.patterns) ? op.payload.patterns : [],
        code: typeof op.payload?.code === 'string' ? op.payload.code : '',
        disabled: Boolean(op.payload?.disabled),
        createdAt: op.payload?.createdAt || new Date(op.timestamp).toISOString(),
        updatedAt: new Date(op.timestamp).toISOString(),
      };

      if (existingIdx >= 0) {
        rules[existingIdx] = { ...rules[existingIdx], ...ruleData };
      } else {
        rules.push(ruleData);
      }
      break;
    }

    case 'RUN_CODE_UPDATE': {
      const rules = cloned.runCodeInPageRules || (cloned.runCodeInPageRules = []);
      const existingIdx = rules.findIndex((r) => r.id === op.entityId);
      if (existingIdx >= 0) {
        const current = rules[existingIdx];
        rules[existingIdx] = {
          ...current,
          ...op.payload,
          updatedAt: new Date(op.timestamp).toISOString(),
        };
      }
      break;
    }

    case 'RUN_CODE_DELETE': {
      const rules = cloned.runCodeInPageRules || (cloned.runCodeInPageRules = []);
      cloned.runCodeInPageRules = rules.filter((r) => r.id !== op.entityId);
      break;
    }
  }

  return cloned;
}

/**
 * Deterministically sorts operations by (timestamp, lamportSeq, deviceId, id).
 */
export function sortOperations(ops: WorkspaceOperation[]): WorkspaceOperation[] {
  return [...ops].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    if (a.lamportSeq !== b.lamportSeq) {
      return a.lamportSeq - b.lamportSeq;
    }
    const devCompare = a.deviceId.localeCompare(b.deviceId);
    if (devCompare !== 0) {
      return devCompare;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Replays a list of operations on top of a baseline snapshot,
 * applying defensive structure validations.
 */
export function replayOperations(
  baseline: ArcableWorkspaceData,
  ops: WorkspaceOperation[]
): ArcableWorkspaceData {
  const sorted = sortOperations(ops);
  let state: ArcableWorkspaceData = {
    spaces: [...baseline.spaces],
    folders: [...baseline.folders],
    tabs: [...baseline.tabs],
    tmpTabs: [...(baseline.tmpTabs || [])],
    widgets: [...(baseline.widgets || [])],
    customCodeRules: [...(baseline.customCodeRules || [])],
    runCodeInPageRules: [...(baseline.runCodeInPageRules || [])],
    activeSpaceId: baseline.activeSpaceId,
    version: baseline.version || 1,
    devices: baseline.devices ? { ...baseline.devices } : undefined,
  };

  for (const op of sorted) {
    state = applyOperation(state, op);
  }

  // Defensive validation & relationship repair
  if (state.spaces.length === 0) {
    const fallbackSpace: Space = {
      id: 'space_default',
      name: 'General',
      emojiIcon: '🌐',
      colors: '#6366f1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.spaces = [fallbackSpace];
    state.activeSpaceId = fallbackSpace.id;
  }

  const spaceIds = new Set(state.spaces.map((s) => s.id));
  if (!spaceIds.has(state.activeSpaceId)) {
    state.activeSpaceId = state.spaces[0].id;
  }

  const folderIds = new Set(state.folders.map((f) => f.id));

  // Repair folders
  state.folders = state.folders.map((f) => {
    const validSpace = spaceIds.has(f.parentSpaceId) ? f.parentSpaceId : state.activeSpaceId;
    const validParentFolder = f.parentFolderId && folderIds.has(f.parentFolderId) && f.parentFolderId !== f.id
      ? f.parentFolderId
      : undefined;
    return {
      ...f,
      parentSpaceId: validSpace,
      parentFolderId: validParentFolder,
    };
  });

  // Self-heal: propagate parentSpaceId from parent folders to child folders
  let changed = true;
  while (changed) {
    changed = false;
    const fMap = new Map<string, Folder>(state.folders.map((f) => [f.id, f]));
    state.folders = state.folders.map((f) => {
      if (f.parentFolderId && fMap.has(f.parentFolderId)) {
        const parent = fMap.get(f.parentFolderId)!;
        if (parent.parentSpaceId && f.parentSpaceId !== parent.parentSpaceId) {
          changed = true;
          return { ...f, parentSpaceId: parent.parentSpaceId };
        }
      }
      return f;
    });
  }

  const updatedFolderMap = new Map<string, Folder>(state.folders.map((f) => [f.id, f]));

  // Repair tabs
  state.tabs = state.tabs.map((t) => {
    if (t.favourite) {
      return {
        ...t,
        favourite: true,
        pinned: false,
        parentSpaceId: undefined,
        parentFolderId: undefined,
      };
    }
    const validParentFolder = !t.pinned && t.parentFolderId && folderIds.has(t.parentFolderId)
      ? t.parentFolderId
      : undefined;
    const folderSpace = validParentFolder ? updatedFolderMap.get(validParentFolder)?.parentSpaceId : undefined;
    const validSpace = folderSpace || (spaceIds.has(t.parentSpaceId || '') ? t.parentSpaceId : state.activeSpaceId);
    return {
      ...t,
      favourite: false,
      parentSpaceId: validSpace,
      parentFolderId: validParentFolder,
    };
  });

  // Chronological sort for tmpTabs (newest first)
  if (state.tmpTabs && state.tmpTabs.length > 0) {
    state.tmpTabs.sort(
      (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    );
  } else {
    state.tmpTabs = [];
  }

  // Deterministic sort for widgets (order, then createdAt, then id)
  if (state.widgets && state.widgets.length > 0) {
    state.widgets = [...state.widgets].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.createdAt || 0;
      const orderB = b.order !== undefined ? b.order : b.createdAt || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
  } else {
    state.widgets = [];
  }

  // Deterministic sort for custom code and run code rules
  if (state.customCodeRules && state.customCodeRules.length > 0) {
    state.customCodeRules = sortCustomCodeRules(state.customCodeRules);
  } else {
    state.customCodeRules = [];
  }

  if (state.runCodeInPageRules && state.runCodeInPageRules.length > 0) {
    state.runCodeInPageRules = sortRunCodeRules(state.runCodeInPageRules);
  } else {
    state.runCodeInPageRules = [];
  }

  return state;
}

/**
 * Compacts the ArcableSyncFile by:
 * 1. Updating current device's lastSyncAt timestamp
 * 2. Pruning inactive devices older than 7 days (device registry retention)
 * 3. Identifying "online" devices (lastSyncAt within last 10 minutes)
 * 4. Finding oldest ONLINE device sync time (compaction cutoff). If only current device is online, cutoff is now.
 * 5. Rolling operations older than cutoff into baselineSnapshot
 * 6. Computing latest snapshot for local rendering
 */
export function compactSyncFile(
  syncFile: ArcableSyncFile,
  currentDeviceId: string,
  pendingOps: WorkspaceOperation[],
  deviceName?: string,
  now: number = Date.now(),
  localTmpTabs?: TmpTab[]
): { syncFile: ArcableSyncFile; latestSnapshot: ArcableWorkspaceData } {
  // 1. Ensure devices map exists
  const devices: Record<string, DeviceSyncRecord> = { ...(syncFile.devices || {}) };

  // Update current device
  devices[currentDeviceId] = {
    deviceId: currentDeviceId,
    deviceName: deviceName || devices[currentDeviceId]?.deviceName || getDefaultDeviceName(),
    lastSyncAt: now,
  };

  // 2. Prune inactive devices (older than 7 days), always keeping currentDeviceId in registry
  const registeredDevices: DeviceSyncRecord[] = [];
  const prunedDevices: Record<string, DeviceSyncRecord> = {};

  for (const [id, dev] of Object.entries(devices)) {
    if (id === currentDeviceId || now - dev.lastSyncAt <= DEVICE_INACTIVITY_TTL_MS) {
      prunedDevices[id] = dev;
      registeredDevices.push(dev);
    }
  }

  // 3. Filter for ONLINE devices (within 10 minutes) to compute compaction cutoff
  const onlineDevices = registeredDevices.filter(
    (dev) => dev.deviceId === currentDeviceId || isDeviceOnline(dev.lastSyncAt, now)
  );

  // 4. Combine existing operations with new pending operations (deduplicate by op.id)
  const existingOpMap = new Map<string, WorkspaceOperation>();
  for (const op of syncFile.operations || []) {
    existingOpMap.set(op.id, op);
  }
  for (const op of pendingOps) {
    existingOpMap.set(op.id, op);
  }

  const allOps = Array.from(existingOpMap.values());

  // 5. Compute compaction cutoff
  // Cutoff is the minimum lastSyncAt among all ONLINE devices.
  // If only currentDeviceId is online, cutoff is currentDeviceId.lastSyncAt (= now),
  // which immediately folds all historical operations into baselineSnapshot.
  const cutoffTimestamp = onlineDevices.length > 0
    ? Math.min(...onlineDevices.map((d) => d.lastSyncAt))
    : now;

  // 6. Partition operations: fold those <= cutoff into baselineSnapshot
  const opsToFold: WorkspaceOperation[] = [];
  const remainingOps: WorkspaceOperation[] = [];

  for (const op of allOps) {
    if (op.timestamp <= cutoffTimestamp) {
      opsToFold.push(op);
    } else {
      remainingOps.push(op);
    }
  }

  // 7. Fold ops into baseline
  const newBaseline = replayOperations(syncFile.baselineSnapshot, opsToFold);

  // 8. Reconcile tmpTabs across devices:
  // - Tabs belonging to other active devices (t.deviceId !== currentDeviceId) are preserved.
  // - Tabs belonging to currentDeviceId are updated from localTmpTabs (if provided), omitting any deleted tabs.
  const deletedTmpTabIds: Record<string, number> = { ...(syncFile.deletedTmpTabIds || {}) };
  for (const op of allOps) {
    if (op.type === 'TMP_TAB_DELETE' && op.entityId) {
      deletedTmpTabIds[op.entityId] = Math.max(deletedTmpTabIds[op.entityId] || 0, op.timestamp || now);
    }
  }

  // Prune tombstones older than 7 days
  for (const [id, delTime] of Object.entries(deletedTmpTabIds)) {
    if (now - delTime > DEVICE_INACTIVITY_TTL_MS) {
      delete deletedTmpTabIds[id];
    }
  }

  const isTabDeleted = (tabId: string) => deletedTmpTabIds[tabId] !== undefined;

  const otherDeviceMap = new Map<string, TmpTab>();
  for (const t of newBaseline.tmpTabs || []) {
    if (t.deviceId && t.deviceId !== currentDeviceId && !isTabDeleted(t.id)) {
      otherDeviceMap.set(t.id, t);
    }
  }
  // Also preserve any non-current-device tabs passed in localTmpTabs (if not deleted)
  for (const t of localTmpTabs || []) {
    if (t.deviceId && t.deviceId !== currentDeviceId && !otherDeviceMap.has(t.id) && !isTabDeleted(t.id)) {
      otherDeviceMap.set(t.id, t);
    }
  }

  if (localTmpTabs !== undefined) {
    const currentDeviceTabs = localTmpTabs
      .filter((t) => !t.deviceId || t.deviceId === currentDeviceId)
      .map((t) => ({
        ...t,
        deviceId: currentDeviceId,
        deviceName: t.deviceName || deviceName || devices[currentDeviceId]?.deviceName,
        deviceType: t.deviceType || (deviceName?.includes('Web App') ? 'Web App' : 'Ext'),
      }))
      .filter((t) => !isTabDeleted(t.id));

    newBaseline.tmpTabs = [...Array.from(otherDeviceMap.values()), ...currentDeviceTabs];
  } else {
    // Keep baseline's current-device tabs if not deleted
    const currentDeviceTabs = (newBaseline.tmpTabs || []).filter(
      (t) => (!t.deviceId || t.deviceId === currentDeviceId) && !isTabDeleted(t.id)
    );
    newBaseline.tmpTabs = [...Array.from(otherDeviceMap.values()), ...currentDeviceTabs];
  }

  // 9. Replay remaining ops on top of new baseline to get latest state
  const latestSnapshot = replayOperations(newBaseline, remainingOps);

  // 10. Prune tmpTabs belonging to devices that are inactive for > 7 days (or removed from registry)
  const isTabActive = (t: TmpTab) =>
    !t.deviceId || t.deviceId === currentDeviceId || prunedDevices[t.deviceId] !== undefined;

  if (newBaseline.tmpTabs) {
    newBaseline.tmpTabs = newBaseline.tmpTabs.filter(isTabActive);
    newBaseline.tmpTabs.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }
  if (latestSnapshot.tmpTabs) {
    latestSnapshot.tmpTabs = latestSnapshot.tmpTabs.filter(isTabActive);
    latestSnapshot.tmpTabs.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }

  const updatedSyncFile: ArcableSyncFile = {
    version: (syncFile.version || 1) + 1,
    devices: prunedDevices,
    baselineSnapshot: newBaseline,
    operations: sortOperations(remainingOps),
    deletedTmpTabIds,
  };

  return {
    syncFile: updatedSyncFile,
    latestSnapshot,
  };
}

/**
 * Re-compacts and updates ArcableSyncFile when a device is deleted/removed.
 * - Removes the specified device from `syncFile.devices`.
 * - Determines the new compaction cutoff:
 *   If other active online devices remain, cutoff is min(lastSyncAt) of remaining online devices.
 *   If no other online devices remain, cutoff is `now`.
 * - Folds all operations <= cutoff into baselineSnapshot and prunes them from operations.
 * - Returns the updated syncFile and resolved latestSnapshot.
 */
export function recomputeSyncFileOnDeviceRemoval(
  syncFile: ArcableSyncFile,
  removedDeviceId: string,
  now: number = Date.now()
): { syncFile: ArcableSyncFile; latestSnapshot: ArcableWorkspaceData } {
  const devices: Record<string, DeviceSyncRecord> = { ...(syncFile.devices || {}) };
  delete devices[removedDeviceId];

  // Prune any remaining inactive devices older than 7 days from registry
  const remainingRegisteredDevices: DeviceSyncRecord[] = [];
  const validDevices: Record<string, DeviceSyncRecord> = {};

  for (const [id, dev] of Object.entries(devices)) {
    if (now - dev.lastSyncAt <= DEVICE_INACTIVITY_TTL_MS) {
      validDevices[id] = dev;
      remainingRegisteredDevices.push(dev);
    }
  }

  // Filter for online devices (within 10 minutes)
  const remainingOnlineDevices = remainingRegisteredDevices.filter((dev) =>
    isDeviceOnline(dev.lastSyncAt, now)
  );

  // Calculate new cutoff
  const cutoffTimestamp = remainingOnlineDevices.length > 0
    ? Math.min(...remainingOnlineDevices.map((d) => d.lastSyncAt))
    : now;

  // Deduplicate and partition operations
  const existingOpMap = new Map<string, WorkspaceOperation>();
  for (const op of syncFile.operations || []) {
    existingOpMap.set(op.id, op);
  }

  const allOps = Array.from(existingOpMap.values());
  const opsToFold: WorkspaceOperation[] = [];
  const remainingOps: WorkspaceOperation[] = [];

  for (const op of allOps) {
    if (op.timestamp <= cutoffTimestamp) {
      opsToFold.push(op);
    } else {
      remainingOps.push(op);
    }
  }

  // Fold into baseline
  const newBaseline = replayOperations(syncFile.baselineSnapshot, opsToFold);
  const latestSnapshot = replayOperations(newBaseline, remainingOps);

  if (newBaseline.tmpTabs) {
    newBaseline.tmpTabs = newBaseline.tmpTabs.filter((t) => t.deviceId !== removedDeviceId);
  }
  if (latestSnapshot.tmpTabs) {
    latestSnapshot.tmpTabs = latestSnapshot.tmpTabs.filter((t) => t.deviceId !== removedDeviceId);
  }

  const updatedSyncFile: ArcableSyncFile = {
    version: (syncFile.version || 1) + 1,
    devices: validDevices,
    baselineSnapshot: newBaseline,
    operations: sortOperations(remainingOps),
    deletedTmpTabIds: syncFile.deletedTmpTabIds,
  };

  return {
    syncFile: updatedSyncFile,
    latestSnapshot,
  };
}

/**
 * Re-compacts and updates ArcableSyncFile when deleting all other devices except keepDeviceId.
 * - Retains ONLY keepDeviceId in `syncFile.devices`.
 * - Determines cutoff = devices[keepDeviceId].lastSyncAt (or now).
 * - Folds all operations <= cutoff into baselineSnapshot and prunes them from operations.
 * - Returns the updated syncFile and resolved latestSnapshot.
 */
export function recomputeSyncFileOnDeleteOtherDevices(
  syncFile: ArcableSyncFile,
  keepDeviceId: string,
  now: number = Date.now()
): { syncFile: ArcableSyncFile; latestSnapshot: ArcableWorkspaceData } {
  const currentRecord = syncFile.devices?.[keepDeviceId];
  const validDevices: Record<string, DeviceSyncRecord> = {
    [keepDeviceId]: currentRecord || {
      deviceId: keepDeviceId,
      deviceName: getDefaultDeviceName(),
      lastSyncAt: now,
    },
  };

  const cutoffTimestamp = validDevices[keepDeviceId].lastSyncAt || now;

  // Deduplicate and partition operations
  const existingOpMap = new Map<string, WorkspaceOperation>();
  for (const op of syncFile.operations || []) {
    existingOpMap.set(op.id, op);
  }

  const allOps = Array.from(existingOpMap.values());
  const opsToFold: WorkspaceOperation[] = [];
  const remainingOps: WorkspaceOperation[] = [];

  for (const op of allOps) {
    if (op.timestamp <= cutoffTimestamp) {
      opsToFold.push(op);
    } else {
      remainingOps.push(op);
    }
  }

  // Fold into baseline
  const newBaseline = replayOperations(syncFile.baselineSnapshot, opsToFold);
  const latestSnapshot = replayOperations(newBaseline, remainingOps);

  if (newBaseline.tmpTabs) {
    newBaseline.tmpTabs = newBaseline.tmpTabs.filter((t) => !t.deviceId || t.deviceId === keepDeviceId);
  }
  if (latestSnapshot.tmpTabs) {
    latestSnapshot.tmpTabs = latestSnapshot.tmpTabs.filter((t) => !t.deviceId || t.deviceId === keepDeviceId);
  }

  const updatedSyncFile: ArcableSyncFile = {
    version: (syncFile.version || 1) + 1,
    devices: validDevices,
    baselineSnapshot: newBaseline,
    operations: sortOperations(remainingOps),
    deletedTmpTabIds: syncFile.deletedTmpTabIds,
  };

  return {
    syncFile: updatedSyncFile,
    latestSnapshot,
  };
}

/**
 * Checks if a snapshot is just a fallback/empty placeholder structure
 * (e.g. created during server-side initializations with only space_default and no tabs/folders).
 */
export function isPlaceholderSnapshot(data: ArcableWorkspaceData | undefined | null): boolean {
  if (!data) return true;
  if (!data.spaces || data.spaces.length === 0) return true;
  if (
    data.spaces.length === 1 &&
    (data.spaces[0].id === 'space_default' || data.spaces[0].id === 'space_fallback') &&
    (!data.folders || data.folders.length === 0) &&
    (!data.tabs || data.tabs.length === 0)
  ) {
    return true;
  }
  return false;
}

/**
 * Creates an empty/initial ArcableSyncFile bootstrapped with a given initial state.
 */
export function createInitialSyncFile(
  initialState: ArcableWorkspaceData,
  deviceId: string = getOrCreateDeviceId(),
  deviceName?: string
): ArcableSyncFile {
  const now = Date.now();
  return {
    version: 1,
    devices: {
      [deviceId]: {
        deviceId,
        deviceName: deviceName || getDefaultDeviceName(),
        lastSyncAt: now,
      },
    },
    baselineSnapshot: {
      ...initialState,
      tmpTabs: initialState.tmpTabs || [],
      widgets: initialState.widgets || [],
      customCodeRules: initialState.customCodeRules || [],
      runCodeInPageRules: initialState.runCodeInPageRules || [],
    },
    operations: [],
  };
}

/**
 * Sorts devices by lastSyncAt descending (most recent first).
 * If lastSyncAt is identical or missing, sorts alphabetically by deviceName/deviceId.
 */
export function sortDevicesByLastSync(devices: DeviceSyncRecord[]): DeviceSyncRecord[] {
  return [...devices].sort((a, b) => {
    const timeA = a.lastSyncAt || 0;
    const timeB = b.lastSyncAt || 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return (a.deviceName || a.deviceId || '').localeCompare(b.deviceName || b.deviceId || '');
  });
}

