import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url);
Module._extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const listeners = {};
const event = (name) => ({
  addListener(fn) {
    listeners[name] = fn;
  },
});
let rules = [];
const messages = [];
const session = {};
const browser = {
  storage: {
    session: {
      get: async (key) => ({ [key]: structuredClone(session[key]) }),
      set: async (patch) => Object.assign(session, structuredClone(patch)),
    },
  },
  runtime: {
    id: "extension-id",
    getURL: (p) => `moz-extension://internal/${p}`,
    getManifest: () => ({ permissions: [] }),
  },
  tabs: {
    onRemoved: event("removed"),
    sendMessage: async (...args) => messages.push(args),
  },
  declarativeNetRequest: {
    getSessionRules: async () => structuredClone(rules),
    updateSessionRules: async ({ addRules }) => {
      rules = addRules;
    },
  },
  webRequest: {
    onHeadersReceived: event("headers"),
    onBeforeRequest: event("request"),
    onErrorOccurred: event("webError"),
  },
  webNavigation: {
    onErrorOccurred: event("error"),
    onBeforeNavigate: event("beforeNavigate"),
    onCommitted: event("committed"),
    getFrame: async ({ frameId }) =>
      frameId === 3
        ? { parentFrameId: 2 }
        : { url: "moz-extension://internal/panel/index.html#token=test" },
  },
};
const load = Module._load;
Module._load = function (name, ...args) {
  return name === "webextension-polyfill"
    ? browser
    : load.call(this, name, ...args);
};
const {
  initPanelEmbedding,
  preparePanelEmbedding,
  forgetPanelEmbedding,
} = require("../src/background/panelEmbedding.ts");
Module._load = load;
await Promise.all([
  preparePanelEmbedding(10, 2),
  preparePanelEmbedding(11, 7),
  preparePanelEmbedding(10, 2),
]);
assert.deepEqual(rules[0].condition.tabIds, [10, 11]);
assert.deepEqual(rules[0].condition.initiatorDomains, ["internal"]);
assert.deepEqual(rules[0].condition.resourceTypes, ["sub_frame"]);
await forgetPanelEmbedding(10, Date.now() - 10000);
assert.deepEqual(
  rules[0].condition.tabIds,
  [10, 11],
  "delayed navigation events retain newly registered panel rules",
);
await forgetPanelEmbedding(10);
assert.deepEqual(rules[0].condition.tabIds, [11]);
await forgetPanelEmbedding(11);
assert.deepEqual(rules, []);
initPanelEmbedding();
await preparePanelEmbedding(10, 2);
listeners.beforeNavigate({ tabId: 10, frameId: 3, timeStamp: 100 });
listeners.request({
  type: "sub_frame",
  tabId: 10,
  frameId: 3,
  method: "POST",
  timeStamp: 101,
  url: "https://site.test",
});
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "net::ERR_BLOCKED_BY_RESPONSE",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages.length, 0, "POST must never be replayed");
listeners.request({
  type: "sub_frame",
  tabId: 10,
  frameId: 3,
  method: "GET",
  timeStamp: 101,
  url: "https://site.test",
});
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "net::ERR_BLOCKED_BY_RESPONSE",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages[0][2].frameId, 2);
listeners.error({ tabId: 10, frameId: 3, url: "https://site.test" });
await new Promise((r) => setImmediate(r));
assert.equal(
  messages.length,
  2,
  "Firefox navigation failures omit the error string",
);
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "Error code 2153381986",
});
await new Promise((r) => setImmediate(r));
assert.equal(
  messages.length,
  3,
  "Firefox CSP frame ancestor errors use numeric codes",
);
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "Error code 2153644038",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages.length, 3, "unrelated navigation errors are not retried");
listeners.webError({
  tabId: 10,
  frameId: 3,
  parentFrameId: 2,
  url: "https://direct.test",
  method: "POST",
  error: "NS_ERROR_CSP_FRAME_ANCESTOR_VIOLATION",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages.length, 3, "Firefox POST failures must not be replayed");
listeners.webError({
  tabId: 10,
  frameId: 3,
  parentFrameId: 2,
  url: "https://direct.test",
  method: "GET",
  error: "NS_ERROR_CSP_FRAME_ANCESTOR_VIOLATION",
});
await new Promise((r) => setImmediate(r));
assert.equal(
  messages.length,
  4,
  "Firefox errors can be retried before a webNavigation event",
);
listeners.beforeNavigate({ tabId: 10, frameId: 3, timeStamp: 200 });
listeners.request({
  type: "sub_frame",
  tabId: 10,
  frameId: 3,
  method: "GET",
  url: "https://site.test",
  timeStamp: 101,
});
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "net::ERR_BLOCKED_BY_RESPONSE",
});
await new Promise((r) => setImmediate(r));
assert.equal(
  messages.length,
  4,
  "a delayed GET from the previous navigation cannot authorize a same-URL POST retry",
);
listeners.request({
  type: "sub_frame",
  tabId: 10,
  frameId: 3,
  method: "POST",
  url: "https://site.test",
  timeStamp: 201,
});
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "net::ERR_BLOCKED_BY_RESPONSE",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages.length, 4, "the current POST is never retried");
listeners.committed({
  tabId: 10,
  frameId: 3,
  parentFrameId: 2,
  url: "https://site.test",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages.at(-1)[1].type, "ARCABLE_PANEL_COMMITTED");
listeners.removed(10);
messages.length = 0;
listeners.error({
  tabId: 10,
  frameId: 3,
  url: "https://site.test",
  error: "net::ERR_BLOCKED_BY_RESPONSE",
});
await new Promise((r) => setImmediate(r));
assert.equal(messages.length, 0);
// The actual wrapper keeps a loop guard until any successful commit, including
// successful redirects and navigation away from an unresolved failure.
const sources = [];
const frame = {
  setAttribute() {},
  set src(url) {
    sources.push(url);
  },
};
globalThis.location = { hash: "#panel=test&token=fixture" };
globalThis.document = { createElement: () => frame, body: { append() {} } };
browser.runtime.onMessage = event("panelMessage");
browser.runtime.sendMessage = async () => ({ url: "https://a.test" });
Module._load = function (name, ...args) {
  return name === "webextension-polyfill"
    ? browser
    : load.call(this, name, ...args);
};
require("../src/panel/index.ts");
Module._load = load;
await new Promise((r) => setImmediate(r));
listeners.panelMessage({ type: "ARCABLE_PANEL_RETRY", url: "https://b.test" });
listeners.panelMessage({ type: "ARCABLE_PANEL_RETRY", url: "https://b.test" });
assert.deepEqual(
  sources,
  ["https://a.test", "https://b.test"],
  "persistent failures are retried only once",
);
listeners.panelMessage({
  type: "ARCABLE_PANEL_COMMITTED",
  url: "https://redirect-destination.test",
});
listeners.panelMessage({ type: "ARCABLE_PANEL_RETRY", url: "https://b.test" });
assert.equal(sources.length, 3, "successful redirects re-arm the previous URL");
listeners.panelMessage({
  type: "ARCABLE_PANEL_COMMITTED",
  url: "https://a.test",
});
listeners.panelMessage({ type: "ARCABLE_PANEL_RETRY", url: "https://b.test" });
assert.equal(
  sources.length,
  4,
  "successful navigation away re-arms the previous URL",
);
listeners.panelMessage({
  type: "ARCABLE_PANEL_RETRY",
  url: "javascript:alert(1)",
});
assert.equal(sources.length, 4, "retry URLs must be HTTP(S)");
delete globalThis.document;
delete globalThis.location;
console.log(
  "Panel embedding scope, concurrent rules, cleanup, GET-only retry and retry-budget tests passed.",
);
