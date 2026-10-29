import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/tabTracker.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('tabTracker.ts', source, ts.ScriptTarget.Latest, true);
let method;
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'activateTab') method = node;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(method);
const compile = text => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;

let popupAlive = true;
let activeTab;
let focusedWindow;
let received;
let dismissPopup;
const dismissed = new Promise(resolve => { dismissPopup = resolve; });
const closePopup = () => { popupAlive = false; dismissPopup(); };
const workerBrowser = {
  runtime: { id: 'arcable-test' },
  tabs: { update: async (id, details) => {
    assert.equal(details.active, true);
    activeTab = id;
    closePopup(); // Switching tabs can dismiss the originating popup.
    return { id, windowId: 99 };
  } },
  windows: { update: async id => { focusedWindow = id; } },
};
let workerHandler;
const popupBrowser = {
  // Reproduce the original failure: focusing the browser dismisses the popup,
  // destroying its JS context before its awaited continuation can activate a tab.
  windows: { update: () => { closePopup(); return new Promise(() => {}); } },
  tabs: { update: async id => {
    assert.ok(popupAlive, 'the popup must not issue API calls after dismissal');
    activeTab = id;
  } },
  runtime: { sendMessage: async message => {
    received = message;
    const module = { exports: {}, require: () => workerBrowser, console };
    const workerSource = await readFile(new URL('../src/background/tabActivation.ts', import.meta.url), 'utf8');
    vm.runInNewContext(compile(workerSource), module);
    workerHandler = module.exports.handleTabActivationMessage;
    return workerHandler(message, { id: 'arcable-test', url: 'chrome-extension://arcable-test/popup/index.html' });
  } },
};
const activate = vm.runInNewContext(compile(`const activate = async function ${method.name.getText(file)}${source.slice(method.name.end, method.end)};`) + '\nactivate;', { browser: popupBrowser, console });
const pending = activate(42, 1); // Deliberately stale association window ID.
// The old popup's continuation never resumes after dismissal. Drain the worker's
// microtasks without relying on a wall-clock timeout for the successful path.
await Promise.race([pending, dismissed]);
await new Promise(resolve => setImmediate(resolve));
assert.equal(activeTab, 42, 'clicking an associated item must activate its browser tab even when the popup closes');
assert.equal(focusedWindow, 99, 'the worker must focus the tab actual window after popup dismissal');
assert.equal(received.type, 'ARCABLE_ACTIVATE_BROWSER_TAB');

assert.equal((await workerHandler({ type: 'unrelated' }, {})), undefined);
assert.equal((await workerHandler(received, { id: 'other-extension' })).success, false);
assert.equal((await workerHandler({ ...received, browserTabId: '42' }, { id: 'arcable-test' })).success, false);
workerBrowser.tabs.update = async () => { throw new Error('Tab was closed'); };
assert.equal((await workerHandler(received, { id: 'arcable-test' })).success, false);
console.log('Popup tab activation survives dismissal and targets the actual browser window.');
