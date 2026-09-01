export interface RaindropRawUser {
  _id: number;
  fullName: string;
  email?: string;
  email_MD5?: string;
  pro?: boolean;
  registered?: string;
  avatar?: string;
}

export interface RaindropUserProfile {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string;
  isPro?: boolean;
}

export type RaindropAuthType = 'oauth' | 'token';

export interface RaindropAuthState {
  isAuthenticated: boolean;
  authType?: RaindropAuthType;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: RaindropUserProfile;
}

export interface RaindropTokenResponse {
  result?: boolean;
  access_token: string;
  refresh_token?: string;
  expires?: number;
  expires_in?: number;
  token_type?: string;
  error?: string;
  errorMessage?: string;
}

export interface RaindropCollectionItem {
  _id: number;
  title: string;
  count?: number;
  color?: string;
  parent?: { $id: number };
}

export interface RaindropFileItem {
  name?: string;
  size?: number;
  type?: string;
  path?: string;
}

export interface RaindropBookmarkItem {
  _id: number;
  title: string;
  excerpt?: string;
  note?: string;
  link: string;
  type?: string;
  cover?: string;
  tags?: string[];
  collectionId?: number;
  file?: RaindropFileItem;
  created?: string;
  lastUpdate?: string;
}

export interface RaindropCreateItemInput {
  title?: string;
  link: string;
  excerpt?: string;
  tags?: string[];
  collectionId?: number;
  cover?: string;
  pleaseParse?: Record<string, any>;
}

export interface RaindropSearchItem extends RaindropBookmarkItem {
  collectionTitle?: string;
  parentCollectionTitle?: string;
}

export interface RaindropSearchResult {
  items: RaindropSearchItem[];
  collections: RaindropCollectionItem[];
}

export interface RaindropBackupRecord {
  id: number;
  title: string;
  fileName: string;
  deviceName: string;
  timestampStr?: string;
  date?: string;
  timestamp?: number;
  size?: number;
  link?: string;
  created?: string;
  lastUpdate?: string;
}
