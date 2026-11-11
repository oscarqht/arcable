import browser from "webextension-polyfill";
import { loadLatestConfigSnapshot, saveConfigSnapshot, validateConfigSnapshot } from "@arcable/shared/utils";
import type { RaindropAuthState } from "@arcable/shared/types";
import type { ConfigSnapshot } from "@arcable/shared/utils";
import { withConfigurationStorage, setConfigurationWriter } from "./localRules";
import { CONFIG_KEYS, readConfiguration, configurationPatch, retireRuleSync } from "./configSnapshots";

export const SYNC_KEY = "arcable_config_sync";
export const SYNC_ALARM = "arcable-config-sync";
export const RETRY_ALARM = "arcable-config-sync-retry";
export const EDIT_ALARM = "arcable-config-sync-edit";
export interface SyncStatus {
  state: "pending" | "syncing" | "saved" | "error";
  lastSyncedAt?: string;
  error?: string;
  warning?: string;
}
type Edit = { revision: number; value: unknown };
interface Journal {
  observed: ConfigSnapshot;
  pending: Record<string, Edit>;
  revision: number;
  status: SyncStatus;
}
// Browser storage can reorder dictionary keys and omit undefined properties.
// Compare JSON values independently of object insertion order; array order matters.
function comparableJSON(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item,
  );
}
const equal = (a: unknown, b: unknown) => comparableJSON(a) === comparableJSON(b);
// Keys are JSON tuples, so rule IDs containing dots/slashes cannot collide.
function entries(s: ConfigSnapshot): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const kind of ["customCodeRules", "runCodeInPageRules", "sidePanelRules"] as const)
    for (const rule of s[kind]) result.set(JSON.stringify([kind, rule.id]), rule);
  for (const [id, layout] of Object.entries(s.panelLayouts)) result.set(JSON.stringify(["panelLayouts", id]), layout);
  for (const [key, value] of Object.entries(s.settings)) result.set(JSON.stringify(["settings", key]), value);
  return result;
}
function observe(j: Journal, current: ConfigSnapshot): boolean {
  const before = entries(j.observed), after = entries(current);
  let changed = false;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (!equal(before.get(key), after.get(key))) {
      j.pending[key] = { revision: ++j.revision, value: after.get(key) ?? null };
      changed = true;
    }
  }
  j.observed = current;
  return changed;
}
export function mergeConfiguration(base: ConfigSnapshot, pending: Record<string, Edit>): ConfigSnapshot {
  const merged = entries(base);
  for (const [key, edit] of Object.entries(pending)) {
    if (edit.value === null) merged.delete(key);
    else merged.set(key, edit.value);
  }
  const result: any = { ...base, customCodeRules: [], runCodeInPageRules: [], sidePanelRules: [], panelLayouts: {}, settings: {} };
  for (const [key, value] of merged) {
    const [kind, id] = JSON.parse(key);
    if (kind === "settings" || kind === "panelLayouts")
      Object.defineProperty(result[kind], id, { value, enumerable: true, configurable: true, writable: true });
    else result[kind].push(value);
  }
  return validateConfigSnapshot(result);
}

export function createConfigurationSync(getAuth: () => Promise<{ isAuthenticated: boolean; accessToken?: string }>) {
  let running: Promise<void> | undefined;
  let requested = false;
  let editTimer: ReturnType<typeof setTimeout> | undefined;
  let session = 0;
  let ready: Promise<void>;
  async function capture(): Promise<Journal> {
    const stored = await browser.storage.local.get([...CONFIG_KEYS, SYNC_KEY]);
    const current = readConfiguration(stored);
    const j = stored[SYNC_KEY] as Journal | undefined;
    if (!j) return { observed: current, pending: {}, revision: 0, status: { state: "pending" } };
    if (observe(j, current)) j.status = { ...j.status, state: "pending", error: undefined };
    return j;
  }
  async function record() {
    return withConfigurationStorage(async () => {
      const j = await capture();
      await browser.storage.local.set({ [SYNC_KEY]: j });
      return j;
    });
  }
  function scheduleEdit() {
    // Alarms survive MV3 suspension; the short timer provides a responsive debounce.
    void browser.alarms.create(EDIT_ALARM, { delayInMinutes: 0.5 });
    clearTimeout(editTimer);
    editTimer = setTimeout(() => { void sync(); }, 1200);
  }
  async function run() {
    await ready;
    const currentSession = session;
    await record();
    const auth = await getAuth();
    if (!auth.isAuthenticated || !auth.accessToken) return;
    const assertSession = () => {
      if (session !== currentSession) throw new Error("Raindrop session changed; sync will resume after login.");
    };
    try {
      await withConfigurationStorage(async () => {
        const j = await capture();
        j.status = { ...j.status, state: "syncing", error: undefined, warning: undefined };
        await browser.storage.local.set({ [SYNC_KEY]: j });
      });
      let remote: ConfigSnapshot | undefined;
      try { remote = await loadLatestConfigSnapshot(auth.accessToken); }
      catch (error) {
        // Only an explicit empty listing permits initialization. Network/validation failures must never upload stale data.
        if (!(error instanceof Error) || error.message !== "No Arcable configuration snapshot found") throw error;
      }
      assertSession();
      const upload = await withConfigurationStorage(async () => {
        assertSession();
        const j = await capture();
        const merged = mergeConfiguration(remote || j.observed, j.pending);
        // Monotonic snapshot times also handle a remote machine whose clock is ahead.
        merged.savedAt = new Date(Math.max(Date.now(), Date.parse(remote?.savedAt || merged.savedAt) + 1)).toISOString();
        const pending = structuredClone(j.pending);
        const needed = !remote || Object.keys(pending).length > 0;
        j.observed = merged;
        const stored = await browser.storage.local.get("arcable_config");
        await browser.storage.local.set({ ...configurationPatch(merged, stored), [SYNC_KEY]: j });
        return { merged, pending, needed };
      });
      assertSession();
      const result = upload.needed ? await saveConfigSnapshot(auth.accessToken, upload.merged) : undefined;
      assertSession();
      await withConfigurationStorage(async () => {
        assertSession();
        const j = await capture();
        for (const [key, edit] of Object.entries(upload.pending))
          if (j.pending[key]?.revision === edit.revision) delete j.pending[key];
        const pending = Object.keys(j.pending).length > 0;
        j.status = { state: pending ? "pending" : "saved", lastSyncedAt: new Date().toISOString(), warning: result?.warning };
        await browser.storage.local.set({ [SYNC_KEY]: j });
        if (pending) scheduleEdit();
        else { clearTimeout(editTimer); await browser.alarms.clear(EDIT_ALARM); }
      });
      await browser.alarms.clear(RETRY_ALARM);
    } catch {
      // Do not persist transport error details: they may contain authenticated URLs.
      await withConfigurationStorage(async () => {
        const j = await capture();
        j.status = { ...j.status, state: "error", error: "Could not sync with Raindrop. Local changes are kept; retrying automatically." };
        await browser.storage.local.set({ [SYNC_KEY]: j });
      });
      await browser.alarms.create(RETRY_ALARM, { delayInMinutes: 1 });
    }
  }
  function sync(): Promise<void> {
    if (running) { requested = true; return running; }
    running = (async () => {
      do { requested = false; await run(); } while (requested);
    })().catch(async () => {
      await browser.alarms.create(RETRY_ALARM, { delayInMinutes: 1 });
    }).finally(() => { running = undefined; });
    return running;
  }
  function start() {
    setConfigurationWriter(async patch => {
      // Called with the configuration lock held. Recording each save also keeps
      // a rapid edit-and-revert pending, even when its final value equals baseline.
      const j = await capture();
      const current = readConfiguration({ ...configurationPatch(j.observed, {}), ...patch });
      if (observe(j, current)) j.status = { ...j.status, state: "pending", error: undefined };
      await browser.storage.local.set({ ...patch, [SYNC_KEY]: j });
      if (Object.keys(j.pending).length) scheduleEdit();
    });
    // Queue baseline initialization before any new edits. Existing data is not pending on first installation.
    ready = record().then(() => {}, () => {});
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.arcable_raindrop_auth) {
        const before = changes.arcable_raindrop_auth.oldValue as RaindropAuthState | undefined;
        const after = changes.arcable_raindrop_auth.newValue as RaindropAuthState | undefined;
        // Token renewal is the same session and must not cancel an upload.
        const changedSession = before?.isAuthenticated !== after?.isAuthenticated || before?.user?.id !== after?.user?.id;
        if (changedSession) session++;
        if (after?.isAuthenticated && changedSession) void sync();
      }
      if (!changes[SYNC_KEY] && CONFIG_KEYS.some(key => key in changes)) {
        void record().then(j => { if (Object.keys(j.pending).length) scheduleEdit(); }).catch(() => {
          void browser.alarms.create(RETRY_ALARM, { delayInMinutes: 1 });
        });
      }
    });
    browser.alarms.onAlarm.addListener(alarm => {
      if ([SYNC_ALARM, RETRY_ALARM, EDIT_ALARM].includes(alarm.name)) void sync();
    });
    const initialize = async () => {
      await ready;
      await retireRuleSync();
      if (!await browser.alarms.get(SYNC_ALARM))
        await browser.alarms.create(SYNC_ALARM, { periodInMinutes: 10 });
      await sync();
    };
    browser.runtime.onStartup.addListener(() => { void initialize().catch(() => { void browser.alarms.create(RETRY_ALARM, { delayInMinutes: 1 }); }); });
    browser.runtime.onInstalled.addListener(() => { void initialize().catch(() => { void browser.alarms.create(RETRY_ALARM, { delayInMinutes: 1 }); }); });
    void initialize().catch(() => { void browser.alarms.create(RETRY_ALARM, { delayInMinutes: 1 }); });
  }
  return { start, sync, record };
}
