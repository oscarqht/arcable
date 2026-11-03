import type { TabUrlVariant } from '../types/workspace';
import type { TabAssociationMap } from '../types/tabTracker';

/** Sum member badges by item ID, preserving the lower-bound marker of capped counts. */
export function getFavouriteGroupBadge(
  variants: TabUrlVariant[],
  tabAssociations?: TabAssociationMap,
): number | string | undefined {
  let total = 0;
  let capped = false;

  for (const variant of variants) {
    if (!variant.url) continue;
    const badge = tabAssociations?.[variant.id]?.badge;
    const match = String(badge ?? '').match(/^(\d+)(\+)?$/);
    if (!match) continue;
    const count = Number(match[1]);
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    total += count;
    capped ||= Boolean(match[2]);
  }

  return total > 0 ? (capped ? `${total}+` : total) : undefined;
}
