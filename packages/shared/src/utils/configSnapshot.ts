import type { RuleDefinitions } from "../types/rules";
import type { PanelLayout } from "../types/sidePanels";
import type { RaindropBookmarkItem } from "../types/raindrop";
import { isValidUrlPattern } from "./customCodeUtils";
import { isPanelUrl } from "./floatingPanels";
import { normalizePanelLayout } from "./sidePanels";
import {
  fetchRaindropCollections, createRaindropCollection, fetchAllRaindropItems,
  uploadRaindropFile, updateRaindropItem, fetchRaindropItem,
  fetchRaindropFileContent, deleteRaindropBookmark,
} from "./raindropClient";

export interface ConfigSnapshot extends RuleDefinitions {
  format: "arcable-config";
  version: 1;
  savedAt: string;
  settings: { hideScrollbars: boolean; autoPip: boolean; theme: "system" | "light" | "dark" };
  panelLayouts: Record<string, PanelLayout>;
}
export const SNAPSHOT_COLLECTION = "Arcable snapshots";
export const SNAPSHOT_MARKER = "arcable-config-snapshot-v1";
const PREFIX = "Arcable configuration ";
const FILE_PATTERN = /^arcable-config-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.json$/;
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid or unsupported Arcable configuration snapshot");
}
function record(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
function rules(value: any, kind: "custom" | "run" | "panel"): any[] {
  check(Array.isArray(value));
  const seen = new Set<string>();
  return value.map((r: any) => {
    check(record(r) && typeof r.id === "string" && r.id.trim() && !seen.has(r.id));
    seen.add(r.id);
    check(r.disabled === undefined || typeof r.disabled === "boolean");
    for (const key of ["createdAt", "updatedAt"]) check(r[key] === undefined || timestamp(r[key]));
    const base = { id: r.id, disabled: r.disabled ?? false, createdAt: r.createdAt, updatedAt: r.updatedAt };
    if (kind === "custom") {
      check(typeof r.pattern === "string" && isValidUrlPattern(r.pattern));
      check(typeof r.css === "string" && typeof r.js === "string");
      return { ...base, pattern: r.pattern, css: r.css, js: r.js };
    }
    check(typeof r.title === "string" && r.title.trim());
    check(Array.isArray(r.patterns) && r.patterns.every((p: unknown) => typeof p === "string" && isValidUrlPattern(p)));
    if (kind === "panel") {
      check(r.patterns.length);
      check(typeof r.url === "string" && isPanelUrl(r.url));
      return { ...base, title: r.title, patterns: [...r.patterns], url: r.url };
    }
    check(typeof r.code === "string");
    return { ...base, title: r.title, patterns: [...r.patterns], code: r.code };
  });
}
/** Validate everything before a storage write; copy only explicit configuration fields. */
export function validateConfigSnapshot(value: unknown): ConfigSnapshot {
  const s = value as ConfigSnapshot;
  check(record(s) && s.format === "arcable-config" && s.version === 1 && timestamp(s.savedAt) && new Date(s.savedAt).toISOString() === s.savedAt);
  check(record(s.settings) && typeof s.settings.hideScrollbars === "boolean" && typeof s.settings.autoPip === "boolean");
  check(["system", "light", "dark"].includes(s.settings.theme));
  check(record(s.panelLayouts));
  const panelLayouts = Object.fromEntries(Object.entries(s.panelLayouts).map(([id, layout]) => {
    check(id && record(layout));
    const normalized = normalizePanelLayout(layout);
    check(normalized);
    return [id, normalized];
  }));
  return {
    format: "arcable-config", version: 1, savedAt: s.savedAt,
    customCodeRules: rules(s.customCodeRules, "custom"),
    runCodeInPageRules: rules(s.runCodeInPageRules, "run"),
    sidePanelRules: rules(s.sidePanelRules, "panel"),
    settings: { hideScrollbars: s.settings.hideScrollbars, autoPip: s.settings.autoPip, theme: s.settings.theme },
    panelLayouts,
  };
}
function snapshotTime(item: RaindropBookmarkItem): number {
  return Date.parse(item.title.slice(PREFIX.length));
}
function isCandidate(item: RaindropBookmarkItem): boolean {
  return item.excerpt === SNAPSHOT_MARKER && item.title.startsWith(PREFIX) && timestamp(item.title.slice(PREFIX.length));
}
function isSnapshot(item: RaindropBookmarkItem): boolean {
  return isCandidate(item) && !!item.file && FILE_PATTERN.test(item.file.name || "");
}
async function listSnapshots(token: string, create: boolean) {
  const collections = (await fetchRaindropCollections(token)).filter(c => c.title === SNAPSHOT_COLLECTION && !c.parent?.$id);
  if (!collections.length && create) {
    const collection = await createRaindropCollection(token, SNAPSHOT_COLLECTION);
    if (!collection) throw new Error("Could not create Arcable snapshots collection");
    collections.push(collection);
  }
  const items = (await Promise.all(collections.map(c => fetchAllRaindropItems(token, c._id, { cacheBust: String(Date.now()) })))).flat().filter(isCandidate);
  items.sort((a, b) => snapshotTime(b) - snapshotTime(a) || b._id - a._id);
  return { collectionId: collections[0]?._id, items };
}
async function readSnapshot(token: string, id: number) {
  const item = await fetchRaindropItem(token, id);
  if (!item || !isSnapshot(item)) throw new Error("Arcable snapshot file is missing or invalid");
  const text = await fetchRaindropFileContent(token, item.file?.path || item.link);
  const snapshot = validateConfigSnapshot(JSON.parse(text));
  check(Date.parse(snapshot.savedAt) === snapshotTime(item));
  return snapshot;
}
export async function loadLatestConfigSnapshot(token: string): Promise<ConfigSnapshot> {
  const { items } = await listSnapshots(token, false);
  if (!items.length) throw new Error("No Arcable configuration snapshot found");
  return readSnapshot(token, items[0]._id);
}
export async function saveConfigSnapshot(token: string, value: ConfigSnapshot): Promise<{ savedAt: string; warning?: string }> {
  const snapshot = validateConfigSnapshot(value);
  const { collectionId, items } = await listSnapshots(token, true);
  const fileName = `arcable-config-${snapshot.savedAt.replace(/:/g, "-")}.json`;
  const uploaded = await uploadRaindropFile(token, collectionId!, fileName, JSON.stringify(snapshot, null, 2));
  const id = uploaded?.item?._id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Raindrop did not return an uploaded snapshot item");
  const updated = await updateRaindropItem(token, id, { title: `${PREFIX}${snapshot.savedAt}`, excerpt: SNAPSHOT_MARKER });
  if (!updated) throw new Error("Could not label uploaded Arcable snapshot; older snapshots were preserved");
  const verified = await readSnapshot(token, id);
  check(JSON.stringify(verified) === JSON.stringify(snapshot));
  // Only prune files discovered before this upload, older than this snapshot.
  // Never touch legacy records, unrelated files, or concurrent/newer saves.
  let failed = 0;
  for (const old of items.filter(item => item._id !== id && snapshotTime(item) < Date.parse(snapshot.savedAt))) {
    try {
      // Recheck ownership immediately before deletion in case the item was edited/moved.
      const current = await fetchRaindropItem(token, old._id);
      if (current && isSnapshot(current) && snapshotTime(current) < Date.parse(snapshot.savedAt) && current.collectionId === old.collectionId) {
        if (!await deleteRaindropBookmark(token, old._id)) failed++;
      }
    } catch { failed++; }
  }
  return { savedAt: snapshot.savedAt, ...(failed ? { warning: `Snapshot saved and verified, but ${failed} older snapshot(s) could not be deleted.` } : {}) };
}
