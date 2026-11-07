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

const block = /<!--arcable-floating-panels:([\s\S]*?)-->/;
export function isPanelUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function readFloatingPanels(note?: string): FloatingPanel[] {
  try {
    const value = JSON.parse(note?.match(block)?.[1] || "[]");
    const seen = new Set<string>();
    return Array.isArray(value)
      ? value.filter((p: FloatingPanel) => {
          if (
            !p ||
            typeof p.id !== "string" ||
            seen.has(p.id) ||
            !isPanelUrl(p.url) ||
            ![p.x, p.y, p.width, p.height].every(Number.isFinite) ||
            p.width <= 0 ||
            p.height <= 0 ||
            (p.title !== undefined && typeof p.title !== "string") ||
            (p.dockPosition !== undefined && !Number.isFinite(p.dockPosition)) ||
            (p.dock !== undefined &&
              !["left", "right", "top", "bottom"].includes(p.dock))
          )
            return false;
          seen.add(p.id);
          return true;
        })
      : [];
  } catch {
    return [];
  }
}
export function writeFloatingPanels(
  note: string | undefined,
  panels: FloatingPanel[],
): string {
  const encoded = JSON.stringify(panels)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  const metadata = `<!--arcable-floating-panels:${encoded}-->`;
  if (block.test(note || ""))
    return (note || "").replace(block, () => metadata);
  return `${note || ""}${note ? "\n" : ""}${metadata}`;
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
