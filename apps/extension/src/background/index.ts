import {
  initFloatingPanels,
  handleFloatingPanelsMessage,
} from "./floatingPanels";
import { initExtensionActionBehavior } from "./extensionAction";
import browser from "webextension-polyfill";
import type {
  ExtensionMessage,
  ExtensionResponse,
  RaindropAuthState,
  CustomCodeRule,
} from "@arcable/shared/types";
import {
  fetchRaindropUser,
  matchUrlPattern,
  setRaindropTokenResolver,
  getRaindropTokenExpiresAt,
  RaindropReauthenticationError,
} from "@arcable/shared/utils";
import { applyRuleOperations, withConfigurationStorage, writeConfiguration } from "./localRules";
import { createConfigurationSync } from "./configSync";
import { CONFIG_KEYS } from "./configSnapshots";
import {
  createRaindropSessionManager,
  refreshExtensionRaindropToken,
} from "./raindropSession";

import {
  initRunCodeBackgroundListeners,
  executeAutomaticCustomCode,
  runCodeInPageRule,
  CUSTOM_CODE_STORAGE_KEY,
} from "./runCodeRunner";
import { initContextMenuListeners } from "./contextMenus";
import { handleScreenshotCapture } from "./screenshot";
import { handleCopyOperation } from "./clipboard";
import {
  checkUserScriptsAvailable,
  openExtensionDetailsPage,
  isInternalOrExtensionUrl,
} from "../utils/browser";
import {
  initHideScrollbarsBackground,
  applyHideScrollbars,
} from "./hideScrollbars";
import { initAutoPipBackground } from "./autoPip";
import {
  initTabSwitcherBackground,
  handleTabSwitcherMessage,
  type TabSwitcherResponse,
} from "./tabSwitcher";

console.log(
  "[Arcable Extension] Background service worker / script initialized.",
);

// Initialize user scripts, context menu, and auto-PiP listeners
initRunCodeBackgroundListeners();
initContextMenuListeners();
initAutoPipBackground();
initHideScrollbarsBackground();
initTabSwitcherBackground();

// Initialize keyboard shortcut commands (manifest commands)
if (typeof chrome !== "undefined" && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "copy-url") {
      void handleCopyOperation("url");
      return;
    }

    if (command === "copy-title-dash-url") {
      void handleCopyOperation("title-dash-url");
      return;
    }

    if (command === "copy-title-url") {
      void handleCopyOperation("title-url");
      return;
    }

    if (command === "copy-markdown-link") {
      void handleCopyOperation("markdown-link");
      return;
    }

    if (command === "copy-title") {
      void handleCopyOperation("title");
      return;
    }

    if (command === "take-screenshot" || command === "copy-screenshot") {
      void (async () => {
        try {
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          const activeTab = tabs[0];
          if (activeTab?.id) {
            await handleScreenshotCapture(activeTab.id, "viewport");
          }
        } catch (err) {
          console.warn("[screenshot] Command take-screenshot error:", err);
        }
      })();
      return;
    }

    if (
      command === "capture-full-page" ||
      command === "copy-full-page-screenshot"
    ) {
      void (async () => {
        try {
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          const activeTab = tabs[0];
          if (activeTab?.id) {
            await handleScreenshotCapture(activeTab.id, "fullpage");
          }
        } catch (err) {
          console.warn("[screenshot] Command capture-full-page error:", err);
        }
      })();
      return;
    }
  });
}

// Storage keys
const STORAGE_KEY_AUTH = "arcable_raindrop_auth";
const STORAGE_KEY_TOKEN = "arcable_token";
const STORAGE_KEY_CONFIG = "arcable_config";
const STORAGE_KEY_DEVICE_ID = "arcable_device_id";
const STORAGE_KEY_DEVICE_NAME = "arcable_device_name";
const STORAGE_KEY_OS_THEME = "arcable_os_theme";

/**
 * Detect and synchronize the OS / browser theme across extension contexts.
 * In Gecko (Firefox / Zen Browser), the background script runs as a top-level page
 * where window.matchMedia('(prefers-color-scheme: dark)') accurately reflects the
 * host operating system's color scheme, completely decoupled from sidebar containers.
 */
function initBackgroundThemeSync(): void {
  const syncTheme = async (isDark: boolean) => {
    try {
      await browser.storage.local.set({
        [STORAGE_KEY_OS_THEME]: isDark ? "dark" : "light",
      });
    } catch {}
  };

  // Check window.matchMedia for host OS theme (Firefox / Gecko background page)
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    try {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      void syncTheme(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        void syncTheme(e.matches);
      };

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleChange);
      } else if (typeof (mediaQuery as any).addListener === "function") {
        (mediaQuery as any).addListener(handleChange);
      }
    } catch (e) {
      console.warn(
        "[Arcable Background] Failed to init matchMedia theme sync:",
        e,
      );
    }
  }
}

// Initial theme sync on background initialization
initBackgroundThemeSync();

// In-memory cached auth state
let cachedAuthState: RaindropAuthState = { isAuthenticated: false };
initExtensionActionBehavior(getStoredAuthState);

// Load stored auth state on startup
async function loadStoredAuthState(
  forceRefresh = false,
): Promise<RaindropAuthState> {
  if (cachedAuthState.isAuthenticated && !forceRefresh) {
    return cachedAuthState;
  }

  const stored = await browser.storage.local.get([
    STORAGE_KEY_AUTH,
    STORAGE_KEY_TOKEN,
    STORAGE_KEY_CONFIG,
  ]);

  // 1. Check for stored OAuth session
  if (stored[STORAGE_KEY_AUTH]) {
    const auth = stored[STORAGE_KEY_AUTH] as RaindropAuthState;
    if (auth.reauthenticationRequired) {
      cachedAuthState = auth;
      return auth;
    }
    if (auth.isAuthenticated && auth.accessToken) {
      cachedAuthState = auth;
      return cachedAuthState;
    }
  }

  // 2. Fallback: check for standalone API token
  const token =
    typeof (stored as any)[STORAGE_KEY_TOKEN] === "string"
      ? (stored as any)[STORAGE_KEY_TOKEN]
      : "";
  if (token) {
    try {
      const user = await fetchRaindropUser(token, { skipAuthRefresh: true });
      if (user) {
        cachedAuthState = {
          isAuthenticated: true,
          authType: "token",
          accessToken: token,
          user,
        };
        await browser.storage.local.set({
          [STORAGE_KEY_AUTH]: cachedAuthState,
        });
        return cachedAuthState;
      }
    } catch (e) {
      console.warn("[Arcable Background] Failed to validate stored token:", e);
    }
  }

  cachedAuthState = { isAuthenticated: false };
  return cachedAuthState;
}

// Persist auth state to local storage
async function saveAuthState(auth: RaindropAuthState): Promise<void> {
  cachedAuthState = auth;
  await browser.storage.local.set({ [STORAGE_KEY_AUTH]: auth });
  if (auth.accessToken) {
    await browser.storage.local.set({ [STORAGE_KEY_TOKEN]: auth.accessToken });
  }
}

// Clear auth state
async function clearAuthState(): Promise<void> {
  cachedAuthState = { isAuthenticated: false };
  await browser.storage.local.remove([STORAGE_KEY_AUTH, STORAGE_KEY_TOKEN]);
}

const raindropSession = createRaindropSessionManager({
  load: () => loadStoredAuthState(),
  save: saveAuthState,
  refresh: refreshExtensionRaindropToken,
  invalidate: async () => {
    cachedAuthState = {
      isAuthenticated: false,
      reauthenticationRequired: true,
    };
    await browser.storage.local.set({ [STORAGE_KEY_AUTH]: cachedAuthState });
    await browser.storage.local.remove(STORAGE_KEY_TOKEN);
  },
});
setRaindropTokenResolver((token, force) =>
  raindropSession.resolve(token, force),
);

async function getStoredAuthState(
  forceRefresh = false,
): Promise<RaindropAuthState> {
  const auth = await loadStoredAuthState(forceRefresh);
  if (auth.isAuthenticated && auth.accessToken) {
    try {
      await raindropSession.resolve(auth.accessToken);
    } catch (error) {
      if (!(error instanceof RaindropReauthenticationError)) {
        // Keep the session visible during outages. The actual API call will
        // report renewal failure through its normal error response.
        console.warn(
          "[Arcable Background] Raindrop session renewal is temporarily unavailable.",
        );
      }
    }
  }
  return cachedAuthState;
}

// Process OAuth tokens received via bridge or launchWebAuthFlow
async function processOAuthTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<RaindropAuthState | null> {
  if (!tokens || !tokens.access_token) return null;

  const user = await fetchRaindropUser(tokens.access_token, {
    skipAuthRefresh: true,
  });
  if (!user) return null;

  const authState: RaindropAuthState = {
    isAuthenticated: true,
    authType: "oauth",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: getRaindropTokenExpiresAt(tokens),
    user,
  };

  await saveAuthState(authState);
  return authState;
}

initFloatingPanels();

// Listen for internal messages from Options or content scripts
browser.runtime.onMessage.addListener(
  async (
    rawMessage: any,
    sender: any,
  ): Promise<ExtensionResponse | TabSwitcherResponse> => {
    const panelResponse = handleFloatingPanelsMessage(rawMessage, sender);
    if (panelResponse) return panelResponse;
    const switcherResponse = handleTabSwitcherMessage(rawMessage, sender);
    if (switcherResponse) return switcherResponse;
    if (rawMessage?.type === "ARCABLE_APPLY_HIDE_SCROLLBARS") {
      if (sender.tab?.id === undefined) return { success: false };
      await applyHideScrollbars({
        tabId: sender.tab.id,
        frameIds: [sender.frameId ?? 0],
      });
      return { success: true };
    }
    const message = rawMessage as ExtensionMessage;

    if (rawMessage?.type === "RAINDROP_RESOLVE_TOKEN") {
      try {
        return {
          success: true,
          data: await raindropSession.resolve(
            rawMessage.payload?.token || "",
            Boolean(rawMessage.payload?.forceRefresh),
          ),
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not renew Raindrop session.",
          reauthenticationRequired:
            error instanceof RaindropReauthenticationError,
        } as ExtensionResponse;
      }
    }

    // Handle OAuth bridge event from content script
    if (rawMessage && rawMessage.type === "oauth_bridge_success") {
      const auth = await processOAuthTokens(rawMessage.tokens);
      return { success: Boolean(auth), data: auth };
    }

    if (!message || !message.type) {
      return { success: false, error: "Invalid message structure" };
    }

    switch (message.type) {
      case "INJECT_CUSTOM_JS": {
        const payload = message.payload as
          { ruleId?: string; code?: string } | undefined;
        const tabId = sender?.tab?.id;
        if (
          typeof tabId !== "number" ||
          sender.frameId !== 0 ||
          !sender.url ||
          !payload?.ruleId
        ) {
          return {
            success: false,
            error: "Custom JavaScript requires a top-level page and a rule ID.",
          };
        }
        try {
          const stored = await browser.storage.local.get(
            CUSTOM_CODE_STORAGE_KEY,
          );
          const rules = stored[CUSTOM_CODE_STORAGE_KEY];
          const rule = Array.isArray(rules)
            ? rules.find((item: CustomCodeRule) => item.id === payload.ruleId)
            : undefined;
          if (
            !rule ||
            rule.disabled ||
            !rule.js?.trim() ||
            rule.js !== payload.code ||
            !matchUrlPattern(rule.pattern, sender.url)
          ) {
            return {
              success: false,
              error:
                "The custom JavaScript rule is missing, disabled, changed, or does not match this page.",
            };
          }
          await executeAutomaticCustomCode(tabId, rule.js, sender.documentId);
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || String(err) };
        }
      }

      case "GET_OS_THEME": {
        let isDark = false;
        if (
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function"
        ) {
          isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        } else {
          const stored = await browser.storage.local.get(STORAGE_KEY_OS_THEME);
          isDark = stored[STORAGE_KEY_OS_THEME] === "dark";
        }
        return {
          success: true,
          data: { isDark, theme: isDark ? "dark" : "light" },
        };
      }

      case "RUN_CODE_IN_PAGE_EXECUTE": {
        const payload = message.payload as
          { ruleId?: string; tabId?: number } | undefined;
        try {
          const result = await runCodeInPageRule(
            String(payload?.ruleId || ""),
            Number(payload?.tabId),
          );
          return { success: true, data: result };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Failed to run code in page.",
          };
        }
      }

      case "CHECK_USER_SCRIPTS_AVAILABLE": {
        const available = await checkUserScriptsAvailable();
        return { success: true, data: { available } };
      }

      case "OPEN_EXTENSION_DETAILS_PAGE": {
        await openExtensionDetailsPage();
        return { success: true };
      }

      case "TAKE_SCREENSHOT": {
        const payload = message.payload as { tabId?: number } | undefined;
        let tabId = payload?.tabId;
        if (!tabId) {
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          tabId = tabs[0]?.id;
        }
        if (typeof tabId === "number") {
          const ok = await handleScreenshotCapture(tabId, "viewport");
          return { success: ok };
        }
        return { success: false, error: "No active tab found" };
      }

      case "CAPTURE_FULL_PAGE": {
        const payload = message.payload as { tabId?: number } | undefined;
        let tabId = payload?.tabId;
        if (!tabId) {
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          tabId = tabs[0]?.id;
        }
        if (typeof tabId === "number") {
          const ok = await handleScreenshotCapture(tabId, "fullpage");
          return { success: ok };
        }
        return { success: false, error: "No active tab found" };
      }

      // Raindrop: Get current authentication state
      case "RAINDROP_GET_AUTH_STATE": {
        const auth = await getStoredAuthState();
        return { success: true, data: auth };
      }

      // Raindrop: Login via manual API Token
      case "RAINDROP_LOGIN_TOKEN": {
        const token = (message.payload as { token: string })?.token?.trim();
        if (!token) {
          return { success: false, error: "Token is required" };
        }

        const user = await fetchRaindropUser(token, { skipAuthRefresh: true });
        if (!user) {
          return {
            success: false,
            error: "Invalid Raindrop token or user fetch failed",
          };
        }

        const authState: RaindropAuthState = {
          isAuthenticated: true,
          authType: "token",
          accessToken: token,
          user,
        };

        await saveAuthState(authState);
        return { success: true, data: authState };
      }

      // Raindrop: Start OAuth flow
      case "RAINDROP_START_OAUTH": {
        try {
          const extensionId = browser.runtime.id;
          const statePayload = {
            extensionId,
            fromExt: true,
            provider: "raindrop",
          };
          const stateStr = encodeURIComponent(JSON.stringify(statePayload));
          const authUrl = `https://oh-auth.vercel.app/auth/raindrop?state=${stateStr}`;

          // Try launchWebAuthFlow if identity API is supported
          if (
            typeof chrome !== "undefined" &&
            chrome.identity &&
            chrome.identity.launchWebAuthFlow
          ) {
            try {
              const redirectUrl = await new Promise<string | undefined>(
                (resolve, reject) => {
                  chrome.identity.launchWebAuthFlow(
                    { url: authUrl, interactive: true },
                    (responseUrl) => {
                      if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                      } else {
                        resolve(responseUrl);
                      }
                    },
                  );
                },
              );

              if (redirectUrl) {
                // Parse access token / code from redirect url if returned directly
                const url = new URL(redirectUrl);
                const hashParams = new URLSearchParams(
                  url.hash.replace(/^#/, ""),
                );
                const token =
                  hashParams.get("access_token") ||
                  url.searchParams.get("access_token");
                const refreshToken =
                  hashParams.get("refresh_token") ||
                  url.searchParams.get("refresh_token");
                const expiresIn =
                  hashParams.get("expires_in") ||
                  url.searchParams.get("expires_in");
                if (token) {
                  const auth = await processOAuthTokens({
                    access_token: token,
                    refresh_token: refreshToken || undefined,
                    expires_in: Number(expiresIn) || 1209600,
                  });
                  return { success: Boolean(auth), data: auth };
                }
              }

              // Check if token was received via external message / bridge during the flow
              const currentAuth = await getStoredAuthState();
              if (currentAuth.isAuthenticated) {
                return { success: true, data: currentAuth };
              }

              return { success: true };
            } catch (authErr: any) {
              console.warn(
                "[Arcable] launchWebAuthFlow finished/failed:",
                authErr,
              );
              // Check if token was received before reporting error or user cancellation
              const currentAuth = await getStoredAuthState();
              if (currentAuth.isAuthenticated) {
                return { success: true, data: currentAuth };
              }
              return {
                success: false,
                error: authErr?.message || "OAuth flow was cancelled or failed",
              };
            }
          }

          // Fallback if identity API is completely unavailable: open auth provider URL
          await browser.tabs.create({ url: authUrl });
          return { success: true, data: { status: "opened_tab" } };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Failed to initiate OAuth flow",
          };
        }
      }

      // Raindrop: Logout
      case "RAINDROP_LOGOUT": {
        await clearAuthState();
        return { success: true };
      }

      case "ARCABLE_UPDATE_CONFIGURATION": {
        if (!sender.url?.startsWith(browser.runtime.getURL(""))) return { success: false };
        const patch = rawMessage.patch;
        if (!patch || typeof patch !== "object" || Object.keys(patch).some(key => !CONFIG_KEYS.includes(key)))
          return { success: false, error: "Invalid configuration update" };
        await withConfigurationStorage(() => writeConfiguration(patch));
        return { success: true };
      }
      case "ARCABLE_APPLY_RULE_OPS": {
        if (!sender.url?.startsWith(browser.runtime.getURL("")))
          return { success: false };
        await applyRuleOperations(rawMessage.operations);
        return { success: true };
      }
      default:
        return {
          success: false,
          error: `Unknown message type: ${message.type}`,
        };
    }
  },
);

// Listen for external messages (e.g. from web app OAuth redirect)
if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.onMessageExternal
) {
  chrome.runtime.onMessageExternal.addListener(
    (message, _sender, sendResponse) => {
      if (message && message.type === "oauth_success") {
        void processOAuthTokens(message.tokens).then((auth) => {
          if (sendResponse) {
            sendResponse({ success: Boolean(auth), auth });
          }
        });
        return true;
      }
      return false;
    },
  );
}

// Keep auth and automatic code rules in sync with extension storage changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.arcable_raindrop_auth) {
      const newAuth = changes.arcable_raindrop_auth.newValue as
        RaindropAuthState | undefined;
      cachedAuthState = newAuth || { isAuthenticated: false };
    } else if (changes.arcable_token || changes.arcable_config) {
      void getStoredAuthState(true).then((auth) => {});
    }

    if (changes[CUSTOM_CODE_STORAGE_KEY]) {
      const updatedRules = (changes[CUSTOM_CODE_STORAGE_KEY].newValue ||
        []) as CustomCodeRule[];
      void browser.tabs
        .query({})
        .then((tabs) => {
          for (const tab of tabs) {
            if (
              tab.id !== undefined &&
              tab.url &&
              !isInternalOrExtensionUrl(tab.url)
            ) {
              void browser.tabs
                .sendMessage(tab.id, {
                  type: "ARCABLE_CUSTOM_CODE_RULES_UPDATED",
                  rules: updatedRules,
                })
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
    }
  }
});

// Runs independently of Options, including MV3 worker restarts.
createConfigurationSync(() => getStoredAuthState()).start();
