import browser from 'webextension-polyfill';
import {
  ExtensionMessage,
  ExtensionResponse,
  ArcableItem,
  RaindropAuthState,
  RaindropCreateItemInput,
  ArcableWorkspaceData,
  TmpTab,
  WorkspaceOperation,
  CustomCodeRule,
  RunCodeRule,
} from '@arcable/shared/types';
import {
  fetchRaindropUser,
  fetchRaindropCollections,
  createRaindropBookmark,
  deleteRaindropBookmark,
  uploadRaindropFile,
  fetchRaindropFileContent,
  fetchRaindropItems,
  fetchRaindropItem,
  getRaindropOAuthUrl,
  exchangeRaindropOAuthCode,
  fetchRaindropWorkspace,
  syncWorkspaceWithRaindrop,
  fetchRaindropTmpTabs,
  publishRaindropTmpTabs,
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
  getDefaultDeviceName,
  searchRaindrop,
  searchRaindropCollectionCovers,
  getRaindropRequestFailureDetails,
  isValidHttpUrl,
} from '@arcable/shared/utils';

import {
  initRunCodeBackgroundListeners,
  runCodeInPageRule,
  CUSTOM_CODE_STORAGE_KEY,
  RUN_CODE_IN_PAGE_STORAGE_KEY,
} from './runCodeRunner';
import {
  initContextMenuListeners,
  getMatchingCodeRules,
} from './contextMenus';
import { handleScreenshotCapture } from './screenshot';
import { handleCopyOperation } from './clipboard';
import { reconcileTmpTabsWithBrowserTabs } from '../utils/tmpTabDiff';
import { checkUserScriptsAvailable, openExtensionDetailsPage } from '../utils/browser';

console.log('[Arcable Extension] Background service worker / script initialized.');

// Initialize user scripts and context menu listeners
initRunCodeBackgroundListeners();
initContextMenuListeners();

// Initialize keyboard shortcut commands (manifest commands)
if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'copy-url') {
      void handleCopyOperation('url');
      return;
    }

    if (command === 'copy-title-dash-url') {
      void handleCopyOperation('title-dash-url');
      return;
    }

    if (command === 'copy-title-url') {
      void handleCopyOperation('title-url');
      return;
    }

    if (command === 'copy-markdown-link') {
      void handleCopyOperation('markdown-link');
      return;
    }

    if (command === 'copy-title') {
      void handleCopyOperation('title');
      return;
    }

    if (command === 'take-screenshot' || command === 'copy-screenshot') {
      void (async () => {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (activeTab?.id) {
            await handleScreenshotCapture(activeTab.id, 'viewport');
          }
        } catch (err) {
          console.warn('[screenshot] Command take-screenshot error:', err);
        }
      })();
      return;
    }

    if (command === 'capture-full-page' || command === 'copy-full-page-screenshot') {
      void (async () => {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (activeTab?.id) {
            await handleScreenshotCapture(activeTab.id, 'fullpage');
          }
        } catch (err) {
          console.warn('[screenshot] Command capture-full-page error:', err);
        }
      })();
      return;
    }
  });
}

// Storage keys
const STORAGE_KEY_AUTH = 'arcable_raindrop_auth';
const STORAGE_KEY_TOKEN = 'arcable_token';
const STORAGE_KEY_CONFIG = 'arcable_config';
const STORAGE_KEY_DEVICE_ID = 'arcable_device_id';
const STORAGE_KEY_DEVICE_NAME = 'arcable_device_name';
const STORAGE_KEY_OS_THEME = 'arcable_os_theme';

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
        [STORAGE_KEY_OS_THEME]: isDark ? 'dark' : 'light',
      });
    } catch {}
  };

  // Check window.matchMedia for host OS theme (Firefox / Gecko background page)
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      void syncTheme(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        void syncTheme(e.matches);
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange);
      } else if (typeof (mediaQuery as any).addListener === 'function') {
        (mediaQuery as any).addListener(handleChange);
      }
    } catch (e) {
      console.warn('[Arcable Background] Failed to init matchMedia theme sync:', e);
    }
  }
}

// Initial theme sync on background initialization
initBackgroundThemeSync();

// In-memory cached auth state
let cachedAuthState: RaindropAuthState = { isAuthenticated: false };
/**
 * Ensures browser action opens the sidepanel directly when authenticated,
 * or opens the settings/options page when unauthenticated.
 */
async function syncSidePanelBehavior(_isAuthenticated?: boolean): Promise<void> {
  // Let toolbar button click always trigger openSidepanelTab() or native sidebar
  // so the user can see the full sidebar interface immediately.
  if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch {
      // Ignore in non-supported environments
    }
  }
}
void syncSidePanelBehavior();

// Load stored auth state on startup
async function getStoredAuthState(forceRefresh = false): Promise<RaindropAuthState> {
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
    if (auth.isAuthenticated && auth.accessToken) {
      cachedAuthState = auth;
      return cachedAuthState;
    }
  }

  // 2. Fallback: check for standalone API token
  const token = typeof (stored as any)[STORAGE_KEY_TOKEN] === 'string' ? (stored as any)[STORAGE_KEY_TOKEN] : '';
  if (token) {
    try {
      const user = await fetchRaindropUser(token);
      if (user) {
        cachedAuthState = {
          isAuthenticated: true,
          authType: 'token',
          accessToken: token,
          user,
        };
        await browser.storage.local.set({ [STORAGE_KEY_AUTH]: cachedAuthState });
        return cachedAuthState;
      }
    } catch (e) {
      console.warn('[Arcable Background] Failed to validate stored token:', e);
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
  void syncSidePanelBehavior(Boolean(auth && auth.isAuthenticated && auth.accessToken));
}

// Clear auth state
async function clearAuthState(): Promise<void> {
  cachedAuthState = { isAuthenticated: false };
  await browser.storage.local.remove([STORAGE_KEY_AUTH, STORAGE_KEY_TOKEN]);
  void syncSidePanelBehavior(false);
}

/** Fetches Raindrop's tree and atomically replaces the extension cache and outbox. */
async function fetchAndCacheRaindropWorkspace(): Promise<ExtensionResponse<ArcableWorkspaceData>> {
  const auth = await getStoredAuthState();
  if (!auth.isAuthenticated || !auth.accessToken) {
    return { success: false, error: 'Not authenticated with Raindrop' };
  }

  try {
    const stored = await browser.storage.local.get('arcable_workspace_snapshot');
    const currentActiveSpaceId = (stored.arcable_workspace_snapshot as ArcableWorkspaceData | undefined)?.activeSpaceId;

    const result = await fetchRaindropWorkspace(auth.accessToken, currentActiveSpaceId);
    if (!result.success || !result.data) {
      if (result.errorDetails) {
        console.warn('[Arcable Background] Raindrop workspace fetch exhausted transport retries.', result.errorDetails);
      }
      return { success: false, error: result.error || 'Failed to fetch workspace', errorDetails: result.errorDetails };
    }

    await browser.storage.local.set({
      arcable_workspace_snapshot: result.data,
      [CUSTOM_CODE_STORAGE_KEY]: result.data.customCodeRules || [],
      [RUN_CODE_IN_PAGE_STORAGE_KEY]: result.data.runCodeInPageRules || [],
      // A successful startup fetch adopts Raindrop as the source of truth.
      // Keeping an old outbox would replay stale creates on the next sync.
      arcable_pending_ops: [],
      arcable_last_synced_at: Date.now(),
    });
    return { success: true, data: result.data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch workspace' };
  }
}

// Process OAuth tokens received via bridge or launchWebAuthFlow
async function processOAuthTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<RaindropAuthState | null> {
  if (!tokens || !tokens.access_token) return null;

  const user = await fetchRaindropUser(tokens.access_token);
  if (!user) return null;

  const authState: RaindropAuthState = {
    isAuthenticated: true,
    authType: 'oauth',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (Number(tokens.expires_in) || 2592000) * 1000,
    user,
  };

  await saveAuthState(authState);
  void fetchAndCacheRaindropWorkspace();
  return authState;
}

const BACKGROUND_SYNC_DEBOUNCE_MS = 2_000;
// Every extension surface shares this worker. Serialize the actual Raindrop
// request so a popup, side panel, option page, or alarm cannot write the same
// workspace concurrently.
let raindropWorkspaceSyncTail: Promise<void> = Promise.resolve();
let queuedWorkspaceSyncCount = 0;
let isBackgroundSyncInFlight = false;
let isBackgroundSyncQueued = false;
let queuedBackgroundSyncIsPendingOnly = true;
let debouncedSyncTimer: ReturnType<typeof setTimeout> | null = null;

// Listen for internal messages from popup, options, or content scripts
browser.runtime.onMessage.addListener(
  async (rawMessage: any, sender: any): Promise<ExtensionResponse> => {
    const message = rawMessage as ExtensionMessage;

    // Handle OAuth bridge event from content script
    if (rawMessage && rawMessage.type === 'oauth_bridge_success') {
      const auth = await processOAuthTokens(rawMessage.tokens);
      return { success: Boolean(auth), data: auth };
    }

    if (!message || !message.type) {
      return { success: false, error: 'Invalid message structure' };
    }

    switch (message.type) {
      case 'GET_OS_THEME': {
        let isDark = false;
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
          isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else {
          const stored = await browser.storage.local.get(STORAGE_KEY_OS_THEME);
          isDark = stored[STORAGE_KEY_OS_THEME] === 'dark';
        }
        return { success: true, data: { isDark, theme: isDark ? 'dark' : 'light' } };
      }

      case 'RUN_CODE_IN_PAGE_EXECUTE': {
        const payload = message.payload as { ruleId?: string; tabId?: number } | undefined;
        try {
          const result = await runCodeInPageRule(String(payload?.ruleId || ''), Number(payload?.tabId));
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to run code in page.' };
        }
      }

      case 'CHECK_USER_SCRIPTS_AVAILABLE': {
        const available = await checkUserScriptsAvailable();
        return { success: true, data: { available } };
      }

      case 'OPEN_EXTENSION_DETAILS_PAGE': {
        await openExtensionDetailsPage();
        return { success: true };
      }

      case 'TAKE_SCREENSHOT': {
        const payload = message.payload as { tabId?: number } | undefined;
        let tabId = payload?.tabId;
        if (!tabId) {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          tabId = tabs[0]?.id;
        }
        if (typeof tabId === 'number') {
          const ok = await handleScreenshotCapture(tabId, 'viewport');
          return { success: ok };
        }
        return { success: false, error: 'No active tab found' };
      }

      case 'CAPTURE_FULL_PAGE': {
        const payload = message.payload as { tabId?: number } | undefined;
        let tabId = payload?.tabId;
        if (!tabId) {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          tabId = tabs[0]?.id;
        }
        if (typeof tabId === 'number') {
          const ok = await handleScreenshotCapture(tabId, 'fullpage');
          return { success: ok };
        }
        return { success: false, error: 'No active tab found' };
      }

      // Raindrop: Get current authentication state
      case 'RAINDROP_GET_AUTH_STATE': {
        const auth = await getStoredAuthState();
        return { success: true, data: auth };
      }

      // Raindrop: Login via manual API Token
      case 'RAINDROP_LOGIN_TOKEN': {
        const token = (message.payload as { token: string })?.token?.trim();
        if (!token) {
          return { success: false, error: 'Token is required' };
        }

        const user = await fetchRaindropUser(token);
        if (!user) {
          return { success: false, error: 'Invalid Raindrop token or user fetch failed' };
        }

        const authState: RaindropAuthState = {
          isAuthenticated: true,
          authType: 'token',
          accessToken: token,
          user,
        };

        await saveAuthState(authState);
        void fetchAndCacheRaindropWorkspace();
        return { success: true, data: authState };
      }

      // Raindrop: Start OAuth flow
      case 'RAINDROP_START_OAUTH': {
        try {
          const extensionId = browser.runtime.id;
          const statePayload = {
            extensionId,
            fromExt: true,
            provider: 'raindrop',
          };
          const stateStr = encodeURIComponent(JSON.stringify(statePayload));
          const authUrl = `https://oh-auth.vercel.app/auth/raindrop?state=${stateStr}`;

          // Try launchWebAuthFlow if identity API is supported
          if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.launchWebAuthFlow) {
            try {
              const redirectUrl = await new Promise<string | undefined>((resolve, reject) => {
                chrome.identity.launchWebAuthFlow(
                  { url: authUrl, interactive: true },
                  (responseUrl) => {
                    if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                    } else {
                      resolve(responseUrl);
                    }
                  }
                );
              });

              if (redirectUrl) {
                // Parse access token / code from redirect url if returned directly
                const url = new URL(redirectUrl);
                const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
                const token = hashParams.get('access_token') || url.searchParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token') || url.searchParams.get('refresh_token');
                const expiresIn = hashParams.get('expires_in') || url.searchParams.get('expires_in');
                if (token) {
                  const auth = await processOAuthTokens({
                    access_token: token,
                    refresh_token: refreshToken || undefined,
                    expires_in: Number(expiresIn) || 2592000,
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
              console.warn('[Arcable] launchWebAuthFlow finished/failed:', authErr);
              // Check if token was received before reporting error or user cancellation
              const currentAuth = await getStoredAuthState();
              if (currentAuth.isAuthenticated) {
                return { success: true, data: currentAuth };
              }
              return { success: false, error: authErr?.message || 'OAuth flow was cancelled or failed' };
            }
          }

          // Fallback if identity API is completely unavailable: open auth provider URL
          await browser.tabs.create({ url: authUrl });
          return { success: true, data: { status: 'opened_tab' } };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to initiate OAuth flow' };
        }
      }

      // Raindrop: Logout
      case 'RAINDROP_LOGOUT': {
        await clearAuthState();
        return { success: true };
      }

      // Raindrop: Create Bookmark
      case 'RAINDROP_SAVE_BOOKMARK': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const input = (message.payload || {}) as RaindropCreateItemInput;

        // Fallback: if coverDataUrl wasn't provided, attempt to capture active tab screenshot
        if (!input.coverDataUrl && !input.cover?.startsWith('data:')) {
          try {
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.captureVisibleTab) {
              const fallbackCover = await new Promise<string | undefined>((resolve) => {
                chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 }, (dataUrl) => {
                  if (chrome.runtime.lastError || !dataUrl) {
                    resolve(undefined);
                  } else {
                    resolve(dataUrl);
                  }
                });
              });
              if (fallbackCover) {
                input.coverDataUrl = fallbackCover;
              }
            }
          } catch {
            // Ignore capture failure in background
          }
        }

        try {
          const bookmark = await createRaindropBookmark(auth.accessToken, input);
          return { success: true, data: bookmark };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to create bookmark' };
        }
      }

      // Raindrop: Fetch collections
      case 'RAINDROP_GET_COLLECTIONS': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        try {
          const collections = await fetchRaindropCollections(auth.accessToken);
          return { success: true, data: collections };
        } catch (err: any) {
          const errorDetails = getRaindropRequestFailureDetails(err);
          if (errorDetails) {
            console.warn('[Arcable Background] Raindrop collection fetch exhausted transport retries.', errorDetails);
          }
          return { success: false, error: err?.message || 'Failed to fetch collections', errorDetails };
        }
      }

      // Raindrop: Always hydrate the local cache from the Arcable tree before
      // automatic writes are allowed in a newly opened extension surface.
      case 'RAINDROP_FETCH_WORKSPACE': {
        return fetchAndCacheRaindropWorkspace();
      }

      case 'RAINDROP_GET_TMP_TABS': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) return { success: false, error: 'Not authenticated with Raindrop' };
        return fetchRaindropTmpTabs(auth.accessToken);
      }

      // Raindrop: Sync Workspace Data (Spaces, Folders, Tabs Op-Log)
      case 'RAINDROP_SYNC_WORKSPACE': {
        if (debouncedSyncTimer) {
          clearTimeout(debouncedSyncTimer);
          debouncedSyncTimer = null;
        }

        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { localState?: any; deviceId?: string; deviceName?: string; pendingOps?: any[]; replaceBaseline?: boolean } | undefined;
        try {
          const effectiveDeviceId = payload?.deviceId || await getOrCreateExtensionDeviceId();
          const effectiveDeviceName = payload?.deviceName || await getExtensionDeviceName();

          // Keep background worker synchronized with the UI device ID & name
          await browser.storage.local.set({
            arcable_device_id: effectiveDeviceId,
            arcable_device_name: effectiveDeviceName,
          });

          const stored = await browser.storage.local.get([
            'arcable_workspace_snapshot',
            'arcable_tmp_tabs',
            CUSTOM_CODE_STORAGE_KEY,
            RUN_CODE_IN_PAGE_STORAGE_KEY,
            'arcable_pending_ops',
          ]);
          const localTmp = (stored.arcable_tmp_tabs as TmpTab[]) || [];
          const identitySnapshot = stored.arcable_workspace_snapshot as ArcableWorkspaceData | undefined;
          const localCustomRules = stored[CUSTOM_CODE_STORAGE_KEY] as CustomCodeRule[] | undefined;
          const localRunRules = stored[RUN_CODE_IN_PAGE_STORAGE_KEY] as RunCodeRule[] | undefined;
          const storedPendingOps = (stored.arcable_pending_ops as WorkspaceOperation[]) || [];

          // Merge payload pending ops with stored pending ops first, so we
          // know which tmp tab IDs have been deleted by the time we build
          // stateToSync. This prevents a race where the UI deletes a tab but
          // storage hasn't flushed yet and background re-injects the stale entry.
          const opMap = new Map<string, WorkspaceOperation>();
          for (const op of storedPendingOps) {
            opMap.set(op.id, op);
          }
          for (const op of (payload?.pendingOps || [])) {
            opMap.set(op.id, op);
          }
          const combinedPendingOps = Array.from(opMap.values());
          const syncedOpIds = new Set(combinedPendingOps.map((op) => op.id));

          // Collect all entity IDs pending deletion (from UI or stored ops)
          const pendingDeletedTmpIds = new Set<string>(
            combinedPendingOps
              .filter((op) => op.type === 'TMP_TAB_DELETE')
              .map((op) => op.entityId)
          );
          const pendingDeletedCustomCodeIds = new Set<string>(
            combinedPendingOps
              .filter((op) => op.type === 'CUSTOM_CODE_DELETE')
              .map((op) => op.entityId)
          );
          const pendingDeletedRunCodeIds = new Set<string>(
            combinedPendingOps
              .filter((op) => op.type === 'RUN_CODE_DELETE')
              .map((op) => op.entityId)
          );

          const taggedTmp = localTmp
            // Drop tabs that are pending deletion or non-HTTP — they should not be re-uploaded
            .filter((t) => !pendingDeletedTmpIds.has(t.id) && isValidHttpUrl(t.url))
            .map((t) => ({
              ...t,
              deviceId: t.deviceId || effectiveDeviceId,
              deviceName: t.deviceName || effectiveDeviceName,
              deviceType: 'Ext' as const,
            }));

          let stateToSync = payload?.localState || identitySnapshot;
          if (stateToSync) {
            // Also filter deletions from the localState tmpTabs supplied by the UI
            const filteredStateTmpTabs = (stateToSync.tmpTabs || []).filter(
              (t: TmpTab) => !pendingDeletedTmpIds.has(t.id) && isValidHttpUrl(t.url)
            );
            const rawCustomRules = localCustomRules ?? stateToSync.customCodeRules ?? [];
            const rawRunRules = localRunRules ?? stateToSync.runCodeInPageRules ?? [];
            stateToSync = {
              ...stateToSync,
              tmpTabs: taggedTmp.length > 0 ? taggedTmp : filteredStateTmpTabs,
              // Rules are edited in dedicated extension storage. A present empty
              // array is meaningful (it represents deletion), so use nullish
              // fallback rather than truthiness and never let a stale snapshot
              // hide current rule content. Also filter out pending deleted rule IDs.
              customCodeRules: rawCustomRules.filter((r: CustomCodeRule) => !pendingDeletedCustomCodeIds.has(r.id)),
              runCodeInPageRules: rawRunRules.filter((r: RunCodeRule) => !pendingDeletedRunCodeIds.has(r.id)),
            };
          } else {
            stateToSync = {
              activeSpaceId: 'space_personal',
              version: 1,
              spaces: [],
              folders: [],
              tabs: [],
              tmpTabs: taggedTmp,
              customCodeRules: (localCustomRules || []).filter((r: CustomCodeRule) => !pendingDeletedCustomCodeIds.has(r.id)),
              runCodeInPageRules: (localRunRules || []).filter((r: RunCodeRule) => !pendingDeletedRunCodeIds.has(r.id)),
            };
          }

          const result = await syncWorkspaceWithRaindropQueued(auth.accessToken, {
            localState: stateToSync,
            deviceId: effectiveDeviceId,
            deviceName: effectiveDeviceName,
            pendingOps: combinedPendingOps,
            replaceBaseline: payload?.replaceBaseline,
            identitySnapshot,
          });

          if (result.success && result.latestSnapshot) {
            const remoteDeletedOps = (result.syncFile?.operations || [])
              .filter((op: any) => op.type === 'TMP_TAB_DELETE' && op.deviceId !== effectiveDeviceId)
              .map((op: any) => op.entityId);
            const remoteDeletedOpSet = new Set(remoteDeletedOps);
            const deletedTmpTabMap = result.syncFile?.deletedTmpTabIds || {};

            const remainingLocalTmp: TmpTab[] = [];
            for (const localTab of localTmp) {
              if (localTab.browserTabId !== undefined) {
                const isExplicitlyDeletedByRemote = remoteDeletedOpSet.has(localTab.id);
                const tombstoneTime = deletedTmpTabMap[localTab.id];
                // Only honor tombstone if it was deleted after this tab instance was created
                const isTombstoned = Boolean(tombstoneTime && (!localTab.createdAt || localTab.createdAt <= tombstoneTime));

                if (isExplicitlyDeletedByRemote || isTombstoned) {
                  try {
                    await browser.tabs.remove(localTab.browserTabId);
                    console.log(`[Arcable Background] Closed browser tab ${localTab.browserTabId} (${localTab.url}) due to remote deletion.`);
                  } catch {}
                  continue;
                }
              }
              remainingLocalTmp.push(localTab);
            }
            if (remainingLocalTmp.length !== localTmp.length) {
              await browser.storage.local.set({ arcable_tmp_tabs: remainingLocalTmp });
            }

            // Cache latest snapshot and custom code rules in extension storage
            const updates: Record<string, any> = {
              arcable_workspace_snapshot: result.latestSnapshot,
              arcable_last_synced_at: result.syncedAt,
            };
            if (result.latestSnapshot.customCodeRules) {
              updates[CUSTOM_CODE_STORAGE_KEY] = result.latestSnapshot.customCodeRules;
            }
            if (result.latestSnapshot.runCodeInPageRules) {
              updates[RUN_CODE_IN_PAGE_STORAGE_KEY] = result.latestSnapshot.runCodeInPageRules;
            }
            const isInitialSync = !identitySnapshot?.raindropRootCollectionId;
            if (isInitialSync) {
              updates.arcable_pending_ops = [];
            } else if (syncedOpIds.size > 0) {
              const curStored = await browser.storage.local.get('arcable_pending_ops');
              const curOps = (curStored.arcable_pending_ops as WorkspaceOperation[]) || [];
              updates.arcable_pending_ops = curOps.filter((op) => !syncedOpIds.has(op.id));
            }

            await browser.storage.local.set(updates);
            if (debouncedSyncTimer) {
              clearTimeout(debouncedSyncTimer);
              debouncedSyncTimer = null;
            }
          }

          if (!result.success && result.errorDetails) {
            console.warn('[Arcable Background] Raindrop sync exhausted transport retries.', result.errorDetails);
          }
          return { success: result.success, data: result, error: result.error, errorDetails: result.errorDetails };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to sync workspace' };
        }
      }

      // Raindrop: Fetch Devices
      case 'RAINDROP_GET_DEVICES': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { currentDeviceId?: string } | undefined;
        try {
          const effectiveCurrentDeviceId = payload?.currentDeviceId || await getOrCreateExtensionDeviceId();
          const result = await fetchRaindropDevices(auth.accessToken, effectiveCurrentDeviceId);
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to fetch devices' };
        }
      }

      // Raindrop: Rename Device
      case 'RAINDROP_RENAME_DEVICE': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { deviceId: string; newName: string } | undefined;
        if (!payload?.deviceId || !payload?.newName) {
          return { success: false, error: 'deviceId and newName are required' };
        }

        try {
          const result = await renameRaindropDevice(auth.accessToken, payload.deviceId, payload.newName);
          // If the renamed device is this extension, also update local storage
          const currentExtDeviceId = await getOrCreateExtensionDeviceId();
          if (payload.deviceId === currentExtDeviceId) {
            await browser.storage.local.set({ arcable_device_name: payload.newName });
          }
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to rename device' };
        }
      }

      // Raindrop: Delete Device
      case 'RAINDROP_DELETE_DEVICE': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { deviceId: string } | undefined;
        if (!payload?.deviceId) {
          return { success: false, error: 'deviceId is required' };
        }

        try {
          const result = await deleteRaindropDevice(auth.accessToken, payload.deviceId);
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete device' };
        }
      }

      // Raindrop: Delete All Other Devices
      case 'RAINDROP_DELETE_OTHER_DEVICES': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { keepDeviceId?: string } | undefined;
        try {
          const effectiveKeepDeviceId = payload?.keepDeviceId || await getOrCreateExtensionDeviceId();
          const result = await deleteAllOtherRaindropDevices(auth.accessToken, effectiveKeepDeviceId);
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete other devices' };
        }
      }

      // Raindrop: Search Bookmarks
      case 'RAINDROP_SEARCH': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { query: string; page?: number; perPage?: number };
        try {
          const result = await searchRaindrop(auth.accessToken, payload.query, { perpage: payload.perPage });
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to search Raindrop' };
        }
      }

      // Raindrop: Search collection covers without exposing the OAuth token to UI pages.
      case 'RAINDROP_SEARCH_COLLECTION_COVERS': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { query?: string } | undefined;
        try {
          const covers = await searchRaindropCollectionCovers(auth.accessToken, payload?.query || '');
          return { success: true, data: covers };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to search Raindrop collection covers' };
        }
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  }
);

async function getOrCreateExtensionDeviceId(): Promise<string> {
  const stored: any = await browser.storage.local.get(STORAGE_KEY_DEVICE_ID);
  if (stored[STORAGE_KEY_DEVICE_ID] && typeof stored[STORAGE_KEY_DEVICE_ID] === 'string') {
    return stored[STORAGE_KEY_DEVICE_ID];
  }
  const newId = 'dev_' + Math.random().toString(36).substring(2, 10);
  await browser.storage.local.set({ [STORAGE_KEY_DEVICE_ID]: newId });
  return newId;
}

async function getExtensionDeviceName(): Promise<string> {
  const stored: any = await browser.storage.local.get(STORAGE_KEY_DEVICE_NAME);
  return (typeof stored[STORAGE_KEY_DEVICE_NAME] === 'string' && stored[STORAGE_KEY_DEVICE_NAME]) || getDefaultDeviceName('Ext');
}

async function syncWorkspaceWithRaindropQueued(
  ...args: Parameters<typeof syncWorkspaceWithRaindrop>
): ReturnType<typeof syncWorkspaceWithRaindrop> {
  queuedWorkspaceSyncCount += 1;
  const previousSync = raindropWorkspaceSyncTail;
  let releaseQueue!: () => void;
  raindropWorkspaceSyncTail = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousSync;
  try {
    return await syncWorkspaceWithRaindrop(...args);
  } finally {
    queuedWorkspaceSyncCount -= 1;
    releaseQueue();
  }
}

function triggerDebouncedBackgroundSync(
  delayMs: number = BACKGROUND_SYNC_DEBOUNCE_MS,
  pendingOpsRequired: boolean = false
): void {
  if (debouncedSyncTimer) {
    clearTimeout(debouncedSyncTimer);
  }
  debouncedSyncTimer = setTimeout(() => {
    debouncedSyncTimer = null;
    void triggerBackgroundSync(pendingOpsRequired);
  }, delayMs);
}

// Helper for periodic background sync
async function triggerBackgroundSync(pendingOpsRequired: boolean = false): Promise<void> {
  if (pendingOpsRequired && queuedWorkspaceSyncCount > 0) {
    triggerDebouncedBackgroundSync(BACKGROUND_SYNC_DEBOUNCE_MS, true);
    return;
  }
  if (isBackgroundSyncInFlight) {
    // Do not lose changes made while a Raindrop request is in flight. One
    // trailing pass is sufficient because it re-reads the persisted outbox.
    isBackgroundSyncQueued = true;
    if (!pendingOpsRequired) queuedBackgroundSyncIsPendingOnly = false;
    return;
  }

  // Chrome/Firefox alarms still fire while the device is offline or waking.
  // Avoid starting a fetch that cannot reach Raindrop; the next alarm (or a
  // side-panel `online` event) will resume automatic synchronization.
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isBackgroundSyncInFlight = true;

  try {
    const auth = await getStoredAuthState();
    if (!auth.isAuthenticated || !auth.accessToken) return;

    const storedData = await browser.storage.local.get([
      'arcable_workspace_snapshot',
      'arcable_tmp_tabs',
      CUSTOM_CODE_STORAGE_KEY,
      RUN_CODE_IN_PAGE_STORAGE_KEY,
      'arcable_pending_ops',
    ]);
    let localState = storedData.arcable_workspace_snapshot as ArcableWorkspaceData | undefined;
    const localTmpTabs = (storedData.arcable_tmp_tabs as TmpTab[]) || [];
    const localCustomRules = storedData[CUSTOM_CODE_STORAGE_KEY] as CustomCodeRule[] | undefined;
    const localRunRules = storedData[RUN_CODE_IN_PAGE_STORAGE_KEY] as RunCodeRule[] | undefined;
    const pendingOps = (storedData.arcable_pending_ops as WorkspaceOperation[]) || [];
    if (pendingOpsRequired && pendingOps.length === 0) return;
    const syncedOpIds = new Set(pendingOps.map((op) => op.id));

    const deviceId = await getOrCreateExtensionDeviceId();
    const deviceName = await getExtensionDeviceName();

    const pendingDeletedTmpIds = new Set<string>(
      pendingOps
        .filter((op) => op.type === 'TMP_TAB_DELETE')
        .map((op) => op.entityId)
    );
    const pendingDeletedCustomCodeIds = new Set<string>(
      pendingOps
        .filter((op) => op.type === 'CUSTOM_CODE_DELETE')
        .map((op) => op.entityId)
    );
    const pendingDeletedRunCodeIds = new Set<string>(
      pendingOps
        .filter((op) => op.type === 'RUN_CODE_DELETE')
        .map((op) => op.entityId)
    );

    const taggedTmpTabs = localTmpTabs
      .filter((t) => !pendingDeletedTmpIds.has(t.id) && isValidHttpUrl(t.url))
      .map((t) => ({
        ...t,
        deviceId: t.deviceId || deviceId,
        deviceName: t.deviceName || deviceName,
        deviceType: 'Ext' as const,
      }));

    if (localState) {
      const rawCustomRules = localCustomRules ?? localState.customCodeRules ?? [];
      const rawRunRules = localRunRules ?? localState.runCodeInPageRules ?? [];
      localState = {
        ...localState,
        tmpTabs: taggedTmpTabs,
        customCodeRules: rawCustomRules.filter((r: CustomCodeRule) => !pendingDeletedCustomCodeIds.has(r.id)),
        runCodeInPageRules: rawRunRules.filter((r: RunCodeRule) => !pendingDeletedRunCodeIds.has(r.id)),
      };
    } else {
      localState = {
        activeSpaceId: 'space_personal',
        version: 1,
        spaces: [],
        folders: [],
        tabs: [],
        tmpTabs: taggedTmpTabs,
        customCodeRules: (localCustomRules || []).filter((r: CustomCodeRule) => !pendingDeletedCustomCodeIds.has(r.id)),
        runCodeInPageRules: (localRunRules || []).filter((r: RunCodeRule) => !pendingDeletedRunCodeIds.has(r.id)),
      };
    }

    const result = await syncWorkspaceWithRaindropQueued(auth.accessToken, {
      localState,
      deviceId,
      deviceName,
      pendingOps,
    });

    if (result.success && result.latestSnapshot) {
      // Reconcile remote tab closures against local open browser tabs.
      const deletedOpIds = new Set([
        ...(result.syncFile?.operations || [])
          .filter((op: any) => op.type === 'TMP_TAB_DELETE')
          .map((op: any) => op.entityId),
        ...Object.keys(result.syncFile?.deletedTmpTabIds || {}),
      ]);

      const remainingLocalTmpTabs: TmpTab[] = [];
      for (const localTab of localTmpTabs) {
        if (
          localTab.browserTabId !== undefined &&
          (deletedOpIds.has(localTab.id) || (localTab.deviceId && deletedOpIds.has(`tmp_${localTab.deviceId}_${localTab.browserTabId}`)))
        ) {
          try {
            await browser.tabs.remove(localTab.browserTabId);
            console.log(`[Arcable Background] Closed browser tab ${localTab.browserTabId} (${localTab.url}) due to explicit remote deletion operation.`);
          } catch {}
        } else {
          remainingLocalTmpTabs.push(localTab);
        }
      }

      if (remainingLocalTmpTabs.length !== localTmpTabs.length) {
        await browser.storage.local.set({ arcable_tmp_tabs: remainingLocalTmpTabs });
      }

      const updates: Record<string, any> = {
        arcable_workspace_snapshot: result.latestSnapshot,
        arcable_last_synced_at: result.syncedAt,
      };
      if (result.latestSnapshot.customCodeRules) {
        updates[CUSTOM_CODE_STORAGE_KEY] = result.latestSnapshot.customCodeRules;
      }
      if (result.latestSnapshot.runCodeInPageRules) {
        updates[RUN_CODE_IN_PAGE_STORAGE_KEY] = result.latestSnapshot.runCodeInPageRules;
      }
      if (syncedOpIds.size > 0) {
        const curStored = await browser.storage.local.get('arcable_pending_ops');
        const curOps = (curStored.arcable_pending_ops as WorkspaceOperation[]) || [];
        updates.arcable_pending_ops = curOps.filter((op) => !syncedOpIds.has(op.id));
      }

      await browser.storage.local.set(updates);
      console.log('[Arcable Background] Workspace sync completed successfully.');
    }
  } catch (err) {
    console.warn('[Arcable Background] Periodic sync error:', err);
  } finally {
    isBackgroundSyncInFlight = false;
    if (isBackgroundSyncQueued) {
      isBackgroundSyncQueued = false;
      const pendingOnly = queuedBackgroundSyncIsPendingOnly;
      queuedBackgroundSyncIsPendingOnly = true;
      triggerDebouncedBackgroundSync(BACKGROUND_SYNC_DEBOUNCE_MS, pendingOnly);
    }
  }
}

const TMP_TABS_SYNC_ALARM_NAME = 'arcable_tmp_tabs_sync_alarm';
const TMP_TABS_LAST_PUBLISHED_KEY = 'arcable_tmp_tabs_last_published';
let tmpTabsPublishTimer: ReturnType<typeof setTimeout> | null = null;
let tmpTabsPublishInFlight = false;
let tmpTabsPublishQueued = false;

async function publishLocalTmpTabsIfDue(): Promise<void> {
  if (tmpTabsPublishInFlight) {
    tmpTabsPublishQueued = true;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  tmpTabsPublishInFlight = true;
  try {
    const auth = await getStoredAuthState();
    if (!auth.isAuthenticated || !auth.accessToken) return;
    const publishKey = `${TMP_TABS_LAST_PUBLISHED_KEY}_${auth.user?.id || 'unknown'}`;
    const stored = await browser.storage.local.get(['arcable_tmp_tabs', publishKey]);
    const storedTabs = (stored.arcable_tmp_tabs as TmpTab[]) || [];
    // The side panel owns the normal tab tracker, so its local snapshot can
    // become stale while the panel is closed. Read live browser metadata before
    // publishing this device's snapshot.
    const browserTabs = await browser.tabs.query({});
    const reconciled = reconcileTmpTabsWithBrowserTabs(storedTabs, browserTabs);
    const tabs = reconciled.tabs;
    if (reconciled.changed) {
      await browser.storage.local.set({ arcable_tmp_tabs: tabs });
    }
    const fingerprint = JSON.stringify(tabs);
    const previous = stored[publishKey] as { fingerprint?: string; at?: number } | undefined;
    const now = Date.now();
    if (fingerprint === previous?.fingerprint && now - (previous?.at || 0) < 24 * 60 * 60 * 1000) return;
    const delay = Math.max(0, (previous?.at || 0) + 60_000 - now);
    if (delay > 0) {
      if (!tmpTabsPublishTimer) {
        tmpTabsPublishTimer = setTimeout(() => {
          tmpTabsPublishTimer = null;
          void publishLocalTmpTabsIfDue();
        }, delay);
      }
      return;
    }

    const deviceId = await getOrCreateExtensionDeviceId();
    const deviceName = await getExtensionDeviceName();
    const result = await publishRaindropTmpTabs(auth.accessToken, {
      deviceId,
      deviceName,
      deviceType: 'Ext',
      tabs,
    });
    if (!result.success) throw new Error(result.error || 'Failed to publish temporary tabs');
    await browser.storage.local.set({ [publishKey]: { fingerprint, at: Date.now() } });
  } catch (error) {
    console.warn('[Arcable Background] Temporary tab publish failed:', error);
  } finally {
    tmpTabsPublishInFlight = false;
    if (tmpTabsPublishQueued) {
      tmpTabsPublishQueued = false;
      void publishLocalTmpTabsIfDue();
    }
  }
}

// Workspace writes retain their five minute schedule. Open browser tabs use a
// separate one minute alarm and never enter the workspace operation log.
const SYNC_ALARM_NAME = 'arcable_sync_alarm';
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 5 });
  chrome.alarms.create(TMP_TABS_SYNC_ALARM_NAME, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      void triggerBackgroundSync();
    } else if (alarm.name === TMP_TABS_SYNC_ALARM_NAME) {
      void publishLocalTmpTabsIfDue();
    }
  });
}
void publishLocalTmpTabsIfDue();

// Listen for external messages (e.g. from web app OAuth redirect)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'oauth_success') {
      void processOAuthTokens(message.tokens).then((auth) => {
        if (sendResponse) {
          sendResponse({ success: Boolean(auth), auth });
        }
      });
      return true;
    }
    return false;
  });
}

// Keep cached state and SidePanel behavior in sync with extension storage changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.arcable_raindrop_auth) {
      const newAuth = changes.arcable_raindrop_auth.newValue as RaindropAuthState | undefined;
      const oldAuth = changes.arcable_raindrop_auth.oldValue as RaindropAuthState | undefined;
      cachedAuthState = newAuth && newAuth.isAuthenticated && newAuth.accessToken ? newAuth : { isAuthenticated: false };
      void syncSidePanelBehavior(Boolean(cachedAuthState.isAuthenticated && cachedAuthState.accessToken));
      if (cachedAuthState.isAuthenticated && (!oldAuth || !oldAuth.isAuthenticated)) {
        void fetchAndCacheRaindropWorkspace();
      }
    } else if (changes.arcable_token || changes.arcable_config) {
      void getStoredAuthState(true).then((auth) => {
        void syncSidePanelBehavior(Boolean(auth.isAuthenticated && auth.accessToken));
      });
    }

    const pendingOpsAfterChange = changes.arcable_pending_ops?.newValue;
    const hasPendingOps = Array.isArray(pendingOpsAfterChange) && pendingOpsAfterChange.length > 0;
    // Keep browser state out of the workspace operation log. A separate,
    // throttled device snapshot publishes changes to other devices.
    if (changes.arcable_tmp_tabs) void publishLocalTmpTabsIfDue();
    if (hasPendingOps) {
      triggerDebouncedBackgroundSync(BACKGROUND_SYNC_DEBOUNCE_MS, true);
    }
  }
});

// Helper to open or focus the side panel workspace tab (fallback for environments without native sidebar)
async function openSidepanelTab(): Promise<void> {
  const sidepanelUrl = browser.runtime.getURL('sidepanel/index.html');
  try {
    const tabs = await browser.tabs.query({});
    const existingTab = tabs.find(
      (t) => t.url === sidepanelUrl || (t.url && t.url.startsWith(sidepanelUrl))
    );
    if (existingTab && existingTab.id !== undefined) {
      await browser.tabs.update(existingTab.id, { active: true });
      return;
    }
  } catch (err) {
    console.warn('[Arcable Background] Could not query existing tabs for sidepanel:', err);
  }

  try {
    await browser.tabs.create({ url: sidepanelUrl });
  } catch (tabErr) {
    console.error('[Arcable Background] Failed to create sidepanel tab:', tabErr);
  }
}

// Detect Android / mobile environment and configure action behavior appropriately
async function initPlatformBehavior(): Promise<void> {
  try {
    if (typeof browser !== 'undefined' && browser.runtime?.getPlatformInfo) {
      const platformInfo = await browser.runtime.getPlatformInfo();
      if (platformInfo.os === 'android') {
        // On Firefox for Android, there is no native sidebarAction or sidePanel.
        // Ensure action popup is empty so tapping the action button directly
        // triggers action.onClicked to open the side panel page instead of opening the popup page.
        if (browser.action && typeof browser.action.setPopup === 'function') {
          await browser.action.setPopup({ popup: '' });
          console.log('[Arcable Background] Firefox for Android detected: cleared action popup so side panel opens directly on click');
        }
      }
    }
  } catch (err) {
    console.warn('[Arcable Background] Error setting platform behavior:', err);
  }
}
void initPlatformBehavior();

browser.runtime.onInstalled.addListener(() => {
  console.log('[Arcable Extension] Extension installed/updated.');
  void initPlatformBehavior();
  void syncSidePanelBehavior();
  void fetchAndCacheRaindropWorkspace();
});

if (browser.runtime?.onStartup) {
  browser.runtime.onStartup.addListener(() => {
    void initPlatformBehavior();
    void syncSidePanelBehavior();
    void fetchAndCacheRaindropWorkspace();
  });
}

// Initial side panel behavior synchronization on service worker load
void syncSidePanelBehavior();

// Handle extension toolbar action click (instantly open side panel on desktop, or open side panel page on mobile)
function handleActionClick(tab?: browser.Tabs.Tab | chrome.tabs.Tab): void {
  // Firefox Desktop: sidebarAction.open()
  if (typeof browser !== 'undefined' && (browser as any).sidebarAction && typeof (browser as any).sidebarAction.open === 'function') {
    try {
      void (browser as any).sidebarAction.open();
      return;
    } catch (openErr) {
      console.warn('[Arcable Background] sidebarAction.open() failed:', openErr);
      void openSidepanelTab();
      return;
    }
  }

  // Chrome: sidePanel.open()
  if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
    const windowId = tab?.windowId;
    if (windowId !== undefined) {
      void chrome.sidePanel.open({ windowId }).catch((openErr) => {
        console.warn('[Arcable Background] chrome.sidePanel.open() failed:', openErr);
        void openSidepanelTab();
      });
    } else {
      if (chrome.windows && chrome.windows.getCurrent) {
        chrome.windows.getCurrent((win) => {
          if (win?.id !== undefined) {
            void chrome.sidePanel.open({ windowId: win.id }).catch((openErr) => {
              console.warn('[Arcable Background] chrome.sidePanel.open() failed:', openErr);
              void openSidepanelTab();
            });
          }
        });
      }
    }
    return;
  }

  // Fallback for Firefox Android or environments without native sidebar:
  // Open the side panel page directly instead of opening the popup page
  void openSidepanelTab();
}

if (browser.action && browser.action.onClicked) {
  browser.action.onClicked.addListener(handleActionClick);
} else if (typeof (browser as any)?.browserAction !== 'undefined' && (browser as any).browserAction?.onClicked) {
  (browser as any).browserAction.onClicked.addListener(handleActionClick);
} else if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(handleActionClick);
}
