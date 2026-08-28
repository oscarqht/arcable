import { ArcableWorkspaceData, Space, Folder, Tab } from '../types/workspace';
import { WorkspaceOperation, OperationType, ArcableSyncFile, DeviceSyncRecord } from '../types/sync';
import { generateId } from './format';

export const DEVICE_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PENDING_OPS_STORAGE_KEY = 'arcable_pending_ops';
export const DEVICE_ID_STORAGE_KEY = 'arcable_device_id';
export const LAMPORT_SEQ_STORAGE_KEY = 'arcable_lamport_seq';

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
      }
      break;
    }

    case 'FOLDER_DELETE': {
      const deletedFolder = cloned.folders.find((f) => f.id === op.entityId);
      const fallbackParent = deletedFolder?.parentFolderId;
      cloned.folders = cloned.folders.filter((f) => f.id !== op.entityId);

      // Reparent children to prevent loss
      cloned.folders = cloned.folders.map((f) =>
        f.parentFolderId === op.entityId ? { ...f, parentFolderId: fallbackParent } : f
      );
      cloned.tabs = cloned.tabs.map((t) =>
        t.parentFolderId === op.entityId ? { ...t, parentFolderId: fallbackParent } : t
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
    activeSpaceId: baseline.activeSpaceId,
    version: baseline.version || 1,
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
    const validSpace = spaceIds.has(t.parentSpaceId || '') ? t.parentSpaceId : state.activeSpaceId;
    const validParentFolder = !t.pinned && t.parentFolderId && folderIds.has(t.parentFolderId)
      ? t.parentFolderId
      : undefined;
    return {
      ...t,
      favourite: false,
      parentSpaceId: validSpace,
      parentFolderId: validParentFolder,
    };
  });

  return state;
}

/**
 * Compacts the ArcableSyncFile by:
 * 1. Updating current device's lastSyncAt timestamp
 * 2. Pruning inactive devices older than 7 days
 * 3. Appending local pending operations
 * 4. Finding oldest active device sync time (compaction cutoff)
 * 5. Rolling operations older than cutoff into baselineSnapshot
 * 6. Computing latest snapshot for local rendering
 */
export function compactSyncFile(
  syncFile: ArcableSyncFile,
  currentDeviceId: string,
  pendingOps: WorkspaceOperation[],
  deviceName?: string,
  now: number = Date.now()
): { syncFile: ArcableSyncFile; latestSnapshot: ArcableWorkspaceData } {
  // 1. Ensure devices map exists
  const devices: Record<string, DeviceSyncRecord> = { ...(syncFile.devices || {}) };

  // Update current device
  devices[currentDeviceId] = {
    deviceId: currentDeviceId,
    deviceName: deviceName || devices[currentDeviceId]?.deviceName || 'Browser Device',
    lastSyncAt: now,
  };

  // 2. Prune inactive devices (older than 7 days), always keeping currentDeviceId
  const activeDevices: DeviceSyncRecord[] = [];
  const prunedDevices: Record<string, DeviceSyncRecord> = {};

  for (const [id, dev] of Object.entries(devices)) {
    if (id === currentDeviceId || now - dev.lastSyncAt <= DEVICE_INACTIVITY_TTL_MS) {
      prunedDevices[id] = dev;
      activeDevices.push(dev);
    }
  }

  // 3. Combine existing operations with new pending operations (deduplicate by op.id)
  const existingOpMap = new Map<string, WorkspaceOperation>();
  for (const op of syncFile.operations || []) {
    existingOpMap.set(op.id, op);
  }
  for (const op of pendingOps) {
    existingOpMap.set(op.id, op);
  }

  const allOps = Array.from(existingOpMap.values());

  // 4. Compute compaction cutoff
  // Cutoff is the minimum lastSyncAt among all active devices
  const cutoffTimestamp = Math.min(...activeDevices.map((d) => d.lastSyncAt));

  // 5. Partition operations: fold those <= cutoff into baselineSnapshot
  const opsToFold: WorkspaceOperation[] = [];
  const remainingOps: WorkspaceOperation[] = [];

  for (const op of allOps) {
    if (op.timestamp <= cutoffTimestamp) {
      opsToFold.push(op);
    } else {
      remainingOps.push(op);
    }
  }

  // 6. Fold ops into baseline
  const newBaseline = replayOperations(syncFile.baselineSnapshot, opsToFold);

  // 7. Replay remaining ops on top of new baseline to get latest state
  const latestSnapshot = replayOperations(newBaseline, remainingOps);

  const updatedSyncFile: ArcableSyncFile = {
    version: (syncFile.version || 1) + 1,
    devices: prunedDevices,
    baselineSnapshot: newBaseline,
    operations: sortOperations(remainingOps),
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
        deviceName: deviceName || 'Primary Device',
        lastSyncAt: now,
      },
    },
    baselineSnapshot: initialState,
    operations: [],
  };
}
