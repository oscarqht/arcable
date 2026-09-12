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
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
  getDefaultDeviceName,
  searchRaindrop,
  createRaindropBackup,
  fetchRaindropBackups,
  restoreRaindropBackup,
} from '@arcable/shared/utils';

console.log('[Arcable Extension] Background service worker / script initialized.');

const STORAGE_KEY_AUTH = 'arcable_raindrop_auth';
const STORAGE_KEY_ITEMS = 'arcable_items';

let cachedAuthState: RaindropAuthState = { isAuthenticated: false };

// Always enable instant open of Chrome SidePanel on action click
async function syncSidePanelBehavior(_isAuthenticated?: boolean): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true,
      });
      console.log('[Arcable Background] SidePanel behavior initialized: openPanelOnActionClick = true');
    }
  } catch (err) {
    console.warn('[Arcable Background] Could not update sidePanel behavior:', err);
  }
}
void syncSidePanelBehavior();


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

      // Raindrop: Search items & collections
      case 'RAINDROP_SEARCH': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { query?: string; perpage?: number } | undefined;
        const query = payload?.query || '';
        if (!query.trim()) {
          return { success: true, data: { items: [], collections: [] } };
        }

        try {
          const result = await searchRaindrop(auth.accessToken, query.trim(), { perpage: payload?.perpage });
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to search Raindrop' };
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
          const effectiveDeviceId = payload?.deviceId || await getOrCreateExtensionDeviceId();
          const effectiveDeviceName = payload?.deviceName || await getExtensionDeviceName();

          // Keep background worker synchronized with the UI device ID & name
          await browser.storage.local.set({
            arcable_device_id: effectiveDeviceId,
            arcable_device_name: effectiveDeviceName,
          });

          const result = await syncWorkspaceWithRaindrop(auth.accessToken, {
            localState: payload?.localState,
            deviceId: effectiveDeviceId,
            deviceName: effectiveDeviceName,
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
          if (result.success && result.latestSnapshot) {
            await browser.storage.local.set({
              arcable_workspace_snapshot: result.latestSnapshot,
            });
          }
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

        const payload = message.payload as { keepDeviceId: string } | undefined;
        if (!payload?.keepDeviceId) {
          return { success: false, error: 'keepDeviceId is required' };
        }

        try {
          const result = await deleteAllOtherRaindropDevices(auth.accessToken, payload.keepDeviceId);
          if (result.success && result.latestSnapshot) {
            await browser.storage.local.set({
              arcable_workspace_snapshot: result.latestSnapshot,
            });
          }
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete other devices' };
        }
      }

      // Raindrop: Create Manual Backup
      case 'RAINDROP_CREATE_BACKUP': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { workspaceData?: ArcableWorkspaceData; deviceName?: string } | undefined;
        try {
          let wsData = payload?.workspaceData;
          if (!wsData) {
            const stored = await browser.storage.local.get('arcable_workspace_snapshot');
            wsData = stored.arcable_workspace_snapshot as ArcableWorkspaceData | undefined;
          }

          if (!wsData) {
            wsData = {
              activeSpaceId: 'space_personal',
              version: 1,
              spaces: [],
              folders: [],
              tabs: [],
            };
          }

          const effectiveDeviceName = payload?.deviceName || await getExtensionDeviceName();
          const result = await createRaindropBackup(auth.accessToken, {
            workspaceData: wsData,
            deviceName: effectiveDeviceName,
            deviceType: 'Ext',
          });

          return { success: result.success, data: result, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to create backup' };
        }
      }

      // Raindrop: List Top 10 Backups
      case 'RAINDROP_LIST_BACKUPS': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        try {
          const result = await fetchRaindropBackups(auth.accessToken);
          return { success: result.success, data: result.backups, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to list backups' };
        }
      }

      // Raindrop: Restore Backup
      case 'RAINDROP_RESTORE_BACKUP': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }

        const payload = message.payload as { backupId: number; deviceId?: string; deviceName?: string } | undefined;
        if (!payload?.backupId) {
          return { success: false, error: 'backupId is required' };
        }

        try {
          const effectiveDeviceId = payload.deviceId || await getOrCreateExtensionDeviceId();
          const effectiveDeviceName = payload.deviceName || await getExtensionDeviceName();

          const result = await restoreRaindropBackup(auth.accessToken, payload.backupId, {
            deviceId: effectiveDeviceId,
            deviceName: effectiveDeviceName,
          });

          if (result.success && result.restoredSnapshot) {
            // Update cached extension snapshot & clear pending ops
            await browser.storage.local.set({
              arcable_workspace_snapshot: result.restoredSnapshot,
              arcable_last_synced_at: Date.now(),
            });
            await browser.storage.local.remove('arcable_pending_ops');
          }

          return { success: result.success, data: result, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to restore backup' };
        }
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  }
);

// Persistent device ID and device name helpers for extension service worker
async function getOrCreateExtensionDeviceId(): Promise<string> {
  const res = await browser.storage.local.get('arcable_device_id');
  let deviceId = res.arcable_device_id as string | undefined;
  if (!deviceId) {
    deviceId = 'device_ext_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
    await browser.storage.local.set({ arcable_device_id: deviceId });
  }
  return deviceId;
}

async function getExtensionDeviceName(): Promise<string> {
  const res = await browser.storage.local.get('arcable_device_name');
  return (res.arcable_device_name as string) || getDefaultDeviceName('Ext');
}

// Helper for periodic background sync
async function triggerBackgroundSync(): Promise<void> {
  try {
    const auth = await getStoredAuthState();
    if (!auth.isAuthenticated || !auth.accessToken) return;

    const storedSnapshotRes = await browser.storage.local.get('arcable_workspace_snapshot');
    const localState = storedSnapshotRes.arcable_workspace_snapshot as ArcableWorkspaceData | undefined;

    const deviceId = await getOrCreateExtensionDeviceId();
    const deviceName = await getExtensionDeviceName();

    const result = await syncWorkspaceWithRaindrop(auth.accessToken, {
      localState,
      deviceId,
      deviceName,
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

// Detect Android / mobile environment and configure action popup appropriately
async function initPlatformBehavior(): Promise<void> {
  try {
    if (typeof browser !== 'undefined' && browser.runtime?.getPlatformInfo) {
      const platformInfo = await browser.runtime.getPlatformInfo();
      if (platformInfo.os === 'android') {
        // On Firefox for Android, there is no sidebarAction or sidePanel.
        // Dynamically set action popup to popup/index.html so tapping Arcable opens the mobile popup sheet.
        if (browser.action && typeof browser.action.setPopup === 'function') {
          await browser.action.setPopup({ popup: 'popup/index.html' });
          console.log('[Arcable Background] Firefox for Android detected: set action popup to popup/index.html');
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
  void triggerBackgroundSync();
});

// Initial side panel behavior synchronization on service worker load
void syncSidePanelBehavior();

// Handle extension toolbar action click (instantly open side panel on desktop, or popup/workspace on mobile)
function handleActionClick(tab?: browser.Tabs.Tab | chrome.tabs.Tab): void {
  // Firefox Desktop: sidebarAction.open()
  if (typeof browser !== 'undefined' && (browser as any).sidebarAction && typeof (browser as any).sidebarAction.open === 'function') {
    try {
      void (browser as any).sidebarAction.open();
    } catch (openErr) {
      console.warn('[Arcable Background] sidebarAction.open() failed:', openErr);
      void browser.tabs.create({ url: browser.runtime.getURL('sidepanel/index.html') });
    }
    return;
  }

  // Chrome: sidePanel.open()
  if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
    const windowId = tab?.windowId;
    if (windowId !== undefined) {
      void chrome.sidePanel.open({ windowId }).catch((openErr) => {
        console.warn('[Arcable Background] chrome.sidePanel.open() failed:', openErr);
        void browser.tabs.create({ url: browser.runtime.getURL('sidepanel/index.html') });
      });
    } else {
      if (chrome.windows && chrome.windows.getCurrent) {
        chrome.windows.getCurrent((win) => {
          if (win?.id !== undefined) {
            void chrome.sidePanel.open({ windowId: win.id }).catch((openErr) => {
              console.warn('[Arcable Background] chrome.sidePanel.open() failed:', openErr);
              void browser.tabs.create({ url: browser.runtime.getURL('sidepanel/index.html') });
            });
          }
        });
      }
    }
    return;
  }

  // Fallback for Firefox Android or environments without native sidebar:
  // Open popup in a tab if action was clicked directly
  void browser.tabs.create({ url: browser.runtime.getURL('popup/index.html') });
}

if (browser.action && browser.action.onClicked) {
  browser.action.onClicked.addListener(handleActionClick);
} else if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(handleActionClick);
}



