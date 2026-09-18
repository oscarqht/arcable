import { CustomCodeRule, RunCodeRule } from '../types/customCode';

/**
 * Generate a unique identifier for rules.
 */
export function generateRuleId(prefix = 'rule'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/**
 * Validate URLPattern syntax.
 */
export function isValidUrlPattern(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string' || !pattern.trim()) {
    return false;
  }
  try {
    // @ts-ignore - URLPattern is standard in modern browser runtimes
    new URLPattern(pattern.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Test whether a given URL matches a pattern.
 */
export function matchUrlPattern(pattern: string, url: string): boolean {
  if (!pattern || !url) return false;
  try {
    // @ts-ignore
    const p = new URLPattern(pattern);
    return p.test(url);
  } catch {
    try {
      return url.includes(pattern) || new RegExp(pattern).test(url);
    } catch {
      return false;
    }
  }
}

/**
 * Test whether a URL matches any pattern in an array.
 */
export function matchAnyUrlPattern(patterns: string[], url: string): boolean {
  if (!url || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  return patterns.some((p) => matchUrlPattern(p, url));
}

/**
 * Sort custom code rules alphabetically by pattern.
 */
export function sortCustomCodeRules(rules: CustomCodeRule[]): CustomCodeRule[] {
  return [...rules].sort((a, b) => (a.pattern || '').localeCompare(b.pattern || ''));
}

/**
 * Sort run code rules alphabetically by title.
 */
export function sortRunCodeRules(rules: RunCodeRule[]): RunCodeRule[] {
  return [...rules].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

/**
 * Normalize and sanitize custom code rules from storage or import.
 */
export function normalizeCustomCodeRules(value: unknown): { rules: CustomCodeRule[]; mutated: boolean } {
  const sanitized: CustomCodeRule[] = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        mutated = true;
        return;
      }
      const raw = entry as Record<string, unknown>;
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!isValidUrlPattern(pattern)) {
        mutated = true;
        return;
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId('cjc');
        mutated = true;
      }

      const css = typeof raw.css === 'string' ? raw.css : '';
      const js = typeof raw.js === 'string' ? raw.js : '';
      const raindropId =
        typeof raw.raindropId === 'number' && Number.isSafeInteger(raw.raindropId) && raw.raindropId > 0
          ? raw.raindropId
          : undefined;

      const rule: CustomCodeRule = {
        id,
        raindropId,
        pattern,
        css,
        js,
        disabled: Boolean(raw.disabled),
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };

      sanitized.push(rule);
    });
  }

  return { rules: sortCustomCodeRules(sanitized), mutated };
}

/**
 * Normalize and sanitize run code rules from storage or import.
 */
export function normalizeRunCodeRules(value: unknown): { rules: RunCodeRule[]; mutated: boolean } {
  const sanitized: RunCodeRule[] = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        mutated = true;
        return;
      }
      const raw = entry as Record<string, unknown>;
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      if (!title) {
        mutated = true;
        return;
      }

      const patterns = Array.isArray(raw.patterns)
        ? raw.patterns
            .map((p) => (typeof p === 'string' ? p.trim() : ''))
            .filter((p) => isValidUrlPattern(p))
        : [];

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId('run');
        mutated = true;
      }

      const code = typeof raw.code === 'string' ? raw.code : '';
      const raindropId =
        typeof raw.raindropId === 'number' && Number.isSafeInteger(raw.raindropId) && raw.raindropId > 0
          ? raw.raindropId
          : undefined;

      const rule: RunCodeRule = {
        id,
        raindropId,
        title,
        patterns,
        code,
        disabled: Boolean(raw.disabled),
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };

      sanitized.push(rule);
    });
  }

  return { rules: sortRunCodeRules(sanitized), mutated };
}

export interface ExtractedNenyaRules {
  customCodeRules: CustomCodeRule[];
  runCodeRules: RunCodeRule[];
}

/**
 * Extract CustomCodeRules and RunCodeRules from a full Nenya export file,
 * options backup payload, or single rule export JSON.
 */
export function extractRulesFromNenyaExport(parsed: unknown): ExtractedNenyaRules {
  if (!parsed || typeof parsed !== 'object') {
    return { customCodeRules: [], runCodeRules: [] };
  }

  // If top-level is an array:
  if (Array.isArray(parsed)) {
    const looksLikeRunCode = parsed.some(
      (item) => item && typeof item === 'object' && 'title' in item && ('code' in item || 'patterns' in item)
    );
    if (looksLikeRunCode) {
      const { rules } = normalizeRunCodeRules(parsed);
      return { customCodeRules: [], runCodeRules: rules };
    }
    const { rules } = normalizeCustomCodeRules(parsed);
    return { customCodeRules: rules, runCodeRules: [] };
  }

  const root = parsed as Record<string, any>;
  // Support both { version: 1, data: { ... } } and direct payload { ... }
  const data = root.data && typeof root.data === 'object' ? root.data : root;

  let rawCustom = data.customCodeRules ?? root.customCodeRules;
  let rawRun = data.runCodeInPageRules ?? data.runCodeRules ?? root.runCodeInPageRules ?? root.runCodeRules;

  // Single rule JSON object fallback:
  if (!rawCustom && !rawRun) {
    if ('pattern' in root && ('css' in root || 'js' in root)) {
      rawCustom = [root];
    } else if ('title' in root && 'code' in root) {
      rawRun = [root];
    }
  }

  const { rules: customCodeRules } = normalizeCustomCodeRules(rawCustom);
  const { rules: runCodeRules } = normalizeRunCodeRules(rawRun);

  return { customCodeRules, runCodeRules };
}

/**
 * Merge newly imported rules into existing rules without duplicate IDs.
 */
export function mergeCustomCodeRules(
  existing: CustomCodeRule[],
  incoming: CustomCodeRule[]
): { merged: CustomCodeRule[]; addedCount: number; addedRules: CustomCodeRule[] } {
  const existingIds = new Set(existing.map((r) => r.id));
  const merged = [...existing];
  const addedRules: CustomCodeRule[] = [];

  incoming.forEach((rule) => {
    let target = { ...rule };
    if (existingIds.has(target.id)) {
      target.id = generateRuleId('cjc');
      delete target.raindropId;
    }
    existingIds.add(target.id);
    merged.push(target);
    addedRules.push(target);
  });

  return { merged: sortCustomCodeRules(merged), addedCount: addedRules.length, addedRules };
}

/**
 * Merge newly imported run code snippets into existing snippets without duplicate IDs.
 */
export function mergeRunCodeRules(
  existing: RunCodeRule[],
  incoming: RunCodeRule[]
): { merged: RunCodeRule[]; addedCount: number; addedRules: RunCodeRule[] } {
  const existingIds = new Set(existing.map((r) => r.id));
  const merged = [...existing];
  const addedRules: RunCodeRule[] = [];

  incoming.forEach((rule) => {
    let target = { ...rule };
    if (existingIds.has(target.id)) {
      target.id = generateRuleId('run');
      delete target.raindropId;
    }
    existingIds.add(target.id);
    merged.push(target);
    addedRules.push(target);
  });

  return { merged: sortRunCodeRules(merged), addedCount: addedRules.length, addedRules };
}
