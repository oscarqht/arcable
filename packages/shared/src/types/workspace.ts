export interface Tab {
  id: string;
  url: string;
  pinned: boolean;
  customTitle?: string;
  customEmojiIcon?: string;
  parentFolderId?: string; // Optional: if undefined/null, tab belongs to the root of the space
  parentSpaceId: string;   // Required: parent space id
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
  createdAt?: number;
  updatedAt?: number;
}

export interface Space {
  id: string;
  name: string;
  emojiIcon?: string;
  colors?: string;         // Optional theme color or gradient
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
