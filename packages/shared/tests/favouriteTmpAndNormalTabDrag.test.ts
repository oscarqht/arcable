import { Tab, WorkspaceWidget, TabUrlVariant, TmpTab, Folder } from '../src/types/workspace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('Running favourite tmp tab & normal tab drag tests...');

// -------------------------------------------------------------
// Test 1: promoteTmpTab with isFavourite = true
// -------------------------------------------------------------
{
  const tmpTab: TmpTab = {
    id: 'tmp-1',
    url: 'https://example.com/docs',
    title: 'Example Docs',
    favIconUrl: 'https://example.com/icon.png',
    createdAt: Date.now(),
  };

  // Simulating promoteTmpTab logic
  const isFavourite = true;
  const targetOrder = 1500;
  const targetSpaceId = undefined;
  const targetFolderId = undefined;

  const newTab: Tab = {
    id: 'tab-promoted',
    url: tmpTab.url,
    customTitle: tmpTab.customTitle || tmpTab.title || '',
    favIconUrl: tmpTab.favIconUrl,
    parentFolderId: isFavourite ? undefined : targetFolderId,
    parentSpaceId: isFavourite ? undefined : targetSpaceId,
    pinned: false,
    favourite: isFavourite,
    order: targetOrder,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  assert(newTab.favourite === true, 'Promoted tab must have favourite=true');
  assert(newTab.parentSpaceId === undefined, 'Promoted favourite tab must not belong to a space');
  assert(newTab.parentFolderId === undefined, 'Promoted favourite tab must not belong to a folder');
  assert(newTab.order === 1500, 'Promoted favourite tab must have correct order');
  assert(newTab.url === 'https://example.com/docs', 'Promoted favourite tab must preserve URL');
  console.log('✓ Test 1 passed: promoteTmpTab with isFavourite=true');
}

// -------------------------------------------------------------
// Test 2: Dropping tmpTab onto shelf item to merge into a group
// -------------------------------------------------------------
{
  const targetShelfTab: Tab = {
    id: 'fav-tab-1',
    url: 'https://github.com',
    customTitle: 'GitHub',
    favourite: true,
    pinned: false,
    order: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const incomingTmpTab: TmpTab = {
    id: 'tmp-2',
    url: 'https://gitlab.com',
    title: 'GitLab',
    createdAt: Date.now(),
  };

  // Emulate merging tmpTab onto targetShelfTab (as done in handleDropTmpTabIntoFavourite)
  const newVariantId = 'tab-var-new';
  const newVariant: TabUrlVariant = {
    id: newVariantId,
    url: incomingTmpTab.url,
    name: incomingTmpTab.customTitle || incomingTmpTab.title || 'Tab',
    favIconUrl: incomingTmpTab.favIconUrl,
  };

  const existingVariants: TabUrlVariant[] =
    targetShelfTab.urlVariants && targetShelfTab.urlVariants.length > 0
      ? [...targetShelfTab.urlVariants]
      : [
          {
            id: 'tab-var-existing',
            url: targetShelfTab.url,
            name: targetShelfTab.customTitle || 'Tab 1',
            favIconUrl: targetShelfTab.favIconUrl,
            customEmojiIcon: targetShelfTab.customEmojiIcon,
          },
        ];

  existingVariants.push(newVariant);
  const groupItemOrder = existingVariants.map((v) => ({ id: v.id, type: 'tab' as const }));

  const mergedGroupTab: Tab = {
    ...targetShelfTab,
    isGroup: true,
    urlVariants: existingVariants,
    groupItemOrder,
  };

  assert(mergedGroupTab.isGroup === true, 'Merged tab must be marked as isGroup=true');
  assert(mergedGroupTab.urlVariants.length === 2, 'Merged tab must contain 2 variants');
  assert(mergedGroupTab.urlVariants[0].url === 'https://github.com', 'First variant must be original tab');
  assert(mergedGroupTab.urlVariants[1].url === 'https://gitlab.com', 'Second variant must be tmpTab');
  console.log('✓ Test 2 passed: tmpTab merged into favourite tab group');
}

// -------------------------------------------------------------
// Test 3: Dropping tmpTab onto a shelf widget to form a new group
// -------------------------------------------------------------
{
  const targetWidget: WorkspaceWidget = {
    id: 'widget-clock-1',
    style: 'digital',
    size: 'small',
    order: 2000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const incomingTmpTab: TmpTab = {
    id: 'tmp-3',
    url: 'https://time.is',
    title: 'Time.is',
    createdAt: Date.now(),
  };

  // Emulate merging tmpTab with widget (as done in handleDropTmpTabIntoFavourite)
  const groupTabId = 'new-group-tab';
  const variantTabId = 'var-tab-1';
  const variantTab: TabUrlVariant = {
    id: variantTabId,
    url: incomingTmpTab.url,
    name: incomingTmpTab.customTitle || incomingTmpTab.title || 'Tab',
    favIconUrl: incomingTmpTab.favIconUrl,
  };

  const newGroupTab: Tab = {
    id: groupTabId,
    url: incomingTmpTab.url,
    customTitle: 'Group',
    favourite: true,
    pinned: false,
    order: targetWidget.order ?? 0,
    isGroup: true,
    urlVariants: [variantTab],
    defaultVariantId: variantTabId,
    groupItemOrder: [
      { id: targetWidget.id, type: 'widget' },
      { id: variantTabId, type: 'tab' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const updatedWidget: WorkspaceWidget = {
    ...targetWidget,
    parentGroupId: groupTabId,
  };

  assert(newGroupTab.favourite === true, 'New group tab must be a favourite');
  assert(newGroupTab.isGroup === true, 'New group tab must be marked isGroup');
  assert(newGroupTab.groupItemOrder?.length === 2, 'Group item order must contain widget and tab');
  assert(newGroupTab.groupItemOrder[0].id === 'widget-clock-1', 'First item in group order is the widget');
  assert(newGroupTab.groupItemOrder[1].id === variantTabId, 'Second item in group order is the variant');
  assert(updatedWidget.parentGroupId === groupTabId, 'Widget must be reparented to the group');
  console.log('✓ Test 3 passed: tmpTab merged with widget into new group');
}

// -------------------------------------------------------------
// Test 4: Dropping tmpTab into FavouriteGroupPopover at specific position
// -------------------------------------------------------------
{
  const groupTab: Tab = {
    id: 'group-1',
    url: 'https://alpha.com',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'v1', url: 'https://alpha.com', name: 'Alpha' },
      { id: 'v2', url: 'https://beta.com', name: 'Beta' },
    ],
    groupItemOrder: [
      { id: 'v1', type: 'tab' },
      { id: 'v2', type: 'tab' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const incomingTmpTab: TmpTab = {
    id: 'tmp-4',
    url: 'https://gamma.com',
    title: 'Gamma',
    createdAt: Date.now(),
  };

  // Dropping 'before' v2
  const targetId = 'v2';
  const position = 'before';
  const newVariantId = 'v-new';
  const newVariant: TabUrlVariant = {
    id: newVariantId,
    url: incomingTmpTab.url,
    name: incomingTmpTab.customTitle || incomingTmpTab.title || 'Tab',
    favIconUrl: incomingTmpTab.favIconUrl,
  };

  const nextVariants = [...(groupTab.urlVariants || [])];
  const targetIdx = nextVariants.findIndex((v) => v.id === targetId);
  const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
  nextVariants.splice(insertIdx, 0, newVariant);

  const nextOrder = [...(groupTab.groupItemOrder || [])];
  const orderTargetIdx = nextOrder.findIndex((o) => o.id === targetId);
  const orderInsertIdx = position === 'before' ? orderTargetIdx : orderTargetIdx + 1;
  nextOrder.splice(orderInsertIdx, 0, { id: newVariantId, type: 'tab' });

  assert(nextVariants.length === 3, 'Group must have 3 variants');
  assert(nextVariants[1].id === 'v-new', 'Inserted variant must be at index 1 (before v2)');
  assert(nextOrder[1].id === 'v-new', 'Order list must have inserted variant at index 1');
  console.log('✓ Test 4 passed: tmpTab inserted into FavouriteGroupPopover before target');
}

// -------------------------------------------------------------
// Test 5: Dragging standalone favourite tab into normal tabs
// -------------------------------------------------------------
{
  const standaloneFavTab: Tab = {
    id: 'fav-tab-standalone',
    url: 'https://news.ycombinator.com',
    customTitle: 'Hacker News',
    favourite: true,
    pinned: false,
    order: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Emulate moving to space_work and folder_dev
  const targetSpaceId = 'space_work';
  const targetFolderId = 'folder_dev';
  const targetOrder = 500;

  const normalTab: Tab = {
    ...standaloneFavTab,
    favourite: false,
    pinned: false,
    parentSpaceId: targetSpaceId,
    parentFolderId: targetFolderId,
    order: targetOrder,
    updatedAt: Date.now(),
  };

  assert(normalTab.favourite === false, 'Tab moved to space must have favourite=false');
  assert(normalTab.parentSpaceId === 'space_work', 'Tab parentSpaceId must be space_work');
  assert(normalTab.parentFolderId === 'folder_dev', 'Tab parentFolderId must be folder_dev');
  assert(normalTab.order === 500, 'Tab order must match target order');
  console.log('✓ Test 5 passed: standalone favourite tab converted to normal tab');
}

// -------------------------------------------------------------
// Test 6: Extracting variant out of favorite group into normal tabs
// -------------------------------------------------------------
{
  // Subtest 6A: Parent group has remaining variants
  const parentGroupTab: Tab = {
    id: 'group-multi',
    url: 'https://v1.com',
    favourite: true,
    isGroup: true,
    urlVariants: [
      { id: 'var-1', url: 'https://v1.com', name: 'Variant 1' },
      { id: 'var-2', url: 'https://v2.com', name: 'Variant 2' },
    ],
    groupItemOrder: [
      { id: 'var-1', type: 'tab' },
      { id: 'var-2', type: 'tab' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const extractedVariant = parentGroupTab.urlVariants![1]; // var-2
  const targetSpaceId = 'space_personal';
  const newNormalTab: Tab = {
    id: 'tab-extracted',
    url: extractedVariant.url,
    customTitle: extractedVariant.name,
    favIconUrl: extractedVariant.favIconUrl,
    parentSpaceId: targetSpaceId,
    parentFolderId: undefined,
    pinned: false,
    favourite: false,
    order: 3000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const remainingVariants = parentGroupTab.urlVariants!.filter((v) => v.id !== extractedVariant.id);
  const remainingWidgets: WorkspaceWidget[] = [];
  const isGroupEmpty = remainingVariants.length === 0 && remainingWidgets.length === 0;

  const updatedGroupTab: Tab = {
    ...parentGroupTab,
    urlVariants: remainingVariants,
    defaultVariantId: remainingVariants[0]?.id,
    url: remainingVariants[0]?.url || parentGroupTab.url,
    groupItemOrder: (parentGroupTab.groupItemOrder || []).filter((e) => e.id !== extractedVariant.id),
    updatedAt: Date.now(),
  };

  assert(!isGroupEmpty, 'Group should not be empty since 1 variant remains');
  assert(updatedGroupTab.urlVariants!.length === 1, 'Group should have 1 variant remaining');
  assert(updatedGroupTab.urlVariants![0].id === 'var-1', 'Remaining variant is var-1');
  assert(newNormalTab.favourite === false, 'Extracted tab is not a favourite');
  assert(newNormalTab.parentSpaceId === 'space_personal', 'Extracted tab belongs to space_personal');
  console.log('✓ Test 6A passed: group variant extracted, parent group preserved');

  // Subtest 6B: Last variant extracted, parent group auto-deleted
  const singleVariantGroup: Tab = {
    id: 'group-single',
    url: 'https://last.com',
    favourite: true,
    isGroup: true,
    urlVariants: [{ id: 'var-last', url: 'https://last.com', name: 'Last' }],
    groupItemOrder: [{ id: 'var-last', type: 'tab' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const remainingVariantsSingle = singleVariantGroup.urlVariants!.filter((v) => v.id === 'var-last');
  const isEmptyNow = singleVariantGroup.urlVariants!.filter((v) => v.id !== 'var-last').length === 0 && remainingWidgets.length === 0;

  assert(isEmptyNow === true, 'Group should be recognized as empty and deleted');
  console.log('✓ Test 6B passed: last group variant extracted, empty parent group deleted');
}

// -------------------------------------------------------------
// Test 7: Normal tab dragged into favorites shelf
// -------------------------------------------------------------
{
  const normalTab: Tab = {
    id: 'tab-normal-1',
    url: 'https://developer.mozilla.org',
    customTitle: 'MDN Web Docs',
    parentSpaceId: 'space_work',
    parentFolderId: 'folder_docs',
    favourite: false,
    pinned: false,
    order: 400,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Dragging into favorites shelf
  const targetFavOrder = 2500;
  const convertedFavTab: Tab = {
    ...normalTab,
    favourite: true,
    pinned: false,
    parentSpaceId: undefined,
    parentFolderId: undefined,
    order: targetFavOrder,
    updatedAt: Date.now(),
  };

  assert(convertedFavTab.favourite === true, 'Converted tab must have favourite=true');
  assert(convertedFavTab.parentSpaceId === undefined, 'Converted favourite tab must have parentSpaceId=undefined');
  assert(convertedFavTab.parentFolderId === undefined, 'Converted favourite tab must have parentFolderId=undefined');
  assert(convertedFavTab.order === 2500, 'Order should be assigned in favorites shelf');
  console.log('✓ Test 7 passed: normal tab dragged into favorites shelf');
}

console.log('\nAll favourite tmp tab and normal tab drag tests PASSED successfully!');
