import type { Tab } from '../types/workspace';

export interface BatchCoverReplacement {
  id: string;
  tabId: string;
  variantId?: string;
  url: string;
  beforeCover?: string;
  afterCover: string;
  mirrorsPrimary?: boolean;
  beforePrimaryCover?: string;
}

const replacementId = (tabId: string, variantId?: string) => JSON.stringify([tabId, variantId ?? null]);
const defaultVariant = (tab: Tab) => tab.urlVariants?.find((variant) => variant.id === tab.defaultVariantId) || tab.urlVariants?.[0];

/** Match raw saved URLs literally; groups keep their own independent parent icon. */
export function buildBatchCoverReplacementPreview(tabs: readonly Tab[], find: string, cover: string): BatchCoverReplacement[] {
  if (!find || !cover) return [];
  const result: BatchCoverReplacement[] = [];
  for (const tab of tabs) {
    const primaryVariant = defaultVariant(tab);
    if ((!primaryVariant || tab.url !== primaryVariant.url) && tab.url.includes(find) && tab.favIconUrl !== cover) {
      result.push({ id: replacementId(tab.id), tabId: tab.id, url: tab.url, beforeCover: tab.favIconUrl, afterCover: cover });
    }
    for (const variant of tab.urlVariants || []) {
      const mirrorsPrimary = !tab.isGroup && primaryVariant?.id === variant.id && tab.url === variant.url;
      if (!variant.url.includes(find) || (variant.favIconUrl === cover && (!mirrorsPrimary || tab.favIconUrl === cover))) continue;
      result.push({
        id: replacementId(tab.id, variant.id), tabId: tab.id, variantId: variant.id,
        url: variant.url, beforeCover: variant.favIconUrl, afterCover: cover,
        ...(mirrorsPrimary ? { mirrorsPrimary: true, beforePrimaryCover: tab.favIconUrl } : {}),
      });
    }
  }
  return result;
}

/** Apply only reviewed rows whose URL and cover are still current. */
export function applyBatchCoverReplacements(tabs: Tab[], replacements: readonly BatchCoverReplacement[]) {
  const byTab = new Map<string, BatchCoverReplacement[]>();
  for (const row of replacements) byTab.set(row.tabId, [...(byTab.get(row.tabId) || []), row]);
  let appliedCount = 0;
  const changedTabs: Tab[] = [];
  const nextTabs = tabs.map((tab) => {
    const rows = byTab.get(tab.id);
    if (!rows) return tab;
    const primaryVariant = defaultVariant(tab);
    const seen = new Set<string>();
    let favIconUrl = tab.favIconUrl;
    let variants = tab.urlVariants;
    for (const row of rows) {
      const key = replacementId(tab.id, row.variantId);
      if (seen.has(key) || !row.afterCover) continue;
      seen.add(key);
      if (row.variantId === undefined) {
        if (tab.url !== row.url || tab.favIconUrl !== row.beforeCover || tab.favIconUrl === row.afterCover ||
          (primaryVariant && tab.url === primaryVariant.url)) continue;
        favIconUrl = row.afterCover;
      } else {
        const variant = tab.urlVariants?.find((entry) => entry.id === row.variantId);
        if (!variant || variant.url !== row.url || variant.favIconUrl !== row.beforeCover) continue;
        const mirrorsPrimary = !tab.isGroup && primaryVariant?.id === row.variantId && tab.url === row.url;
        const expectedPrimaryCover = row.mirrorsPrimary ? row.beforePrimaryCover : row.beforeCover;
        if (mirrorsPrimary && tab.favIconUrl !== expectedPrimaryCover) continue;
        if (variant.favIconUrl === row.afterCover && (!mirrorsPrimary || tab.favIconUrl === row.afterCover)) continue;
        if (variant.favIconUrl !== row.afterCover) {
          variants = variants?.map((entry) => entry.id === row.variantId ? { ...entry, favIconUrl: row.afterCover } : entry);
        }
        if (mirrorsPrimary) favIconUrl = row.afterCover;
      }
      appliedCount++;
    }
    if (favIconUrl === tab.favIconUrl && variants === tab.urlVariants) return tab;
    const updated = { ...tab, ...(favIconUrl !== tab.favIconUrl ? { favIconUrl } : {}), ...(variants !== tab.urlVariants ? { urlVariants: variants } : {}) };
    changedTabs.push(updated);
    return updated;
  });
  return { tabs: changedTabs.length ? nextTabs : tabs, changedTabs, appliedCount, skippedCount: replacements.length - appliedCount };
}
