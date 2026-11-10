import assert from "node:assert/strict";
import { require, mockModules, event, storage } from "./testLoader.mjs";
const changed = event();
const legacy = { spaces: [{ id: "legacy" }], tabs: [{ note: "keep me" }] };
const local = {
  arcable_workspace_snapshot: legacy,
  arcable_pending_ops: [{ id: "untouched" }],
};
const session = {};
const tabs = new Map([
  [1, { id: 1, url: "https://example.com/app" }],
  [2, { id: 2, url: "https://example.com/other" }],
]);
const deliveries = [];
const browser = {
  runtime: {
    id: "test",
    getURL: (p) => `chrome-extension://test/${p}`,
    getManifest: () => ({ permissions: [] }),
  },
  storage: {
    local: storage(local, changed),
    session: storage(session, changed, "session"),
    onChanged: changed,
  },
  tabs: {
    get: async (id) => tabs.get(id),
    query: async () => [...tabs.values()],
    onRemoved: event(),
    sendMessage: async (id, message) => deliveries.push({ id, message }),
  },
  webNavigation: {
    onCommitted: event(),
    onHistoryStateUpdated: event(),
    onReferenceFragmentUpdated: event(),
  },
};
const embeddings = [];
mockModules({
  "webextension-polyfill": browser,
  "./panelEmbedding": {
    initPanelEmbedding() {},
    preparePanelEmbedding: async (...args) => embeddings.push(args),
    forgetPanelEmbedding: async () => {},
    panelPage: "panel/index.html",
  },
});
const {
  matchingPanels,
  normalizeSidePanelRules,
  PANEL_LAYOUTS_KEY,
  SIDE_PANEL_RULES_KEY,
} = require("../../../packages/shared/src/utils/sidePanels.ts");
const rule = {
  id: "one",
  title: "Reference",
  url: "https://reference.example/",
  patterns: ["*://*.example.com/*"],
};
assert.equal(matchingPanels([rule], "http://example.com/app").length, 1);
assert.equal(matchingPanels([rule], "https://sub.example.com/app").length, 1);
assert.equal(matchingPanels([rule], "https://unrelated.test/").length, 0);
assert.equal(
  matchingPanels([{ ...rule, disabled: true }], "https://example.com").length,
  0,
);
assert.equal(matchingPanels([rule], "chrome://extensions").length, 0);
assert.equal(
  matchingPanels(
    [{ ...rule, patterns: ["example.com/app"] }],
    "https://example.com/app?id=1",
  ).length,
  1,
);
const normalized = normalizeSidePanelRules([
  { ...rule, x: 100, width: 900, dock: "left" },
]);
assert.deepEqual(normalized, normalizeSidePanelRules([rule]));
assert.equal(
  normalizeSidePanelRules([{ ...rule, url: "javascript:alert(1)" }]).length,
  0,
);
local[SIDE_PANEL_RULES_KEY] = [rule, { ...rule, id: "two", title: "Second" }];
let {
  initFloatingPanels,
  handleFloatingPanelsMessage,
} = require("../src/background/floatingPanels.ts");
initFloatingPanels();
const sender = (id) => ({
  id: "test",
  tab: { id },
  frameId: 0,
  url: tabs.get(id).url,
});
const get = (id) =>
  handleFloatingPanelsMessage({ type: "ARCABLE_PANELS_GET" }, sender(id));
const first = await get(1);
assert.equal(first.panels.length, 2);
assert.equal(first.panels[0].width, 440);
assert.equal(first.panels[0].height, 360);
const layout = {
  x: 130,
  y: 180,
  width: 600,
  height: 480,
  dock: "left",
  dockPosition: 244,
};
assert.deepEqual(
  await handleFloatingPanelsMessage(
    {
      type: "ARCABLE_PANELS_PATCH",
      token: first.token,
      panelId: "one",
      patch: layout,
    },
    sender(1),
  ),
  { success: true },
);
assert.deepEqual(local[PANEL_LAYOUTS_KEY].one, layout);
assert.equal((await get(2)).panels[0].dockPosition, 244);
assert.deepEqual(
  await handleFloatingPanelsMessage(
    {
      type: "ARCABLE_PANELS_PATCH",
      token: "wrong",
      panelId: "one",
      patch: layout,
    },
    sender(1),
  ),
  { success: false },
);
assert.deepEqual(
  await handleFloatingPanelsMessage(
    {
      type: "ARCABLE_PANELS_PATCH",
      token: first.token,
      panelId: "one",
      patch: { ...layout, width: -1 },
    },
    sender(1),
  ),
  { success: false },
);
// SPA exit and re-entry reconcile panels, including fragment navigation.
tabs.get(1).url = "https://elsewhere.test/";
browser.webNavigation.onHistoryStateUpdated.emit({ tabId: 1, frameId: 0 });
await get(1);
assert.equal(
  deliveries.filter((d) => d.id === 1).at(-1).message.panels.length,
  0,
);
tabs.get(1).url = "https://example.com/return#details";
browser.webNavigation.onReferenceFragmentUpdated.emit({ tabId: 1, frameId: 0 });
await get(1);
assert.equal(
  deliveries.filter((d) => d.id === 1).at(-1).message.panels[0].dock,
  "left",
);
// Definitions changing immediately removes disabled panels.
await browser.storage.local.set({
  [SIDE_PANEL_RULES_KEY]: [rule, { ...rule, id: "two", disabled: true }],
});
assert.equal((await get(1)).panels.length, 1);
// A fresh worker retains the browser-local layout.
delete require.cache[require.resolve("../src/background/floatingPanels.ts")];
({
  handleFloatingPanelsMessage,
} = require("../src/background/floatingPanels.ts"));
assert.equal((await get(1)).panels[0].width, 600);
// A separate profile with identical definitions initializes an independent layout.
delete local[PANEL_LAYOUTS_KEY];
assert.equal((await get(2)).panels[0].width, 440);
assert.equal((await get(2)).panels[0].dock, undefined);
assert.deepEqual(local.arcable_workspace_snapshot, legacy);
assert.deepEqual(local.arcable_pending_ops, [{ id: "untouched" }]);
console.log(
  "PASS URL matching, multiple panels, SPA reconciliation, local layout, restart, device isolation, and untouched legacy storage",
);
