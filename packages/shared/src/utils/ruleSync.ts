import type { RuleOperation } from "../types/rules";
import { generateRuleId } from "./customCodeUtils";
export function createRuleOperation(
  type: RuleOperation["type"],
  entityId: string,
  payload: any,
): RuleOperation {
  return {
    id: generateRuleId(),
    type,
    entityId,
    payload,
    timestamp: Date.now(),
  };
}

import type { RuleKind } from "../types/rules";
import { normalizeCustomCodeRules, normalizeRunCodeRules } from "./customCodeUtils";
import { normalizeSidePanelRules } from "./sidePanels";
export function sanitizeRule(kind: RuleKind, value: unknown) {
  const rule = kind === "CUSTOM_CODE" ? normalizeCustomCodeRules([value]).rules[0]
    : kind === "RUN_CODE" ? normalizeRunCodeRules([value]).rules[0]
    : normalizeSidePanelRules([value])[0];
  if (!rule) throw new Error("Invalid rule definition");
  if ("raindropId" in rule) delete rule.raindropId;
  return rule;
}
