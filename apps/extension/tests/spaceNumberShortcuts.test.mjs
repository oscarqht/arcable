import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../../../packages/shared/src/components/workspace/WorkspaceManager.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('WorkspaceManager.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0]?.getText(file).includes('const handleSpaceNumberShortcut')) effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(effect);
const code = ts.transpileModule(`const setup = ${effect.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let listener;
let selected;
let modal = false;
const context = {
  enableSpaceNumberShortcuts: true,
  sortedSpacesWithVirtual: Array.from({ length: 9 }, (_, i) => ({ id: `space-${i + 1}` })),
  setActiveSpace: id => { selected = id; },
  window: {
    addEventListener: (name, fn) => { assert.equal(name, 'keydown'); listener = fn; },
    removeEventListener: (name, fn) => { assert.equal(fn, listener); listener = undefined; },
  },
  document: { querySelector: () => modal },
};
const setup = vm.runInNewContext(code + '\nsetup;', context);
const cleanup = setup();
function key(overrides = {}) {
  selected = undefined;
  const event = { code: 'Digit1', key: '¡', altKey: true, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
  listener(event);
  return event;
}
for (let n = 1; n <= 9; n++) {
  const event = key({ code: `Digit${n}`, key: ['¡', '™', '£'][n % 3] });
  assert.equal(selected, `space-${n}`);
  assert.equal(event.prevented, true);
}
// Use displayed order, including the local Open Tabs virtual space at its displayed position.
context.sortedSpacesWithVirtual = [{ id: 'reordered-space' }, { id: 'local-open-tabs' }];
key();
assert.equal(selected, 'reordered-space');
key({ code: 'Digit2' });
assert.equal(selected, 'local-open-tabs');
for (const override of [
  { code: 'Digit3' }, { code: 'Digit0' }, { code: 'KeyT' }, { altKey: false },
  { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true },
  { repeat: true }, { defaultPrevented: true }, { target: { closest: () => ({}) } },
]) {
  const event = key(override);
  assert.equal(selected, undefined);
  assert.equal(event.prevented, false);
}
modal = true;
assert.equal(key().prevented, false);
assert.equal(selected, undefined);
cleanup();
assert.equal(listener, undefined);
context.enableSpaceNumberShortcuts = false;
assert.equal(setup(), undefined);
assert.equal(listener, undefined);
const app = await readFile(new URL('../src/sidepanel/App.tsx', import.meta.url), 'utf8');
assert.match(app, /enableSpaceNumberShortcuts=\{true\}/);
const popup = await readFile(new URL('../src/popup/App.tsx', import.meta.url), 'utf8');
assert.match(popup, /export \{ App \} from '..\/sidepanel\/App'/);
console.log('Option/Alt+1–9 space navigation, ordering, guards, and listener cleanup passed.');
