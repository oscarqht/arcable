// CHROME_BIN=/path/to/chrome node apps/extension/tests/floatingPanels.render.test.mjs
// Runs the real renderer in a disposable browser; only extension messaging/storage are mocked.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const chrome = process.env.CHROME_BIN;
if (!chrome)
  throw new Error("Set CHROME_BIN to a Chromium browser executable.");
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
const fixture = `
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
const server = http.createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url === "/fixture.js" ? "text/javascript" : "text/html",
  );
  response.end(
    request.url === "/fixture.js"
      ? fixture
      : '<!doctype html><body style="background:#202020;color:#ddd;font:16px system-ui"><p>Floating panel rendering test</p><script src="/fixture.js"></script></body>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcable-dock-render-"));
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--disable-background-networking",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  for (let i = 0; i < 100; i++) {
    const result = await fn();
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
let ws;
try {
  const port = await until(() => {
    try {
      return fs
        .readFileSync(path.join(profile, "DevToolsActivePort"), "utf8")
        .split("\n")[0];
    } catch {
      return null;
    }
  }, "browser debugging port");
  const target = await (
    await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/`)}`,
      { method: "PUT" },
    )
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const [resolve, reject] = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, [resolve, reject]);
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await until(() => evaluate("Boolean(window.fixture?.setPanels)"), "renderer");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 700,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const makePanel = (title, dock = "top", id = "panel") => ({
    id,
    title,
    url: "about:blank",
    x: 180,
    y: 120,
    width: 320,
    height: 220,
    dock,
  });
  // Exercise real pointer capture on the production renderer independently of
  // cross-origin frame debugging, whose input acknowledgements vary by browser.
  await evaluate(
    `fixture.setPanels(${JSON.stringify([makePanel("Pointer test", undefined)])})`,
  );
  await evaluate("fixture.dock('')");
  const geometry = () =>
    evaluate(
      "fixture.shadow.querySelector('section').getBoundingClientRect().toJSON()",
    );
  const drag = async (selector, dx, dy) => {
    await send("Page.captureScreenshot", { format: "png" });
    const rect = await evaluate(
      `(()=>{const r=fixture.shadow.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+Math.min(70,r.width/2),y:r.y+r.height/2}})()`,
    );
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...rect,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: rect.x + dx,
      y: rect.y + dy,
      button: "left",
      buttons: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: rect.x + dx,
      y: rect.y + dy,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  };
  // Reload only the selected embedded document, preserving the surrounding UI.
  await evaluate(`fixture.setPanels(${JSON.stringify([
    makePanel("Reload test", "", "reload"),
    { ...makePanel("Other panel", "", "other"), x: 600, y: 400 },
  ])});
  fixture.reloadPanel = fixture.shadow.querySelector('section');
  fixture.reloadButton = fixture.reloadPanel.querySelector('[aria-label="Reload panel"]');
  fixture.reloadFrame = fixture.reloadPanel.querySelector('iframe');
  fixture.otherFrame = fixture.shadow.querySelectorAll('section')[1].querySelector('iframe');
  fixture.reloadSnapshot = () => ({
    geometry: fixture.reloadPanel.getBoundingClientRect().toJSON(),
    dock: fixture.reloadPanel.querySelector('select').value,
    chips: [...fixture.shadow.querySelectorAll('.edge button')].map(b => b.outerHTML),
    panels: fixture.panels,
    patches: fixture.patches.length,
    otherSource: fixture.otherFrame.src,
    host: location.href,
  });`);
  assert.ok(
    await evaluate("Boolean(fixture.reloadButton)"),
    "Header has a reload button",
  );
  assert.equal(await evaluate("fixture.reloadButton.title"), "Reload panel");
  assert.equal(
    await evaluate("fixture.reloadButton.parentElement.tagName"),
    "HEADER",
  );
  const reloadSource = () => evaluate("fixture.reloadFrame.src");
  const checkReload = async (activate) => {
    await evaluate(`fixture.oldDocument = fixture.reloadFrame.contentDocument;
      fixture.otherDocument = fixture.otherFrame.contentDocument;`);
    const before = await evaluate("fixture.reloadSnapshot()");
    const source = await reloadSource();
    await activate();
    const next = await reloadSource();
    assert.notEqual(
      new URL(next).search,
      new URL(source).search,
      "Reload forces a fresh document",
    );
    assert.equal(
      new URL(next).hash,
      new URL(source).hash,
      "Panel identity and token are preserved",
    );
    await until(
      () => evaluate("fixture.reloadFrame.contentDocument !== fixture.oldDocument"),
      "reloaded document",
    );
    assert.deepEqual(
      await evaluate("fixture.reloadSnapshot()"),
      before,
      "Reload preserves layout, docking, other panels, and host page",
    );
    assert.ok(
      await evaluate("fixture.otherFrame.contentDocument === fixture.otherDocument"),
    );
  };
  await checkReload(() => drag('[aria-label="Reload panel"]', 0, 0));
  for (const key of ["Enter", " "]) {
    await evaluate("fixture.reloadButton.focus()");
    await checkReload(async () => {
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code: key === "Enter" ? "Enter" : "Space",
        windowsVirtualKeyCode: key === "Enter" ? 13 : 32,
        text: key === "Enter" ? "\r" : " ",
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: key === "Enter" ? "Enter" : "Space",
        windowsVirtualKeyCode: key === "Enter" ? 13 : 32,
      });
    });
  }
  await evaluate(
    "fixture.dock('right'); fixture.shadow.querySelector('.right button').click()",
  );
  await checkReload(() => drag('[aria-label="Reload panel"]', 0, 0));
  await evaluate(`fixture.setPanels(fixture.panels.map(p => p.id === 'reload'
    ? { ...p, url: 'https://updated.example/panel' } : p))`);
  await checkReload(() => evaluate("fixture.reloadButton.click()"));
  console.log(
    "Panel reload by pointer and keyboard preserves layout, docking, URL, other panels, and host page.",
  );
  await evaluate(
    `fixture.setPanels(${JSON.stringify([makePanel("Pointer test", "")])})`,
  );
  const beforeDrag = await geometry();
  await drag("header", 40, 24);
  const afterDrag = await geometry();
  assert.equal(afterDrag.x, beforeDrag.x + 40);
  assert.equal(afterDrag.y, beforeDrag.y + 24);
  await drag('[aria-label="Resize panel"]', 40, 24);
  const afterResize = await geometry();
  assert.equal(afterResize.width, afterDrag.width + 40);
  assert.equal(afterResize.height, afterDrag.height + 24);
  const patches = await evaluate("fixture.patches");
  assert.equal(patches.at(-1).type, "ARCABLE_PANELS_PATCH");
  assert.equal(patches.at(-1).patch.width, afterResize.width);
  console.log(
    "Production renderer pointer dragging, resizing, and layout messages passed.",
  );
  for (const title of [
    "tident",
    "WWW iii",
    "资料 Reference",
    "A long panel title that should be truncated without stretching its letters",
  ]) {
    await evaluate(`fixture.setPanels(${JSON.stringify([makePanel(title)])})`);
    const horizontal = await evaluate("fixture.measure()");
    for (const edge of ["left", "right"]) {
      await evaluate(`fixture.dock('${edge}')`);
      const vertical = await evaluate("fixture.measure()");
      assert.ok(
        Math.abs(vertical.text.width - horizontal.text.height) < 0.1,
        `${title} on ${edge}: glyph height changed after rotation`,
      );
      assert.ok(
        Math.abs(vertical.text.height - horizontal.text.width) < 0.1,
        `${title} on ${edge}: glyph width changed after rotation`,
      );
      assert.ok(
        vertical.label.left >= vertical.button.left &&
          vertical.label.right <= vertical.button.right,
        `${edge}: label exceeds handle width`,
      );
      assert.ok(
        vertical.label.top >= vertical.button.top &&
          vertical.label.bottom <= vertical.button.bottom,
        `${edge}: label exceeds handle height`,
      );
      assert.ok(
        vertical.button.height <= 160,
        `${edge}: long handle exceeds size limit`,
      );
      assert.equal(vertical.font, horizontal.font);
    }
    await evaluate("fixture.dock('bottom')");
    const bottom = await evaluate("fixture.measure()");
    assert.ok(
      Math.abs(bottom.text.width - horizontal.text.width) < 0.1,
      "Returning to horizontal docking changes glyph width",
    );
  }
  await evaluate(
    `fixture.setPanels(${JSON.stringify([makePanel("tident", "left", "left"), makePanel("tident", "right", "right"), makePanel("tident", "top", "top"), makePanel("tident", "bottom", "bottom")])})`,
  );
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  const screenshotPath = path.join(os.tmpdir(), "arcable-dock-render.png");
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  console.log(
    `Dock label glyph dimensions preserved on both sides, including long and multilingual labels. Screenshot: ${screenshotPath}`,
  );
} finally {
  ws?.close();
  if (proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise((resolve) => proc.once("exit", resolve));
    proc.kill();
    await exited;
  }
  server.close();
  // Browser helpers can briefly keep writing after the main process exits.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
