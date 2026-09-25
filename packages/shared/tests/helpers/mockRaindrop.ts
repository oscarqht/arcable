/** In-memory Raindrop REST API (collections + raindrops + file upload) used by sync tests. */
export interface MockRaindrop {
  collections: any[];
  bookmarks: any[];
  handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> | undefined;
  reset(): void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function createMockRaindrop(): MockRaindrop {
  let nextId = 1000;
  const state: MockRaindrop = {
    collections: [],
    bookmarks: [],
    reset() {
      state.collections = [];
      state.bookmarks = [];
    },
    handle(input, init) {
      const url = new URL(String(input));
      if (url.hostname !== 'api.raindrop.io') return undefined;
      const method = (init?.method || 'GET').toUpperCase();
      const pathname = url.pathname;
      return (async () => {
        let body: any;
        if (init?.body instanceof FormData) {
          const file = init.body.get('file') as File;
          body = {
            collectionId: Number(init.body.get('collectionId')),
            fileName: file?.name,
            content: file ? await file.text() : '',
          };
        } else if (typeof init?.body === 'string') {
          try {
            body = JSON.parse(init.body);
          } catch {
            body = init.body;
          }
        }

        if (method === 'GET' && pathname.endsWith('/collections')) {
          return json({ items: state.collections.filter((c) => !c.parent?.$id) });
        }
        if (method === 'GET' && pathname.endsWith('/collections/childrens')) {
          return json({ items: state.collections.filter((c) => c.parent?.$id) });
        }
        if (method === 'GET' && pathname.includes('/collections/covers/')) {
          return json({ items: [] });
        }
        if (method === 'GET' && pathname.includes('/raindrops/')) {
          const collectionId = parseInt(pathname.split('/raindrops/')[1], 10);
          const ids = new Set<number>([collectionId]);
          if (url.searchParams.get('nested') === 'true') {
            let changed = true;
            while (changed) {
              changed = false;
              for (const c of state.collections) {
                if (c.parent?.$id && ids.has(c.parent.$id) && !ids.has(c._id)) {
                  ids.add(c._id);
                  changed = true;
                }
              }
            }
          }
          const page = Number(url.searchParams.get('page') || 0);
          const items = page > 0 ? [] : state.bookmarks.filter((b) => ids.has(b.collection?.$id));
          return json({ items, count: items.length });
        }
        if (method === 'POST' && pathname.endsWith('/collection')) {
          const created = { _id: nextId++, title: body.title, parent: body.parent, sort: body.sort ?? 0, color: body.color, cover: body.cover };
          state.collections.push(created);
          return json({ item: created });
        }
        if (method === 'PUT' && pathname.startsWith('/rest/v1/collection/')) {
          const id = parseInt(pathname.split('/').pop()!, 10);
          const existing = state.collections.find((c) => c._id === id);
          if (existing) Object.assign(existing, body);
          return json({ item: existing || { _id: id, ...body } });
        }
        if (method === 'PUT' && pathname.endsWith('/raindrop/file')) {
          const created = {
            _id: nextId++,
            title: body.fileName,
            link: `https://up.raindrop.io/${body.fileName}`,
            file: { name: body.fileName },
            content: body.content,
            collection: { $id: body.collectionId },
            collectionId: body.collectionId,
          };
          state.bookmarks.push(created);
          return json({ item: created });
        }
        if (method === 'POST' && pathname.endsWith('/raindrops')) {
          const items = (body.items || []).map((input: any) => {
            const created = {
              _id: nextId++,
              ...input,
              order: 0,
              sort: 0,
              collectionId: input.collection?.$id,
              created: '2026-01-01T00:00:00Z',
              lastUpdate: '2026-01-01T00:00:00Z',
            };
            state.bookmarks.push(created);
            return created;
          });
          return json({ items });
        }
        if (method === 'PUT' && pathname.startsWith('/rest/v1/raindrop/')) {
          const id = parseInt(pathname.split('/').pop()!, 10);
          const existing = state.bookmarks.find((b) => b._id === id);
          if (existing) {
            Object.assign(existing, body);
            if (body.collection?.$id) existing.collectionId = body.collection.$id;
          }
          return json({ item: existing || { _id: id, ...body } });
        }
        if (method === 'GET' && pathname.startsWith('/rest/v1/raindrop/')) {
          const id = parseInt(pathname.split('/').pop()!, 10);
          return json({ item: state.bookmarks.find((b) => b._id === id) });
        }
        if (method === 'DELETE' && pathname.startsWith('/rest/v1/raindrops/')) {
          const ids: number[] = body?.ids || [];
          state.bookmarks = state.bookmarks.filter((b) => !ids.includes(b._id));
          return json({ result: true });
        }
        if (method === 'DELETE' && pathname.startsWith('/rest/v1/raindrop/')) {
          const id = parseInt(pathname.split('/').pop()!, 10);
          state.bookmarks = state.bookmarks.filter((b) => b._id !== id);
          return json({ result: true });
        }
        if (method === 'DELETE' && pathname.startsWith('/rest/v1/collection/')) {
          const id = parseInt(pathname.split('/').pop()!, 10);
          state.collections = state.collections.filter((c) => c._id !== id);
          return json({ result: true });
        }
        return json({ result: true });
      })();
    },
  };
  return state;
}
