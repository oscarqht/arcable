import type { PanelAnchor, PanelLayout } from "../types/sidePanels";

export interface FloatingPanel extends PanelLayout {
  id: string;
  url: string;
  title?: string;
}

export function nearestPanelAnchor(
  start: number,
  size: number,
  extent: number,
): PanelAnchor {
  const end = extent - start - size;
  return start <= end
    ? { edge: "start", distance: start }
    : { edge: "end", distance: end };
}

export function anchoredPosition(
  anchor: PanelAnchor | undefined,
  fallback: number,
  size: number,
  extent: number,
): number {
  return !anchor
    ? fallback
    : anchor.edge === "start"
      ? anchor.distance
      : extent - size - anchor.distance;
}

/** Capture user intent from rendered geometry; viewport layout never calls this. */
export function anchorPanel(
  p: FloatingPanel,
  width: number,
  height: number,
): FloatingPanel {
  return {
    ...p,
    anchorX: nearestPanelAnchor(p.x, p.width, width),
    anchorY: nearestPanelAnchor(p.y, p.height, height),
  };
}

export function positionPanel(
  p: FloatingPanel,
  width: number,
  height: number,
): FloatingPanel {
  // Resolve using the temporarily fitted size, retaining the original saved size.
  const fitted = clampPanel(p, width, height);
  return clampPanel(
    {
      ...fitted,
      x: anchoredPosition(p.anchorX, p.x, fitted.width, width),
      y: anchoredPosition(p.anchorY, p.y, fitted.height, height),
    },
    width,
    height,
  );
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
