import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const shortcuts = compile(await readFile(new URL('../src/sidepanel/shortcuts.ts', import.meta.url), 'utf8'));
const entries = await Promise.all(['sidepanel', 'popup'].map(async page => [
  page, compile(await readFile(new URL(`../src/${page}/main.tsx`, import.meta.url), 'utf8')),
]));

for (const [page, entry] of entries) {
  for (const [name, windows] of [
    ['missing windows', undefined],
    ['missing getCurrent', {}],
    ['throwing getCurrent', { getCurrent() { throw new Error('unsupported'); } }],
    ['rejecting getCurrent', { getCurrent: async () => { throw new Error('unsupported'); } }],
    ['desktop', { getCurrent: async () => ({ id: 42 }) }],
  ]) {
    const messages = [];
    const ports = [];
    let rendered = false;
    let receiveMessage;
    const browser = {
      windows,
      runtime: {
        onMessage: { addListener(fn) { receiveMessage = fn; } },
        sendMessage: async message => { messages.push(message); return { success: false }; },
        connect: () => {
          const port = { onDisconnect: { addListener() {} }, postMessage: message => ports.push(message) };
          return port;
        },
      },
    };
    const sandbox = {
      exports: {}, console, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
      window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } },
      document: { getElementById: () => true, hasFocus: () => true, addEventListener() {}, removeEventListener() {} },
      require: id => id === 'webextension-polyfill' ? browser : {},
    };
    vm.runInNewContext(shortcuts, sandbox);
    const shortcutExports = sandbox.exports;
    sandbox.exports = {};
    sandbox.require = id => {
      if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (id === 'react') return { StrictMode: 'strict' };
      if (id === 'react-dom/client') return { createRoot: () => ({ render() { rendered = true; } }) };
      if (id.endsWith('/shortcuts') || id === './shortcuts') return shortcutExports;
      return {};
    };
    vm.runInNewContext(entry, sandbox);
    assert.ok(rendered, `${page}: ${name} must not prevent React mounting`);
    assert.equal(typeof receiveMessage, 'function');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(messages.length, 1, `${page}: ${name} consumes pending search focus`);
    assert.equal(messages[0].windowId, name === 'desktop' ? 42 : undefined);
    assert.equal(ports.length, page === 'sidepanel' && name === 'desktop' ? 1 : 0);
    if (ports.length) assert.equal(ports[0].windowId, 42);
  }
}
console.log('Firefox mobile side panel and popup startup tests passed.');
