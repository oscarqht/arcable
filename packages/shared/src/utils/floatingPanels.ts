export interface FloatingPanel {
  id: string;
  url: string;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dock?: "left" | "right" | "top" | "bottom";
  dockPosition?: number;
}

export function isPanelUrl(value: string): boolean {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function clampPanel(
  p: FloatingPanel,
  width: number,
  height: number,
): FloatingPanel {
  const w = Math.max(1, Math.min(p.width, width - 16));
  const h = Math.max(1, Math.min(p.height, height - 16));
  return {
    ...p,
    width: w,
    height: h,
    x: Math.max(8, Math.min(p.x, width - w - 8)),
    y: Math.max(8, Math.min(p.y, height - h - 8)),
  };
}
