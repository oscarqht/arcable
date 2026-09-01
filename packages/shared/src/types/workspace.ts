export interface Tab {
  id: string;
  url: string;
  pinned: boolean;
  favourite?: boolean;     // Optional: if true, tab is a global favourite and does not belong to any space or folder
  customTitle?: string;
  customEmojiIcon?: string;
  parentFolderId?: string; // Optional: if undefined/null, tab belongs to the root of the space (not applicable if favourite)
  parentSpaceId?: string;  // Optional: required when tab is not a favourite, undefined when favourite
  order?: number;          // Optional: custom sorting order
  createdAt?: number;
  updatedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  customEmojiIcon?: string;
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
  name: string;
  emojiIcon?: string;
  colors?: string;         // Optional theme color or gradient
  order?: number;          // Optional: custom sorting order
  createdAt?: number;
  updatedAt?: number;
}

export interface ArcableWorkspaceData {
  spaces: Space[];
  folders: Folder[];
  tabs: Tab[];
  activeSpaceId: string;
  version?: number;
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
  createdAt?: number;
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

