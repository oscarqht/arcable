import browser from "webextension-polyfill";
import type {
  RaindropAuthState,
  RuleDefinitions,
  RuleOperation,
} from "@arcable/shared/types";
import {
  syncRuleDefinitions,
  SIDE_PANEL_RULES_KEY,
  sanitizeRule,
} from "@arcable/shared/utils";
export const RULE_OPS_KEY = "arcable_rule_ops";
const keys = {
  CUSTOM_CODE: "customCodeRules",
  RUN_CODE: "runCodeInPageRules",
  SIDE_PANEL: SIDE_PANEL_RULES_KEY,
} as const;
let auth: () => Promise<RaindropAuthState>;
let storageTail: Promise<unknown> = Promise.resolve();
let syncTail: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = storageTail.then(action);
  storageTail = result.catch(() => {});
  return result;
}
function applyOperations(local: Record<string, any>, ops: RuleOperation[]) {
  for (const op of ops) {
    const kind = op.type.replace(
      /_(CREATE|UPDATE|DELETE)$/,
      "",
    ) as keyof typeof keys;
    const key = keys[kind];
    const current = ((local[key] || []) as any[]).find(
      (r) => r.id === op.entityId,
    );
    const remaining = ((local[key] || []) as any[]).filter(
      (r) => r.id !== op.entityId,
    );
    local[key] = op.type.endsWith("_DELETE")
      ? remaining
      : [
          ...remaining,
          sanitizeRule(kind, { ...current, ...op.payload, id: op.entityId }),
        ];
  }
  return local;
}
export function queueRuleOperations(ops: RuleOperation[]) {
  return serialized(async () => {
    if (
      !Array.isArray(ops) ||
      ops.some(
        (op) =>
          !op ||
          typeof op.id !== "string" ||
          typeof op.entityId !== "string" ||
          !/^(CUSTOM_CODE|RUN_CODE|SIDE_PANEL)_(CREATE|UPDATE|DELETE)$/.test(
            op.type,
          ),
      )
    )
      throw new Error("Invalid rule operations");
    const stored = await browser.storage.local.get([
      RULE_OPS_KEY,
      ...Object.values(keys),
    ]);
    const all = new Map(
      ((stored[RULE_OPS_KEY] || []) as RuleOperation[]).map((op) => [
        op.id,
        op,
      ]),
    );
    ops.forEach((op) => all.set(op.id, op));
    const local = applyOperations(
      Object.fromEntries(
        Object.values(keys).map((key) => [key, stored[key] || []]),
      ),
      ops,
    );
    await browser.storage.local.set({
      ...local,
      [RULE_OPS_KEY]: [...all.values()],
    });
  });
}
export function syncRules(): Promise<RuleDefinitions> {
  const run = syncTail.then(async () => {
    const session = await auth();
    if (!session.isAuthenticated || !session.accessToken)
      throw new Error("Not authenticated with Raindrop");
    const ops = await serialized(
      async () =>
        ((await browser.storage.local.get(RULE_OPS_KEY))[RULE_OPS_KEY] ||
          []) as RuleOperation[],
    );
    const definitions = await syncRuleDefinitions(session.accessToken, ops);
    await serialized(async () => {
      const stored = await browser.storage.local.get(RULE_OPS_KEY);
      const acknowledged = new Set(ops.map((op) => op.id));
      const remaining = (
        (stored[RULE_OPS_KEY] || []) as RuleOperation[]
      ).filter((op) => !acknowledged.has(op.id));
      // Edits made during the network request remain visible and queued.
      const local = applyOperations(
        {
          customCodeRules: definitions.customCodeRules,
          runCodeInPageRules: definitions.runCodeInPageRules,
          [SIDE_PANEL_RULES_KEY]: definitions.sidePanelRules,
        },
        remaining,
      );
      await browser.storage.local.set({
        ...local,
        [RULE_OPS_KEY]: remaining,
        arcable_last_synced_at: Date.now(),
      });
    });
    return definitions;
  });
  syncTail = run.catch(() => {});
  return run;
}
export function initRuleSync(loadAuth: () => Promise<RaindropAuthState>) {
  auth = loadAuth;
  let timer: ReturnType<typeof setTimeout>;
  browser.storage.onChanged.addListener((changes, area) => {
    const pending = changes[RULE_OPS_KEY]?.newValue;
    if (area === "local" && Array.isArray(pending) && pending.length) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void syncRules().catch(() => {});
      }, 2000);
    }
  });
  browser.alarms.create("arcable-rule-sync", { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "arcable-rule-sync") void syncRules().catch(() => {});
  });
  void syncRules().catch(() => {});
}
