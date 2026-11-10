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
  anchorX?: PanelAnchor;
  anchorY?: PanelAnchor;
  dockAnchor?: PanelAnchor;
}
/** Start is left/top; end is right/bottom. Distances are viewport pixels. */
export interface PanelAnchor {
  edge: "start" | "end";
  distance: number;
}
