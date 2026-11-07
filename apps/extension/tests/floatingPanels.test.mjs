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
const storage = (data) => ({
  get: async (keys) =>
    Object.fromEntries(
      (typeof keys === "string" ? [keys] : keys).map((k) => [
        k,
        structuredClone(data[k]),
      ]),
    ),
  set: async (patch) => Object.assign(data, structuredClone(patch)),
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
    sendMessage: async () => {},
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
const {
  attachGroupMetaToNote,
} = require("../../../packages/shared/src/utils/raindropSync.ts");
const {
  createWorkspaceBackupJson,
  parseWorkspaceBackupJson,
} = require("../../../packages/shared/src/utils/workspaceBackup.ts");
const {
  replayOperations,
} = require("../../../packages/shared/src/utils/syncEngine.ts");
Module._load = load;
const panel = {
  id: "panel",
  url: "https://embed.test",
  title: "Reference --> <b>",
  x: 80,
  y: 90,
  width: 440,
  height: 320,
};
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
const patch = { x: 12, y: 13, width: 300, height: 240, dock: "bottom" };
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
