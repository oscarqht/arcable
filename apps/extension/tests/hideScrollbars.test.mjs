import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

let enabled;
let onChanged;
let failTab;
const calls = [];
const browser = {
  storage: {
    local: { get: async () => ({ arcable_hide_all_scrollbars: enabled }) },
    onChanged: { addListener: listener => { onChanged = listener; } },
  },
  tabs: { query: async () => [{ id: 1 }, { id: 2 }, {}] },
  scripting: {
    removeCSS: async details => {
      if (details.target.tabId === failTab) throw new Error('Restricted page');
      calls.push(['remove', details]);
    },
    insertCSS: async details => { calls.push(['insert', details]); },
  },
};
const source = await readFile(new URL('../src/background/hideScrollbars.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const sandbox = { exports: {}, require: () => browser, console };
vm.runInNewContext(js, sandbox);
const { applyHideScrollbars: apply, initHideScrollbarsBackground: init, HIDE_SCROLLBARS_CSS: css } = sandbox.exports;
const flush = () => new Promise(resolve => setImmediate(resolve));
init();
await flush();
assert.equal(calls.filter(([operation]) => operation === 'insert').length, 0, 'off by default');

enabled = true;
onChanged({ arcable_hide_all_scrollbars: { newValue: true } }, 'local');
await flush();
let inserted = calls.filter(([operation]) => operation === 'insert');
assert.equal(inserted.length, 2, 'updates all open tabs');
assert.ok(inserted.every(([, details]) => details.target.allFrames && details.origin === 'USER'));
assert.ok(css.includes('scrollbar-width: none !important'));
assert.ok(css.includes('*::-webkit-scrollbar'));
assert.ok(!/overflow\s*:|pointer-events\s*:/.test(css), 'does not disable scrolling');

calls.length = 0;
await apply({ tabId: 3, frameIds: [7] });
assert.equal(calls[1][1].target.frameIds[0], 7, 'new child frame uses its sender frame');
assert.equal(calls[0][1].css, calls[1][1].css, 'removes the exact stylesheet before reinserting');

calls.length = 0;
enabled = false;
onChanged({ arcable_hide_all_scrollbars: { newValue: false } }, 'local');
await flush();
assert.equal(calls.length, 2);
assert.ok(calls.every(([operation]) => operation === 'remove'), 'off restores site scrollbars');
assert.ok(calls.every(([, details]) => details.css === css && details.origin === 'USER'));

calls.length = 0;
enabled = true;
failTab = 1;
onChanged({ arcable_hide_all_scrollbars: { newValue: true } }, 'local');
await flush();
assert.ok(calls.some(([operation, details]) => operation === 'insert' && details.target.tabId === 2), 'restricted pages do not stop other tabs');

calls.length = 0;
failTab = undefined;
const queued = apply({ tabId: 4, allFrames: true });
enabled = false;
await queued;
assert.ok(calls.every(([operation]) => operation === 'remove'), 'queued updates read latest preference');

for (const name of ['chrome', 'firefox']) {
  const manifest = JSON.parse(await readFile(new URL(`../manifest.${name}.json`, import.meta.url), 'utf8'));
  const script = manifest.content_scripts.find(script => script.js.includes('hide-scrollbars.js'));
  assert.deepEqual(script.matches, ['<all_urls>']);
  assert.equal(script.all_frames, true);
  assert.equal(script.match_about_blank, true);
  assert.equal(script.run_at, 'document_start');
}
console.log('Hide scrollbars behavior checks passed.');
