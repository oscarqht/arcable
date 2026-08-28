import browser from 'webextension-polyfill';
import {
  ExtensionMessage,
  ExtensionResponse,
  ArcableItem,
  RaindropAuthState,
  RaindropCreateItemInput,
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

// Helper to get current stored Raindrop auth state
async function getStoredAuthState(): Promise<RaindropAuthState> {
  try {
    const res = await browser.storage.local.get(STORAGE_KEY_AUTH);
    const auth = res[STORAGE_KEY_AUTH] as RaindropAuthState | undefined;
    if (auth && auth.accessToken && auth.user) {
      return auth;
    }
  } catch (err) {
    console.error('[Arcable Background] Error reading auth state:', err);
  }
  return { isAuthenticated: false };
}

// Helper to save auth state
async function saveAuthState(auth: RaindropAuthState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_AUTH]: auth });
}

// Helper to clear auth state
async function clearAuthState(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY_AUTH);
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

        const user = await fetchRaindropUser(token);
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

        const payload = message.payload as { localState?: any; deviceId?: string; deviceName?: string } | undefined;
        try {
          const result = await syncWorkspaceWithRaindrop(auth.accessToken, {
            localState: payload?.localState,
            deviceId: payload?.deviceId,
            deviceName: payload?.deviceName || 'Arcable Extension',
          });
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

browser.runtime.onInstalled.addListener(() => {
  console.log('[Arcable Extension] Extension installed/updated.');
});
