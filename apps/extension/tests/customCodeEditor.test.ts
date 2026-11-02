import assert from 'node:assert/strict';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).URLPattern = class { constructor(pattern: string) { if (!pattern) throw new Error('invalid'); } };
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
const storage: Record<string, any> = {};
const listeners = new Set<(changes: any, area: string) => void>();
const browser = {
  runtime: { id: 'test', sendMessage: async () => ({ success: false, error: 'Not authenticated with Raindrop' }), getURL: (path: string) => path },
  storage: {
    local: {
      get: async (key: string) => ({ [key]: structuredClone(storage[key]) }),
      set: async (values: Record<string, any>) => {
        Object.assign(storage, structuredClone(values));
        for (const listener of listeners) listener(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: structuredClone(value) }])), 'local');
      },
    },
    onChanged: { addListener: (listener: any) => listeners.add(listener), removeListener: (listener: any) => listeners.delete(listener) },
  },
};
(globalThis as any).chrome = { runtime: { id: 'test' } };
(globalThis as any).browser = browser;
let editor: any;
let editorCount = 0;
const ace = {
  edit: () => {
    editorCount++;
    let value = '';
    const changes = new Set<() => void>();
    editor = {
      session: { setMode: () => {}, on: (_event: string, fn: () => void) => changes.add(fn), off: (_event: string, fn: () => void) => changes.delete(fn) },
      setTheme: () => {}, setOptions: () => {}, resize: () => {}, destroy: () => {},
      getValue: () => value,
      // Ace emits a change for both removal and insertion on setValue.
      setValue: (next: string) => { value = ''; changes.forEach((fn) => fn()); value = next; changes.forEach((fn) => fn()); },
    };
    return editor;
  },
};
(globalThis as any).window = { ace, localStorage: { getItem: () => null, setItem: () => {} }, confirm: () => true, scrollTo: () => {}, addEventListener: () => {}, removeEventListener: () => {} };

async function main() {
  const { CustomCodeTab } = await import('../src/options/components/CustomCodeTab');
  let view: TestRenderer.ReactTestRenderer;
  const mount = async () => {
    await act(async () => { view = TestRenderer.create(React.createElement(CustomCodeTab, { isDark: false, showToast: () => {} }), { createNodeMock: () => ({ focus() {}, scrollIntoView() {} }) }); });
  };
  await mount();
  const text = (node: any): string => typeof node === 'string' ? node : node?.children?.map(text).join('') || '';
  const button = (label: string) => view!.root.findAllByType('button').find((item) => text(item) === label);
  const click = async (label: string) => {
    const target = button(label);
    assert(target, `missing button ${label}`);
    await act(async () => target.props.onClick());
  };
  const pattern = async (value: string) => {
    const input = view!.root.findAllByType('input').find((item) => item.props.type === 'text');
    assert(input);
    await act(async () => input.props.onChange({ target: { value } }));
  };
  const type = async (value: string) => { await act(async () => editor.setValue(value)); };
  const save = async () => { await act(async () => view!.root.findByType('form').props.onSubmit({ preventDefault() {} })); };
  const css = '  body > p { color: red; }\n';
  const js = '  const fn = x => x < 10;\n';

  await pattern('https://both.example/*');
  await type(css);
  await click('⚡ JavaScript');
  await type(js);
  await click('🎨 CSSAdded');
  assert.equal(editor.getValue(), css, 'switching tabs must retain CSS');
  await click('⚡ JavaScriptAdded');
  assert.equal(editor.getValue(), js, 'switching tabs must retain JavaScript');
  assert.equal(editorCount, 1, 'switching language must not destroy the editor');
  await save();
  assert.equal(storage.customCodeRules[0].css, css);
  assert.equal(storage.customCodeRules[0].js, js);
  assert.equal(storage.arcable_pending_ops[0].payload.css, css);
  assert.equal(storage.arcable_pending_ops[0].payload.js, js);
  await act(async () => view!.unmount());
  await mount();
  await click('Edit');
  assert.equal(editor.getValue(), css, 'reopened combined rule must load CSS');
  await click('⚡ JavaScriptAdded');
  assert.equal(editor.getValue(), js, 'reopened combined rule must load JavaScript');
  await click('🎨 CSSAdded');
  const editedCss = `${css}/* edit */`;
  await type(editedCss);
  await click('⚡ JavaScriptAdded');
  const editedJs = `${js}// edit`;
  await type(editedJs);
  await save();
  assert.equal(storage.customCodeRules[0].css, editedCss);
  assert.equal(storage.customCodeRules[0].js, editedJs);
  assert.equal(storage.arcable_pending_ops.at(-1).payload.css, editedCss);
  assert.equal(storage.arcable_pending_ops.at(-1).payload.js, editedJs);

  await pattern('https://js.example/*');
  await type(js);
  await save();
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://js.example/*').js, js);
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://js.example/*').css, '');
  await click('🎨 CSS');
  await pattern('https://css.example/*');
  await type(css);
  await save();
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://css.example/*').css, css);
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://css.example/*').js, '');
  await act(async () => view!.unmount());
  await mount();
  assert.equal(view!.root.findAllByType('button').filter((item) => text(item) === 'View').length, 0, 'saved rules must not show View buttons');
  for (const action of ['Edit', 'Copy', 'Export', 'Delete']) {
    assert.equal(view!.root.findAllByType('button').filter((item) => text(item) === action).length, 3, `${action} must remain available for every rule`);
  }
  const editRule = async (url: string) => {
    const index = storage.customCodeRules.findIndex((r: any) => r.pattern === url);
    const buttons = view!.root.findAllByType('button').filter((item) => text(item) === 'Edit');
    await act(async () => buttons[index].props.onClick());
  };
  await editRule('https://css.example/*');
  assert.equal(editor.getValue(), css);
  await type(editedCss);
  await save();
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://css.example/*').css, editedCss);
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://css.example/*').js, '');
  await editRule('https://js.example/*');
  assert.equal(editor.getValue(), js);
  await type(editedJs);
  await save();
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://js.example/*').js, editedJs);
  assert.equal(storage.customCodeRules.find((r: any) => r.pattern === 'https://js.example/*').css, '');
  await act(async () => view!.unmount());
  console.log('Custom code editor persistence tests passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
