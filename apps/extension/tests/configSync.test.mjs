import assert from "node:assert/strict";
import { require, mockModules, storage } from "./testLoader.mjs";
const event = () => {
  let listeners = [];
  return { addListener: fn => listeners.push(fn), removeListener: fn => { listeners = listeners.filter(l => l !== fn); },
    emit: (...args) => listeners.forEach(fn => fn(...args)), clear: () => { listeners = []; } };
};
const changed = event(), alarm = event(), startup = event(), installed = event();
const local = {};
const localStorage = storage(local, changed);
const alarms = new Map();
const timers = new Map();
let nextTimer = 0;
const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
global.setTimeout = fn => { timers.set(++nextTimer, fn); return nextTimer; };
global.clearTimeout = id => timers.delete(id);
const utils = require("../../../packages/shared/src/utils/index.ts");
let remote, reads = 0, uploads = [], failRead = false, failSave = false, onRead, onSave;
let auth = { isAuthenticated: true, accessToken: "test" };
mockModules({
  "webextension-polyfill": { storage: { local: localStorage, onChanged: changed },
    alarms: { get: async name => alarms.get(name), clear: async name => alarms.delete(name), create: async (name, info) => alarms.set(name, info), onAlarm: alarm },
    runtime: { onStartup: startup, onInstalled: installed } },
  "@arcable/shared/utils": { ...utils,
    loadLatestConfigSnapshot: async () => {
      reads++; await onRead?.();
      if (failRead) throw new Error("Network failure");
      if (!remote) throw new Error("No Arcable configuration snapshot found");
      return structuredClone(remote);
    },
    saveConfigSnapshot: async (_token, value) => {
      await onSave?.(value);
      if (failSave) throw new Error("Upload failure");
      remote = structuredClone(value); uploads.push(remote); return { savedAt: value.savedAt };
    },
  },
});
const { createConfigurationSync, SYNC_KEY, SYNC_ALARM, RETRY_ALARM, EDIT_ALARM } = require("../src/background/configSync.ts");
const { writeConfiguration, withConfigurationStorage, applyRuleOperations } = require("../src/background/localRules.ts");
const { configurationPatch } = require("../src/background/configSnapshots.ts");
const rule = (id, css = id) => ({ id, pattern: "example.com", css, js: "" });
const layout = { x: 20, y: 30, width: 440, height: 360 };
const snapshot = (patch = {}) => utils.validateConfigSnapshot({ format: "arcable-config", version: 1,
  savedAt: "2026-11-11T00:00:00.000Z", customCodeRules: [], runCodeInPageRules: [], sidePanelRules: [], panelLayouts: {},
  settings: { hideScrollbars: true, autoPip: true, theme: "system" }, ...patch });
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };
let sync;
async function reset(initial = snapshot(), cloud = snapshot()) {
  changed.clear(); alarm.clear(); startup.clear(); installed.clear(); timers.clear(); alarms.clear();
  for (const key of Object.keys(local)) delete local[key];
  Object.assign(local, configurationPatch(initial, {}), { arcable_raindrop_auth: auth, bookmarks: ["keep"] });
  remote = cloud; reads = 0; uploads = []; failRead = failSave = false; onRead = onSave = undefined;
  sync = createConfigurationSync(async () => auth); sync.start(); await flush();
}
try {
  // First startup uses remote, including deletions; no stale local upload.
  await reset(snapshot({ customCodeRules: [rule("stale")] }), snapshot({ customCodeRules: [rule("remote")] }));
  assert.deepEqual(local.customCodeRules.map(r => r.id), ["remote"]);
  assert.equal(uploads.length, 0); assert.equal(local[SYNC_KEY].status.state, "saved");
  assert.deepEqual(alarms.get(SYNC_ALARM), { periodInMinutes: 10 });
  const beforePeriodic = reads;
  remote = snapshot({ customCodeRules: [rule("periodic")] });
  alarm.emit({ name: SYNC_ALARM }); await flush();
  assert.ok(reads > beforePeriodic); assert.equal(local.customCodeRules[0].id, "periodic"); assert.equal(uploads.length, 0);
  const beforeStartup = reads; startup.emit(); await flush(); assert.ok(reads > beforeStartup);

  // Pending local conflicts/deletions win; untouched remote entities/settings survive.
  await reset(snapshot(), snapshot({ customCodeRules: [rule("edit"), rule("delete")], panelLayouts: { delete: layout, keep: layout } }));
  await localStorage.set({ customCodeRules: [rule("edit", "local"), rule("new")],
    arcable_panel_layouts: { keep: { ...layout, x: 90 } }, arcable_hide_all_scrollbars: false });
  await flush();
  assert.equal(local[SYNC_KEY].status.state, "pending"); assert.ok(alarms.has(EDIT_ALARM));
  remote = snapshot({ customCodeRules: [rule("edit", "remote"), rule("delete"), rule("untouched")],
    panelLayouts: { delete: layout, keep: layout, remote: layout }, settings: { hideScrollbars: true, autoPip: false, theme: "dark" } });
  alarm.emit({ name: EDIT_ALARM }); await flush();
  assert.deepEqual(remote.customCodeRules.map(r => [r.id, r.css]), [["edit", "local"], ["untouched", "untouched"], ["new", "new"]]);
  assert.deepEqual(remote.settings, { hideScrollbars: false, autoPip: false, theme: "dark" });
  assert.equal(remote.panelLayouts.delete, undefined); assert.equal(remote.panelLayouts.keep.x, 90); assert.ok(remote.panelLayouts.remote);
  assert.equal(local.bookmarks[0], "keep"); assert.equal(Object.keys(local[SYNC_KEY].pending).length, 0);
  assert.equal(uploads.length, 1);

  // Edits during fetch and upload are retained, and only uploaded revisions are acknowledged.
  onRead = async () => { onRead = undefined; await localStorage.set({ arcable_auto_pip: true }); };
  onSave = async () => { onSave = undefined; await localStorage.set({ arcable_hide_all_scrollbars: true }); };
  await localStorage.set({ customCodeRules: [...local.customCodeRules, rule("during")] }); await flush();
  await sync.sync(); await flush();
  assert.equal(remote.settings.autoPip, true);
  assert.equal(remote.settings.hideScrollbars, false);
  assert.equal(local.arcable_hide_all_scrollbars, true);
  assert.equal(local[SYNC_KEY].status.state, "pending"); assert.ok(alarms.has(EDIT_ALARM));
  await sync.sync(); await flush(); assert.equal(remote.settings.hideScrollbars, true);

  // Failed fetch never uploads stale state; retry and fresh worker preserve outbox.
  await localStorage.set({ customCodeRules: [...local.customCodeRules, rule("restart")] }); await flush();
  failRead = true; const uploadCount = uploads.length;
  await sync.sync(); assert.equal(uploads.length, uploadCount); assert.equal(local[SYNC_KEY].status.state, "error");
  assert.ok(alarms.has(RETRY_ALARM));
  changed.clear(); alarm.clear(); startup.clear(); installed.clear(); timers.clear();
  // Simulate a write whose change event did not run before the worker stopped.
  local.arcable_auto_pip = false;
  failRead = false; sync = createConfigurationSync(async () => auth); sync.start(); await flush();
  assert.ok(remote.customCodeRules.some(r => r.id === "restart")); assert.equal(remote.settings.autoPip, false);
  assert.equal(local[SYNC_KEY].status.state, "saved"); assert.ok(!alarms.has(RETRY_ALARM));

  failSave = true; await localStorage.set({ arcable_auto_pip: true }); await flush();
  await sync.sync(); assert.equal(local[SYNC_KEY].status.state, "error"); assert.ok(Object.keys(local[SYNC_KEY].pending).length);
  failSave = false; alarm.emit({ name: RETRY_ALARM }); await flush(); assert.equal(remote.settings.autoPip, true);

  // No cloud snapshot initializes from local. Missing and failed reads are distinct.
  await reset(snapshot({ customCodeRules: [rule("seed")] }), null);
  assert.equal(uploads.length, 1); assert.equal(remote.customCodeRules[0].id, "seed");

  // Offline edits after baseline but before first login override only their fields.
  auth = { isAuthenticated: false };
  await reset(snapshot({ customCodeRules: [rule("stale")] }), snapshot({ customCodeRules: [rule("cloud")] }));
  await localStorage.set({ arcable_auto_pip: false }); await flush();
  auth = { isAuthenticated: true, accessToken: "test" };
  await localStorage.set({ arcable_raindrop_auth: auth }); await flush();
  assert.deepEqual(remote.customCodeRules.map(r => r.id), ["cloud"]); assert.equal(remote.settings.autoPip, false);

  // A rapid edit and revert is still an intentional pending local version.
  const original = local.arcable_auto_pip;
  await withConfigurationStorage(() => writeConfiguration({ arcable_auto_pip: !original }));
  await withConfigurationStorage(() => writeConfiguration({ arcable_auto_pip: original }));
  remote.settings.autoPip = !original;
  await sync.sync(); assert.equal(remote.settings.autoPip, original);

  // Every rule kind uses the same durable writer; all-sites Run Code is valid.
  await applyRuleOperations([
    { id: "run-op", type: "RUN_CODE_CREATE", entityId: "run", payload: { title: "Run", code: "return 42", patterns: [] } },
    { id: "panel-op", type: "SIDE_PANEL_CREATE", entityId: "panel", payload: { title: "Panel", url: "https://example.com", patterns: ["example.com"] } },
  ]);
  await sync.sync();
  assert.deepEqual(remote.runCodeInPageRules[0].patterns, []); assert.equal(remote.sidePanelRules[0].id, "panel");
  await applyRuleOperations([
    { id: "run-delete", type: "RUN_CODE_DELETE", entityId: "run" },
    { id: "panel-delete", type: "SIDE_PANEL_DELETE", entityId: "panel" },
  ]);
  failRead = true; await sync.sync();
  changed.clear(); alarm.clear(); startup.clear(); installed.clear(); timers.clear();
  failRead = false; sync = createConfigurationSync(async () => auth); sync.start(); await flush();
  assert.deepEqual(remote.runCodeInPageRules, []); assert.deepEqual(remote.sidePanelRules, []);

  // Corrupt remote data never replaces local data or triggers an upload.
  const goodRemote = structuredClone(remote), goodLocal = structuredClone(local.customCodeRules), beforeInvalid = uploads.length;
  remote.settings.theme = "invalid";
  await sync.sync();
  assert.equal(local[SYNC_KEY].status.state, "error"); assert.equal(uploads.length, beforeInvalid);
  assert.deepEqual(local.customCodeRules, goodLocal);
  remote = goodRemote; await sync.sync();

  // An edit after tracking starts but during the very first fetch survives hydration.
  delete local[SYNC_KEY];
  changed.clear(); alarm.clear(); startup.clear(); installed.clear(); timers.clear();
  remote = snapshot({ customCodeRules: [rule("first-remote")] });
  onRead = async () => {
    onRead = undefined;
    await applyRuleOperations([{ id: "first-local", type: "CUSTOM_CODE_CREATE", entityId: "first-local", payload: rule("first-local") }]);
  };
  sync = createConfigurationSync(async () => auth); sync.start(); await flush();
  assert.deepEqual(remote.customCodeRules.map(r => r.id), ["first-remote", "first-local"]);

  // Multiple triggers serialize network work.
  let release, active = 0, maximum = 0;
  onRead = async () => { maximum = Math.max(maximum, ++active); await new Promise(resolve => { release = resolve; }); active--; onRead = undefined; };
  const running = sync.sync(); await flush(); const duplicate = sync.sync(); release(); await Promise.all([running, duplicate]);
  assert.equal(maximum, 1);
  console.log("PASS automatic startup/periodic/login sync, remote-only updates, merge/deletions, field-level settings, in-flight edits, durable restart, retries and serialization");
} finally {
  global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout;
}
