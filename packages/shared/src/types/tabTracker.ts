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
