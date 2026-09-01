export interface AssociatedTabInfo {
  tabItemId: string;
  browserTabId: number;
  windowId: number;
  currentUrl: string;
  originalUrl: string;
  isDiverted: boolean;
  badge?: string | number | null;
}

export type TabAssociationMap = Record<string, AssociatedTabInfo>; // tabItemId -> AssociatedTabInfo

export interface AudibleTab {
  id: number;
  windowId: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  audible?: boolean;
  muted?: boolean;
}

export type MediaControlAction = 'prev' | 'next' | 'playPause' | 'play' | 'pause';

