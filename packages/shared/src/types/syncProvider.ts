import type { ArcableWorkspaceData } from './workspace';
import type { SyncResult, WorkspaceOperation } from './sync';
import type { RaindropRequestFailureDetails } from './raindrop';

export type SyncProviderId = 'raindrop' | 'drive';

export interface SyncProviderCapabilities {
  /** Full-text search over the user's bookmarks outside the Arcable workspace. */
  bookmarkSearch: boolean;
  /** Remote icon catalogue for space/folder covers. */
  collectionCoverSearch: boolean;
  /** Server-side page metadata parsing when creating a tab. */
  remoteLinkParsing: boolean;
  /** Save an arbitrary page as a bookmark outside the workspace. */
  saveBookmark: boolean;
}

export interface SyncRequest {
  localState?: ArcableWorkspaceData;
  pendingOps?: WorkspaceOperation[];
  deviceId?: string;
  deviceName?: string;
  /** Overwrite the remote workspace with `localState` (restore / migration target). */
  replaceBaseline?: boolean;
  /** Freshly hydrated state used only to recover remote-issued IDs from a stale UI payload. */
  identitySnapshot?: ArcableWorkspaceData;
  isInitialSync?: boolean;
}

export interface FetchWorkspaceResult {
  success: boolean;
  data?: ArcableWorkspaceData;
  /** False when the backend has no Arcable workspace yet. */
  exists?: boolean;
  /** Set when this backend's workspace was migrated to another backend. */
  migratedTo?: SyncProviderId;
  error?: string;
  errorDetails?: RaindropRequestFailureDetails;
}

export interface CreateBackupResult {
  success: boolean;
  fileName?: string;
  error?: string;
}

export interface SyncProvider {
  readonly id: SyncProviderId;
  readonly label: string;
  readonly capabilities: SyncProviderCapabilities;
  fetchWorkspace(token: string, activeSpaceId?: string): Promise<FetchWorkspaceResult>;
  sync(token: string, request: SyncRequest): Promise<SyncResult>;
  createBackup(token: string, data: ArcableWorkspaceData, deviceName?: string): Promise<CreateBackupResult>;
  /** True when `data` has never been hydrated from this backend on this device. */
  isInitialSync(data: ArcableWorkspaceData | undefined | null): boolean;
}

export interface MigrationResult {
  success: boolean;
  from: SyncProviderId;
  to: SyncProviderId;
  latestSnapshot?: ArcableWorkspaceData;
  error?: string;
}
