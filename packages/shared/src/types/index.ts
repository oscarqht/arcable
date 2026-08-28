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
  | 'RAINDROP_SYNC_WORKSPACE';

export interface ExtensionMessage<T = unknown> {
  type: ExtensionMessageType;
  payload?: T;
  source?: PlatformType;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export * from './raindrop';
export * from './workspace';
export * from './sync';
