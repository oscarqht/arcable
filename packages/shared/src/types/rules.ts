import type { CustomCodeRule, RunCodeRule } from "./customCode";
import type { SidePanelRule } from "./sidePanels";
export type RuleKind = "CUSTOM_CODE" | "RUN_CODE" | "SIDE_PANEL";
export interface RuleOperation {
  id: string;
  type: `${RuleKind}_${"CREATE" | "UPDATE" | "DELETE"}`;
  entityId: string;
  payload: any;
  timestamp: number;
}
export interface RuleDefinitions {
  customCodeRules: CustomCodeRule[];
  runCodeInPageRules: RunCodeRule[];
  sidePanelRules: SidePanelRule[];
}
