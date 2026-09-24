import type { RaindropRequestFailureDetails } from './raindrop';

export type PlatformType = 'web' | 'chrome-extension' | 'firefox-extension';

export interface ArcableItem {
  id: string;
  title: string;
  url?: string;
  description?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  starred?: boolean;
}

export interface ArcableConfig {
  theme: 'light' | 'dark' | 'system';
  syncEnabled: boolean;
  autoCapture: boolean;
  apiEndpoint?: string;
}

export type ExtensionMessageType =
  | 'GET_CURRENT_TAB'
  | 'SAVE_ITEM'
  | 'GET_ITEMS'
  | 'DELETE_ITEM'
  | 'TOGGLE_STAR'
  | 'PING'
  | 'PONG'
  | 'RAINDROP_GET_AUTH_STATE'
  | 'RAINDROP_LOGIN_TOKEN'
  | 'RAINDROP_START_OAUTH'
  | 'RAINDROP_LOGOUT'
  | 'RAINDROP_SAVE_BOOKMARK'
  | 'RAINDROP_GET_COLLECTIONS'
  | 'RAINDROP_SEARCH_COLLECTION_COVERS'
  | 'RAINDROP_SEARCH'
  | 'RAINDROP_FETCH_WORKSPACE'
  | 'RAINDROP_SYNC_WORKSPACE'
  | 'RAINDROP_GET_DEVICES'
  | 'RAINDROP_RENAME_DEVICE'
  | 'RAINDROP_DELETE_DEVICE'
  | 'RAINDROP_DELETE_OTHER_DEVICES'
  | 'RAINDROP_CREATE_BACKUP'
  | 'RAINDROP_LIST_BACKUPS'
  | 'RAINDROP_RESTORE_BACKUP'
  | 'INJECT_CUSTOM_JS'
  | 'RUN_CODE_IN_PAGE_EXECUTE'
  | 'CHECK_USER_SCRIPTS_AVAILABLE'
  | 'OPEN_EXTENSION_DETAILS_PAGE'
  | 'GET_OS_THEME'
  | 'TAKE_SCREENSHOT'
  | 'CAPTURE_FULL_PAGE';

export interface ExtensionMessage<T = unknown> {
  type: ExtensionMessageType | string;
  payload?: T;
  source?: PlatformType;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: RaindropRequestFailureDetails;
  pending?: boolean;
  message?: string;
}

export * from './raindrop';
export * from './workspace';
export * from './sync';
export * from './tabTracker';
export * from './customCode';
