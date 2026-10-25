import type { Tab } from '../types/workspace';

export interface BatchUrlReplacement {
  id: string;
  tabId: string;
  variantId?: string;
  before: string;
  after: string;
}

const replacementId = (tabId: string, variantId?: string) => JSON.stringify([tabId, variantId ?? null]);

function defaultVariant(tab: Tab) {
  return tab.urlVariants?.find((variant) => variant.id === tab.defaultVariantId) || tab.urlVariants?.[0];
}

/** Preview raw saved values, without resolving templates or normalizing URLs. */
export function buildBatchUrlReplacementPreview(
  tabs: readonly Tab[],
  find: string,
  replacement: string,
): BatchUrlReplacement[] {
  if (!find || find === replacement) return [];
  const result: BatchUrlReplacement[] = [];
  const add = (tabId: string, before: string, variantId?: string) => {
    if (!before.includes(find)) return;
    // split/join deliberately treats both inputs literally, including "$&".
    const after = before.split(find).join(replacement);
    result.push({ id: replacementId(tabId, variantId), tabId, variantId, before, after });
  };
  for (const tab of tabs) {
    const primaryVariant = defaultVariant(tab);
    // The primary URL normally mirrors the default variant: show it only once.
    if (!primaryVariant || tab.url !== primaryVariant.url) add(tab.id, tab.url);
    for (const variant of tab.urlVariants || []) add(tab.id, variant.url, variant.id);
  }
  return result;
}

/** Apply only reviewed rows still matching their original value in the latest state. */
export function applyBatchUrlReplacements(tabs: Tab[], replacements: readonly BatchUrlReplacement[]) {
  const byTab = new Map<string, BatchUrlReplacement[]>();
  for (const row of replacements) {
    const rows = byTab.get(row.tabId) || [];
    rows.push(row);
    byTab.set(row.tabId, rows);
  }
  let appliedCount = 0;
  const changedTabs: Tab[] = [];
  const nextTabs = tabs.map((tab) => {
    const rows = byTab.get(tab.id);
    if (!rows) return tab;
    const primaryVariant = defaultVariant(tab);
    const seen = new Set<string>();
    let url = tab.url;
    let variants = tab.urlVariants;
    for (const row of rows) {
      const key = replacementId(row.tabId, row.variantId);
      if (seen.has(key) || row.before === row.after) continue;
      seen.add(key);
      if (row.variantId === undefined) {
        // A new default mirror is not the independent primary row reviewed earlier.
        if (tab.url !== row.before || (primaryVariant && tab.url === primaryVariant.url)) continue;
        url = row.after;
      } else {
        const variant = tab.urlVariants?.find((entry) => entry.id === row.variantId);
        if (!variant || variant.url !== row.before) continue;
        variants = variants?.map((entry) => entry.id === row.variantId ? { ...entry, url: row.after } : entry);
        if (primaryVariant?.id === row.variantId && tab.url === row.before) url = row.after;
      }
      appliedCount++;
    }
    if (url === tab.url && variants === tab.urlVariants) return tab;
    const updated = { ...tab, url, ...(variants !== tab.urlVariants ? { urlVariants: variants } : {}) };
    changedTabs.push(updated);
    return updated;
  });
  return {
    tabs: changedTabs.length ? nextTabs : tabs,
    changedTabs,
    appliedCount,
    skippedCount: replacements.length - appliedCount,
  };
}
