import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const constants = { exports: {} };
vm.runInNewContext(transpile(await readFile(new URL('../src/utils/actionMode.ts', import.meta.url), 'utf8')), constants);
const { STORAGE_KEY_ACTION_MODE: key, getActionMode } = constants.exports;
assert.equal(getActionMode(undefined), 'sidepanel');
assert.equal(getActionMode('invalid'), 'sidepanel');
assert.equal(getActionMode('popup'), 'popup');
const source = transpile(await readFile(new URL('../src/background/extensionAction.ts', import.meta.url), 'utf8'));

for (const name of ['chrome', 'firefox']) {
  let value;
  let changed;
  let popup;
  let panel;
  const calls = [];
  const browser = {
    storage: {
      local: { get: async () => ({ [key]: value }) },
      onChanged: { addListener: fn => { changed = fn; } },
    },
    action: { setPopup: async details => { popup = details.popup; calls.push('popup'); } },
  };
  const chrome = name === 'chrome' ? { sidePanel: { setPanelBehavior: async details => {
    panel = details.openPanelOnActionClick; calls.push('panel');
  } } } : undefined;
  const sandbox = { exports: {}, require: id => id === 'webextension-polyfill' ? browser : constants.exports, chrome, console };
  vm.runInNewContext(source, sandbox);
  const { initExtensionActionBehavior: init, syncExtensionActionBehavior: sync } = sandbox.exports;
  init();
  await sync();
  assert.equal(popup, '', `${name}: native sidebar by default`);
  if (chrome) assert.equal(panel, true);
  value = 'popup';
  changed({ [key]: { newValue: value } }, 'local');
  await sync();
  assert.equal(popup, 'popup/index.html');
  if (chrome) {
    assert.equal(panel, false);
    assert.deepEqual(calls.slice(-2), ['panel', 'popup'], 'disable Chrome panel interception before installing popup');
  }
  // A worker restart must reapply the saved value without relying on onClicked.
  await sync();
  assert.equal(popup, 'popup/index.html');
  value = 'sidepanel';
  changed({ [key]: { newValue: value } }, 'local');
  await sync();
  assert.equal(popup, '');
  if (chrome) assert.equal(panel, true);
  // Queued updates use the most recent choice; deleting the key restores the default.
  value = 'popup';
  const pending = sync();
  value = undefined;
  await pending;
  assert.equal(popup, '');
  console.log(`${name} extension action behavior checks passed.`);
}
