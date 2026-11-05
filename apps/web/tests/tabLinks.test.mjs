import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = ts.createSourceFile(
  'page.tsx',
  await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const callbacks = new Map();
function visit(node) {
  if (ts.isJsxAttribute(node) && ['onOpenTab', 'onOpenVariant'].includes(node.name.text)) {
    const expression = node.initializer?.expression;
    assert.ok(expression && ts.isArrowFunction(expression));
    callbacks.set(node.name.text, ts.transpileModule(`(${expression.getText(source)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(callbacks.size, 2, 'Both web workspace callbacks must be tested');

for (const [name, code] of callbacks) {
  for (const [label, options] of [
    ['normal click', undefined],
    ['explicit same-tab preference', { inNewTab: false }],
    ['modifier-key click', { inNewTab: true }],
    ['temporary-tab open', { inNewTab: true, asTmpTab: true }],
  ]) {
    test(`${name}: ${label} opens a new tab without navigating the web app`, () => {
      const calls = [];
      const window = {
        location: { href: 'https://arcable.example/' },
        open: (...args) => calls.push(args),
      };
      const open = vm.runInNewContext(code, { window });
      open('https://example.com/destination', undefined, undefined, options);
      assert.deepEqual(calls, [['https://example.com/destination', '_blank', 'noopener,noreferrer']]);
      assert.equal(window.location.href, 'https://arcable.example/');
    });
  }

  test(`${name}: empty URLs do not open a tab`, () => {
    const open = vm.runInNewContext(code, {
      window: { open: () => assert.fail('An empty URL must not open a tab') },
    });
    open('');
  });

  test(`${name}: safe without a browser window`, () => {
    const open = vm.runInNewContext(code, {});
    assert.doesNotThrow(() => open('https://example.com'));
  });
}
