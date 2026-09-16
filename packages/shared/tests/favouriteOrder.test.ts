import { getSparseOrderBetween } from '../src/hooks/useWorkspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(getSparseOrderBetween(2000, 3000) === 2500, 'a favourite move should use the gap between neighbours');
assert(getSparseOrderBetween(undefined, 1000) === 0, 'a move to the front should update only the moved item');
assert(getSparseOrderBetween(9000, undefined) === 10000, 'a move to the end should update only the moved item');
assert(getSparseOrderBetween(2000, 2001) === undefined, 'adjacent orders should request a one-time shelf compaction');

console.log('Favourite sparse-order tests passed.');
