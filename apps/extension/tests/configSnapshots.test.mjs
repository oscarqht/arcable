import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { require, mockModules, event, storage } from "./testLoader.mjs";

let sequence = 100, corrupt = false, uploadFails = false, labelFails = false, deleteFails = false;
let duringUpload;
const collections = [{ _id: 1, title: "Arcable rules" }];
const items = new Map([[1, { _id: 1, collectionId: 1, title: "Legacy rule", excerpt: "legacy" }]]);
const contents = new Map();
const calls = [];
const client = {
  fetchRaindropCollections: async () => structuredClone(collections),
  createRaindropCollection: async (_token, title) => {
    const c = { _id: ++sequence, title };
    collections.push(c);
    return c;
  },
  fetchAllRaindropItems: async (_token, id) => {
    assert.notEqual(id, 1, "Never read legacy collections");
    return structuredClone([...items.values()].filter(i => i.collectionId === id));
  },
  uploadRaindropFile: async (_token, collectionId, name, text) => {
    if (uploadFails) throw new Error("Upload failed");
    assert.match(name, /\.json$/);
    const item = { _id: ++sequence, collectionId, title: name, link: `https://up.raindrop.io/${sequence}`, file: { name, path: `https://up.raindrop.io/${sequence}` } };
    items.set(item._id, item);
    contents.set(item.file.path, corrupt ? "broken json" : text);
    calls.push(["upload", item._id]);
    await duringUpload?.();
    return { item: structuredClone(item) };
  },
  updateRaindropItem: async (_token, id, update) => {
    if (labelFails) return null;
    Object.assign(items.get(id), update);
    return structuredClone(items.get(id));
  },
  fetchRaindropItem: async (_token, id) => structuredClone(items.get(id)),
  fetchRaindropFileContent: async (_token, path) => {
    calls.push(["read", path]);
    return contents.get(path);
  },
  deleteRaindropBookmark: async (_token, id) => {
    calls.push(["delete", id]);
    if (deleteFails) return false;
    items.delete(id);
    return true;
  },
};
const changed = event();
const local = { arcable_raindrop_auth: { accessToken: "private" }, arcable_config: { theme: "dark", raindrop: { token: "private" } }, bookmarks: ["keep"], arcable_rule_ops: ["obsolete"], arcable_last_synced_at: 1 };
const localStorage = storage(local, changed);
localStorage.remove = async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key]; };
const cleared = [];
mockModules({ "./raindropClient": client, "webextension-polyfill": { storage: { local: localStorage, onChanged: changed }, alarms: { clear: async name => cleared.push(name) } } });
const snapshotUtils = require("../../../packages/shared/src/utils/configSnapshot.ts");
const { validateConfigSnapshot: validate, saveConfigSnapshot: save, loadLatestConfigSnapshot: load } = snapshotUtils;
const base = {
  format: "arcable-config", version: 1, savedAt: "2026-11-10T06:40:43.563Z",
  customCodeRules: [{ id: "css", pattern: "example.com", css: "a{color:red}", js: "console.log('✓')".repeat(10000), raindropId: 88, token: "excluded" }],
  runCodeInPageRules: [{ id: "run", title: "Run", patterns: ["example.com"], code: "return 42", disabled: true }],
  sidePanelRules: [{ id: "panel", title: "Reference", url: "https://reference.example/", patterns: ["example.com"] }],
  settings: { hideScrollbars: false, autoPip: false, theme: "dark", token: "excluded" },
  panelLayouts: { panel: { x: -2, y: 24, width: 440, height: 360, dock: "right", dockPosition: 120 } },
  accessToken: "excluded", bookmarks: ["excluded"],
};
const allSitesRunRule = { ...base.runCodeInPageRules[0], patterns: [] };
const allSitesSnapshot = { ...base, runCodeInPageRules: [allSitesRunRule] };
assert.deepEqual(validate(allSitesSnapshot).runCodeInPageRules[0].patterns, [], "Run Code permits all-sites snippets without URL patterns");
const canonical = validate(base);
assert.deepEqual(validate(JSON.parse(JSON.stringify(canonical))), canonical, "Round trip all rule types and layouts");
assert.ok(!JSON.stringify(canonical).includes("excluded"));
assert.equal(canonical.customCodeRules[0].raindropId, undefined);
for (const patch of [
  { version: 2 }, { savedAt: "yesterday" }, { settings: {} }, { panelLayouts: [] },
  { customCodeRules: null }, { customCodeRules: [...base.customCodeRules, ...base.customCodeRules] },
  { customCodeRules: [{ ...base.customCodeRules[0], js: 2 }] },
  { runCodeInPageRules: [{ ...base.runCodeInPageRules[0], patterns: [42] }] },
  { runCodeInPageRules: [{ ...base.runCodeInPageRules[0], patterns: [""] }] },
  { runCodeInPageRules: [{ ...base.runCodeInPageRules[0], patterns: null }] },
  { sidePanelRules: [{ ...base.sidePanelRules[0], patterns: [] }] },
  { sidePanelRules: [{ ...base.sidePanelRules[0], url: "javascript:alert(1)" }] },
  { sidePanelRules: [{ ...base.sidePanelRules[0], disabled: "false" }] },
  { panelLayouts: { panel: { ...base.panelLayouts.panel, width: 0 } } },
  { panelLayouts: { panel: { ...base.panelLayouts.panel, dock: "center" } } },
]) assert.throws(() => validate({ ...base, ...patch }), /Invalid/);

await assert.rejects(load("test"), /No Arcable/);
assert.equal(collections.length, 1, "Loading never creates collections");
await save("test", base);
assert.deepEqual(await load("test"), canonical);
const first = sequence;
const snapshotsCollection = collections.find(c => c.title === snapshotUtils.SNAPSHOT_COLLECTION)._id;
items.set(2, { _id: 2, collectionId: snapshotsCollection, title: "Ordinary bookmark", link: "https://example.com" });
items.set(3, { _id: 3, collectionId: snapshotsCollection, title: "Unrelated JSON", file: { name: "other.json" } });
const secondSnapshot = { ...base, savedAt: "2026-11-11T06:40:43.563Z", customCodeRules: [], panelLayouts: {} };
const beforeCleanup = calls.length;
await save("test", secondSnapshot);
assert.ok(!items.has(first), "Older snapshot pruned");
assert.ok(items.has(1) && items.has(2) && items.has(3), "Legacy and unrelated data untouched");
const cleanupCalls = calls.slice(beforeCleanup);
assert.ok(cleanupCalls.findIndex(c => c[0] === "read") < cleanupCalls.findIndex(c => c[0] === "delete"), "Read back before pruning");
assert.deepEqual(await load("test"), validate(secondSnapshot));
const second = sequence;
for (const mode of ["upload", "label", "content"]) {
  uploadFails = mode === "upload"; labelFails = mode === "label"; corrupt = mode === "content";
  const deletes = calls.filter(c => c[0] === "delete").length;
  await assert.rejects(save("test", { ...base, savedAt: "2026-11-12T06:40:43.563Z" }));
  assert.equal(calls.filter(c => c[0] === "delete").length, deletes, "Failed save never deletes older backups");
  assert.ok(items.has(second));
}
uploadFails = labelFails = corrupt = false;
await assert.rejects(load("test"), /JSON|Unexpected/, "Corrupt newest must not fall back to older data");
// Remove only failed test uploads, not through the implementation.
for (const id of [...items.keys()]) if (id > second) items.delete(id);
deleteFails = true;
assert.match((await save("test", { ...base, savedAt: "2026-11-13T06:40:43.563Z" })).warning, /could not be deleted/);
deleteFails = false;
const newest = sequence;
await save("test", { ...base, savedAt: "2026-11-09T06:40:43.563Z" });
assert.ok(items.has(newest), "Clock skew/newer snapshot preserved");
assert.equal((await load("test")).savedAt, "2026-11-13T06:40:43.563Z", "Latest ignores list order and lastUpdate");

// Isolate local saves from the future-dated snapshots used to test clock skew.
items.clear();
contents.clear();

const { saveConfiguration, loadConfiguration, retireRuleSync } = require("../src/background/configSnapshots.ts");
const { applyRuleOperations } = require("../src/background/localRules.ts");
await retireRuleSync();
assert.deepEqual(cleared, ["arcable-rule-sync"]);
assert.equal(local.arcable_rule_ops, undefined);
assert.equal(local.arcable_last_synced_at, undefined);
const beforeEdit = calls.length;
await applyRuleOperations([{ id: "op", type: "SIDE_PANEL_CREATE", entityId: "panel", payload: base.sidePanelRules[0] }]);
assert.equal(calls.length, beforeEdit, "Local edits never access Raindrop");
assert.equal(local.arcable_rule_ops, undefined, "No sync outbox");
local.customCodeRules = base.customCodeRules;
local.runCodeInPageRules = [allSitesRunRule];
local.arcable_panel_layouts = base.panelLayouts;
local.arcable_hide_all_scrollbars = false;
local.arcable_auto_pip = false;
await saveConfiguration("test");
const localSnapshot = await load("test");
assert.equal(localSnapshot.customCodeRules[0].js, base.customCodeRules[0].js);
assert.deepEqual(localSnapshot.panelLayouts, base.panelLayouts);
assert.deepEqual(localSnapshot.runCodeInPageRules, validate(allSitesSnapshot).runCodeInPageRules, "Save and read back all-sites Run Code snippets");
assert.ok(!JSON.stringify(localSnapshot).includes("private"));
local.customCodeRules = [{ id: "delete-me" }];
local.runCodeInPageRules = [];
local.arcable_side_panel_rules = [];
local.arcable_panel_layouts = { orphan: base.panelLayouts.panel };
await loadConfiguration("test");
assert.deepEqual(local.customCodeRules, localSnapshot.customCodeRules);
assert.deepEqual(local.runCodeInPageRules, localSnapshot.runCodeInPageRules);
assert.deepEqual(local.arcable_side_panel_rules, localSnapshot.sidePanelRules);
assert.deepEqual(local.arcable_panel_layouts, base.panelLayouts);
assert.deepEqual(local.arcable_raindrop_auth, { accessToken: "private" });
assert.deepEqual(local.bookmarks, ["keep"]);
assert.equal(local.arcable_config.raindrop.token, "private");
const empty = { ...base, savedAt: "2099-01-01T00:00:00.000Z", customCodeRules: [], runCodeInPageRules: [], sidePanelRules: [], panelLayouts: {} };
await save("test", empty);
await loadConfiguration("test");
assert.deepEqual(local.customCodeRules, []);
assert.deepEqual(local.runCodeInPageRules, []);
assert.deepEqual(local.arcable_side_panel_rules, []);
assert.deepEqual(local.arcable_panel_layouts, {});
const beforeInvalid = structuredClone(local);
const latestItem = items.get(sequence);
contents.set(latestItem.file.path, JSON.stringify({ ...empty, panelLayouts: { bad: {} } }));
await assert.rejects(loadConfiguration("test"), /Invalid/);
assert.deepEqual(local, beforeInvalid, "Invalid load leaves ALL local data unchanged");
contents.set(latestItem.file.path, JSON.stringify(empty));
items.clear();
await assert.rejects(loadConfiguration("test"), /No Arcable/);
assert.deepEqual(local, beforeInvalid, "Missing load leaves ALL local data unchanged");

for (const path of ["background/index.ts", "background/localRules.ts", "options/components/CustomCodeTab.tsx", "options/components/RunCodeTab.tsx", "options/components/SidePanelsTab.tsx"]) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /syncRules|syncToRaindropImmediately|ARCABLE_SYNC_RULES|ARCABLE_QUEUE_RULE_OPS|initRuleSync/);
}
console.log("PASS snapshot round trips, validation, latest selection, safe cleanup, local-only editing, migration cleanup, full replacement and unchanged data on failures");
