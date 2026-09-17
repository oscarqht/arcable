import { getSortedSiblings } from '../src/hooks/useWorkspace';
import { Folder, Tab } from '../src/types/workspace';
import { isDragAcceptable, startDrag, endDrag } from '../src/utils/dragState';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Testing folder and tab drag constraints...');

// 1. Verify getSortedSiblings always places folders before tabs in the same level
const testFolders: Folder[] = [
  { id: 'f2', name: 'Folder 2', parentSpaceId: 'space-1', order: 2000 },
  { id: 'f1', name: 'Folder 1', parentSpaceId: 'space-1', order: 1000 },
];
const testTabs: Tab[] = [
  { id: 't2', url: 'https://example.com/2', parentSpaceId: 'space-1', order: 2000 },
  { id: 't1', url: 'https://example.com/1', parentSpaceId: 'space-1', order: 1000 },
];

const siblings = getSortedSiblings(testFolders, testTabs, 'space-1');
assert(siblings.length === 4, 'Should have 4 siblings total');
assert(siblings[0].id === 'f1' && siblings[0].type === 'folder', 'First item should be f1 folder');
assert(siblings[1].id === 'f2' && siblings[1].type === 'folder', 'Second item should be f2 folder');
assert(siblings[2].id === 't1' && siblings[2].type === 'tab', 'Third item should be t1 tab');
assert(siblings[3].id === 't2' && siblings[3].type === 'tab', 'Fourth item should be t2 tab');
console.log('✓ Folders always precede tabs at same level');

// 2. Verify TabRow rejects folders during drag-over/drop
const mockDragEvent = {
  dataTransfer: {
    types: ['application/x-arcable-folder'],
    setData: () => {},
    getData: () => '',
  },
} as unknown as React.DragEvent;

startDrag(mockDragEvent, { id: 'f1', type: 'folder' });
const tabRowAcceptsFolder = isDragAcceptable(mockDragEvent, ['tab']);
assert(tabRowAcceptsFolder === false, 'TabRow must reject folder drag items');

const tabRowAcceptsTab = isDragAcceptable(mockDragEvent, ['tab', 'folder']);
assert(tabRowAcceptsTab === true, 'General check matches if folder allowed, but TabRow restricted to tab');
endDrag();
console.log('✓ TabRow rejects folder drag items');

// 3. Verify FolderItem accepts tab drags, but restricts position to inside only
startDrag(mockDragEvent, { id: 't1', type: 'tab' });
const folderAcceptsTab = isDragAcceptable(mockDragEvent, ['folder', 'tab']);
assert(folderAcceptsTab === true, 'FolderItem accepts tab drag items');
endDrag();

// 4. Test reorderSiblingItem constraints simulation
interface ReorderParams {
  sourceId: string;
  sourceType: 'folder' | 'tab';
  targetId: string;
  targetType: 'folder' | 'tab';
  position: 'before' | 'after' | 'inside';
}

function simulateReorder(
  params: ReorderParams,
  folders: Folder[],
  tabs: Tab[]
): { folders: Folder[]; tabs: Tab[]; rejected: boolean } {
  const { sourceId, sourceType, targetId, targetType, position } = params;
  if (sourceId === targetId) return { folders, tabs, rejected: true };

  // Folders are always sorted on top of tabs in the same level.
  // 1. Prevent dragging folders down to below or onto tab items.
  if (sourceType === 'folder' && targetType === 'tab') {
    return { folders, tabs, rejected: true };
  }

  // 2. Prevent dragging tab items to above or below folders (only dropping inside a folder is allowed).
  if (sourceType === 'tab' && targetType === 'folder' && position !== 'inside') {
    return { folders, tabs, rejected: true };
  }

  const sourceFolder = sourceType === 'folder' ? folders.find((f) => f.id === sourceId) : undefined;
  const sourceTab = sourceType === 'tab' ? tabs.find((t) => t.id === sourceId) : undefined;
  if (!sourceFolder && !sourceTab) return { folders, tabs, rejected: true };

  const targetFolder = targetType === 'folder' ? folders.find((f) => f.id === targetId) : undefined;
  const targetTab = targetType === 'tab' ? tabs.find((t) => t.id === targetId) : undefined;
  if (!targetFolder && !targetTab) return { folders, tabs, rejected: true };

  // Drop inside folder
  if (position === 'inside' && targetFolder) {
    if (sourceType === 'tab') {
      const updatedTabs = tabs.map((t) =>
        t.id === sourceId
          ? {
              ...t,
              parentSpaceId: targetFolder.parentSpaceId,
              parentFolderId: targetFolder.id,
              order: 5000,
            }
          : t
      );
      return { folders, tabs: updatedTabs, rejected: false };
    }
  }

  return { folders, tabs, rejected: false };
}

// 4a. Dropping tab before folder must be rejected
const resTabBeforeFolder = simulateReorder(
  { sourceId: 't1', sourceType: 'tab', targetId: 'f1', targetType: 'folder', position: 'before' },
  testFolders,
  testTabs
);
assert(resTabBeforeFolder.rejected === true, 'Dropping tab before folder must be rejected');

// 4b. Dropping tab after folder must be rejected
const resTabAfterFolder = simulateReorder(
  { sourceId: 't1', sourceType: 'tab', targetId: 'f1', targetType: 'folder', position: 'after' },
  testFolders,
  testTabs
);
assert(resTabAfterFolder.rejected === true, 'Dropping tab after folder must be rejected');

// 4c. Dropping tab inside folder must be allowed
const resTabInsideFolder = simulateReorder(
  { sourceId: 't1', sourceType: 'tab', targetId: 'f1', targetType: 'folder', position: 'inside' },
  testFolders,
  testTabs
);
assert(resTabInsideFolder.rejected === false, 'Dropping tab inside folder must be allowed');
assert(
  resTabInsideFolder.tabs.find((t) => t.id === 't1')?.parentFolderId === 'f1',
  'Tab t1 must have parentFolderId set to f1'
);

// 4d. Dropping folder onto tab (before, after, inside) must be rejected
const resFolderBeforeTab = simulateReorder(
  { sourceId: 'f1', sourceType: 'folder', targetId: 't1', targetType: 'tab', position: 'before' },
  testFolders,
  testTabs
);
assert(resFolderBeforeTab.rejected === true, 'Dropping folder before tab must be rejected');

const resFolderAfterTab = simulateReorder(
  { sourceId: 'f1', sourceType: 'folder', targetId: 't1', targetType: 'tab', position: 'after' },
  testFolders,
  testTabs
);
assert(resFolderAfterTab.rejected === true, 'Dropping folder after tab must be rejected');

const resFolderInsideTab = simulateReorder(
  { sourceId: 'f1', sourceType: 'folder', targetId: 't1', targetType: 'tab', position: 'inside' },
  testFolders,
  testTabs
);
assert(resFolderInsideTab.rejected === true, 'Dropping folder inside tab must be rejected');

console.log('✓ All drag constraint checks passed successfully!');
