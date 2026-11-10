import assert from "node:assert/strict";
import { require, mockModules, event, storage } from "./testLoader.mjs";
let sequence = 100;
const collections = [
  { _id: 1, title: "Arcable v2" },
  { _id: 2, title: "_custom_css", parent: { $id: 1 } },
  { _id: 3, title: "_run_code", parent: { $id: 1 } },
];
const items = new Map([
  [
    2,
    [
      {
        _id: 10,
        link: "https://arcable.app/custom-css/css",
        title: "example.com",
        excerpt: JSON.stringify({
          id: "css",
          pattern: "example.com",
          css: ".original { color: blue }",
          js: 'console.log("preserved")',
        }),
      },
    ],
  ],
  [
    3,
    [
      {
        _id: 11,
        link: "https://arcable.app/run-code/run",
        title: "Manual",
        excerpt: JSON.stringify({
          id: "run",
          title: "Manual",
          patterns: ["example.com"],
          code: "return 42",
        }),
      },
    ],
  ],
]);
const originalLegacy = structuredClone([...items]);
const writes = [];
let corrupt = false;
const client = {
  decodeRaindropTitle: (s) => s,
  fetchRaindropCollections: async () => structuredClone(collections),
  fetchAllRaindropItems: async (_token, id) =>
    structuredClone(items.get(id) || []).map((item) =>
      corrupt && item.link.includes("/rule-part/")
        ? { ...item, excerpt: "truncated" }
        : item,
    ),
  createRaindropCollection: async (_token, title) => {
    const c = { _id: ++sequence, title };
    collections.push(c);
    writes.push({ collection: c._id });
    return c;
  },
  createRaindropBookmarks: async (_token, inputs) =>
    inputs.map((input) => {
      assert.ok(input.collectionId > 3, "Must never write legacy collections");
      const item = { ...input, _id: ++sequence };
      items.set(input.collectionId, [
        ...(items.get(input.collectionId) || []),
        item,
      ]);
      writes.push({ collection: input.collectionId, item });
      return item;
    }),
  updateRaindropItem: async (_token, id, input) => {
    for (const [collectionId, rows] of items) {
      const prior = rows.find((r) => r._id === id);
      if (prior) {
        assert.ok(collectionId > 3, "Must never update legacy bookmarks");
        Object.assign(prior, input);
        writes.push({ collection: collectionId, item: prior });
        return structuredClone(prior);
      }
    }
    return null;
  },
};
mockModules({ "./raindropClient": client });
const {
  syncRuleDefinitions,
} = require("../../../packages/shared/src/utils/raindropSync.ts");
const {
  createRuleOperation,
} = require("../../../packages/shared/src/utils/ruleSync.ts");
const panel = {
  id: "panel",
  title: "Panel",
  url: "https://reference.example/",
  patterns: ["*://*.example.com/*"],
  x: 444,
  dock: "right",
  width: 900,
};
let definitions = await syncRuleDefinitions("test", []);
assert.equal(writes.length, 0, "Initial fetch must be read-only");
assert.deepEqual(definitions.sidePanelRules, []);
assert.equal(definitions.customCodeRules[0].js, 'console.log("preserved")');
assert.equal(definitions.runCodeInPageRules[0].code, "return 42");
definitions = await syncRuleDefinitions("test", [
  createRuleOperation("SIDE_PANEL_CREATE", panel.id, panel),
]);
assert.equal(definitions.sidePanelRules.length, 1);
assert.equal(definitions.sidePanelRules[0].width, undefined);
assert.equal(definitions.sidePanelRules[0].dock, undefined);
assert.equal(definitions.customCodeRules.length, 1);
assert.equal(definitions.runCodeInPageRules.length, 1);
let hydrated = await syncRuleDefinitions("test", []);
assert.deepEqual(hydrated.sidePanelRules, definitions.sidePanelRules);
const longCode = 'console.log("资料 long code");\n'.repeat(300);
definitions = await syncRuleDefinitions("test", [
  createRuleOperation("CUSTOM_CODE_UPDATE", "css", { js: longCode }),
  createRuleOperation("RUN_CODE_UPDATE", "run", { code: longCode }),
]);
hydrated = await syncRuleDefinitions("test", []);
assert.equal(hydrated.customCodeRules[0].js, longCode);
assert.equal(hydrated.customCodeRules[0].css, ".original { color: blue }");
assert.equal(hydrated.runCodeInPageRules[0].code, longCode);
await syncRuleDefinitions("test", [
  createRuleOperation("CUSTOM_CODE_DELETE", "css", {}),
  createRuleOperation("SIDE_PANEL_DELETE", "panel", {}),
]);
hydrated = await syncRuleDefinitions("test", []);
assert.deepEqual(hydrated.sidePanelRules, []);
assert.deepEqual(
  hydrated.customCodeRules,
  [],
  "Legacy rule must not reappear after deletion",
);
await syncRuleDefinitions("test", [
  createRuleOperation("CUSTOM_CODE_UPDATE", "css", { js: "stale" }),
]);
assert.deepEqual(
  (await syncRuleDefinitions("test", [])).customCodeRules,
  [],
  "Stale updates must not resurrect a deleted rule",
);
for (const [id, legacy] of originalLegacy)
  assert.deepEqual(items.get(id), legacy);
corrupt = true;
await assert.rejects(
  () => syncRuleDefinitions("test", []),
  /Corrupted rule upload/,
);
corrupt = false;
console.log(
  "PASS definition sync, layout exclusion, code preservation, long code, tombstones, read-only hydration, and legacy cloud isolation",
);
// Worker publication must preserve edits made during a network request and keep failed ops queued.
const local = {
  arcable_workspace_snapshot: { untouched: true },
  arcable_pending_ops: [{ id: "legacy" }],
};
let release, entered;
let fail = false;
let result = {
  customCodeRules: [],
  runCodeInPageRules: [],
  sidePanelRules: [],
};
const network = () =>
  new Promise((resolve) => {
    release = resolve;
    entered?.();
  });
const workerBrowser = {
  storage: { local: storage(local), onChanged: event() },
  alarms: { create() {}, onAlarm: event() },
};
const realUtils = require("../../../packages/shared/src/utils/index.ts");
mockModules({
  "webextension-polyfill": workerBrowser,
  "@arcable/shared/utils": {
    ...realUtils,
    syncRuleDefinitions: async () => {
      await network();
      if (fail) throw new Error("offline");
      return result;
    },
  },
});
const {
  initRuleSync,
  queueRuleOperations,
  syncRules,
  RULE_OPS_KEY,
} = require("../src/background/ruleSync.ts");
const initial = new Promise((resolve) => {
  entered = resolve;
});
initRuleSync(async () => ({ isAuthenticated: true, accessToken: "test" }));
await initial;
await queueRuleOperations([
  createRuleOperation("SIDE_PANEL_CREATE", "panel", panel),
]);
assert.equal(
  local.arcable_side_panel_rules[0].title,
  "Panel",
  "Local save must complete while sync is in flight",
);
release();
// Wait until initial publication completes by queuing the next sync.
const next = new Promise((resolve) => {
  entered = resolve;
});
const pendingSync = syncRules();
await next;
assert.equal(
  local.arcable_side_panel_rules.length,
  1,
  "Initial sync must retain an in-flight local create",
);
await queueRuleOperations([
  createRuleOperation("SIDE_PANEL_UPDATE", "panel", {
    title: "Edited while syncing",
  }),
]);
result = { ...result, sidePanelRules: [{ ...panel, title: "Panel" }] };
release();
await pendingSync;
assert.equal(local.arcable_side_panel_rules[0].title, "Edited while syncing");
assert.equal(
  local[RULE_OPS_KEY].length,
  1,
  "Only acknowledged ops may leave the outbox",
);
const failing = new Promise((resolve) => {
  entered = resolve;
});
fail = true;
const failed = syncRules();
await failing;
release();
await assert.rejects(failed, /offline/);
assert.equal(local[RULE_OPS_KEY].length, 1);
assert.deepEqual(local.arcable_workspace_snapshot, { untouched: true });
assert.deepEqual(local.arcable_pending_ops, [{ id: "legacy" }]);
console.log(
  "PASS in-flight local edits, acknowledgement isolation, offline retry outbox, and untouched legacy local records",
);
