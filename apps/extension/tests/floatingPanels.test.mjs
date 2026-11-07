import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
for (const ext of [".ts", ".tsx"])
  Module._extensions[ext] = (module, filename) =>
    module._compile(
      ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
const local = {};
const session = {};
const listeners = { removed: [], startup: [], changed: [] };
const deliveries = [];
const storage = (data) => ({
  get: async (keys) =>
    Object.fromEntries(
      (typeof keys === "string" ? [keys] : keys).map((k) => [
        k,
        structuredClone(data[k]),
      ]),
    ),
  set: async (patch) => {
    const changes = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [
        key,
        { oldValue: data[key], newValue: value },
      ]),
    );
    Object.assign(data, structuredClone(patch));
    for (const listener of listeners.changed)
      listener(changes, data === local ? "local" : "session");
  },
  remove: async (key) => {
    delete data[key];
  },
});
const browser = {
  runtime: {
    id: "test",
    getURL: (path) => `chrome-extension://test/${path}`,
    onStartup: { addListener: (f) => listeners.startup.push(f) },
  },
  storage: {
    local: storage(local),
    session: storage(session),
    onChanged: { addListener: (f) => listeners.changed.push(f) },
  },
  tabs: {
    onRemoved: { addListener: (f) => listeners.removed.push(f) },
    sendMessage: async (tabId, message) => {
      deliveries.push({ tabId, message: structuredClone(message) });
    },
  },
};
const load = Module._load;
Module._load = function (name, ...args) {
  return name === "webextension-polyfill"
    ? browser
    : load.call(this, name, ...args);
};
const {
  initFloatingPanels,
  handleFloatingPanelsMessage,
} = require("../src/background/floatingPanels.ts");
const {
  readFloatingPanels,
  writeFloatingPanels,
  clampPanel,
} = require("../../../packages/shared/src/utils/floatingPanels.ts");
const { nearestDockPosition } = require("../src/content/dockPosition.ts");
const {
  attachGroupMetaToNote,
} = require("../../../packages/shared/src/utils/raindropSync.ts");
const {
  createWorkspaceBackupJson,
  parseWorkspaceBackupJson,
} = require("../../../packages/shared/src/utils/workspaceBackup.ts");
const {
  replayOperations,
  savePendingOperation,
  createWorkspaceOperation,
} = require("../../../packages/shared/src/utils/syncEngine.ts");
const {
  listenForFloatingPanelEdits,
} = require("../src/utils/floatingPanels.ts");
Module._load = load;
// Side handles rotate the entire label, including non-Latin glyphs, instead of
// using vertical glyph forms that can change its proportions.
const contentSource = readFileSync(new URL("../src/content/floatingPanels.ts", import.meta.url), "utf8");
assert.match(contentSource, /\.left button, \.right button\s*\{[^}]*writing-mode:vertical-rl;[^}]*text-orientation:sideways;[^}]*writing-mode:sideways-rl;/);

const panel = {
  id: "panel",
  url: "https://embed.test",
  title: "Reference --> <b>",
  x: 80,
  y: 90,
  width: 440,
  height: 320,
};
// Nearest gaps preserve other handles, allow crossing them, and respect viewport bounds.
assert.equal(nearestDockPosition(80, 30, 300, []), 80);
assert.equal(nearestDockPosition(-20, 30, 300, []), 0);
assert.equal(nearestDockPosition(500, 30, 300, []), 270);
const occupied = [{ start: 100, end: 140 }, { start: 200, end: 240 }];
assert.equal(nearestDockPosition(110, 30, 300, occupied), 145);
assert.equal(nearestDockPosition(180, 30, 300, occupied), 165);
assert.equal(nearestDockPosition(250, 30, 300, occupied), 250);
assert.equal(nearestDockPosition(10, 30, 60, [{ start: 0, end: 40 }]), undefined);
const positioned = { ...panel, dock: "right", dockPosition: 175 };
assert.deepEqual(readFloatingPanels(writeFloatingPanels("", [positioned])), [positioned]);
assert.deepEqual(readFloatingPanels(writeFloatingPanels("", [{ ...panel, dockPosition: "bad" }])), []);
const original = 'Personal note\n<!--arcable-group:{"other":true}-->\n';
const note = writeFloatingPanels(original, [panel]);
const userText = "  User note\n\n";
const grouped = attachGroupMetaToNote(userText, {
  urlVariants: [
    { id: "a", name: "A", url: "https://a.test" },
    { id: "b", name: "B", url: "https://b.test" },
  ],
});
assert.ok(grouped.startsWith(userText));
assert.equal(
  attachGroupMetaToNote(grouped, {}),
  userText,
  "group metadata round trip preserves user whitespace",
);
assert.equal(
  attachGroupMetaToNote(note, {}),
  note.replace(/\n?<!--arcable-group:[\s\S]*?-->/g, ""),
  "group cleanup preserves the panel block",
);
assert.ok(note.startsWith(original));
assert.deepEqual(readFloatingPanels(note), [panel]);
assert.deepEqual(
  readFloatingPanels(JSON.parse(JSON.stringify({ note })).note),
  [panel],
  "backup JSON round trip",
);
assert.equal(
  writeFloatingPanels(note, []).split("arcable-floating-panels:").length,
  2,
);
assert.deepEqual(readFloatingPanels(writeFloatingPanels(note, [])), []);
assert.deepEqual(
  readFloatingPanels("<!--arcable-floating-panels:broken-->"),
  [],
);
assert.deepEqual(
  readFloatingPanels(
    writeFloatingPanels("", [{ ...panel, url: "javascript:alert(1)" }]),
  ),
  [],
);
assert.equal(
  readFloatingPanels(writeFloatingPanels("", [panel, panel])).length,
  1,
);
const small = clampPanel({ ...panel, x: 99999, y: -20 }, 300, 200);
assert.ok(
  small.x >= 0 &&
    small.y >= 0 &&
    small.x + small.width <= 300 &&
    small.y + small.height <= 200,
);
local.arcable_workspace_snapshot = {
  spaces: [{ id: "s", name: "Space" }],
  folders: [],
  activeSpaceId: "s",
  tabs: [
    {
      id: "item",
      url: "https://main.test",
      note: "Group note",
      urlVariants: [
        { id: "a", name: "A", url: "https://main.test", note },
        {
          id: "b",
          name: "B",
          url: "https://b.test",
          note: writeFloatingPanels("B note", [
            { ...panel, id: "b-panel", dock: "left" },
          ]),
        },
      ],
    },
  ],
};
const backup = createWorkspaceBackupJson(local.arcable_workspace_snapshot, {
  deviceName: "Test",
  deviceType: "Ext",
});
const restored = parseWorkspaceBackupJson(backup.jsonString);
assert.equal(restored.success, true);
assert.deepEqual(restored.data.tabs, local.arcable_workspace_snapshot.tabs);
local.arcable_pending_ops = [];
local.arcable_device_id = "device-test";
initFloatingPanels();
const ui = { id: "test", url: "chrome-extension://test/sidepanel/index.html" };
const content = (id) => ({
  id: "test",
  frameId: 0,
  tab: { id },
  url: "https://main.test",
});
const send = (message, sender = ui) =>
  handleFloatingPanelsMessage(message, sender);
await send({
  type: "ARCABLE_PANELS_BIND",
  browserTabId: 42,
  itemId: "item",
  variantId: "a",
});
const first = await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.deepEqual(first.panels, [panel]);
// Exercise the real UI outbox event -> background -> content-message path,
// with no authenticated session, network request, or completed remote sync.
const originalSnapshot = structuredClone(local.arcable_workspace_snapshot);
const uiStorage = new Map();
globalThis.window = Object.assign(new EventTarget(), {
  localStorage: {
    getItem: (key) => uiStorage.get(key) ?? null,
    setItem: (key, value) => uiStorage.set(key, value),
  },
});
const published = [];
browser.runtime.sendMessage = (message) => {
  const result = Promise.resolve(send(message));
  published.push(result);
  return result;
};
const stopPublishing = listenForFloatingPanelEdits();
const added = { ...panel, id: "added-panel", url: "https://added.test" };
const addOp = createWorkspaceOperation(
  "TAB_UPDATE",
  "item",
  {
    urlVariants: originalSnapshot.tabs[0].urlVariants.map((v) =>
      v.id === "a"
        ? { ...v, note: writeFloatingPanels(v.note, [panel, added]) }
        : v,
    ),
  },
  "device-test",
);
savePendingOperation(addOp);
await published.at(-1);
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.deepEqual(
  deliveries.at(-1).message.panels,
  [panel, added],
  "saved addition reaches the open tab before sync",
);
assert.deepEqual(
  local.arcable_workspace_snapshot,
  originalSnapshot,
  "optimistic edit does not replace the authoritative snapshot",
);
assert.equal(local.arcable_pending_ops.length, 1);
assert.ok(
  deliveries.every((entry) => entry.tabId === 42),
  "unrelated browser tabs receive no optimistic panels",
);
await browser.storage.local.set({
  arcable_workspace_snapshot: originalSnapshot,
});
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.deepEqual(
  deliveries.at(-1).message.panels,
  [panel, added],
  "older sync snapshot cannot undo the pending addition",
);
const removeOp = createWorkspaceOperation(
  "TAB_UPDATE",
  "item",
  {
    urlVariants: originalSnapshot.tabs[0].urlVariants.map((v) =>
      v.id === "a" ? { ...v, note: writeFloatingPanels(v.note, []) } : v,
    ),
  },
  "device-test",
  addOp.timestamp + 1,
);
savePendingOperation(removeOp);
await published.at(-1);
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.deepEqual(
  deliveries.at(-1).message.panels,
  [],
  "saved removal reaches the open tab before sync",
);
await browser.storage.local.set({
  arcable_workspace_snapshot: originalSnapshot,
});
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.deepEqual(
  deliveries.at(-1).message.panels,
  [],
  "older sync snapshot cannot restore a removed panel",
);
await send({ type: "ARCABLE_PANELS_LOCAL_EDIT", operation: addOp });
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.equal(
  local.arcable_pending_ops.length,
  2,
  "repeated delivery deduplicates the outbox by operation ID",
);
assert.deepEqual(
  deliveries.at(-1).message.panels,
  [],
  "repeated older addition cannot override a newer removal",
);

assert.equal(
  (
    await send(
      { type: "ARCABLE_PANELS_LOCAL_EDIT", operation: removeOp },
      content(42),
    )
  ).success,
  false,
  "page content cannot publish workspace edits",
);
stopPublishing();
const count = local.arcable_pending_ops.length;
savePendingOperation({ ...removeOp, id: "unsubscribed-op" });
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.equal(
  local.arcable_pending_ops.length,
  count,
  "unmounted UI stops publishing",
);
delete globalThis.window;
local.arcable_pending_ops = [];

assert.deepEqual(
  (await send({ type: "ARCABLE_PANELS_GET" }, content(43))).panels,
  [],
  "identical URLs in unrelated tabs have no panels",
);
assert.equal(
  send({ type: "ARCABLE_PANELS_GET" }, { ...content(42), frameId: 1 }),
  undefined,
);
assert.equal(
  (
    await send(
      { type: "ARCABLE_PANELS_BIND", browserTabId: 43, itemId: "item" },
      content(42),
    )
  ).success,
  false,
  "page content cannot bind other tabs",
);
const patch = { x: 12, y: 13, width: 300, height: 240, dock: "bottom", dockPosition: 175 };
assert.equal(
  (
    await send(
      {
        type: "ARCABLE_PANELS_PATCH",
        token: first.token,
        panelId: "panel",
        patch,
      },
      content(42),
    )
  ).success,
  true,
);
assert.equal(local.arcable_pending_ops.length, 1);
assert.equal(local.arcable_pending_ops[0].deviceId, "device-test");
assert.equal(local.arcable_workspace_snapshot.tabs[0].note, "Group note");
assert.ok(
  local.arcable_workspace_snapshot.tabs[0].urlVariants[0].note.startsWith(
    original,
  ),
);
assert.equal(
  readFloatingPanels(
    local.arcable_workspace_snapshot.tabs[0].urlVariants[1].note,
  )[0].dock,
  "left",
);
assert.deepEqual(
  readFloatingPanels(
    replayOperations(
      local.arcable_workspace_snapshot,
      local.arcable_pending_ops,
    ).tabs[0].urlVariants[0].note,
  )[0],
  { ...panel, ...patch },
);
await send({
  type: "ARCABLE_PANELS_BIND",
  browserTabId: 42,
  itemId: "item",
  variantId: "b",
});
const second = await send(
  { type: "ARCABLE_PANELS_GET" },
  { ...content(42), url: "https://navigated.test" },
);
assert.equal(
  second.panels[0].id,
  "b-panel",
  "navigation retains selected variant",
);
assert.notEqual(second.token, first.token);
await send({
  type: "ARCABLE_PANELS_BIND",
  browserTabId: 42,
  itemId: "item",
  variantId: "a",
  preserveSelection: true,
});
assert.equal(
  (await send({ type: "ARCABLE_PANELS_GET" }, content(42))).token,
  second.token,
  "ordinary reactivation retains the selected variant",
);
assert.equal(
  (
    await send(
      {
        type: "ARCABLE_PANELS_PATCH",
        token: first.token,
        panelId: "panel",
        patch,
      },
      content(42),
    )
  ).success,
  false,
  "stale layout event cannot update the previous variant",
);
// Sync assigns remote IDs to newly created variants; keep ownership within the same item.
local.arcable_pending_ops = [];
local.arcable_workspace_snapshot.tabs[0].urlVariants[1].id = "501";
assert.equal(
  (await send({ type: "ARCABLE_PANELS_GET" }, content(42))).panels[0].id,
  "b-panel",
);
await send(
  {
    type: "ARCABLE_PANELS_PATCH",
    token: second.token,
    panelId: "b-panel",
    patch,
  },
  content(42),
);
assert.equal(
  readFloatingPanels(
    local.arcable_workspace_snapshot.tabs[0].urlVariants[1].note,
  )[0].dock,
  "bottom",
);
listeners.removed[0](42);
await send({ type: "ARCABLE_PANELS_GET" }, content(42));
assert.deepEqual(
  (await send({ type: "ARCABLE_PANELS_GET" }, content(42))).panels,
  [],
  "closed tab binding removed",
);
console.log(
  "Floating panel note, backup, geometry, ownership, navigation, stale event, sync ID remap, and close tests passed.",
);
