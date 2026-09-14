import { ArcableWorkspaceData } from './workspace';

export type OperationType =
  | 'SPACE_CREATE'
  | 'SPACE_UPDATE'
  | 'SPACE_DELETE'
  | 'FOLDER_CREATE'
  | 'FOLDER_UPDATE'
  | 'FOLDER_DELETE'
  | 'TAB_CREATE'
  | 'TAB_UPDATE'
  | 'TAB_DELETE'
  | 'TMP_TAB_CREATE'
  | 'TMP_TAB_UPDATE'
  | 'TMP_TAB_DELETE'
  | 'WIDGET_CREATE'
  | 'WIDGET_UPDATE'
  | 'WIDGET_DELETE'
  | 'CUSTOM_CODE_CREATE'
  | 'CUSTOM_CODE_UPDATE'
  | 'CUSTOM_CODE_DELETE'
  | 'RUN_CODE_CREATE'
  | 'RUN_CODE_UPDATE'
  | 'RUN_CODE_DELETE';

export interface WorkspaceOperation {
  id: string;              // Unique operation ID (e.g. op_1700000000_abc)
  type: OperationType;
  entityId: string;        // ID of space / folder / tab
  payload?: any;           // Specific entity data or partial update
  deviceId: string;        // Device ID that authored this op
  timestamp: number;       // Wall clock timestamp (ms)
  lamportSeq: number;      // Lamport logical clock sequence
}

export interface DeviceSyncRecord {
  deviceId: string;
  deviceName?: string;
  lastSyncAt: number;      // Timestamp of device's last successful sync
}

export interface ArcableSyncFile {
  version: number;
  devices: Record<string, DeviceSyncRecord>; // deviceId -> DeviceSyncRecord
  baselineSnapshot: ArcableWorkspaceData;     // Compacted state
  operations: WorkspaceOperation[];          // Pending operations log since baseline
  deletedTmpTabIds?: Record<string, number>; // entityId -> deletedAt timestamp tombstone
}

export interface SyncResult {
  success: boolean;
  collectionId?: number;
  dataItemId?: number;
  latestSnapshot?: ArcableWorkspaceData;
  syncFile?: ArcableSyncFile;
  opsAppliedCount?: number;
  error?: string;
  syncedAt?: number;
}

export type SyncProvider = 'raindrop' | 'local';

export interface WorkspaceSyncRequest {
  baseVersion: number;
  deviceId: string;
  deviceName?: string;
  operations: WorkspaceOperation[];
  initialState?: ArcableWorkspaceData;
}

export interface WorkspaceSyncResponse {
  success: boolean;
  serverVersion: number;
  diffs?: WorkspaceOperation[];
  fullState?: ArcableWorkspaceData;
  error?: string;
}

// Aliases for compatibility during transition
export type SupabaseSyncRequest = WorkspaceSyncRequest;
export type SupabaseSyncResponse = WorkspaceSyncResponse;


