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
  | 'TAB_DELETE';

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
