import { getAllSpaceFolderIds } from '../src/utils/treeUtils';
import {
  FOLDER_COLLAPSE_STORAGE_PREFIX,
  getLocalFolderExpanded,
  setLocalFolderExpanded,
} from '../src/hooks/useWorkspace';
import { Folder } from '../src/types/workspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Simple in-memory localStorage polyfill for Node test environment
const storage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => storage.set(key, val),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
};

console.log('Testing getAllSpaceFolderIds...');

const folders: Folder[] = [
  // Space 1 folders
  { id: 'f-root-1', name: 'Work Root 1', parentSpaceId: 'space-work' },
  { id: 'f-child-1-1', name: 'Work Nested 1', parentSpaceId: 'space-work', parentFolderId: 'f-root-1' },
  { id: 'f-child-1-1-1', name: 'Work Deeply Nested', parentSpaceId: 'space-work', parentFolderId: 'f-child-1-1' },
  { id: 'f-root-2', name: 'Work Root 2', parentSpaceId: 'space-work' },
  // Space 1 folder with missing parentSpaceId but valid parentFolderId (self-healing)
  { id: 'f-child-orphan', name: 'Work Missing ParentSpaceId', parentSpaceId: '', parentFolderId: 'f-root-2' },

  // Space 2 folders (Personal)
  { id: 'f-personal-1', name: 'Personal Root', parentSpaceId: 'space-personal' },
  { id: 'f-personal-sub', name: 'Personal Sub', parentSpaceId: 'space-personal', parentFolderId: 'f-personal-1' },
];

// Test empty space
const emptySpaceFolderIds = getAllSpaceFolderIds('space-empty', folders);
assert(emptySpaceFolderIds.size === 0, 'Empty space must return 0 folders');

// Test work space
const workFolderIds = getAllSpaceFolderIds('space-work', folders);
assert(workFolderIds.size === 5, `Expected 5 folders in space-work, got ${workFolderIds.size}`);
assert(workFolderIds.has('f-root-1'), 'Should contain f-root-1');
assert(workFolderIds.has('f-child-1-1'), 'Should contain f-child-1-1');
assert(workFolderIds.has('f-child-1-1-1'), 'Should contain f-child-1-1-1');
assert(workFolderIds.has('f-root-2'), 'Should contain f-root-2');
assert(workFolderIds.has('f-child-orphan'), 'Should contain f-child-orphan via parentFolderId');
assert(!workFolderIds.has('f-personal-1'), 'Should not contain folders from space-personal');
assert(!workFolderIds.has('f-personal-sub'), 'Should not contain subfolders from space-personal');

// Test personal space
const personalFolderIds = getAllSpaceFolderIds('space-personal', folders);
assert(personalFolderIds.size === 2, `Expected 2 folders in space-personal, got ${personalFolderIds.size}`);
assert(personalFolderIds.has('f-personal-1'), 'Should contain f-personal-1');
assert(personalFolderIds.has('f-personal-sub'), 'Should contain f-personal-sub');
assert(!personalFolderIds.has('f-root-1'), 'Should not contain work folders');

console.log('Testing expand/collapse storage state...');

// Simulate Collapse all on space-work
workFolderIds.forEach((id) => {
  setLocalFolderExpanded(id, false);
});

// All work folders should now be recorded as collapsed in localStorage
workFolderIds.forEach((id) => {
  assert(getLocalFolderExpanded(id, true) === false, `Folder ${id} should be collapsed`);
  assert(
    storage.get(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${id}`) === 'true',
    `Storage key for ${id} should be "true"`
  );
});

// Personal folders should remain unaffected (default expanded)
assert(getLocalFolderExpanded('f-personal-1', true) === true, 'Personal folder 1 should remain expanded');
assert(getLocalFolderExpanded('f-personal-sub', true) === true, 'Personal folder sub should remain expanded');

// Simulate Expand all on space-work
workFolderIds.forEach((id) => {
  setLocalFolderExpanded(id, true);
});

// All work folders should now be expanded and removed from collapse storage
workFolderIds.forEach((id) => {
  assert(getLocalFolderExpanded(id, true) === true, `Folder ${id} should be expanded`);
  assert(
    !storage.has(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${id}`),
    `Storage key for ${id} should be removed`
  );
});

console.log('Testing across-all-spaces collapse and expand...');

// Test collapse all across all spaces
folders.forEach((f) => {
  setLocalFolderExpanded(f.id, false);
});
folders.forEach((f) => {
  assert(getLocalFolderExpanded(f.id, true) === false, `Folder ${f.id} should be collapsed across all spaces`);
});

// Check areAllFoldersCollapsed calculation logic
const allCollapsedCheck = folders.length > 0 && folders.every((f) => getLocalFolderExpanded(f.id, true) === false);
assert(allCollapsedCheck === true, 'All folders should be detected as collapsed');

// Test expand all across all spaces
folders.forEach((f) => {
  setLocalFolderExpanded(f.id, true);
});
folders.forEach((f) => {
  assert(getLocalFolderExpanded(f.id, true) === true, `Folder ${f.id} should be expanded across all spaces`);
  assert(!storage.has(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${f.id}`), `Storage key for ${f.id} should be cleared`);
});

const noneCollapsedCheck = folders.length > 0 && folders.every((f) => getLocalFolderExpanded(f.id, true) === false);
assert(noneCollapsedCheck === false, 'Folders should not be detected as all collapsed');

console.log('All folder expand/collapse tests passed successfully!');
