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
