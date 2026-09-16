import { shouldPersistSidepanelSpaceId } from '../src/sidepanel/spaceSelection';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  shouldPersistSidepanelSpaceId('space-work', 'space-personal'),
  'a user selecting a different space must be persisted'
);
assert(
  !shouldPersistSidepanelSpaceId('space-work', 'space-work'),
  'reflecting a Firefox storage notification must not write the same space again'
);

console.log('Side-panel space-selection tests passed.');
