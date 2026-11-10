import browser from "webextension-polyfill";
import { openOptionsPageSafely } from "../utils/browser";
export function initExtensionActionBehavior() {
  const action = browser.action || (browser as any).browserAction;
  // Clear any popup override left by an earlier version.
  if (action?.setPopup) void action.setPopup({ popup: "" }).catch(() => {});
  action?.onClicked.addListener(() => {
    void openOptionsPageSafely();
  });
}
