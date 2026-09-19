import {
  shouldPersistSidepanelSpaceId,
  resolveSidepanelActiveSpaceId,
  VIRTUAL_SYNCED_TABS_SPACE_ID,
} from '../src/sidepanel/spaceSelection';
import type { Space } from '@arcable/shared/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1. Storage persistence suppression
assert(
  shouldPersistSidepanelSpaceId('space-work', 'space-personal'),
  'a user selecting a different space must be persisted'
);
assert(
  !shouldPersistSidepanelSpaceId('space-work', 'space-work'),
  'reflecting a Firefox storage notification must not write the same space again'
);
assert(
  shouldPersistSidepanelSpaceId('space-work', VIRTUAL_SYNCED_TABS_SPACE_ID),
  'switching to the virtual synced tabs space must be persisted'
);
assert(
  !shouldPersistSidepanelSpaceId(VIRTUAL_SYNCED_TABS_SPACE_ID, VIRTUAL_SYNCED_TABS_SPACE_ID),
  're-persisting the same virtual space must be prevented'
);

// 2. resolveSidepanelActiveSpaceId resolution behavior
const spaces: Space[] = [
  { id: 'space-2', name: 'Work', order: 2 } as Space,
  { id: 'space-1', name: 'Personal', order: 1 } as Space,
  { id: 'space-3', name: 'Research', order: 3 } as Space,
];

// Preserves virtual synced tabs space
assert(
  resolveSidepanelActiveSpaceId(spaces, VIRTUAL_SYNCED_TABS_SPACE_ID) === VIRTUAL_SYNCED_TABS_SPACE_ID,
  'virtual synced tabs space must be preserved when selected'
);

// Preserves explicitly remembered space if it still exists
assert(
  resolveSidepanelActiveSpaceId(spaces, 'space-2') === 'space-2',
  'remembered space must be returned when it exists in spaces'
);

// Falls back to snapshotActiveId if remembered space is removed or not found
assert(
  resolveSidepanelActiveSpaceId(spaces, 'space-deleted', 'space-3') === 'space-3',
  'must fall back to snapshotActiveId when lastSelectedId is no longer present'
);

// Falls back to first sorted space if both lastSelectedId and snapshotActiveId are invalid
assert(
  resolveSidepanelActiveSpaceId(spaces, 'space-deleted', 'space-also-deleted') === 'space-1',
  'must fall back to first sorted space (space-1 by order) when both ids are invalid'
);

// Uses snapshotActiveId when lastSelectedId is null or undefined
assert(
  resolveSidepanelActiveSpaceId(spaces, null, 'space-2') === 'space-2',
  'must use snapshotActiveId when lastSelectedId is null'
);

// Handles undefined or empty spaces
assert(
  resolveSidepanelActiveSpaceId(undefined, 'space-1') === undefined,
  'must handle undefined spaces array gracefully'
);
assert(
  resolveSidepanelActiveSpaceId([], 'space-1') === undefined,
  'must handle empty spaces array gracefully'
);

console.log('Side-panel space-selection tests passed.');
