import browser from 'webextension-polyfill';
import {
  RunCodeRule,
  RunCodeBackgroundFetchMessage,
  SerializedFetchResponse,
} from '@arcable/shared/types';

export const RUN_CODE_BACKGROUND_FETCH_MESSAGE = 'runCodeInPage:backgroundFetch';
export const RUN_CODE_IN_PAGE_STORAGE_KEY = 'runCodeInPageRules';
export const CUSTOM_CODE_STORAGE_KEY = 'customCodeRules';

import { isFirefox, isBrave } from '../utils/browser';

const ALLOWED_BACKGROUND_FETCH_INIT_KEYS = new Set([
  'body',
  'cache',
  'credentials',
  'headers',
  'integrity',
  'keepalive',
  'method',
  'redirect',
  'referrer',
  'referrerPolicy',
]);

const ALLOWED_BACKGROUND_FETCH_CREDENTIALS = new Set([
  'include',
  'omit',
  'same-origin',
]);

const ALLOWED_BACKGROUND_FETCH_CACHE = new Set([
  'default',
  'force-cache',
  'no-cache',
  'no-store',
  'only-if-cached',
  'reload',
]);

const ALLOWED_BACKGROUND_FETCH_REDIRECT = new Set([
  'error',
  'follow',
  'manual',
]);

const ALLOWED_BACKGROUND_FETCH_REFERRER_POLICY = new Set([
  '',
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

const RUN_CODE_BACKGROUND_FETCH_SETUP_ERROR = isFirefox()
  ? 'Arcable background fetch is unavailable. Confirm the "Run user scripts" permission is granted.'
  : 'Arcable background fetch is unavailable. Confirm "Allow User Scripts" is enabled.';

function buildRunCodeHelperPrelude(backgroundFetchAvailable: boolean): string {
  return [
    `const __arcableBackgroundFetchMessageType = ${JSON.stringify(RUN_CODE_BACKGROUND_FETCH_MESSAGE)};`,
    `const __arcableBackgroundFetchSetupError = ${JSON.stringify(RUN_CODE_BACKGROUND_FETCH_SETUP_ERROR)};`,
    `const __arcableBackgroundFetchEnabled = ${backgroundFetchAvailable ? 'true' : 'false'};`,
    'async function __arcableSerializeFetchBody(body) {',
    '  if (body == null) return null;',
    '  if (typeof body === "string") return { kind: "text", value: body };',
    '  if (body instanceof URLSearchParams) return { kind: "text", value: body.toString() };',
    '  if (body instanceof ArrayBuffer) return { kind: "bytes", value: Array.from(new Uint8Array(body)) };',
    '  if (ArrayBuffer.isView(body)) return { kind: "bytes", value: Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)) };',
    '  if (typeof Blob !== "undefined" && body instanceof Blob) {',
    '    const bytes = new Uint8Array(await body.arrayBuffer());',
    '    return { kind: "bytes", value: Array.from(bytes) };',
    '  }',
    '  if (typeof FormData !== "undefined" && body instanceof FormData) {',
    '    const pairs = [];',
    '    for (const [k, v] of body.entries()) {',
    '      if (typeof v === "string") pairs.push([k, v]);',
    '      else if (v instanceof Blob) {',
    '        const bytes = Array.from(new Uint8Array(await v.arrayBuffer()));',
    '        pairs.push([k, { name: v.name, type: v.type, bytes }]);',
    '      }',
    '    }',
    '    return { kind: "formdata", value: pairs };',
    '  }',
    '  throw new Error("Unsupported body type for background fetch.");',
    '}',
    'function __arcableSerializeFetchHeaders(headers) {',
    '  if (!headers) return [];',
    '  if (typeof Headers !== "undefined" && headers instanceof Headers) return Array.from(headers.entries());',
    '  if (Array.isArray(headers)) return headers.map(e => [String(e[0]), String(e[1])]);',
    '  if (typeof headers === "object") return Object.entries(headers).map(([k, v]) => [String(k), String(v)]);',
    '  throw new Error("Invalid headers for background fetch.");',
    '}',
    'async function __arcableNormalizeFetchInit(init) {',
    '  if (!init) return {};',
    '  if (typeof init !== "object" || Array.isArray(init)) throw new Error("Init must be an object.");',
    '  const next = {};',
    '  if (init.method != null) next.method = String(init.method);',
    '  if (init.headers !== undefined) next.headers = __arcableSerializeFetchHeaders(init.headers);',
    '  if (Object.prototype.hasOwnProperty.call(init, "body")) next.body = await __arcableSerializeFetchBody(init.body);',
    '  if (init.credentials != null) next.credentials = String(init.credentials);',
    '  if (init.cache != null) next.cache = String(init.cache);',
    '  if (init.redirect != null) next.redirect = String(init.redirect);',
    '  if (init.referrer != null) next.referrer = String(init.referrer);',
    '  if (init.referrerPolicy != null) next.referrerPolicy = String(init.referrerPolicy);',
    '  if (init.integrity != null) next.integrity = String(init.integrity);',
    '  if (init.keepalive != null) next.keepalive = Boolean(init.keepalive);',
    '  return next;',
    '}',
    'function __arcableBuildFetchResponse(payload) {',
    '  const bodyText = typeof payload?.bodyText === "string" ? payload.bodyText : "";',
    '  const headers = new Headers(payload?.headers && typeof payload.headers === "object" ? payload.headers : {});',
    '  return {',
    '    ok: Boolean(payload?.ok),',
    '    status: Number.isFinite(payload?.status) ? payload.status : 0,',
    '    statusText: typeof payload?.statusText === "string" ? payload.statusText : "",',
    '    url: typeof payload?.url === "string" ? payload.url : "",',
    '    redirected: Boolean(payload?.redirected),',
    '    headers,',
    '    text() { return Promise.resolve(bodyText); },',
    '    json() { return Promise.resolve().then(() => JSON.parse(bodyText)); },',
    '    clone() { return __arcableBuildFetchResponse(payload); },',
    '  };',
    '}',
    'const __arcableFetchFn = async function arcableFetch(input, init) {',
    '  if (!__arcableBackgroundFetchEnabled) throw new Error(__arcableBackgroundFetchSetupError);',
    '  const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input?.url ? String(input.url) : "";',
    '  if (!url) throw new Error("Background fetch requires an absolute URL string.");',
    '  if (!chrome?.runtime?.sendMessage) throw new Error(__arcableBackgroundFetchSetupError);',
    '  const response = await chrome.runtime.sendMessage({',
    '    type: __arcableBackgroundFetchMessageType,',
    '    url,',
    '    init: await __arcableNormalizeFetchInit(init),',
    '  });',
    '  if (!response || response.ok !== true) {',
    '    throw new Error(typeof response?.error === "string" ? response.error : "Background fetch failed.");',
    '  }',
    '  return __arcableBuildFetchResponse(response.response);',
    '};',
    'globalThis.arcableFetch = __arcableFetchFn;',
    'globalThis.nenyaFetch = __arcableFetchFn;',
  ].join('\n');
}

function sanitizeSourceName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function buildUserScriptCode(
  code: string,
  consoleLabel: string,
  sourceName: string,
  backgroundFetchAvailable: boolean
): string {
  return [
    '(async function() {',
    buildRunCodeHelperPrelude(backgroundFetchAvailable),
    '  try {',
    code,
    '  } catch (error) {',
    `    console.error(${JSON.stringify(consoleLabel)}, error);`,
    '  }',
    '})();',
    `//# sourceURL=${sourceName}`,
  ].join('\n');
}

async function configureManualUserScriptWorld(userScripts: any): Promise<boolean> {
  if (!userScripts || typeof userScripts.configureWorld !== 'function') {
    return false;
  }
  try {
    await userScripts.configureWorld({ messaging: true });
    return true;
  } catch (err) {
    console.warn('[runCodeRunner] Failed to configure userScript messaging world:', err);
    return false;
  }
}

async function ensureManualUserScriptPermission(): Promise<void> {
  if (!isFirefox()) return;

  const permission = { permissions: ['userScripts'] } as any;
  const alreadyGranted = await browser.permissions.contains(permission);
  if (alreadyGranted) return;

  const granted = await browser.permissions.request(permission);
  if (!granted) {
    throw new Error('Arcable Run Code requires the "Run user scripts" permission. Please grant it to run this snippet.');
  }
}

/**
 * Execute manual code in CSP-exempt user script world.
 */
export async function executeManualUserCode(
  tabId: number,
  code: string,
  consoleLabel = '[Arcable RunCode] Execution error:',
  sourceName = 'arcable-user-code.js'
): Promise<void> {
  const setupMessage = isFirefox()
    ? 'Arcable Run Code requires the "Run user scripts" permission. Please enable it in about:addons.'
    : isBrave()
    ? 'Arcable Run Code requires Brave user scripts. Please enable "Allow user scripts" on the extension details page (brave://extensions).'
    : 'Arcable Run Code requires Chrome user scripts. Please enable "Allow User Scripts" on the extension details page (chrome://extensions) or enable Developer Mode.';

  await ensureManualUserScriptPermission();

  let userScripts: any = null;
  try {
    userScripts = (chrome as any).userScripts;
  } catch {
    userScripts = null;
  }

  if (!userScripts || typeof userScripts.execute !== 'function') {
    throw new Error(setupMessage);
  }

  try {
    const backgroundFetchAvailable = await configureManualUserScriptWorld(userScripts);
    await userScripts.execute({
      target: { tabId },
      world: 'USER_SCRIPT',
      injectImmediately: true,
      js: [
        {
          code: buildUserScriptCode(
            code,
            consoleLabel,
            sanitizeSourceName(sourceName),
            backgroundFetchAvailable
          ),
        },
      ],
    });
  } catch (err: any) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${setupMessage} (Detail: ${detail})`);
  }
}

/**
 * Execute automatic custom code in page context (MAIN world).
 */
export async function executeAutomaticCustomCode(
  tabId: number,
  code: string,
  consoleLabel = '[Arcable CustomCode] Execution error:'
): Promise<void> {
  if (!code || !code.trim()) {
    throw new Error('Custom code contains no JavaScript.');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (jsCode: string, label: string) => {
      try {
        (0, eval)(jsCode);
        return { success: true };
      } catch (error: any) {
        console.error(label, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    args: [code, consoleLabel],
  });

  const failedResult = results.find((result) => result.result && result.result.success === false);
  if (failedResult?.result?.error) {
    throw new Error(failedResult.result.error);
  }
}

function normalizeBackgroundFetchUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Background fetch URL is required.');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Background fetch URL must be a valid absolute URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Background fetch only supports HTTP and HTTPS URLs.');
  }
  return parsed.toString();
}

function buildBackgroundFetchInit(rawInit?: RunCodeBackgroundFetchMessage['init']): RequestInit {
  if (!rawInit) return {};
  const init: RequestInit = {};

  if (rawInit.method != null) {
    init.method = String(rawInit.method).toUpperCase();
  }

  if (Array.isArray(rawInit.headers)) {
    const headers = new Headers();
    rawInit.headers.forEach(([k, v]) => {
      if (k) headers.append(k, v);
    });
    init.headers = headers;
  }

  if (rawInit.body) {
    if (rawInit.body.kind === 'text') {
      init.body = String(rawInit.body.value);
    } else if (rawInit.body.kind === 'bytes' && Array.isArray(rawInit.body.value)) {
      init.body = new Uint8Array(rawInit.body.value);
    }
  }

  if (rawInit.credentials != null && ALLOWED_BACKGROUND_FETCH_CREDENTIALS.has(rawInit.credentials)) {
    init.credentials = rawInit.credentials;
  }
  if (rawInit.cache != null && ALLOWED_BACKGROUND_FETCH_CACHE.has(rawInit.cache)) {
    init.cache = rawInit.cache;
  }
  if (rawInit.redirect != null && ALLOWED_BACKGROUND_FETCH_REDIRECT.has(rawInit.redirect)) {
    init.redirect = rawInit.redirect;
  }
  if (rawInit.referrer != null) {
    init.referrer = String(rawInit.referrer);
  }
  if (rawInit.referrerPolicy != null && ALLOWED_BACKGROUND_FETCH_REFERRER_POLICY.has(rawInit.referrerPolicy)) {
    init.referrerPolicy = rawInit.referrerPolicy;
  }
  if (rawInit.integrity != null) {
    init.integrity = String(rawInit.integrity);
  }
  if (rawInit.keepalive != null) {
    init.keepalive = Boolean(rawInit.keepalive);
  }

  return init;
}

export async function executeRunCodeBackgroundFetch(
  message: RunCodeBackgroundFetchMessage
): Promise<SerializedFetchResponse> {
  const url = normalizeBackgroundFetchUrl(message.url);
  const init = buildBackgroundFetchInit(message.init);

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error: any) {
    throw new Error(`Background fetch request failed: ${error?.message || String(error)}`);
  }

  const bodyText = await response.text();
  const headersRecord: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headersRecord[k] = v;
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    redirected: response.redirected,
    headers: headersRecord,
    bodyText,
  };
}

/**
 * Execute a stored Run Code rule on a given tab by ID.
 */
export async function runCodeInPageRule(ruleId: string, tabId: number): Promise<{ title: string }> {
  if (!ruleId) throw new Error('Rule ID is required.');
  if (typeof tabId !== 'number') throw new Error('Valid tab ID is required.');

  const stored = await browser.storage.local.get(RUN_CODE_IN_PAGE_STORAGE_KEY);
  const rules = (stored[RUN_CODE_IN_PAGE_STORAGE_KEY] as RunCodeRule[]) || [];
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) throw new Error('Run Code rule not found.');
  if (!rule.code || !rule.code.trim()) throw new Error('Rule contains no code.');

  await executeManualUserCode(
    tabId,
    rule.code,
    `[Arcable RunCode: ${rule.title}] Script execution error:`,
    `arcable-run-code-${ruleId}.js`
  );

  return { title: rule.title };
}

/**
 * Initialize background user script message listener.
 */
export function initRunCodeBackgroundListeners(): void {
  const runtime = chrome.runtime as any;
  if (runtime && runtime.onUserScriptMessage) {
    runtime.onUserScriptMessage.addListener(
      (message: any, _sender: any, sendResponse: (res: any) => void) => {
        if (!message || message.type !== RUN_CODE_BACKGROUND_FETCH_MESSAGE) {
          return false;
        }

        void (async () => {
          try {
            const response = await executeRunCodeBackgroundFetch(message);
            sendResponse({ ok: true, response });
          } catch (error: any) {
            console.error('[runCodeRunner] Background fetch failed:', error);
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();

        return true;
      }
    );
  }
}
