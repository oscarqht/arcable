import browser from "webextension-polyfill";
import type {
  RuleOperation,
} from "@arcable/shared/types";
import {
  SIDE_PANEL_RULES_KEY,
  sanitizeRule,
} from "@arcable/shared/utils";
const keys = {
  CUSTOM_CODE: "customCodeRules",
  RUN_CODE: "runCodeInPageRules",
  SIDE_PANEL: SIDE_PANEL_RULES_KEY,
} as const;
let storageTail: Promise<unknown> = Promise.resolve();
export function withConfigurationStorage<T>(action: () => Promise<T>): Promise<T> {
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
export function applyRuleOperations(ops: RuleOperation[]) {
  return withConfigurationStorage(async () => {
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
      ...Object.values(keys),
    ]);
    const local = applyOperations(
      Object.fromEntries(
        Object.values(keys).map((key) => [key, stored[key] || []]),
      ),
      ops,
    );
    await browser.storage.local.set(local);
  });
}
