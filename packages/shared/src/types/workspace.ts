import { CustomCodeRule, RunCodeRule } from './customCode';
import type { DeviceSyncRecord } from './sync';
export type { CustomCodeRule, RunCodeRule, DeviceSyncRecord };

export interface TabOpenOptions {
  inNewTab?: boolean;
  event?: any;
}

export interface TabUrlVariant {
  id: string;
  name: string;
  url: string;
}

export interface Environment {
  id: string;
  name: string;
  values: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
}

export interface Tab {
  id: string;
  /** Remote identity only; `id` stays stable for extension tab associations. */
  raindropId?: number;
  url: string;
  urlVariants?: TabUrlVariant[];
  defaultVariantId?: string;
  pinned: boolean;
  favourite?: boolean;     // Optional: if true, tab is a global favourite and does not belong to any space or folder
  customTitle?: string;
  customEmojiIcon?: string;
  favIconUrl?: string;
  parentFolderId?: string; // Optional: if undefined/null, tab belongs to the root of the space (not applicable if favourite)
  parentSpaceId?: string;  // Optional: required when tab is not a favourite, undefined when favourite
  order?: number;          // Optional: custom sorting order
  createdAt?: number;
  updatedAt?: number;
}

export interface Folder {
  id: string;
  /** Remote identity only; `id` stays stable for local UI state. */
  raindropId?: number;
  name: string;
  customEmojiIcon?: string;
  /** The cover selected for the matching Raindrop collection. */
  coverUrl?: string;
  colors?: string;         // Optional color hex or theme name
  parentFolderId?: string; // Optional: nested folder support (null/undefined if root in space)
  parentSpaceId: string;   // Required: parent space id
  isExpanded?: boolean;    // UI state for folder collapse/expansion
  order?: number;          // Optional: custom sorting order
  createdAt?: number;
  updatedAt?: number;
}

export interface Space {
  id: string;
  /** Remote identity only; `id` stays stable for local UI state. */
  raindropId?: number;
  name: string;
  emojiIcon?: string;
  /** The cover selected for the matching Raindrop collection. */
  coverUrl?: string;
  colors?: string;         // Optional theme color or gradient
  order?: number;          // Optional: custom sorting order
  createdAt?: number;
  updatedAt?: number;
}

export type WidgetStyle =
  | 'digital'
  | 'calendar'
  | 'analog'
  | 'combo'
  | 'pomodoro'
  | 'countdown'
  | 'note'
  | 'weather'
  | 'search';

export type WidgetSize = 'small' | 'medium' | 'large';

export interface PomodoroConfig {
  workMinutes?: number;
  breakMinutes?: number;
  mode?: 'work' | 'break';
  isRunning?: boolean;
  targetTimestamp?: number;
  remainingSeconds?: number;
}

export interface CountdownConfig {
  title?: string;
  targetDate?: string;
}

export interface NoteConfig {
  text?: string;
  colorTheme?: 'yellow' | 'green' | 'pink' | 'blue' | 'purple' | 'slate';
}

export interface WeatherConfig {
  city?: string;
  latitude?: number;
  longitude?: number;
  tempUnit?: 'c' | 'f';
  cachedTemp?: number;
  cachedCode?: number;
  lastFetched?: number;
}

export interface SearchConfig {
  engine?: 'google' | 'custom';
  customUrl?: string;
  customName?: string;
  customIcon?: string;
}

export interface WorkspaceWidget {
  id: string;
  style: WidgetStyle;
  size: WidgetSize;
  order?: number;          // Optional: custom sorting order
  config?: Record<string, any>;
  createdAt?: number;
  updatedAt?: number;
}

export interface ArcableWorkspaceData {
  /** Raindrop collection ID for the Arcable root; enables direct favourite mutations. */
  raindropRootCollectionId?: number;
  /** Current non-tree metadata file. Null means a fresh remote read confirmed it does not exist. */
  raindropMetadataItemId?: number | null;
  spaces: Space[];
  folders: Folder[];
  tabs: Tab[];
  tmpTabs?: TmpTab[];
  widgets?: WorkspaceWidget[];
  customCodeRules?: CustomCodeRule[];
  runCodeInPageRules?: RunCodeRule[];
  environmentVariables?: string[];
  environments?: Environment[];
  activeSpaceId: string;
  version?: number;
  devices?: Record<string, DeviceSyncRecord>;
}

export interface TmpTab {
  id: string;
  url: string;
  title?: string;
  customTitle?: string;
  favIconUrl?: string;
  browserTabId?: number;
  windowId?: number;
  badge?: string | number | null;
  deviceId?: string;
  deviceName?: string;
  deviceType?: 'Web App' | 'Ext';
  createdAt?: number;
  updatedAt?: number;
}

export interface TmpTabCustomTitleRecord {
  tabId?: number;
  url: string;
  customTitle: string;
  updatedAt: number;
}

export type WorkspaceSiblingItem =
  | { type: 'folder'; data: Folder; id: string; order: number }
  | { type: 'tab'; data: Tab; id: string; order: number };
