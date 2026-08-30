import browser from 'webextension-polyfill';
import {
  ExtensionMessage,
  ExtensionResponse,
  ArcableItem,
  RaindropAuthState,
  RaindropCreateItemInput,
  ArcableWorkspaceData,
} from '@arcable/shared/types';
import {
  fetchRaindropUser,
  fetchRaindropCollections,
  createRaindropBookmark,
  syncWorkspaceWithRaindrop,
} from '@arcable/shared/utils';

console.log('[Arcable Extension] Background service worker / script initialized.');

const STORAGE_KEY_AUTH = 'arcable_raindrop_auth';
const STORAGE_KEY_ITEMS = 'arcable_items';

let cachedAuthState: RaindropAuthState = { isAuthenticated: false };

// Sync Chrome SidePanel action behavior dynamically based on auth state
async function syncSidePanelBehavior(isLoggedIn?: boolean): Promise<void> {
  try {
    if (typeof isLoggedIn === 'undefined') {
      const auth = await getStoredAuthState();
      isLoggedIn = Boolean(auth && auth.isAuthenticated && auth.accessToken);
    }

    if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: isLoggedIn,
      });
      console.log(`[Arcable Background] SidePanel behavior updated: openPanelOnActionClick = ${isLoggedIn}`);
    }
  } catch (err) {
    console.warn('[Arcable Background] Could not update sidePanel behavior:', err);
  }
}

// Helper to get current stored Raindrop auth state (instant local storage lookup)
async function getStoredAuthState(forceRefresh = false): Promise<RaindropAuthState> {
  if (!forceRefresh && cachedAuthState && cachedAuthState.isAuthenticated && cachedAuthState.accessToken) {
    return cachedAuthState;
  }

  try {
    const res = (await browser.storage.local.get([
      STORAGE_KEY_AUTH,
      'arcable_token',
      'raindrop_token',
      'arcable_config',
    ])) as Record<string, any>;
    const auth = res[STORAGE_KEY_AUTH] as RaindropAuthState | undefined;
    if (auth && (auth.accessToken || (auth as any).token) && auth.isAuthenticated !== false) {
      cachedAuthState = {
        ...auth,
        accessToken: auth.accessToken || (auth as any).token,
        isAuthenticated: true,
      };
      return cachedAuthState;
    }

    // Check alternate token storage keys if any
    const altToken =
      res.arcable_token ||
      res.raindrop_token ||
      res.arcable_config?.apiToken ||
      res.arcable_config?.token;
    if (altToken && typeof altToken === 'string' && altToken.trim()) {
      const clean = altToken.trim();
      const authState: RaindropAuthState = {
        isAuthenticated: true,
        authType: 'token',
        accessToken: clean,
        user: { id: 1, name: 'Raindrop User' },
      };
      cachedAuthState = authState;
      await browser.storage.local.set({ [STORAGE_KEY_AUTH]: authState });
      return authState;
    }
  } catch (err) {
    console.error('[Arcable Background] Error reading auth state:', err);
  }

  cachedAuthState = { isAuthenticated: false };
  return cachedAuthState;
}

// Helper to save auth state
async function saveAuthState(auth: RaindropAuthState): Promise<void> {
  cachedAuthState = auth;
  await browser.storage.local.set({ [STORAGE_KEY_AUTH]: auth });
  void syncSidePanelBehavior(Boolean(auth && auth.isAuthenticated && auth.accessToken));
}

// Helper to clear auth state
async function clearAuthState(): Promise<void> {
  cachedAuthState = { isAuthenticated: false };
  await browser.storage.local.remove(STORAGE_KEY_AUTH);
  void syncSidePanelBehavior(false);
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
  return authState;
}

// Listen for internal messages from popup, options, or content scripts
browser.runtime.onMessage.addListener(
  async (rawMessage: any): Promise<ExtensionResponse> => {
    const message = rawMessage as ExtensionMessage;

    // Handle OAuth bridge event from content script
    if (rawMessage && rawMessage.type === 'oauth_bridge_success') {
      const auth = await processOAuthTokens(rawMessage.tokens);
      return { success: Boolean(auth), data: auth };
    }

    switch (message.type) {
      case 'PING':
        return { success: true, data: 'PONG from Arcable Background' };

      case 'GET_CURRENT_TAB': {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        return {
          success: true,
          data: activeTab
            ? {
                id: activeTab.id,
                title: activeTab.title,
                url: activeTab.url,
                favIconUrl: activeTab.favIconUrl,
              }
            : null,
        };
      }

      case 'SAVE_ITEM': {
        const item = message.payload as ArcableItem;
        const stored = await browser.storage.local.get(STORAGE_KEY_ITEMS);
        const items: ArcableItem[] = (stored[STORAGE_KEY_ITEMS] as ArcableItem[]) || [];
        items.unshift(item);
        await browser.storage.local.set({ [STORAGE_KEY_ITEMS]: items });
        return { success: true, data: item };
      }

      case 'GET_ITEMS': {
        const stored = await browser.storage.local.get(STORAGE_KEY_ITEMS);
        return { success: true, data: stored[STORAGE_KEY_ITEMS] || [] };
      }

      // Raindrop: Get auth state
      case 'RAINDROP_GET_AUTH_STATE': {
        const auth = await getStoredAuthState();
        return { success: true, data: auth };
      }

      // Raindrop: Login with API Token
      case 'RAINDROP_LOGIN_TOKEN': {
        const token = (message.payload as { token: string })?.token;
        if (!token) {
          return { success: false, error: 'Token is required' };
        }

        let user = await fetchRaindropUser(token);
        if (!user) {
          try {
            const collections = await fetchRaindropCollections(token);
            if (collections && Array.isArray(collections)) {
              user = { id: 1, name: 'Raindrop User', isPro: false };
            }
          } catch {}
        }

        if (!user) {
          return {
            success: false,
            error: 'Invalid Raindrop token or unauthorized. Please verify in Raindrop Settings → Integrations.',
          };
        }

        const authState: RaindropAuthState = {
          isAuthenticated: true,
          authType: 'token',
          accessToken: token,
          user,
        };

        await saveAuthState(authState);
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

          // Try launchWebAuthFlow if identity API is supported
          if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.launchWebAuthFlow) {
            const authUrl = `https://oh-auth.vercel.app/auth/raindrop?state=${stateStr}`;
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
                if (token) {
                  const auth = await processOAuthTokens({
                    access_token: token,
                    refresh_token: hashParams.get('refresh_token') || undefined,
                    expires_in: Number(hashParams.get('expires_in')) || 2592000,
                  });
                  return { success: Boolean(auth), data: auth };
                }
              }
            } catch (authErr) {
              console.warn('[Arcable] launchWebAuthFlow failed, opening tab fallback:', authErr);
            }
          }

          // Fallback: Open web auth tab
          const oauthTabUrl = `http://localhost:3000/api/auth/login?ext=true&extId=${extensionId}`;
          await browser.tabs.create({ url: oauthTabUrl });
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

        const input = message.payload as RaindropCreateItemInput;
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
          return { success: false, error: err?.message || 'Failed to fetch collections' };
        }
      }

      // Raindrop: Sync Workspace Data (Spaces, Folders, Tabs Op-Log)
      case 'RAINDROP_SYNC_WORKSPACE': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { localState?: any; deviceId?: string; deviceName?: string; pendingOps?: any[] } | undefined;
        try {
          const result = await syncWorkspaceWithRaindrop(auth.accessToken, {
            localState: payload?.localState,
            deviceId: payload?.deviceId,
            deviceName: payload?.deviceName || 'Arcable Extension',
            pendingOps: payload?.pendingOps,
          });

          if (result.success && result.latestSnapshot) {
            // Cache latest snapshot in extension storage for instant access across popup and sidepanel
            await browser.storage.local.set({
              arcable_workspace_snapshot: result.latestSnapshot,
              arcable_last_synced_at: result.syncedAt,
            });
          }

          return { success: result.success, data: result, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to sync workspace' };
        }
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  }
);

// Helper for periodic background sync
async function triggerBackgroundSync(): Promise<void> {
  try {
    const auth = await getStoredAuthState();
    if (!auth.isAuthenticated || !auth.accessToken) return;

    const storedSnapshotRes = await browser.storage.local.get('arcable_workspace_snapshot');
    const localState = storedSnapshotRes.arcable_workspace_snapshot as ArcableWorkspaceData | undefined;

    const result = await syncWorkspaceWithRaindrop(auth.accessToken, {
      localState,
      deviceName: 'Arcable Background Sync',
    });

    if (result.success && result.latestSnapshot) {
      await browser.storage.local.set({
        arcable_workspace_snapshot: result.latestSnapshot,
        arcable_last_synced_at: result.syncedAt,
      });
      console.log('[Arcable Background] Periodic workspace sync completed successfully.');
    }
  } catch (err) {
    console.warn('[Arcable Background] Periodic sync error:', err);
  }
}

// Set up periodic sync alarm (every 5 minutes)
const SYNC_ALARM_NAME = 'arcable_sync_alarm';
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      void triggerBackgroundSync();
    }
  });
}

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
      cachedAuthState = newAuth && newAuth.isAuthenticated && newAuth.accessToken ? newAuth : { isAuthenticated: false };
      void syncSidePanelBehavior(Boolean(cachedAuthState.isAuthenticated && cachedAuthState.accessToken));
    } else if (changes.arcable_token || changes.arcable_config) {
      void getStoredAuthState(true).then((auth) => {
        void syncSidePanelBehavior(Boolean(auth.isAuthenticated && auth.accessToken));
      });
    }
  }
});

browser.runtime.onInstalled.addListener(() => {
  console.log('[Arcable Extension] Extension installed/updated.');
  void getStoredAuthState(true).then((auth) => {
    void syncSidePanelBehavior(Boolean(auth.isAuthenticated && auth.accessToken));
  });
  void triggerBackgroundSync();
});

// Initial side panel behavior synchronization on service worker load
void getStoredAuthState(true).then((auth) => {
  void syncSidePanelBehavior(Boolean(auth.isAuthenticated && auth.accessToken));
});

// Handle extension toolbar action click:
// - If not logged in / no API token -> open options page
// - Otherwise -> open side panel
async function handleActionClick(tab?: browser.Tabs.Tab | chrome.tabs.Tab): Promise<void> {
  try {
    const auth = await getStoredAuthState();
    const isLoggedIn = Boolean(auth && auth.isAuthenticated && auth.accessToken);

    if (!isLoggedIn) {
      // Instantly open options page with 0ms delay
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
        chrome.runtime.openOptionsPage();
      } else if (browser.runtime && typeof browser.runtime.openOptionsPage === 'function') {
        void browser.runtime.openOptionsPage();
      } else {
        void browser.tabs.create({ url: browser.runtime.getURL('options/index.html') });
      }
    } else {
      // Logged in with API token / OAuth -> open side panel
      try {
        if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
          const windowId = tab?.windowId;
          if (windowId !== undefined) {
            await chrome.sidePanel.open({ windowId });
          } else if (tab?.id !== undefined) {
            await chrome.sidePanel.open({ tabId: tab.id });
          } else {
            const currentWin = await browser.windows.getCurrent();
            if (currentWin?.id !== undefined) {
              await chrome.sidePanel.open({ windowId: currentWin.id });
            }
          }
        } else if (typeof browser !== 'undefined' && (browser as any).sidebarAction && typeof (browser as any).sidebarAction.open === 'function') {
          await (browser as any).sidebarAction.open();
        } else {
          await browser.tabs.create({ url: browser.runtime.getURL('sidepanel/index.html') });
        }
      } catch (openErr) {
        console.warn('[Arcable Background] Side panel open failed, opening sidepanel tab fallback:', openErr);
        await browser.tabs.create({ url: browser.runtime.getURL('sidepanel/index.html') });
      }
    }
  } catch (err) {
    console.error('[Arcable Background] Error handling action click:', err);
  }
}

if (browser.action && browser.action.onClicked) {
  browser.action.onClicked.addListener(handleActionClick);
} else if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(handleActionClick);
}


