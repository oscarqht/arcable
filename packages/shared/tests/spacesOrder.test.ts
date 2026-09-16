import { getSortedSpaces } from '../src/hooks/useWorkspace';
import { Space } from '../src/types/workspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const spacesInReverseRawOrder: Space[] = [
  { id: 'space-3', name: 'Work', order: 3000, createdAt: 100 },
  { id: 'space-2', name: 'Personal', order: 2000, createdAt: 200 },
  { id: 'space-1', name: 'General', order: 1000, createdAt: 300 },
];

const sorted = getSortedSpaces(spacesInReverseRawOrder);

assert(sorted.length === 3, 'All spaces must be preserved');
assert(sorted[0].id === 'space-1', 'First space must match lowest order (arranged position 1)');
assert(sorted[1].id === 'space-2', 'Second space must match middle order (arranged position 2)');
assert(sorted[2].id === 'space-3', 'Third space must match highest order (arranged position 3)');

// Fallback to createdAt when order is undefined
const spacesWithoutExplicitOrder: Space[] = [
  { id: 'space-z', name: 'Z', createdAt: 300 },
  { id: 'space-y', name: 'Y', createdAt: 200 },
  { id: 'space-x', name: 'X', createdAt: 100 },
];

const sortedByTime = getSortedSpaces(spacesWithoutExplicitOrder);
assert(sortedByTime[0].id === 'space-x', 'Spaces fallback to ascending createdAt order');
assert(sortedByTime[1].id === 'space-y', 'Spaces fallback to ascending createdAt order');
assert(sortedByTime[2].id === 'space-z', 'Spaces fallback to ascending createdAt order');

console.log('Spaces order tests passed.');
