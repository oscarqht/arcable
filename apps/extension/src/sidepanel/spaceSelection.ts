import { Space, VIRTUAL_SYNCED_TABS_SPACE_ID } from '@arcable/shared/types';
import { getSortedSpaces } from '@arcable/shared/hooks';

export { VIRTUAL_SYNCED_TABS_SPACE_ID };

/**
 * Extension storage emits `onChanged` notifications in Firefox even for some
 * writes whose value did not change.  Keep the remembered side-panel space
 * write idempotent so reflecting a notification cannot create another one.
 */
export function shouldPersistSidepanelSpaceId(
  previousSpaceId: string | null,
  nextSpaceId: string
): boolean {
  return Boolean(nextSpaceId) && previousSpaceId !== nextSpaceId;
}

/**
 * Resolves the side panel's locally remembered space against the spaces that
 * are actually available in a snapshot.
 * - If lastSelectedId is the virtual synced tabs space, it is preserved.
 * - If lastSelectedId matches a valid space in the workspace, it is preserved.
 * - If lastSelectedId is not found in the workspace (e.g. temporary ID or deleted space),
 *   it checks snapshotActiveId before falling back to the first space in configured order.
 */
export function resolveSidepanelActiveSpaceId(
  spaces: Space[] | undefined,
  lastSelectedId?: string | null,
  snapshotActiveId?: string
): string | undefined {
  if (lastSelectedId === VIRTUAL_SYNCED_TABS_SPACE_ID) {
    return VIRTUAL_SYNCED_TABS_SPACE_ID;
  }
  const sorted = getSortedSpaces(spaces || []);
  if (lastSelectedId) {
    const matched = sorted.find((space) => space.id === lastSelectedId);
    if (matched) return matched.id;
  }
  if (snapshotActiveId === VIRTUAL_SYNCED_TABS_SPACE_ID) {
    return VIRTUAL_SYNCED_TABS_SPACE_ID;
  }
  if (snapshotActiveId) {
    const matched = sorted.find((space) => space.id === snapshotActiveId);
    if (matched) return matched.id;
  }
  return sorted[0]?.id;
}

