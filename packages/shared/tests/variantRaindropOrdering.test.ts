import {
  ARCABLE_VARIANT_DELIMITER,
  calculateTabTargetOrder,
  calculateWidgetTargetOrder,
  getTabVariantOrder,
  reconstructWorkspace,
  syncWorkspaceWithRaindrop,
} from '../src/utils/raindropSync';
import type { Tab, TabUrlVariant, WorkspaceWidget, ArcableWorkspaceData } from '../src/types/workspace';
import type { RaindropBookmarkItem, RaindropCollectionTree } from '../src/types/raindrop';

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

let remoteItemsStore: RaindropBookmarkItem[] = [];
let nextId = 1000;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string'
    ? JSON.parse(init.body)
    : undefined;

  if (method === 'GET') {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/collections')) {
      return new Response(JSON.stringify({
        items: [
          { _id: 1, title: 'Arcable v2', count: remoteItemsStore.length, sort: 0 },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith('/collections/childrens')) {
      return new Response(JSON.stringify({
        items: [
          { _id: 2, title: 'Personal', parent: { $id: 1 }, count: remoteItemsStore.length, sort: 0 },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/raindrops/')) {
      return new Response(JSON.stringify({
        items: remoteItemsStore,
        count: remoteItemsStore.length,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (url.includes('cover') || url.includes('icon')) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/collection') && method === 'POST') {
    return new Response(JSON.stringify({ item: { _id: 2, title: body?.title || 'Collection', parent: { $id: 1 } } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.endsWith('/raindrops') && method === 'POST') {
    const created = body.items.map((item: any) => {
      const newItem: RaindropBookmarkItem = {
        _id: nextId++,
        title: item.title,
        link: item.link,
        cover: item.cover,
        collectionId: item.collection?.$id || 2,
        order: item.order ?? 0,
        sort: item.sort ?? 0,
      };
      remoteItemsStore.push(newItem);
      return newItem;
    });
    return new Response(JSON.stringify({ items: created }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'PUT') {
    const id = Number(url.split('/').pop());
    const existing = remoteItemsStore.find((item) => item._id === id);
    if (existing) {
      if (body.title !== undefined) existing.title = body.title;
      if (body.link !== undefined) existing.link = body.link;
      if (body.cover !== undefined) existing.cover = body.cover;
      if (body.order !== undefined) existing.order = body.order;
      if (body.sort !== undefined) existing.sort = body.sort;
      if (body.collection?.$id !== undefined) existing.collectionId = body.collection.$id;
    }
    return new Response(JSON.stringify({ item: existing || { _id: id, ...body } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'DELETE') {
    if (url.includes('/raindrops/')) {
      const idsToDelete: number[] = body?.ids || [];
      remoteItemsStore = remoteItemsStore.filter((item) => !idsToDelete.includes(item._id));
      return new Response(JSON.stringify({ result: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const id = Number(url.split('/').pop());
    remoteItemsStore = remoteItemsStore.filter((item) => item._id !== id);
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}) as typeof fetch;

async function testVariantRaindropOrdering() {
  console.log('Running variant Raindrop ordering and title tests...');

  // 1. Title format tests: Single URL vs Multi-variant
  {
    remoteItemsStore = [];
    const singleTab: Tab = {
      id: 'tab-single',
      url: 'https://google.com',
      customTitle: 'Google',
      favourite: true,
      order: 0,
    };
    const multiTab: Tab = {
      id: 'tab-multi',
      url: 'https://github.com',
      customTitle: 'GitHub',
      favourite: true,
      order: 1,
      defaultVariantId: 'v1',
      urlVariants: [
        { id: 'v1', name: 'Default', url: 'https://github.com' },
        { id: 'v2', name: 'PRs', url: 'https://github.com/pulls' },
        { id: 'v3', name: 'Issues', url: 'https://github.com/issues' },
      ],
    };

    const localState: ArcableWorkspaceData = {
      spaces: [{ id: 'space_personal', name: 'Personal', order: 0 }],
      folders: [],
      tabs: [singleTab, multiTab],
      widgets: [],
      customCodeRules: [],
      runCodeInPageRules: [],
      activeSpaceId: 'space_personal',
    };

    const syncResult = await syncWorkspaceWithRaindrop('test-token', {
      localState,
      pendingOps: [],
      replaceBaseline: true,
      forceFullTreeFetch: true,
    });

    assert(syncResult.success, 'Sync should succeed');

    const singleRemote = remoteItemsStore.find((i) => i.link === 'https://google.com');
    assert(singleRemote?.title === 'Google', `Single URL tab title must have NO delimiter, got: ${singleRemote?.title}`);

    const v1Remote = remoteItemsStore.find((i) => i.link === 'https://github.com');
    assert(
      v1Remote?.title === `GitHub${ARCABLE_VARIANT_DELIMITER}Default`,
      'Default variant bookmark must have <item name> ||| <variant name>'
    );

    const v2Remote = remoteItemsStore.find((i) => i.link === 'https://github.com/pulls');
    assert(
      v2Remote?.title === `GitHub${ARCABLE_VARIANT_DELIMITER}PRs`,
      'Secondary variant bookmark must have <item name> ||| <variant name>'
    );

    const v3Remote = remoteItemsStore.find((i) => i.link === 'https://github.com/issues');
    assert(
      v3Remote?.title === `GitHub${ARCABLE_VARIANT_DELIMITER}Issues`,
      'Secondary variant bookmark must have <item name> ||| <variant name>'
    );

    // Verify consecutive Raindrop ordering
    assert(v1Remote?.order !== undefined && v2Remote?.order !== undefined && v3Remote?.order !== undefined, 'Orders must be set');
    assert(v2Remote.order === v1Remote.order + 1, 'v2 order must directly follow v1 order');
    assert(v3Remote.order === v2Remote.order + 1, 'v3 order must directly follow v2 order');

    console.log('✓ Multi-variant titles and consecutive sorting in normal spaces verified');
  }

  // 2. Favourite group with variants and child widgets ordered by groupItemOrder
  {
    const groupTab: Tab = {
      id: 'grp-1',
      url: 'https://linear.app',
      customTitle: 'Linear',
      favourite: true,
      isGroup: true,
      order: 0,
      defaultVariantId: 'v-lin',
      urlVariants: [
        { id: 'v-lin', name: 'Work', url: 'https://linear.app' },
        { id: 'v-lin-priv', name: 'Private', url: 'https://linear.app/personal' },
      ],
      groupItemOrder: [
        { type: 'tab', id: 'v-lin' },
        { type: 'widget', id: 'w-clock' },
        { type: 'tab', id: 'v-lin-priv' },
      ],
    };

    const childWidget: WorkspaceWidget = {
      id: 'w-clock',
      parentGroupId: 'grp-1',
      order: 0,
      style: 'combo',
      size: 'small',
    };

    const allTabs = [groupTab];
    const allWidgets = [childWidget];

    const grpTargetOrder = calculateTabTargetOrder(groupTab, allTabs, allWidgets);
    assert(grpTargetOrder === 0, 'Group base order should be 0');

    const vLinOrder = getTabVariantOrder(groupTab, 'v-lin', 0, grpTargetOrder);
    const widgetOrder = calculateWidgetTargetOrder(childWidget, allTabs, allWidgets);
    const vPrivOrder = getTabVariantOrder(groupTab, 'v-lin-priv', 1, grpTargetOrder);

    assert(vLinOrder === 0, 'v-lin should be at index 0');
    assert(widgetOrder === 1, 'w-clock should be at index 1');
    assert(vPrivOrder === 2, 'v-lin-priv should be at index 2');

    console.log('✓ Favourite group with mixed variants and child widgets correctly ordered by groupItemOrder');
  }

  // 3. One-time migration: existing bookmark missing delimiter gets updated
  {
    remoteItemsStore = [
      {
        _id: 501,
        title: 'Claude', // Bare title missing delimiter!
        link: 'https://claude.ai',
        collectionId: 1,
        order: 0,
        sort: 0,
      },
      {
        _id: 502,
        title: `Claude${ARCABLE_VARIANT_DELIMITER}Projects`,
        link: 'https://claude.ai/projects',
        collectionId: 1,
        order: 1,
        sort: 1,
      },
    ];

    const localTab: Tab = {
      id: '501',
      raindropId: 501,
      url: 'https://claude.ai',
      customTitle: 'Claude',
      favourite: true,
      order: 0,
      defaultVariantId: '501',
      urlVariants: [
        { id: '501', name: 'Default', url: 'https://claude.ai' },
        { id: '502', name: 'Projects', url: 'https://claude.ai/projects' },
      ],
    };

    const syncResult = await syncWorkspaceWithRaindrop('test-token', {
      localState: {
        spaces: [{ id: 'space_personal', name: 'Personal', order: 0 }],
        folders: [],
        tabs: [localTab],
        widgets: [],
        customCodeRules: [],
        runCodeInPageRules: [],
        activeSpaceId: 'space_personal',
      },
      pendingOps: [],
      replaceBaseline: true,
      forceFullTreeFetch: true,
    });

    assert(syncResult.success, 'Sync should succeed');

    const item501 = remoteItemsStore.find((i) => i._id === 501);
    assert(
      item501?.title === `Claude${ARCABLE_VARIANT_DELIMITER}Default`,
      `Bookmark 501 should have title migrated to Claude ||| Default, got: ${item501?.title}`
    );
    console.log('✓ One-time migration successfully detected and updated bare title to Claude ||| Default');
  }

  // 4. Workspace reconstruction from remote items where all variants have |||
  {
    const rootCol = { _id: 1, title: 'Arcable v2', count: 2, sort: 0 };
    const spaceCol = { _id: 2, title: 'Personal', parent: { $id: 1 }, count: 2, sort: 0 };

    const items: RaindropBookmarkItem[] = [
      {
        _id: 601,
        title: `ChatGPT${ARCABLE_VARIANT_DELIMITER}Default`,
        link: 'https://chatgpt.com',
        collectionId: 2,
        order: 5,
        sort: 5,
      },
      {
        _id: 602,
        title: `ChatGPT${ARCABLE_VARIANT_DELIMITER}GPTs`,
        link: 'https://chatgpt.com/gpts',
        collectionId: 2,
        order: 6,
        sort: 6,
      },
    ];

    const tree: RaindropCollectionTree = {
      root: rootCol,
      collections: [rootCol, spaceCol],
      items,
    };

    const reconstructed = reconstructWorkspace(tree, 'space_personal');
    assert(reconstructed.tabs.length === 1, `Expected 1 tab, got ${reconstructed.tabs.length}`);
    const tab = reconstructed.tabs[0];
    assert(tab.customTitle === 'ChatGPT', `Expected customTitle ChatGPT, got ${tab.customTitle}`);
    assert(tab.urlVariants?.length === 2, `Expected 2 variants, got ${tab.urlVariants?.length}`);
    assert(tab.urlVariants[0].name === 'Default', 'First variant must be Default');
    assert(tab.urlVariants[0].url === 'https://chatgpt.com', 'First variant URL must match');
    assert(tab.urlVariants[1].name === 'GPTs', 'Second variant must be GPTs');
    assert(tab.defaultVariantId === tab.urlVariants[0].id, 'defaultVariantId must point to first variant');

    console.log('✓ ReconstructWorkspace correctly parses multi-variant tabs when all items have |||');
  }

  console.log('All variant Raindrop ordering and title tests passed successfully!');
}

void testVariantRaindropOrdering().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
