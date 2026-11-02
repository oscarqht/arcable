// Run after building Chrome: CHROME_BIN=/path/to/chrome node apps/extension/tests/customCodeCsp.test.mjs
// Uses a disposable profile and a local page; it does not access any user data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const chrome = process.env.CHROME_BIN;
if (!chrome) throw new Error("Set CHROME_BIN to a Chromium binary supporting unpacked extensions.");
const extension = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcable-csp-test-"));
fs.mkdirSync(path.join(profile, "Default"));
fs.writeFileSync(path.join(profile, "Default", "Preferences"), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));
const quote = String.fromCharCode(39);
const server = http.createServer((req, res) => {
  res.setHeader("Content-Security-Policy", `default-src ${quote}self${quote}; script-src ${quote}self${quote}`);
  if (req.url === "/page.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end("window.pageValue = 41;");
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end("<html><head><script src=\"/page.js\"></script></head><body>test</body></html>");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;
const proc = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
  "--disable-background-networking", "--enable-unsafe-extension-debugging",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0",
  `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "about:blank",
], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  for (let i = 0; i < 100; i++) {
    const value = await fn();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const [resolve, reject] = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  return {
    close: () => ws.close(),
    send: (method, params = Object.create(null)) => new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, [resolve, reject]);
      ws.send(JSON.stringify({ id: requestId, method, params }));
    }),
  };
}
async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

try {
  const port = await until(() => {
    try { return fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; }
    catch { return null; }
  }, "browser debugging port");
  const base = `http://127.0.0.1:${port}`;
  const worker = await until(async () => {
    const targets = await (await fetch(`${base}/json/list`)).json();
    return targets.find(target => target.type === "service_worker" && target.url.includes("background.js"));
  }, "Arcable service worker");
  const background = await connect(worker.webSocketDebuggerUrl);
  const extensionId = worker.url.split("/")[2];
  const details = await (await fetch(`${base}/json/new?${encodeURIComponent(`chrome://extensions/?id=${extensionId}`)}`, { method: "PUT" })).json();
  const settings = await connect(details.webSocketDebuggerUrl);
  const toggle = `document.querySelector("extensions-manager")?.shadowRoot.querySelector("extensions-detail-view")?.shadowRoot.querySelector("#allow-user-scripts")?.shadowRoot.querySelector("cr-toggle")`;
  await until(() => evaluate(settings, `Boolean(${toggle})`), "user scripts toggle");
  await evaluate(settings, `${toggle}.click()`);
  await until(() => evaluate(background, "typeof chrome.userScripts?.execute === \"function\""), "user scripts permission");
  settings.close();

  const rules = [
    { id: "enabled", pattern: "*127.0.0.1*", js: "(() => { window.arcableCspTest = window.pageValue + 1; console.log(\"ARCABLE_CSP_TEST_RAN\"); return { cleanup: () => null }; })();", css: "" },
    { id: "disabled", pattern: "*127.0.0.1*", disabled: true, js: "window.disabledRuleRan = true", css: "" },
    { id: "unmatched", pattern: "https://example.invalid/*", js: "window.unmatchedRuleRan = true", css: "" },
  ];
  await evaluate(background, `chrome.storage.local.set(${JSON.stringify({ customCodeRules: rules })})`);
  const target = await (await fetch(`${base}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" })).json();
  const page = await connect(target.webSocketDebuggerUrl);
  await until(() => evaluate(page, "window.arcableCspTest === 42"), "matching script in page world");
  assert.equal(await evaluate(page, "window.disabledRuleRan"), undefined);
  assert.equal(await evaluate(page, "window.unmatchedRuleRan"), undefined);
  await evaluate(page, "delete window.arcableCspTest");
  await page.send("Page.reload");
  await until(() => evaluate(page, "window.arcableCspTest === 42"), "matching script after reload");
  page.close();
  background.close();
  console.log("Custom JS runs in the main world under restrictive CSP and after reload; disabled/unmatched rules do not run.");
} finally {
  proc.kill("SIGTERM");
  server.close();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
