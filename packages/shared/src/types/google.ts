import type { ArcableWorkspaceData } from './workspace';

export interface GoogleUserProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface GoogleAuthState {
  isAuthenticated: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: GoogleUserProfile;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType?: string;
  version?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  webViewLink?: string;
}

/** On-disk format of `Arcable/workspace.json` in Google Drive. */
export interface DriveWorkspaceFile {
  format: 'arcable-workspace';
  schemaVersion: number;
  arcableVersion?: string;
  updatedAt: number;
  updatedBy?: { deviceId?: string; deviceName?: string };
  lamportSeq?: number;
  /** Set when the workspace was migrated away from Drive; the file is then read-only. */
  migratedTo?: 'raindrop';
  data: ArcableWorkspaceData;
}
