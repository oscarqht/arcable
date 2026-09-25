import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  widgetToRaindropItemInput,
  reconstructWorkspace,
  syncWorkspaceWithRaindrop,
  fetchRaindropWorkspace,
  ARCABLE_WIDGET_TAG,
  ARCABLE_WIDGET_LINK_PREFIX,
  ARCABLE_COLLECTION_NAME,
} from '../src/utils/raindropSync';
import { WorkspaceWidget, ArcableWorkspaceData } from '../src/types/workspace';
import { RaindropBookmarkItem, RaindropCollectionItem } from '../src/types/raindrop';

const sampleNoteText = `# Meeting Notes
> "Always measure twice, cut once."
- Tasks:
  - Check if count < 100 && total > 50
  - Review HTML template: <div class="header"><h3>Title</h3></div>
  - Visit docs: <https://example.com/docs>
  - Function: (x) => x > 0 && x < 10
  - Arrows: a -> b => c <=> d
`;

describe('Sticky note special characters preservation (<, >, tags, quotes)', () => {
  it('widgetToRaindropItemInput safely encodes sticky note content into excerpt and note', () => {
    const widget: WorkspaceWidget = {
      id: 'widget-sticky-1',
      style: 'note',
      size: 'small',
      order: 100,
      config: {
        text: sampleNoteText,
        colorTheme: 'yellow',
      },
    };

    const input = widgetToRaindropItemInput(widget, 10);
    assert.equal(input.title, '[Widget] note');
    assert.equal(input.link, `${ARCABLE_WIDGET_LINK_PREFIX}widget-sticky-1`);
    assert(input.tags?.includes(ARCABLE_WIDGET_TAG));

    // 1. Excerpt must be valid JSON
    const parsedExcerpt = JSON.parse(input.excerpt || '{}');
    assert.equal(parsedExcerpt.id, 'widget-sticky-1');
    assert.equal(parsedExcerpt.style, 'note');

    // 2. Excerpt should NOT contain raw ASCII '<' or '>' so Raindrop's backend HTML/text sanitizer
    // does not strip tags or characters from the JSON string
    assert(!input.excerpt?.includes('<'), 'Excerpt must not contain raw ASCII <');
    assert(!input.excerpt?.includes('>'), 'Excerpt must not contain raw ASCII >');

    // 3. Excerpt should have text_b64 and config_b64
    assert(parsedExcerpt.config.text_b64, 'Excerpt must include text_b64');
    assert(parsedExcerpt.config_b64, 'Excerpt must include config_b64');

    // 4. Note should be populated with base64 payload as fallback
    assert(input.note, 'Note field must be populated');
    const parsedNote = JSON.parse(input.note);
    assert(parsedNote.text_b64, 'Note must include text_b64');
    assert(parsedNote.config_b64, 'Note must include config_b64');
  });

  it('reconstructWorkspace restores original sticky note text with < and > intact', () => {
    const widget: WorkspaceWidget = {
      id: 'widget-sticky-1',
      style: 'note',
      size: 'small',
      order: 100,
      config: {
        text: sampleNoteText,
        colorTheme: 'yellow',
      },
    };

    const input = widgetToRaindropItemInput(widget, 10);
    const rootCol = { _id: 10, title: 'Arcable', parent: null } as any;

    const tree = {
      root: rootCol,
      collections: [rootCol],
      items: [
        {
          _id: 101,
          collectionId: 10,
          title: input.title,
          link: input.link,
          tags: input.tags,
          excerpt: input.excerpt,
          note: input.note,
          order: 100,
          sort: 100,
          created: '2026-09-25T10:00:00Z',
          lastUpdate: '2026-09-25T10:00:00Z',
        } as RaindropBookmarkItem,
      ],
    };

    const workspace = reconstructWorkspace(tree);
    const restoredWidget = workspace.widgets?.find((w) => w.id === 'widget-sticky-1');
    assert(restoredWidget, 'Widget must be restored');
    assert.equal(restoredWidget.config?.text, sampleNoteText, 'Sticky note text must match exact original content');
    assert.equal(restoredWidget.config?.colorTheme, 'yellow');
    // Temporary helper properties should be cleaned up
    assert.equal(restoredWidget.config?.text_b64, undefined);
    assert.equal(restoredWidget.config?.config_b64, undefined);
  });

  it('reconstructWorkspace restores < and > even if Raindrop backend stripped all < and > from excerpt', () => {
    const widget: WorkspaceWidget = {
      id: 'widget-sticky-1',
      style: 'note',
      size: 'small',
      order: 100,
      config: {
        text: sampleNoteText,
        colorTheme: 'pink',
      },
    };

    const input = widgetToRaindropItemInput(widget, 10);

    // Simulate aggressive Raindrop backend stripping of < and > from excerpt
    let sanitizedExcerpt = input.excerpt;
    if (sanitizedExcerpt) {
      sanitizedExcerpt = sanitizedExcerpt.replace(/[<>]/g, '');
    }

    const rootCol = { _id: 10, title: 'Arcable', parent: null } as any;
    const tree = {
      root: rootCol,
      collections: [rootCol],
      items: [
        {
          _id: 101,
          collectionId: 10,
          title: input.title,
          link: input.link,
          tags: input.tags,
          excerpt: sanitizedExcerpt,
          note: input.note,
          order: 100,
          sort: 100,
          created: '2026-09-25T10:00:00Z',
          lastUpdate: '2026-09-25T10:00:00Z',
        } as RaindropBookmarkItem,
      ],
    };

    const workspace = reconstructWorkspace(tree);
    const restoredWidget = workspace.widgets?.find((w) => w.id === 'widget-sticky-1');
    assert(restoredWidget, 'Widget must be restored');
    assert.equal(
      restoredWidget.config?.text,
      sampleNoteText,
      'Sticky note text must preserve < and > even if Raindrop sanitized excerpt'
    );
  });

  it('reconstructWorkspace gracefully handles legacy sticky notes without base64 fields', () => {
    const legacyExcerpt = JSON.stringify({
      id: 'widget-legacy',
      style: 'note',
      size: 'small',
      order: 50,
      config: {
        text: 'Legacy note text with no base64',
        colorTheme: 'blue',
      },
    });

    const rootCol = { _id: 10, title: 'Arcable', parent: null } as any;
    const tree = {
      root: rootCol,
      collections: [rootCol],
      items: [
        {
          _id: 102,
          collectionId: 10,
          title: '[Widget] note',
          link: `${ARCABLE_WIDGET_LINK_PREFIX}widget-legacy`,
          tags: [ARCABLE_WIDGET_TAG],
          excerpt: legacyExcerpt,
          order: 50,
          sort: 50,
          created: '2026-09-25T10:00:00Z',
          lastUpdate: '2026-09-25T10:00:00Z',
        } as RaindropBookmarkItem,
      ],
    };

    const workspace = reconstructWorkspace(tree);
    const restored = workspace.widgets?.find((w) => w.id === 'widget-legacy');
    assert(restored, 'Legacy widget must be restored');
    assert.equal(restored.config?.text, 'Legacy note text with no base64');
    assert.equal(restored.config?.colorTheme, 'blue');
  });

  it('preserves sticky note < and > across syncWorkspaceWithRaindrop and incremental updates', async () => {
    let nextId = 200;
    const mockState = {
      collections: [
        { _id: 1, title: ARCABLE_COLLECTION_NAME, sort: 0, parent: null },
        { _id: 10, title: 'Work', parent: { $id: 1 }, sort: 0 },
      ],
      bookmarks: [] as any[],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      let body: any;
      if (init?.body) {
        try {
          body = JSON.parse(String(init.body));
        } catch {
          body = String(init.body);
        }
      }
      const pathname = new URL(url).pathname;

      if (method === 'GET' && pathname.endsWith('/collections')) {
        return new Response(JSON.stringify({
          items: mockState.collections.filter((c: any) => !c.parent?.$id),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'GET' && pathname.endsWith('/collections/childrens')) {
        return new Response(JSON.stringify({
          items: mockState.collections.filter((c: any) => c.parent?.$id),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'GET' && pathname.includes('/raindrops/')) {
        const collId = parseInt(pathname.split('/raindrops/')[1], 10);
        const nested = new URL(url).searchParams.get('nested') === 'true';
        let items: any[] = [];
        if (nested) {
          const descColls = new Set<number>([collId]);
          for (const c of mockState.collections) {
            if (c.parent?.$id && descColls.has(c.parent.$id)) descColls.add(c._id);
          }
          items = mockState.bookmarks.filter((b) => descColls.has(b.collection?.$id || b.collectionId));
        } else {
          items = mockState.bookmarks.filter((b) => (b.collection?.$id || b.collectionId) === collId);
        }
        return new Response(JSON.stringify({ items, count: items.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'POST' && pathname.endsWith('/raindrops')) {
        const created = (body.items || []).map((item: any) => {
          const collId = item.collection?.$id ?? item.collectionId;
          const newItem = {
            ...item,
            _id: nextId++,
            collection: { $id: collId },
            collectionId: collId,
            created: '2026-09-25T10:00:00Z',
            lastUpdate: '2026-09-25T10:00:00Z',
          };
          mockState.bookmarks.push(newItem);
          return newItem;
        });
        return new Response(JSON.stringify({ items: created }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'PUT' && pathname.includes('/raindrop/')) {
        const id = Number(pathname.split('/').pop());
        const existing = mockState.bookmarks.find((b) => b._id === id);
        if (existing) {
          Object.assign(existing, body, { lastUpdate: '2026-09-25T10:01:00Z' });
        }
        return new Response(JSON.stringify({ item: existing || { _id: id, ...body } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    try {
      const initialWorkspace: ArcableWorkspaceData = {
        spaces: [{ id: '10', name: 'Work', order: 0, createdAt: 1000 }],
        folders: [],
        tabs: [],
        widgets: [
          {
            id: 'w-note-1',
            style: 'note',
            size: 'small',
            order: 0,
            config: {
              text: '> Initial note with <tag> & x < 10',
              colorTheme: 'yellow',
            },
          },
        ],
      };

      // 1. Initial Sync
      const syncResult1 = await syncWorkspaceWithRaindrop('mock-token', {
        localState: initialWorkspace,
        replaceBaseline: true,
      });
      assert.equal(syncResult1.success, true);

      // Verify the created bookmark in Raindrop
      const createdBm = mockState.bookmarks.find((b) => b.link === `${ARCABLE_WIDGET_LINK_PREFIX}w-note-1`);
      assert(createdBm, 'Widget bookmark must be created');
      assert(!createdBm.excerpt.includes('<'), 'Raindrop excerpt must not contain raw <');
      assert(!createdBm.excerpt.includes('>'), 'Raindrop excerpt must not contain raw >');

      // Simulate Raindrop backend stripping < and > if any were present
      createdBm.excerpt = createdBm.excerpt.replace(/[<>]/g, '');

      // 2. Incremental Update with more special characters
      const updatedText = `> Updated note:
- Comparison: x < 5 && y > 10
- Code: <div>Hello World</div>
- Arrow: a -> b => c`;

      const updatedWorkspace: ArcableWorkspaceData = {
        ...syncResult1.latestSnapshot!,
        widgets: [
          {
            ...syncResult1.latestSnapshot!.widgets![0],
            config: {
              text: updatedText,
              colorTheme: 'green',
            },
            updatedAt: Date.now(),
          },
        ],
      };

      const syncResult2 = await syncWorkspaceWithRaindrop('mock-token', {
        localState: updatedWorkspace,
        pendingOps: [
          {
            id: 'op-update-w',
            type: 'WIDGET_UPDATE',
            entityId: 'w-note-1',
            payload: {
              config: {
                text: updatedText,
                colorTheme: 'green',
              },
            },
            timestamp: Date.now(),
          },
        ],
      });
      assert.equal(syncResult2.success, true);

      // Verify fetchRaindropWorkspace reconstructs the updated text with < and >
      const fetched = await fetchRaindropWorkspace('mock-token');
      assert.equal(fetched.success, true);
      const fetchedWidget = fetched.data?.widgets?.find((w) => w.id === 'w-note-1');
      assert(fetchedWidget, 'Fetched widget must exist');
      assert.equal(fetchedWidget.config?.text, updatedText, 'Fetched text with < and > must match updated text');
      assert.equal(fetchedWidget.config?.colorTheme, 'green');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
