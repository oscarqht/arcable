import assert from 'node:assert/strict';
import { fetchRaindropWorkspace, syncWorkspaceWithRaindrop } from '../src/utils/raindropSync';
import type { ArcableWorkspaceData } from '../src/types/workspace';
import type { WorkspaceOperation } from '../src/types/sync';

// Advance the mock clock to avoid real API rate-limit delays.
let clock = Date.now();
Date.now = () => (clock += 1000);

const collections: any[] = [{ _id: 1, title: 'Arcable v2' }];
let bookmarks: any[] = [];
let nextId = 10;
let corruptParts = false;
let truncateManifest = false;
let batchCount = 0;
const partPrefix = 'https://arcable.app/custom-code-part/';
const manifestPrefix = 'https://arcable.app/custom-code-v2/';
const limit = (item: any) => {
  const excerpt = item.excerpt?.replace(/[<>]/g, '').slice(0, 400);
  return { ...item, excerpt: corruptParts && item.link?.startsWith(partPrefix) ? excerpt?.slice(0, 30)
    : truncateManifest && item.link?.startsWith(manifestPrefix) ? excerpt?.slice(0, 20) : excerpt };
};

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  const path = url.pathname;
  const json = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (method === 'GET' && path.endsWith('/collections')) return json({ items: collections.filter((c) => !c.parent?.$id) });
  if (method === 'GET' && path.endsWith('/collections/childrens')) return json({ items: collections.filter((c) => c.parent?.$id) });
  if (method === 'GET' && path.includes('/raindrops/')) {
    const id = Number(path.split('/raindrops/')[1]);
    const nested = url.searchParams.get('nested') === 'true';
    const all = bookmarks.filter((b) => nested || b.collection?.$id === id);
    const page = Number(url.searchParams.get('page') || 0);
    const perpage = Number(url.searchParams.get('perpage') || 25);
    return json({ items: all.slice(page * perpage, (page + 1) * perpage), count: all.length });
  }
  if (method === 'POST' && path.endsWith('/collection')) {
    const created = { _id: nextId++, ...body };
    collections.push(created);
    return json({ item: created });
  }
  if (method === 'POST' && path.endsWith('/raindrops')) {
    batchCount++;
    const items = body.items.map((entry: any) => limit({ ...entry, _id: nextId++ }));
    bookmarks.push(...items);
    return json({ items });
  }
  if (method === 'PUT' && path.includes('/raindrop/')) {
    const item = bookmarks.find((b) => b._id === Number(path.split('/').pop()));
    assert(item);
    Object.assign(item, limit({ ...item, ...body }));
    return json({ item });
  }
  if (method === 'DELETE' && path.includes('/raindrops/')) {
    bookmarks = bookmarks.filter((b) => !body.ids.includes(b._id));
    return json({ result: true });
  }
  if (method === 'DELETE' && path.includes('/raindrop/')) {
    bookmarks = bookmarks.filter((b) => b._id !== Number(path.split('/').pop()));
    return json({ result: true });
  }
  throw new Error(`Unexpected request ${method} ${url}`);
}) as typeof fetch;

const base: ArcableWorkspaceData = { raindropRootCollectionId: 1, activeSpaceId: '', version: 1, spaces: [], folders: [], tabs: [], tmpTabs: [] };
const css = '  /* 雪 and < > */\nbody > p { color: red; }\n'.repeat(45);
const js = '  const f = x => x < 7 && x > 0; // 😀\n'.repeat(55);
const original = [
  { id: 'css-only', pattern: 'https://css.example/*', css, js: '' },
  { id: 'js-only', pattern: 'https://js.example/*', css: '', js },
  { id: 'both', pattern: 'https://both.example/*', css: css.repeat(4), js: js.repeat(4) },
  { id: 'short', pattern: 'https://short.example/*', css: 'a', js: '' },
];
const operation = (type: WorkspaceOperation['type'], id: string, payload: any): WorkspaceOperation =>
  ({ id: `${type}-${id}`, type, entityId: id, payload, timestamp: Date.now(), deviceId: 'test', lamportSeq: 1 });
const assertRules = (actual: typeof original, expected: typeof original) => {
  for (const rule of expected) {
    const found = actual.find((r) => r.id === rule.id);
    assert(found, `missing ${rule.id}`);
    assert.equal(found.pattern, rule.pattern);
    assert.equal(found.css, rule.css);
    assert.equal(found.js, rule.js);
  }
};

async function main() {
  const created = await syncWorkspaceWithRaindrop('token', { localState: { ...base, customCodeRules: original }, replaceBaseline: true });
  assert.equal(created.success, true, created.error);
  assertRules(created.latestSnapshot!.customCodeRules!, original);
  assert(batchCount > 1, 'long code must be sent in bounded batches');
  assert(bookmarks.filter((b) => b.link?.startsWith(partPrefix)).every((b) => b.excerpt.length <= 200));
  const fetched = await fetchRaindropWorkspace('token');
  assert.equal(fetched.success, true, fetched.error);
  assertRules(fetched.data!.customCodeRules!, original);

  const editedRules = original.map((r) => ({ ...r, css: r.js ? `${r.css}\n/* edited */` : r.css, js: r.js ? `${r.js}\n// edited` : r.js }));
  const updatedState = { ...created.latestSnapshot!, customCodeRules: created.latestSnapshot!.customCodeRules!.map((r) => ({ ...r, ...editedRules.find((e) => e.id === r.id) })) };
  const updated = await syncWorkspaceWithRaindrop('token', { localState: updatedState, pendingOps: editedRules.map((r) => operation('CUSTOM_CODE_UPDATE', r.id, r)) });
  assert.equal(updated.success, true, updated.error);
  const reopened = await fetchRaindropWorkspace('token');
  assert.equal(reopened.success, true, reopened.error);
  assertRules(reopened.data!.customCodeRules!, editedRules);

  const before = bookmarks.find((b) => b.link === `${manifestPrefix}both`).excerpt;
  corruptParts = true;
  const failed = await syncWorkspaceWithRaindrop('token', { localState: { ...updated.latestSnapshot!, customCodeRules: updated.latestSnapshot!.customCodeRules!.map((r) => r.id === 'both' ? { ...r, js: `${r.js}changed` } : r) }, pendingOps: [operation('CUSTOM_CODE_UPDATE', 'both', {})] });
  assert.equal(failed.success, false, 'corrupt parts must fail instead of clearing local code');
  assert.equal(bookmarks.find((b) => b.link === `${manifestPrefix}both`).excerpt, before, 'failed write must not publish the new manifest');
  corruptParts = false;
  const restored = await fetchRaindropWorkspace('token');
  assert.equal(restored.success, true, restored.error);
  assertRules(restored.data!.customCodeRules!, editedRules);

  const revision = JSON.parse(before).revision;
  const part = bookmarks.find((b) => b.link?.startsWith(`${partPrefix}both/${revision}/`) && b.excerpt.length > 30);
  const prior = part.excerpt;
  part.excerpt = prior.slice(0, 10);
  const corrupt = await fetchRaindropWorkspace('token');
  assert.equal(corrupt.success, false, 'incomplete remote data must not hydrate as empty code');
  part.excerpt = prior;

  const extra = { id: 'incremental', pattern: 'https://incremental.example/*', css, js };
  const inserted = await syncWorkspaceWithRaindrop('token', {
    localState: { ...updated.latestSnapshot!, customCodeRules: [...updated.latestSnapshot!.customCodeRules!, extra] },
    pendingOps: [operation('CUSTOM_CODE_CREATE', extra.id, extra)],
  });
  assert.equal(inserted.success, true, inserted.error);
  const afterCreate = await fetchRaindropWorkspace('token');
  assert.equal(afterCreate.success, true, afterCreate.error);
  assertRules(afterCreate.data!.customCodeRules!, [...editedRules, extra]);
  const savedExtra = inserted.latestSnapshot!.customCodeRules!.find((r) => r.id === extra.id)!;
  const deleted = await syncWorkspaceWithRaindrop('token', {
    localState: { ...inserted.latestSnapshot!, customCodeRules: inserted.latestSnapshot!.customCodeRules!.filter((r) => r.id !== extra.id) },
    pendingOps: [operation('CUSTOM_CODE_DELETE', extra.id, { raindropId: savedExtra.raindropId })],
  });
  assert.equal(deleted.success, true, deleted.error);
  assert(!bookmarks.some((b) => b.link?.startsWith(`${partPrefix}incremental/`)), 'deleting a rule must remove its code parts');
  assert(!bookmarks.some((b) => b.link === `${manifestPrefix}incremental`));

  const cancelledRule = { id: 'cancelled', pattern: 'https://cancelled.example/*', css, js };
  const cancelledOp = operation('CUSTOM_CODE_CREATE', cancelledRule.id, cancelledRule);
  truncateManifest = true;
  const cancelledCreate = await syncWorkspaceWithRaindrop('token', {
    localState: { ...updated.latestSnapshot!, customCodeRules: [...updated.latestSnapshot!.customCodeRules!, cancelledRule] },
    pendingOps: [cancelledOp],
  });
  assert.equal(cancelledCreate.success, false);
  truncateManifest = false;
  const cancelledDelete = await syncWorkspaceWithRaindrop('token', {
    localState: updated.latestSnapshot,
    pendingOps: [cancelledOp, operation('CUSTOM_CODE_DELETE', cancelledRule.id, {})],
  });
  assert.equal(cancelledDelete.success, true, cancelledDelete.error);
  assert(!bookmarks.some((b) => b.link?.startsWith(`${partPrefix}cancelled/`) || b.link === `${manifestPrefix}cancelled`));

  const legacy = updated.latestSnapshot!.customCodeRules!.find((r) => r.id === 'short')!;
  const expanded = { ...legacy, css, js };
  const expandedState = { ...updated.latestSnapshot!, customCodeRules: updated.latestSnapshot!.customCodeRules!.map((r) => r.id === legacy.id ? expanded : r) };
  const migration = await syncWorkspaceWithRaindrop('token', { localState: expandedState, pendingOps: [operation('CUSTOM_CODE_UPDATE', legacy.id, expanded)] });
  assert.equal(migration.success, true, migration.error);
  const migrated = await fetchRaindropWorkspace('token');
  assert.equal(migrated.success, true, migrated.error);
  assertRules(migrated.data!.customCodeRules!, [expanded]);
  assert.equal(migrated.data!.customCodeRules!.find((r) => r.id === legacy.id)!.raindropId, legacy.raindropId);
  const shrunk = { ...expanded, css: 'a', js: '' };
  const shrunkState = { ...migration.latestSnapshot!, customCodeRules: migration.latestSnapshot!.customCodeRules!.map((r) => r.id === legacy.id ? shrunk : r) };
  const shrink = await syncWorkspaceWithRaindrop('token', { localState: shrunkState, pendingOps: [operation('CUSTOM_CODE_UPDATE', legacy.id, shrunk)] });
  assert.equal(shrink.success, true, shrink.error);
  const fetchedShrink = await fetchRaindropWorkspace('token');
  assert.equal(fetchedShrink.success, true, fetchedShrink.error);
  assertRules(fetchedShrink.data!.customCodeRules!, [shrunk]);

  const retryRule = { id: 'retry', pattern: 'https://retry.example/*', css, js };
  const retryState = { ...updated.latestSnapshot!, customCodeRules: [...updated.latestSnapshot!.customCodeRules!, retryRule] };
  const retryOp = operation('CUSTOM_CODE_CREATE', retryRule.id, retryRule);
  truncateManifest = true;
  const firstAttempt = await syncWorkspaceWithRaindrop('token', { localState: retryState, pendingOps: [retryOp] });
  assert.equal(firstAttempt.success, false);
  truncateManifest = false;
  const retry = await syncWorkspaceWithRaindrop('token', { localState: retryState, pendingOps: [retryOp] });
  assert.equal(retry.success, true, retry.error);
  assert.equal(bookmarks.filter((b) => b.link === `${manifestPrefix}retry`).length, 1, 'retry must not duplicate the rule');
  const afterRetry = await fetchRaindropWorkspace('token');
  assert.equal(afterRetry.success, true, afterRetry.error);
  assertRules(afterRetry.data!.customCodeRules!, [retryRule]);

  truncateManifest = true;
  const missingManifest = await syncWorkspaceWithRaindrop('token', { localState: { ...updated.latestSnapshot!, customCodeRules: updated.latestSnapshot!.customCodeRules!.map((r) => r.id === 'both' ? { ...r, js: `${r.js}manifest` } : r) }, pendingOps: [operation('CUSTOM_CODE_UPDATE', 'both', {})] });
  assert.equal(missingManifest.success, false, 'a truncated manifest must not be reported as saved');
  truncateManifest = false;

  console.log('Long custom code sync tests passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
