import {
  initPanelEmbedding,
  preparePanelEmbedding,
  forgetPanelEmbedding,
  panelPage,
} from "./panelEmbedding";
import browser from "webextension-polyfill";
import {
  readFloatingPanels,
  writeFloatingPanels,
  type FloatingPanel,
} from "../../../../packages/shared/src/utils/floatingPanels";
import {
  createWorkspaceOperation,
  replayOperations,
} from "../../../../packages/shared/src/utils/syncEngine";
import type {
  ArcableWorkspaceData,
  Tab,
} from "../../../../packages/shared/src/types/workspace";

const key = "arcable_floating_panel_bindings";
type Binding = {
  itemId: string;
  variantId?: string;
  variantUrl?: string;
  token: string;
};
const session = browser.storage.session || browser.storage.local;
let queue = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
async function bindings(): Promise<Record<string, Binding>> {
  return ((await session.get(key))[key] as Record<string, Binding>) || {};
}
async function workspace() {
  const stored = await browser.storage.local.get([
    "arcable_workspace_snapshot",
    "arcable_pending_ops",
  ]);
  const snapshot = stored.arcable_workspace_snapshot as
    ArcableWorkspaceData | undefined;
  return {
    stored,
    data: snapshot
      ? replayOperations(snapshot, (stored.arcable_pending_ops || []) as any[])
      : undefined,
  };
}
function owner(tab: Tab, binding: Binding) {
  if (!binding.variantId) return tab;
  if (!tab.urlVariants?.length)
    return tab.url === binding.variantUrl ? tab : undefined;
  return (
    tab.urlVariants.find((v) => v.id === binding.variantId) ||
    tab.urlVariants.find((v) => v.url === binding.variantUrl)
  );
}
async function state(tabId: number) {
  const binding = (await bindings())[tabId];
  if (!binding) return { panels: [] };
  const { data } = await workspace();
  const tab = data?.tabs.find((t) => t.id === binding.itemId);
  return {
    panels: readFloatingPanels(tab && owner(tab, binding)?.note),
    token: binding.token,
  };
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
    /* Restricted/loading pages cannot receive overlays. */
  }
}
export function initFloatingPanels() {
  initPanelEmbedding();
  browser.tabs.onRemoved.addListener((tabId) => {
    void serialized(async () => {
      const all = await bindings();
      delete all[tabId];
      await forgetPanelEmbedding(tabId);
      await session.set({ [key]: all });
    });
  });
  browser.runtime.onStartup.addListener(() => {
    if (!browser.storage.session) void session.remove(key);
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (changes.arcable_workspace_snapshot || changes.arcable_pending_ops)
    )
      void serialized(async () => {
        const all = await bindings();
        await Promise.all(Object.keys(all).map((id) => refresh(Number(id))));
      });
  });
}
export function handleFloatingPanelsMessage(
  message: any,
  sender: browser.Runtime.MessageSender,
): Promise<any> | undefined {
  if (sender.id !== browser.runtime.id) return;
  if (message?.type === "ARCABLE_PANELS_LOCAL_EDIT") {
    const operation = message.operation;
    if (
      !sender.url?.startsWith(browser.runtime.getURL("")) ||
      operation?.type !== "TAB_UPDATE" ||
      typeof operation.id !== "string" ||
      typeof operation.entityId !== "string" ||
      !Number.isFinite(operation.timestamp) ||
      !operation.payload ||
      typeof operation.payload !== "object" ||
      (!("note" in operation.payload) && !("urlVariants" in operation.payload))
    ) {
      return Promise.resolve({ success: false });
    }
    return serialized(async () => {
      const stored = await browser.storage.local.get("arcable_pending_ops");
      const operations = new Map(
        ((stored.arcable_pending_ops || []) as any[]).map((op) => [op.id, op]),
      );
      operations.set(operation.id, operation);
      // Keep the authoritative snapshot intact. Overlay reads replay this local
      // outbox, including when an older in-flight sync publishes its result.
      await browser.storage.local.set({
        arcable_pending_ops: [...operations.values()],
      });
      return { success: true };
    });
  }
  if (message?.type === "ARCABLE_PANELS_BIND") {
    if (
      !sender.url?.startsWith(browser.runtime.getURL("")) ||
      !Number.isInteger(message.browserTabId)
    )
      return Promise.resolve({ success: false });
    return serialized(async () => {
      const { data } = await workspace();
      const tab = data?.tabs.find(
        (t) =>
          t.id === message.itemId ||
          t.urlVariants?.some((v) => v.id === message.itemId),
      );
      const all = await bindings();
      if (tab) {
        const variant =
          tab.urlVariants?.find((v) => v.id === message.variantId) ||
          tab.urlVariants?.find((v) => v.id === message.itemId) ||
          tab.urlVariants?.find((v) => v.url === message.url) ||
          tab.urlVariants?.find((v) => v.id === tab.defaultVariantId) ||
          tab.urlVariants?.[0];
        const prior = all[message.browserTabId];
        if (!message.preserveSelection || prior?.itemId !== tab.id) {
          all[message.browserTabId] = {
            itemId: tab.id,
            variantId: variant?.id,
            variantUrl: variant?.url,
            token:
              prior?.itemId === tab.id && prior.variantId === variant?.id
                ? prior.token
                : crypto.randomUUID(),
          };
        }
      } else delete all[message.browserTabId];
      await session.set({ [key]: all });
      await refresh(message.browserTabId);
      return { success: true };
    });
  }
  if (message?.type === "ARCABLE_PANEL_DOCUMENT") {
    if (
      sender.tab?.id === undefined ||
      !sender.frameId ||
      sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL(panelPage)
    )
      return Promise.resolve({});
    const tabId = sender.tab.id;
    return serialized(async () => {
      const current = await state(tabId);
      if (!current.token || current.token !== message.token) return {};
      const panel = current.panels.find((p) => p.id === message.panelId);
      if (!panel) return {};
      await preparePanelEmbedding(tabId, sender.frameId!);
      return { url: panel.url };
    });
  }
  if (sender.tab?.id === undefined || (sender.frameId ?? 0) !== 0) return;
  const tabId = sender.tab.id;
  if (message?.type === "ARCABLE_PANELS_GET")
    return serialized(() => state(tabId));
  if (message?.type === "ARCABLE_PANELS_PATCH")
    return serialized(async () => {
      const binding = (await bindings())[tabId];
      if (!binding || binding.token !== message.token)
        return { success: false };
      const { data, stored } = await workspace();
      const tab = data?.tabs.find((t) => t.id === binding.itemId);
      const target = tab && owner(tab, binding);
      if (!tab || !target || !data) return { success: false };
      const panels = readFloatingPanels(target.note);
      const panel = panels.find((p) => p.id === message.panelId);
      if (!panel) return { success: false };
      const patch = message.patch || {};
      if (
        ![patch.x, patch.y, patch.width, patch.height].every(Number.isFinite) ||
        patch.width <= 0 ||
        patch.height <= 0 ||
        (patch.dockPosition != null && !Number.isFinite(patch.dockPosition)) ||
        (patch.dock != null &&
          !["left", "right", "top", "bottom"].includes(patch.dock))
      )
        return { success: false };
      const next: FloatingPanel = {
        ...panel,
        x: patch.x,
        y: patch.y,
        width: patch.width,
        height: patch.height,
        dock: patch.dock || undefined,
        dockPosition: patch.dockPosition ?? undefined,
      };
      const note = writeFloatingPanels(
        target.note,
        panels.map((p) => (p.id === next.id ? next : p)),
      );
      const payload =
        binding.variantId && tab.urlVariants?.length
          ? {
              urlVariants: tab.urlVariants!.map((v) =>
                v === target ? { ...v, note } : v,
              ),
            }
          : { note };
      const deviceId = (await browser.storage.local.get("arcable_device_id"))
        .arcable_device_id as string | undefined;
      const op = createWorkspaceOperation(
        "TAB_UPDATE",
        tab.id,
        payload,
        deviceId,
      );
      const pending = [...((stored.arcable_pending_ops || []) as any[]), op];
      const updated = replayOperations(data, [op]);
      await browser.storage.local.set({
        arcable_pending_ops: pending,
        arcable_workspace_snapshot: updated,
      });
      return { success: true };
    });
}
