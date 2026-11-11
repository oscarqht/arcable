import browser from "webextension-polyfill";
import {
  initPanelEmbedding,
  preparePanelEmbedding,
  forgetPanelEmbedding,
  panelPage,
} from "./panelEmbedding";
import {
  matchingPanels,
  normalizePanelLayout,
  SIDE_PANEL_RULES_KEY,
  PANEL_LAYOUTS_KEY,
} from "@arcable/shared/utils";
import { withConfigurationStorage, writeConfiguration } from "./localRules";
const TOKENS = "arcable_panel_document_tokens";
const session = browser.storage.session || browser.storage.local;
let queue = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(() => withConfigurationStorage(action));
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
async function state(tabId: number) {
  const [tab, stored, tokens] = await Promise.all([
    browser.tabs.get(tabId),
    browser.storage.local.get([SIDE_PANEL_RULES_KEY, PANEL_LAYOUTS_KEY]),
    session.get(TOKENS),
  ]);
  const all = (tokens[TOKENS] || {}) as Record<string, string>;
  if (!all[tabId]) {
    all[tabId] = crypto.randomUUID();
    await session.set({ [TOKENS]: all });
  }
  const layouts = (stored[PANEL_LAYOUTS_KEY] || {}) as Record<string, any>;
  const panels = matchingPanels(
    stored[SIDE_PANEL_RULES_KEY],
    tab.url || "",
    layouts,
  );
  let initialized = false;
  for (const panel of panels) {
    if (!normalizePanelLayout(layouts[panel.id])) {
      layouts[panel.id] = normalizePanelLayout(panel);
      initialized = true;
    }
  }
  if (initialized)
    await writeConfiguration({ [PANEL_LAYOUTS_KEY]: layouts });
  return { panels, token: all[tabId] };
}
async function refresh(tabId: number) {
  try {
    const current = await state(tabId);
    if (!current.panels.length) await forgetPanelEmbedding(tabId);
    await browser.tabs.sendMessage(
      tabId,
      { type: "ARCABLE_PANELS_STATE", ...current },
      { frameId: 0 },
    );
  } catch {
    /* Restricted or loading page. The content script fetches on startup. */
  }
}
export function initFloatingPanels() {
  initPanelEmbedding();
  browser.tabs.onRemoved.addListener((tabId) => {
    void serialized(async () => {
      const stored = await session.get(TOKENS);
      const all = (stored[TOKENS] || {}) as Record<string, string>;
      delete all[tabId];
      await session.set({ [TOKENS]: all });
      await forgetPanelEmbedding(tabId);
    });
  });
  const navigate = (details: { tabId: number; frameId: number }) => {
    if (details.frameId === 0) void serialized(() => refresh(details.tabId));
  };
  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    void serialized(async () => {
      const stored = await session.get(TOKENS);
      const all = (stored[TOKENS] || {}) as Record<string, string>;
      all[details.tabId] = crypto.randomUUID();
      await session.set({ [TOKENS]: all });
      await refresh(details.tabId);
    });
  });
  browser.webNavigation.onHistoryStateUpdated?.addListener(navigate);
  browser.webNavigation.onReferenceFragmentUpdated?.addListener(navigate);
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (changes[SIDE_PANEL_RULES_KEY] || changes[PANEL_LAYOUTS_KEY])
    )
      void serialized(async () => {
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) if (tab.id !== undefined) await refresh(tab.id);
      });
  });
}
export function handleFloatingPanelsMessage(
  message: any,
  sender: browser.Runtime.MessageSender,
): Promise<any> | undefined {
  if (sender.id !== browser.runtime.id) return;
  if (message?.type === "ARCABLE_PANEL_DOCUMENT") {
    if (
      sender.tab?.id === undefined ||
      !sender.frameId ||
      sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL(panelPage)
    )
      return Promise.resolve({});
    return serialized(async () => {
      const current = await state(sender.tab!.id!);
      const panel =
        current.token === message.token &&
        current.panels.find((p) => p.id === message.panelId);
      if (!panel) return {};
      await preparePanelEmbedding(sender.tab!.id!, sender.frameId!);
      return { url: panel.url };
    });
  }
  if (sender.tab?.id === undefined || (sender.frameId ?? 0) !== 0) return;
  const tabId = sender.tab.id;
  if (message?.type === "ARCABLE_LOCATION_CHANGED")
    return serialized(() => refresh(tabId));
  if (message?.type === "ARCABLE_PANELS_GET")
    return serialized(() => state(tabId));
  if (message?.type === "ARCABLE_PANELS_PATCH")
    return serialized(async () => {
      const current = await state(tabId);
      const layout = normalizePanelLayout(message.patch);
      if (
        !layout ||
        current.token !== message.token ||
        !current.panels.some((p) => p.id === message.panelId)
      )
        return { success: false };
      const stored = await browser.storage.local.get(PANEL_LAYOUTS_KEY);
      await writeConfiguration({
        [PANEL_LAYOUTS_KEY]: {
          ...((stored[PANEL_LAYOUTS_KEY] as object) || {}),
          [message.panelId]: layout,
        },
      });
      return { success: true };
    });
}
