import type { CustomCodeRule, RunCodeRule } from "../types/customCode";
import type { RuleDefinitions, RuleOperation, RuleKind } from "../types/rules";
import type { RaindropBookmarkItem } from "../types/raindrop";
import {
  fetchRaindropCollections,
  fetchAllRaindropItems,
  createRaindropCollection,
  createRaindropBookmarks,
  updateRaindropItem,
  decodeRaindropTitle,
} from "./raindropClient";
import {
  normalizeCustomCodeRules,
  normalizeRunCodeRules,
  sortCustomCodeRules,
  sortRunCodeRules,
} from "./customCodeUtils";
import { normalizeSidePanelRules } from "./sidePanels";
const ARCABLE_CUSTOM_CSS_LINK_PREFIX = "https://arcable.app/custom-css/";
const ARCABLE_RUN_CODE_LINK_PREFIX = "https://arcable.app/run-code/";
const CUSTOM_CODE_V2_LINK_PREFIX = "https://arcable.app/custom-code-v2/";
const CUSTOM_CODE_PART_LINK_PREFIX = "https://arcable.app/custom-code-part/";
export const RULES_COLLECTION = "Arcable rules";
const MANIFEST_PREFIX = "https://arcable.app/rule/";
const PART_PREFIX = "https://arcable.app/rule-part/";
const fields = {
  CUSTOM_CODE: "customCodeRules",
  RUN_CODE: "runCodeInPageRules",
  SIDE_PANEL: "sidePanelRules",
} as const;
function normalize(kind: RuleKind, value: unknown): any[] {
  return kind === "CUSTOM_CODE"
    ? normalizeCustomCodeRules(value).rules
    : kind === "RUN_CODE"
      ? normalizeRunCodeRules(value).rules
      : normalizeSidePanelRules(value);
}
export function sanitizeRule(kind: RuleKind, value: unknown) {
  const rule = normalize(kind, [value])[0];
  if (!rule) throw new Error("Invalid rule definition");
  delete rule.raindropId;
  return rule;
}
async function readLegacyCode(
  token: string,
  collections: Awaited<ReturnType<typeof fetchRaindropCollections>>,
): Promise<RuleDefinitions> {
  const root = collections.find(
    (c) => c.title === "Arcable v2" && !c.parent?.$id,
  );
  if (!root)
    return { customCodeRules: [], runCodeInPageRules: [], sidePanelRules: [] };
  const code = collections.find(
    (c) => c.title === "_custom_css" && c.parent?.$id === root?._id,
  );
  const run = collections.find(
    (c) => c.title === "_run_code" && c.parent?.$id === root?._id,
  );
  const customCssItems = code
    ? await fetchAllRaindropItems(token, code._id)
    : [];
  const runCodeItems = run ? await fetchAllRaindropItems(token, run._id) : [];
  let customCodeRules: CustomCodeRule[] = customCssItems
    .filter((item) => !item.link?.startsWith(CUSTOM_CODE_PART_LINK_PREFIX))
    .map((item) => {
      if (item.link?.startsWith(CUSTOM_CODE_V2_LINK_PREFIX)) {
        const code = readChunkedCustomCode(item, customCssItems);
        const manifest = JSON.parse(item.excerpt!);
        return {
          id: decodeURIComponent(
            item.link.slice(CUSTOM_CODE_V2_LINK_PREFIX.length),
          ),
          raindropId: item._id,
          pattern: decodeRaindropTitle(item.title || ""),
          ...code,
          disabled: Boolean(manifest.disabled),
          createdAt: item.created,
          updatedAt: item.lastUpdate,
        };
      }
      let parsedExcerpt: any = {};
      try {
        if (item.excerpt) parsedExcerpt = JSON.parse(item.excerpt);
      } catch {}

      let parsedNote: any = {};
      if (typeof item.note === "string" && item.note.trim().startsWith("{")) {
        try {
          parsedNote = JSON.parse(item.note.trim());
        } catch {}
      }

      const ruleId =
        parsedExcerpt.id ||
        (item.link?.startsWith(ARCABLE_CUSTOM_CSS_LINK_PREFIX)
          ? item.link.slice(ARCABLE_CUSTOM_CSS_LINK_PREFIX.length)
          : String(item._id));

      let css = "";
      if (typeof parsedExcerpt.css_b64 === "string" && parsedExcerpt.css_b64) {
        css = decodeSafePayload(parsedExcerpt.css_b64);
      } else if (typeof parsedNote.css_b64 === "string" && parsedNote.css_b64) {
        css = decodeSafePayload(parsedNote.css_b64);
      } else if (typeof parsedExcerpt.css === "string") {
        css = parsedExcerpt.css;
      }

      let js = "";
      if (typeof parsedExcerpt.js_b64 === "string" && parsedExcerpt.js_b64) {
        js = decodeSafePayload(parsedExcerpt.js_b64);
      } else if (typeof parsedNote.js_b64 === "string" && parsedNote.js_b64) {
        js = decodeSafePayload(parsedNote.js_b64);
      } else if (typeof parsedExcerpt.js === "string") {
        js = parsedExcerpt.js;
      }

      return {
        id: ruleId,
        raindropId: item._id,
        pattern: parsedExcerpt.pattern || item.title || "",
        css,
        js,
        disabled: Boolean(parsedExcerpt.disabled),
        createdAt: parsedExcerpt.createdAt || item.created,
        updatedAt: parsedExcerpt.updatedAt || item.lastUpdate,
      };
    });

  customCodeRules = sortCustomCodeRules(customCodeRules);

  // Reconstruct run code rules from _run_code

  let runCodeInPageRules: RunCodeRule[] = runCodeItems.map((item) => {
    let parsedExcerpt: any = {};
    try {
      if (item.excerpt) parsedExcerpt = JSON.parse(item.excerpt);
    } catch {}
    const ruleId =
      parsedExcerpt.id ||
      (item.link?.startsWith(ARCABLE_RUN_CODE_LINK_PREFIX)
        ? item.link.slice(ARCABLE_RUN_CODE_LINK_PREFIX.length)
        : String(item._id));

    let code = "";
    if (typeof parsedExcerpt.code_b64 === "string" && parsedExcerpt.code_b64) {
      code = decodeSafePayload(parsedExcerpt.code_b64);
    } else if (typeof item.note === "string" && item.note.trim()) {
      try {
        code = decodeSafePayload(item.note.trim());
      } catch {
        code = typeof parsedExcerpt.code === "string" ? parsedExcerpt.code : "";
      }
    } else if (typeof parsedExcerpt.code === "string") {
      code = parsedExcerpt.code;
    }

    return {
      id: ruleId,
      raindropId: item._id,
      title: parsedExcerpt.title || item.title || "",
      patterns: parsedExcerpt.patterns || [],
      code,
      disabled: Boolean(parsedExcerpt.disabled),
      createdAt: parsedExcerpt.createdAt || item.created,
      updatedAt: parsedExcerpt.updatedAt || item.lastUpdate,
    };
  });

  runCodeInPageRules = sortRunCodeRules(runCodeInPageRules);

  return { customCodeRules, runCodeInPageRules, sidePanelRules: [] };
}
export function encodeSafePayload(text: string): string {
  if (!text) return "";
  try {
    const buf = (globalThis as any).Buffer;
    if (typeof buf !== "undefined") {
      return buf.from(text, "utf-8").toString("base64");
    }
    if (typeof TextEncoder !== "undefined" && typeof btoa !== "undefined") {
      const bytes = new TextEncoder().encode(text);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
    return encodeURIComponent(text);
  } catch (err) {
    console.warn(
      "[RaindropSync] Failed to base64 encode payload, fallback to encodeURIComponent:",
      err,
    );
    return encodeURIComponent(text);
  }
}

/**
 * Decodes a safe payload from base64 (with fallback to decodeURIComponent or raw text).
 */
export function decodeSafePayload(encoded: string): string {
  if (!encoded) return "";
  try {
    const buf = (globalThis as any).Buffer;
    if (typeof buf !== "undefined") {
      return buf.from(encoded, "base64").toString("utf-8");
    }
    if (typeof TextDecoder !== "undefined" && typeof atob !== "undefined") {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(encoded);
  } catch {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
}

function customCodeChecksum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

function customCodePartPrefix(id: string, revision?: string): string {
  return `${CUSTOM_CODE_PART_LINK_PREFIX}${encodeURIComponent(id)}/${revision ? `${revision}/` : ""}`;
}

function readChunkedCustomCode(
  item: RaindropBookmarkItem,
  parts: RaindropBookmarkItem[],
): { css: string; js: string } {
  const id = decodeURIComponent(
    item.link.slice(CUSTOM_CODE_V2_LINK_PREFIX.length),
  );
  let manifest: any;
  try {
    manifest = JSON.parse(item.excerpt || "");
  } catch {}
  if (
    !manifest ||
    manifest.v !== 2 ||
    typeof manifest.revision !== "string" ||
    !Number.isSafeInteger(manifest.count) ||
    manifest.count < 1 ||
    !Number.isSafeInteger(manifest.length) ||
    manifest.length < 1 ||
    typeof manifest.hash !== "string"
  ) {
    throw new Error(`Invalid or truncated custom code manifest for ${id}.`);
  }
  const prefix = customCodePartPrefix(id, manifest.revision);
  const byLink = new Map(parts.map((part) => [part.link, part]));
  let encoded = "";
  for (let i = 0; i < manifest.count; i++) {
    const part = byLink.get(`${prefix}${i}`);
    if (!part || typeof part.excerpt !== "string" || !part.excerpt) {
      throw new Error(
        `Missing custom code part ${i + 1} of ${manifest.count} for ${id}.`,
      );
    }
    encoded += part.excerpt;
  }
  if (
    encoded.length !== manifest.length ||
    customCodeChecksum(encoded) !== manifest.hash
  ) {
    throw new Error(`Incomplete or corrupted custom code for ${id}.`);
  }
  let code: any;
  try {
    code = JSON.parse(decodeSafePayload(encoded));
  } catch {}
  if (!code || typeof code.css !== "string" || typeof code.js !== "string") {
    throw new Error(`Invalid custom code content for ${id}.`);
  }
  return code;
}

/** Read only code collections from the old tree. All writes target the new rules collection. */
export async function syncRuleDefinitions(
  token: string,
  operations: RuleOperation[],
): Promise<RuleDefinitions> {
  const collections = await fetchRaindropCollections(token);
  const definitions = await readLegacyCode(token, collections);
  let collection = collections.find(
    (c) => c.title === RULES_COLLECTION && !c.parent?.$id,
  );
  const items = collection
    ? await fetchAllRaindropItems(token, collection._id)
    : [];
  const byLink = new Map(items.map((item) => [item.link, item]));
  for (const item of items.filter((i) => i.link.startsWith(MANIFEST_PREFIX))) {
    const [kind, encodedId] = item.link
      .slice(MANIFEST_PREFIX.length)
      .split("/");
    if (!Object.prototype.hasOwnProperty.call(fields, kind) || !encodedId)
      continue;
    const field = fields[kind as RuleKind];
    const id = decodeURIComponent(encodedId);
    const manifest = JSON.parse(item.excerpt || "");
    let rule;
    if (!manifest.deleted) {
      let encoded = "";
      if (
        !Number.isSafeInteger(manifest.count) ||
        manifest.count < 1 ||
        manifest.count > 100000 ||
        typeof manifest.revision !== "string"
      )
        throw new Error("Invalid rule manifest");
      for (let n = 0; n < manifest.count; n++) {
        const part = byLink.get(
          `${PART_PREFIX}${kind}/${encodedId}/${manifest.revision}/${n}`,
        );
        if (!part?.excerpt) throw new Error("Incomplete rule upload");
        encoded += part.excerpt;
      }
      if (
        encoded.length !== manifest.length ||
        customCodeChecksum(encoded) !== manifest.hash
      )
        throw new Error("Corrupted rule upload");
      rule = sanitizeRule(kind as RuleKind, {
        ...JSON.parse(decodeSafePayload(encoded)),
        id,
      });
    }
    (definitions[field] as any[]) = [
      ...definitions[field].filter((r) => r.id !== id),
      ...(rule ? [rule] : []),
    ];
  }
  for (const op of operations) {
    const kind = op.type.replace(/_(CREATE|UPDATE|DELETE)$/, "") as RuleKind;
    const field = fields[kind];
    if (!field) throw new Error("Unsupported rule operation");
    const id = op.entityId;
    const link = `${MANIFEST_PREFIX}${kind}/${encodeURIComponent(id)}`;
    const current = definitions[field].find((r) => r.id === id);
    const deleted = op.type.endsWith("_DELETE");
    // A remote deletion wins over a stale update; explicit creates can restore it.
    if (!current && op.type.endsWith("_UPDATE")) continue;
    const rule = deleted
      ? undefined
      : sanitizeRule(kind, { ...current, ...op.payload, id });
    if (!collection)
      collection = await createRaindropCollection(token, RULES_COLLECTION);
    let manifest: any = { v: 1, deleted: true };
    if (rule) {
      const encoded = encodeSafePayload(JSON.stringify(rule));
      const revision = crypto.randomUUID();
      const parts = [];
      for (let n = 0; n < encoded.length; n += 200)
        parts.push({
          title: "Rule content",
          link: `${PART_PREFIX}${kind}/${encodeURIComponent(id)}/${revision}/${parts.length}`,
          excerpt: encoded.slice(n, n + 200),
          collectionId: collection._id,
          pleaseParse: { disabled: true },
        });
      for (let start = 0; start < parts.length; start += 100) {
        const batch = parts.slice(start, start + 100);
        if (
          (await createRaindropBookmarks(token, batch)).length !== batch.length
        )
          throw new Error("Incomplete rule upload");
      }
      const remote = await fetchAllRaindropItems(token, collection._id, {
        cacheBust: revision,
      });
      const recovered = parts
        .map((p) => remote.find((r) => r.link === p.link)?.excerpt || "")
        .join("");
      if (recovered !== encoded)
        throw new Error("Raindrop truncated rule content");
      manifest = {
        v: 1,
        revision,
        count: parts.length,
        length: encoded.length,
        hash: customCodeChecksum(encoded),
      };
    }
    const input = {
      title: rule ? rule.title || rule.pattern : "Deleted rule",
      link,
      excerpt: JSON.stringify(manifest),
      collectionId: collection._id,
      pleaseParse: { disabled: true },
    };
    const prior = byLink.get(link);
    const saved = prior
      ? await updateRaindropItem(token, prior._id, input)
      : (await createRaindropBookmarks(token, [input]))[0];
    if (!saved) throw new Error("Could not publish rule");
    byLink.set(link, saved);
    (definitions[field] as any[]) = [
      ...definitions[field].filter((r) => r.id !== id),
      ...(rule ? [rule] : []),
    ];
  }
  return definitions;
}
