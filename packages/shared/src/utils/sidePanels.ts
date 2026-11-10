import type { SidePanelRule, PanelLayout } from "../types/sidePanels";
import type { FloatingPanel } from "./floatingPanels";
import { isPanelUrl } from "./floatingPanels";
import { matchAnyUrlPattern, isValidUrlPattern } from "./customCodeUtils";
export const SIDE_PANEL_RULES_KEY = "arcable_side_panel_rules";
export const PANEL_LAYOUTS_KEY = "arcable_panel_layouts";
/** Explicit allowlist keeps panel definitions separate from local layouts. */
export function normalizeSidePanelRules(value: unknown): SidePanelRule[] {
  const seen = new Set<string>();
  return !Array.isArray(value)
    ? []
    : value.flatMap((r) => {
        if (
          !r ||
          typeof r.id !== "string" ||
          !r.id ||
          seen.has(r.id) ||
          typeof r.title !== "string" ||
          !r.title.trim() ||
          !isPanelUrl(r.url)
        )
          return [];
        const patterns = Array.isArray(r.patterns)
          ? r.patterns
              .filter(
                (p: unknown): p is string =>
                  typeof p === "string" && isValidUrlPattern(p),
              )
              .map((p: string) => p.trim())
          : [];
        if (!patterns.length) return [];
        seen.add(r.id);
        return [
          {
            id: r.id,
            title: r.title.trim(),
            url: r.url,
            patterns,
            disabled: Boolean(r.disabled),
            createdAt:
              typeof r.createdAt === "string" ? r.createdAt : undefined,
            updatedAt:
              typeof r.updatedAt === "string" ? r.updatedAt : undefined,
          },
        ];
      });
}
export function normalizePanelLayout(p: any): PanelLayout | undefined {
  if (
    !p ||
    ![p.x, p.y, p.width, p.height].every(Number.isFinite) ||
    p.width <= 0 ||
    p.height <= 0 ||
    (p.dock != null && !["left", "right", "top", "bottom"].includes(p.dock)) ||
    (p.dockPosition != null && !Number.isFinite(p.dockPosition))
  )
    return;
  return {
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    dock: p.dock || undefined,
    dockPosition: p.dockPosition ?? undefined,
  };
}
export function matchingPanels(
  rules: unknown,
  url: string,
  layouts: Record<string, PanelLayout> = {},
): FloatingPanel[] {
  if (!isPanelUrl(url)) return [];
  return normalizeSidePanelRules(rules)
    .filter((r) => !r.disabled && matchAnyUrlPattern(r.patterns, url))
    .map((r, i) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      ...(normalizePanelLayout(layouts[r.id]) || {
        x: 24 + i * 28,
        y: 24 + i * 28,
        width: 440,
        height: 360,
      }),
    }));
}
