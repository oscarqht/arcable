import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/tabSwitcher/session.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const { SwitcherSession, isNewTab, isNewTabUrl } = sandbox.exports;
const tabs = Array.from({ length: 5 }, (_, id) => ({ id, title: `Tab ${id}`, url: `https://example.com/${id}` }));
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const pending = [], renders = [], activations = [], visibility = [];
  let closed = 0;
  const session = new SwitcherSession({
    load: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    render: (tabs, selected) => renders.push({ tabs, selected }),
    close: () => { closed++; },
    activate: async id => { activations.push(id); },
    visibility: value => visibility.push(value),
  });
  return { session, pending, renders, activations, visibility, get closed() { return closed; } };
}

test('starts on previous tab, cycles in fixed order and wraps, then activates on release', async () => {
  const f = fixture();
  f.session.handle('next');
  f.pending[0].resolve(tabs);
  await flush();
  assert.equal(f.renders.at(-1).selected, 1);
  for (let i = 0; i < 4; i++) f.session.handle('next');
  assert.equal(f.renders.at(-1).selected, 0);
  assert.equal(f.activations.length, 0);
  f.session.handle('commit');
  assert.deepEqual(f.activations, [0]);
  assert.deepEqual(f.visibility, [true, false]);
});

test('fast release and repeated input before worker response select the intended tab', async () => {
  const f = fixture();
  f.session.handle('next');
  f.session.handle('next');
  f.session.handle('commit');
  assert.equal(f.activations.length, 0);
  f.pending[0].resolve(tabs);
  await flush();
  assert.deepEqual(f.activations, [2]);
  assert.equal(f.session.active, false);
});

test('cancel during load prevents late activation or reopening, even after another session starts', async () => {
  const f = fixture();
  f.session.handle('next');
  f.session.handle('commit');
  f.session.handle('cancel');
  f.session.handle('next');
  f.pending[0].resolve(tabs);
  await flush();
  assert.deepEqual(f.activations, []);
  assert.equal(f.renders.at(-1).tabs.length, 0);
  f.pending[1].resolve(tabs);
  await flush();
  assert.equal(f.renders.at(-1).selected, 1);
});

test('reverse cycles and clicking a card selects that card', async () => {
  const f = fixture();
  f.session.handle('previous');
  f.pending[0].resolve(tabs);
  await flush();
  assert.equal(f.renders.at(-1).selected, 4);
  f.session.choose(2);
  assert.deepEqual(f.activations, [2]);
});

test('single tab works; empty results and failed loads dismiss safely', async () => {
  for (const result of [tabs.slice(0, 1), [], null]) {
    const f = fixture();
    f.session.handle('next');
    f.session.handle('commit');
    if (result) f.pending[0].resolve(result);
    else f.pending[0].reject(new Error('worker unavailable'));
    await flush();
    assert.equal(f.session.active, false);
    assert.deepEqual(f.activations, result?.length ? [0] : []);
    assert.equal(f.closed, 1);
  }
});

test('filters out new tab urls from switcher session and cancels if all tabs are new tabs', async () => {
  assert.equal(isNewTabUrl('chrome://newtab'), true);
  assert.equal(isNewTabUrl('about:blank'), true);
  assert.equal(isNewTabUrl('https://example.com'), false);
  assert.equal(isNewTab({ url: 'chrome://new-tab-page' }), true);
  assert.equal(isNewTab({ url: 'https://example.com' }), false);

  const mixedTabs = [
    { id: 1, title: 'Real Tab 1', url: 'https://example.com/1' },
    { id: 2, title: 'New Tab', url: 'chrome://newtab' },
    { id: 3, title: 'Blank', url: 'about:blank' },
    { id: 4, title: 'Real Tab 2', url: 'https://example.com/2' },
    { id: 5, title: 'Edge New Tab', url: 'edge://newtab' },
  ];

  const f = fixture();
  f.session.handle('next');
  f.pending[0].resolve(mixedTabs);
  await flush();

  assert.equal(f.session.active, true);
  assert.deepEqual(
    f.renders.at(-1).tabs.map(t => t.id),
    [1, 4],
  );

  // When all loaded tabs are new tabs, session cancels safely
  const allNewTabs = [
    { id: 10, title: 'New Tab', url: 'chrome://newtab' },
    { id: 11, title: 'About Blank', url: 'about:blank' },
  ];
  const fEmpty = fixture();
  fEmpty.session.handle('next');
  fEmpty.pending[0].resolve(allNewTabs);
  await flush();

  assert.equal(fEmpty.session.active, false);
  assert.equal(fEmpty.closed, 1);
  assert.deepEqual(fEmpty.activations, []);
});

