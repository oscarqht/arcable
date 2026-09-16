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
