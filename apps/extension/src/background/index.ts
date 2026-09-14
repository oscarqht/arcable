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
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
  fetchCloudDevices,
  renameCloudDevice,
  deleteCloudDevice,
  syncOperationsWithServer,
  getDefaultDeviceName,
  searchRaindrop,
  getDefaultServerUrl,
  parseExtensionOAuthCallback,
  fetchServerWorkspaceState,
  replayOperations,
} from '@arcable/shared/utils';

import {
  initRunCodeBackgroundListeners,
  executeAutomaticCustomCode,
  runCodeInPageRule,
  CUSTOM_CODE_STORAGE_KEY,
  RUN_CODE_IN_PAGE_STORAGE_KEY,
} from './runCodeRunner';
import {
  initContextMenuListeners,
  getMatchingCodeRules,
} from './contextMenus';

console.log('[Arcable Extension] Background service worker / script initialized.');

// Initialize user scripts and context menu listeners
initRunCodeBackgroundListeners();
initContextMenuListeners();

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
  const updates: Record<string, any> = {
    [STORAGE_KEY_AUTH]: auth,
    arcable_sync_provider: (auth && auth.isAuthenticated && auth.accessToken) ? 'raindrop' : 'local',
  };
  await browser.storage.local.set(updates);
  void syncSidePanelBehavior(Boolean(auth && auth.isAuthenticated && auth.accessToken));
  void browser.runtime.sendMessage({
    type: 'RAINDROP_AUTH_CHANGED',
    auth,
  }).catch(() => {});
}

// Helper to clear auth state
async function clearAuthState(): Promise<void> {
  cachedAuthState = { isAuthenticated: false };
  await browser.storage.local.remove(STORAGE_KEY_AUTH);
  await browser.storage.local.set({ arcable_sync_provider: 'local' });
  void syncSidePanelBehavior(false);
  void browser.runtime.sendMessage({
    type: 'RAINDROP_AUTH_CHANGED',
    auth: { isAuthenticated: false },
  }).catch(() => {});
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
  async (rawMessage: any, sender: any): Promise<ExtensionResponse> => {
    const message = rawMessage as ExtensionMessage;

    // Handle OAuth bridge event from content script
    if (rawMessage && (rawMessage.type === 'oauth_bridge_success' || rawMessage.type === 'oauth_success')) {
      const auth = await processOAuthTokens(rawMessage.tokens);
      return { success: Boolean(auth), data: auth };
    }

    switch (message.type) {


      case 'INJECT_CUSTOM_JS': {
        const payload = (message.payload || rawMessage) as { ruleId: string; code: string; tabId?: number };
        const tabId = payload?.tabId ?? sender?.tab?.id;
        if (!payload?.code || typeof tabId !== 'number') {
          return { success: false, error: 'Valid tabId and code are required' };
        }
        try {
          await executeAutomaticCustomCode(tabId, payload.code, `[Arcable CustomCode: ${payload.ruleId}]`);
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || String(err) };
        }
      }

      case 'RUN_CODE_IN_PAGE_EXECUTE': {
        const payload = (message.payload || rawMessage) as { ruleId: string; tabId?: number };
        let targetTabId = payload?.tabId;
        if (typeof targetTabId !== 'number') {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          targetTabId = tabs[0]?.id;
        }
        if (typeof targetTabId !== 'number' || !payload?.ruleId) {
          return { success: false, error: 'Valid tab and ruleId are required' };
        }
        try {
          const result = await runCodeInPageRule(payload.ruleId, targetTabId);
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err?.message || String(err) };
        }
      }

      case 'GET_MATCHING_RUN_CODE_RULES': {
        const payload = message.payload as { url?: string } | undefined;
        let targetUrl = payload?.url;
        if (!targetUrl) {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          targetUrl = tabs[0]?.url;
        }
        const matching = targetUrl ? await getMatchingCodeRules(targetUrl) : [];
        return { success: true, data: matching };
      }

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
          const hasIdentity =
            typeof browser?.identity?.launchWebAuthFlow === 'function' &&
            typeof browser?.identity?.getRedirectURL === 'function';

          let extensionRedirect: string | undefined;
          if (hasIdentity) {
            try {
              extensionRedirect = browser.identity.getRedirectURL('raindrop');
            } catch (err) {
              console.warn('[Arcable] Failed to get identity redirect URL for Raindrop:', err);
            }
          }

          const statePayload: Record<string, any> = {
            extensionId,
            fromExt: true,
            provider: 'raindrop',
          };
          if (extensionRedirect) {
            statePayload.extensionRedirect = extensionRedirect;
          }

          const stateStr = encodeURIComponent(JSON.stringify(statePayload));
          const authUrl = `https://oh-auth.vercel.app/auth/raindrop?state=${stateStr}`;

          if (hasIdentity && extensionRedirect) {
            const responseUrl = await browser.identity.launchWebAuthFlow({
              url: authUrl,
              interactive: true,
            });
            const tokens = responseUrl ? parseExtensionOAuthCallback(responseUrl) : null;
            if (!tokens?.access_token) {
              return { success: false, error: 'Raindrop OAuth completed without an access token.' };
            }

            const auth = await processOAuthTokens({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_in: tokens.expires_in || 2592000,
            });
            return auth
              ? { success: true, data: auth }
              : { success: false, error: 'Could not validate the Raindrop OAuth session.' };
          } else {
            // Fallback for Firefox Android or environments without browser.identity
            await browser.tabs.create({ url: authUrl });
            return {
              success: true,
              pending: true,
              message: 'Opened authorization in a new tab. Please complete sign-in there.',
            };
          }
        } catch (err: any) {
          console.warn('[Arcable] Raindrop OAuth failed:', err);
          return { success: false, error: err?.message || 'Failed to complete Raindrop OAuth' };
        }
      }

      // Raindrop: Logout
      case 'RAINDROP_LOGOUT': {
        await clearAuthState();
        return { success: true };
      }

      // Cloud Device Management (via Next.js API /api/sync/devices)
      case 'CLOUD_GET_DEVICES': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }
        const stored: any = await browser.storage.local.get(['arcable_server_url']);
        const serverUrl = String(stored.arcable_server_url || getDefaultServerUrl()).replace(/\/+$/, '');
        const payload = message.payload as { currentDeviceId?: string; currentDeviceName?: string } | undefined;
        try {
          const effectiveCurrentDeviceId = payload?.currentDeviceId || await getOrCreateExtensionDeviceId();
          const effectiveCurrentDeviceName = payload?.currentDeviceName || await getExtensionDeviceName();
          const result = await fetchCloudDevices({
            serverUrl,
            token: auth.accessToken,
            currentDeviceId: effectiveCurrentDeviceId,
            currentDeviceName: effectiveCurrentDeviceName,
          });
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to fetch devices' };
        }
      }

      case 'CLOUD_RENAME_DEVICE': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }
        const stored: any = await browser.storage.local.get(['arcable_server_url']);
        const serverUrl = String(stored.arcable_server_url || getDefaultServerUrl()).replace(/\/+$/, '');
        const payload = message.payload as { deviceId: string; newName: string } | undefined;
        if (!payload?.deviceId || !payload?.newName) {
          return { success: false, error: 'deviceId and newName are required' };
        }
        try {
          const result = await renameCloudDevice({
            serverUrl,
            token: auth.accessToken,
            deviceId: payload.deviceId,
            newName: payload.newName,
          });
          const currentExtDeviceId = await getOrCreateExtensionDeviceId();
          if (payload.deviceId === currentExtDeviceId) {
            await browser.storage.local.set({ arcable_device_name: payload.newName });
          }
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to rename device' };
        }
      }

      case 'CLOUD_DELETE_DEVICE': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }
        const stored: any = await browser.storage.local.get(['arcable_server_url']);
        const serverUrl = String(stored.arcable_server_url || getDefaultServerUrl()).replace(/\/+$/, '');
        const payload = message.payload as { deviceId: string } | undefined;
        if (!payload?.deviceId) {
          return { success: false, error: 'deviceId is required' };
        }
        try {
          const result = await deleteCloudDevice({
            serverUrl,
            token: auth.accessToken,
            deviceId: payload.deviceId,
          });
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete device' };
        }
      }

      case 'CLOUD_DELETE_OTHER_DEVICES': {
        const auth = await getStoredAuthState();
        if (!auth.isAuthenticated || !auth.accessToken) {
          return { success: false, error: 'Not authenticated with Raindrop' };
        }
        const stored: any = await browser.storage.local.get(['arcable_server_url']);
        const serverUrl = String(stored.arcable_server_url || getDefaultServerUrl()).replace(/\/+$/, '');
        const payload = message.payload as { keepDeviceId?: string } | undefined;
        try {
          const effectiveKeepDeviceId = payload?.keepDeviceId || await getOrCreateExtensionDeviceId();
          const result = await deleteCloudDevice({
            serverUrl,
            token: auth.accessToken,
            allOther: true,
            keepDeviceId: effectiveKeepDeviceId,
          });
          return { success: result.success, data: result.devices, error: result.error };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete other devices' };
        }
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

      // Raindrop: Sync Workspace Data (Spaces, Folders, Tabs Op-Log) via Next.js server API
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

          const stored = await browser.storage.local.get([
            'arcable_server_url',
            'arcable_server_version',
            'arcable_tmp_tabs',
            CUSTOM_CODE_STORAGE_KEY,
            RUN_CODE_IN_PAGE_STORAGE_KEY,
            'arcable_pending_ops',
          ]);
          const serverUrl = String(stored.arcable_server_url || getDefaultServerUrl()).replace(/\/+$/, '');
          const baseVersion = Number(stored.arcable_server_version) || 0;
          const localTmp = (stored.arcable_tmp_tabs as TmpTab[]) || [];
          const localCustomRules = (stored[CUSTOM_CODE_STORAGE_KEY] as CustomCodeRule[]) || [];
          const localRunRules = (stored[RUN_CODE_IN_PAGE_STORAGE_KEY] as RunCodeRule[]) || [];
          const storedPendingOps = (stored.arcable_pending_ops as WorkspaceOperation[]) || [];

          // Merge payload pending ops with stored pending ops first
          const opMap = new Map<string, WorkspaceOperation>();
          for (const op of storedPendingOps) {
            opMap.set(op.id, op);
          }
          for (const op of (payload?.pendingOps || [])) {
            opMap.set(op.id, op);
          }
          const combinedPendingOps = Array.from(opMap.values());
          const syncedOpIds = new Set(combinedPendingOps.map((op) => op.id));

          // Collect all tmp tab IDs pending deletion
          const pendingDeletedTmpIds = new Set<string>(
            combinedPendingOps
              .filter((op) => op.type === 'TMP_TAB_DELETE')
              .map((op) => op.entityId)
          );

          const taggedTmp = localTmp
            .filter((t) => !pendingDeletedTmpIds.has(t.id))
            .map((t) => ({
              ...t,
              deviceId: t.deviceId || effectiveDeviceId,
              deviceName: t.deviceName || effectiveDeviceName,
              deviceType: 'Ext' as const,
            }));

          let stateToSync = payload?.localState;
          if (stateToSync) {
            const filteredStateTmpTabs = (stateToSync.tmpTabs || []).filter(
              (t: TmpTab) => !pendingDeletedTmpIds.has(t.id)
            );
            stateToSync = {
              ...stateToSync,
              tmpTabs: taggedTmp.length > 0 ? taggedTmp : filteredStateTmpTabs,
              customCodeRules: stateToSync.customCodeRules || localCustomRules,
              runCodeInPageRules: stateToSync.runCodeInPageRules || localRunRules,
            };
          } else {
            stateToSync = {
              activeSpaceId: 'space_personal',
              version: 1,
              spaces: [],
              folders: [],
              tabs: [],
              tmpTabs: taggedTmp,
              customCodeRules: localCustomRules,
              runCodeInPageRules: localRunRules,
            };
          }

          let latestSnapshot: ArcableWorkspaceData | undefined;
          let newServerVersion = baseVersion;

          if (combinedPendingOps.length === 0) {
            const stateRes = await fetchServerWorkspaceState({
              serverUrl,
              token: auth.accessToken,
              deviceId: effectiveDeviceId,
              deviceName: effectiveDeviceName,
            });
            if (!stateRes.success) {
              return { success: false, error: stateRes.error };
            }
            if (stateRes.state) {
              latestSnapshot = stateRes.state;
            }
            if (stateRes.version) {
              newServerVersion = stateRes.version;
            }
          } else {
            const opRes = await syncOperationsWithServer({
              serverUrl,
              token: auth.accessToken,
              baseVersion,
              deviceId: effectiveDeviceId,
              deviceName: effectiveDeviceName,
              operations: combinedPendingOps,
              initialState: stateToSync,
            });
            if (!opRes.success) {
              return { success: false, error: opRes.error };
            }
            if (opRes.serverVersion) {
              newServerVersion = opRes.serverVersion;
            }
            if (opRes.fullState) {
              latestSnapshot = opRes.fullState;
            } else if (opRes.diffs && opRes.diffs.length > 0) {
              latestSnapshot = replayOperations(stateToSync, opRes.diffs);
            }
          }

          if (latestSnapshot) {
            const remoteDeletedOps = (combinedPendingOps || [])
              .filter((op: any) => op.type === 'TMP_TAB_DELETE' && op.deviceId !== effectiveDeviceId)
              .map((op: any) => op.entityId);
            const remoteDeletedOpSet = new Set(remoteDeletedOps);

            const remainingLocalTmp: TmpTab[] = [];
            for (const localTab of localTmp) {
              if (localTab.browserTabId !== undefined) {
                const isExplicitlyDeletedByRemote = remoteDeletedOpSet.has(localTab.id);
                if (isExplicitlyDeletedByRemote) {
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
              arcable_workspace_snapshot: latestSnapshot,
              arcable_last_synced_at: Date.now(),
              arcable_server_version: newServerVersion,
            };
            if (latestSnapshot.customCodeRules) {
              updates[CUSTOM_CODE_STORAGE_KEY] = latestSnapshot.customCodeRules;
            }
            if (latestSnapshot.runCodeInPageRules) {
              updates[RUN_CODE_IN_PAGE_STORAGE_KEY] = latestSnapshot.runCodeInPageRules;
            }
            if (syncedOpIds.size > 0) {
              const curStored = await browser.storage.local.get('arcable_pending_ops');
              const curOps = (curStored.arcable_pending_ops as WorkspaceOperation[]) || [];
              updates.arcable_pending_ops = curOps.filter((op) => !syncedOpIds.has(op.id));
            }

            await browser.storage.local.set(updates);
          }

          return { success: true, data: { success: true, latestSnapshot, serverVersion: newServerVersion } };
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

let isBackgroundSyncInFlight = false;
let debouncedSyncTimer: ReturnType<typeof setTimeout> | null = null;

function triggerDebouncedBackgroundSync(delayMs: number = 20000): void {
  if (debouncedSyncTimer) {
    clearTimeout(debouncedSyncTimer);
  }
  debouncedSyncTimer = setTimeout(() => {
    debouncedSyncTimer = null;
    void triggerBackgroundSync();
  }, delayMs);
}

// Helper for periodic background sync
async function triggerBackgroundSync(): Promise<void> {
  if (isBackgroundSyncInFlight) return;
  isBackgroundSyncInFlight = true;

  try {
    const auth = await getStoredAuthState();
    if (!auth.isAuthenticated || !auth.accessToken) {
      return;
    }

    const storedData = await browser.storage.local.get([
      'arcable_server_url',
      'arcable_server_version',
      'arcable_workspace_snapshot',
      'arcable_tmp_tabs',
      CUSTOM_CODE_STORAGE_KEY,
      RUN_CODE_IN_PAGE_STORAGE_KEY,
      'arcable_pending_ops',
    ]);
    const serverUrl = String(storedData.arcable_server_url || getDefaultServerUrl()).replace(/\/+$/, '');
    const baseVersion = Number(storedData.arcable_server_version) || 0;
    let localState = storedData.arcable_workspace_snapshot as ArcableWorkspaceData | undefined;
    const localTmpTabs = (storedData.arcable_tmp_tabs as TmpTab[]) || [];
    const localCustomRules = (storedData[CUSTOM_CODE_STORAGE_KEY] as CustomCodeRule[]) || [];
    const localRunRules = (storedData[RUN_CODE_IN_PAGE_STORAGE_KEY] as RunCodeRule[]) || [];
    const pendingOps = (storedData.arcable_pending_ops as WorkspaceOperation[]) || [];
    const syncedOpIds = new Set(pendingOps.map((op) => op.id));

    const deviceId = await getOrCreateExtensionDeviceId();
    const deviceName = await getExtensionDeviceName();

    const taggedTmpTabs = localTmpTabs.map((t) => ({
      ...t,
      deviceId: t.deviceId || deviceId,
      deviceName: t.deviceName || deviceName,
      deviceType: 'Ext' as const,
    }));

    if (localState) {
      localState = {
        ...localState,
        tmpTabs: taggedTmpTabs,
        customCodeRules: localState.customCodeRules || localCustomRules,
        runCodeInPageRules: localState.runCodeInPageRules || localRunRules,
      };
    } else {
      localState = {
        activeSpaceId: 'space_personal',
        version: 1,
        spaces: [],
        folders: [],
        tabs: [],
        tmpTabs: taggedTmpTabs,
        customCodeRules: localCustomRules,
        runCodeInPageRules: localRunRules,
      };
    }

    let latestSnapshot: ArcableWorkspaceData | undefined;
    let newServerVersion = baseVersion;

    if (pendingOps.length === 0) {
      const stateRes = await fetchServerWorkspaceState({
        serverUrl,
        token: auth.accessToken,
        deviceId,
        deviceName,
      });
      if (stateRes.success && stateRes.state) {
        latestSnapshot = stateRes.state;
        if (stateRes.version) {
          newServerVersion = stateRes.version;
        }
      }
    } else {
      const opRes = await syncOperationsWithServer({
        serverUrl,
        token: auth.accessToken,
        baseVersion,
        deviceId,
        deviceName,
        operations: pendingOps,
        initialState: localState,
      });
      if (opRes.success) {
        if (opRes.serverVersion) {
          newServerVersion = opRes.serverVersion;
        }
        if (opRes.fullState) {
          latestSnapshot = opRes.fullState;
        } else if (opRes.diffs && opRes.diffs.length > 0) {
          latestSnapshot = replayOperations(localState, opRes.diffs);
        }
      }
    }

    if (latestSnapshot) {
      const updates: Record<string, any> = {
        arcable_workspace_snapshot: latestSnapshot,
        arcable_last_synced_at: Date.now(),
        arcable_server_version: newServerVersion,
      };
      if (latestSnapshot.customCodeRules) {
        updates[CUSTOM_CODE_STORAGE_KEY] = latestSnapshot.customCodeRules;
      }
      if (latestSnapshot.runCodeInPageRules) {
        updates[RUN_CODE_IN_PAGE_STORAGE_KEY] = latestSnapshot.runCodeInPageRules;
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
    if (message && (message.type === 'oauth_success' || message.type === 'oauth_bridge_success')) {
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

    if (changes.arcable_tmp_tabs || changes.arcable_pending_ops) {
      triggerDebouncedBackgroundSync(20000);
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
  void triggerBackgroundSync();
});

if (browser.runtime?.onStartup) {
  browser.runtime.onStartup.addListener(() => {
    void initPlatformBehavior();
    void syncSidePanelBehavior();
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
