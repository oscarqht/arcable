import browser from "webextension-polyfill";
import {
  SIDE_PANEL_RULES_KEY, PANEL_LAYOUTS_KEY, validateConfigSnapshot,
  saveConfigSnapshot, loadLatestConfigSnapshot,
} from "@arcable/shared/utils";
import { withConfigurationStorage } from "./localRules";

const CONFIG_KEYS = ["customCodeRules", "runCodeInPageRules", SIDE_PANEL_RULES_KEY,
  PANEL_LAYOUTS_KEY, "arcable_hide_all_scrollbars", "arcable_auto_pip", "arcable_config"];
// Serialize manual operations across all options windows, including cleanup.
let tail: Promise<unknown> = Promise.resolve();
function exclusive<T>(action: () => Promise<T>): Promise<T> {
  const result = tail.then(action);
  tail = result.catch(() => {});
  return result;
}
export async function retireRuleSync() {
  await browser.alarms.clear("arcable-rule-sync");
  await browser.storage.local.remove(["arcable_rule_ops", "arcable_last_synced_at"]);
}
export function saveConfiguration(token: string) {
  return exclusive(async () => {
    const snapshot = await withConfigurationStorage(async () => {
      const s = await browser.storage.local.get(CONFIG_KEYS);
      return validateConfigSnapshot({
        format: "arcable-config", version: 1, savedAt: new Date().toISOString(),
        customCodeRules: s.customCodeRules ?? [], runCodeInPageRules: s.runCodeInPageRules ?? [],
        sidePanelRules: s[SIDE_PANEL_RULES_KEY] ?? [], panelLayouts: s[PANEL_LAYOUTS_KEY] ?? {},
        settings: { hideScrollbars: s.arcable_hide_all_scrollbars ?? true,
          autoPip: s.arcable_auto_pip ?? true, theme: (s.arcable_config as { theme?: string })?.theme ?? "system" },
      });
    });
    return saveConfigSnapshot(token, snapshot);
  });
}
export function loadConfiguration(token: string) {
  return exclusive(async () => {
    const snapshot = validateConfigSnapshot(await loadLatestConfigSnapshot(token));
    await withConfigurationStorage(async () => {
      const s = await browser.storage.local.get("arcable_config");
      // One write replaces every included field, including empty lists/maps.
      // Preserve unrelated local settings (especially auth) rather than importing them.
      await browser.storage.local.set({
        customCodeRules: snapshot.customCodeRules, runCodeInPageRules: snapshot.runCodeInPageRules,
        [SIDE_PANEL_RULES_KEY]: snapshot.sidePanelRules, [PANEL_LAYOUTS_KEY]: snapshot.panelLayouts,
        arcable_hide_all_scrollbars: snapshot.settings.hideScrollbars, arcable_auto_pip: snapshot.settings.autoPip,
        arcable_config: { ...((s.arcable_config as object) || {}), theme: snapshot.settings.theme },
      });
    });
    return { savedAt: snapshot.savedAt };
  });
}
