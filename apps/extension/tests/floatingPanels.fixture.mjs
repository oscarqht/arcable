import fs from "node:fs";
import ts from "typescript";

const compile = (relative) =>
  ts.transpileModule(
    fs.readFileSync(new URL(relative, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
const modules = {
  "./loginHelp": compile("../src/content/loginHelp.ts"),
  "../utils/browser": compile("../src/utils/browser.ts"),
  "./dockPosition": compile("../src/content/dockPosition.ts"),
  "../../../../packages/shared/src/utils/floatingPanels": compile(
    "../../../packages/shared/src/utils/floatingPanels.ts",
  ),
  renderer: compile("../src/content/floatingPanels.ts"),
};
export const fixture = `
window.fixture = { patches: [], listeners: [], panels: [] };
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(options) {
  const root = attachShadow.call(this, options);
  if (this.hasAttribute('data-arcable-floating-panels')) fixture.shadow = root;
  return root;
};
const browser = {
  storage: { local: { get: async () => ({ arcable_config: { theme: 'dark' } }) }, onChanged: { addListener() {} } },
  runtime: {
    getURL: () => "about:blank",
    onMessage: { addListener(fn) { fixture.listeners.push(fn); } },
    sendMessage: async (message) => {
      if (message.type === 'ARCABLE_PANELS_GET') return { token: 'render-test', panels: fixture.panels };
      fixture.patches.push(message);
    },
  },
};
const sources = ${JSON.stringify(modules)};
const cache = { 'webextension-polyfill': browser };
function require(name) {
  if (cache[name]) return cache[name];
  const module = { exports: {} };
  new Function('module', 'exports', 'require', sources[name])(module, module.exports, require);
  return cache[name] = module.exports;
}
require('renderer').initFloatingPanels();
fixture.setPanels = panels => {
  fixture.panels = panels;
  fixture.listeners.forEach(fn => fn({ type: 'ARCABLE_PANELS_STATE', token: 'render-test', panels }));
};
fixture.measure = () => {
  const button = fixture.shadow.querySelector('.edge button');
  const label = button.querySelector('span') || button;
  const range = document.createRange();
  range.selectNodeContents(label);
  const text = range.getBoundingClientRect();
  return { button: button.getBoundingClientRect().toJSON(), label: label.getBoundingClientRect().toJSON(),
    text: text.toJSON(), font: getComputedStyle(label).font, writingMode: getComputedStyle(label).writingMode };
};
fixture.dock = edge => {
  const select = fixture.shadow.querySelector('select');
  select.value = edge;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
`;
