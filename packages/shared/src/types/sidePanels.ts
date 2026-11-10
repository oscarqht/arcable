export interface SidePanelRule {
  id: string;
  title: string;
  url: string;
  patterns: string[];
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
export interface PanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  dock?: "left" | "right" | "top" | "bottom";
  dockPosition?: number;
}
