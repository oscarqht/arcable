import { TmpTab } from '../src/types/workspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testDeleteTmpTabs() {
  console.log('Running deleteTmpTabs tests...');

  let tmpTabs: TmpTab[] = [
    {
      id: 'tab-1',
      url: 'https://example.com/1',
      title: 'Tab 1',
      spaceId: 'space-work',
      createdAt: Date.now(),
    },
    {
      id: 'tab-2',
      url: 'https://example.com/2',
      title: 'Tab 2',
      spaceId: 'space-work',
      createdAt: Date.now(),
    },
    {
      id: 'tab-3',
      url: 'https://example.com/3',
      title: 'Tab 3',
      spaceId: 'space-personal',
      createdAt: Date.now(),
    },
  ];

  const deleteTmpTabs = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    tmpTabs = tmpTabs.filter((t) => !idSet.has(t.id));
  };

  // Delete tabs 1 & 2
  deleteTmpTabs(['tab-1', 'tab-2']);

  assert(tmpTabs.length === 1, 'Only 1 tab should remain');
  assert(tmpTabs[0].id === 'tab-3', 'Tab 3 in space-personal should be preserved');
  assert(tmpTabs[0].spaceId === 'space-personal', 'Remaining tab is space-personal');

  // Deleting empty array does nothing
  deleteTmpTabs([]);
  assert(tmpTabs.length === 1, 'Length unchanged on empty delete');

  console.log('✓ deleteTmpTabs tests passed successfully!');
}

testDeleteTmpTabs();
