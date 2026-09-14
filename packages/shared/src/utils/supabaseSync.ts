import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ArcableWorkspaceData } from '../types/workspace';
import {
  WorkspaceOperation,
  SupabaseSyncRequest,
  SupabaseSyncResponse,
  SupabaseSessionTokens,
  SyncProvider,
  DeviceSyncRecord,
} from '../types/sync';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  removeStoredPendingOperations,
  replayOperations,
  sortDevicesByLastSync,
} from './syncEngine';
import { areSupabaseSessionsEquivalent } from './supabaseSession';

export { areSupabaseSessionsEquivalent } from './supabaseSession';


export const SYNC_PROVIDER_KEY = 'arcable_sync_provider';
export const SUPABASE_SESSION_KEY = 'arcable_supabase_session';
export const SUPABASE_SERVER_URL_KEY = 'arcable_supabase_server_url';
export const SUPABASE_VERSION_KEY = 'arcable_supabase_version';
export const DEV_SERVER_URL = 'http://localhost:3000';
export const PROD_SERVER_URL = 'https://arcable.vercel.app';

/**
 * Detects whether the current execution context is development mode.
 */
export function isDevEnvironment(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV === 'development') return true;
      if (process.env.NODE_ENV === 'production') return false;
    }
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      if ((import.meta as any).env.DEV) return true;
      if ((import.meta as any).env.PROD) return false;
    }
  } catch {}
  return false;
}

/**
 * Returns default server URL depending on environment:
 * dev => http://localhost:3000
 * production => https://arcable.vercel.app
 */
export function getDefaultServerUrl(): string {
  return isDevEnvironment() ? DEV_SERVER_URL : PROD_SERVER_URL;
}

export const DEFAULT_SERVER_URL = getDefaultServerUrl();

/**
 * Returns current sync provider: 'supabase' | 'raindrop' | 'local'
 */
export function getSyncProvider(): SyncProvider {
  if (typeof window === 'undefined') return 'supabase';
  try {
    // If user has active Google/Supabase OAuth session, sync provider is strictly supabase
    if (getSupabaseSession()?.access_token) {
      return 'supabase';
    }
    const provider = window.localStorage.getItem(SYNC_PROVIDER_KEY) as SyncProvider;
    if (provider === 'raindrop' || provider === 'local' || provider === 'supabase') {
      return provider;
    }
    return 'raindrop';
  } catch {
    return 'supabase';
  }
}

/**
 * Persists the active sync provider.
 */
export function setSyncProvider(provider: SyncProvider): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SYNC_PROVIDER_KEY, provider);
    window.dispatchEvent(new CustomEvent('arcable_sync_provider_changed', { detail: provider }));
  } catch (err) {
    console.warn('Failed to set sync provider:', err);
  }
}

/**
 * Retrieves the stored Supabase session tokens from localStorage.
 */
export function getSupabaseSession(): SupabaseSessionTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUPABASE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.access_token) {
      return parsed as SupabaseSessionTokens;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Stores or clears the Supabase session tokens in localStorage and extension storage.
 */
export function setSupabaseSession(session: SupabaseSessionTokens | null): void {
  if (typeof window !== 'undefined') {
    try {
      const rawCurrentSession = window.localStorage.getItem(SUPABASE_SESSION_KEY);
      let currentSession: SupabaseSessionTokens | null = null;
      if (rawCurrentSession) {
        try {
          currentSession = JSON.parse(rawCurrentSession) as SupabaseSessionTokens;
        } catch {}
      }

      // Avoid dispatching another local session-change event when Firefox
      // reports a no-op extension storage write for the same session.
      if (!areSupabaseSessionsEquivalent(currentSession, session)) {
        if (session && session.access_token) {
          window.localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
          window.dispatchEvent(new CustomEvent('arcable_supabase_session_changed', { detail: session }));
        } else {
          window.localStorage.removeItem(SUPABASE_SESSION_KEY);
          window.dispatchEvent(new CustomEvent('arcable_supabase_session_changed', { detail: null }));
        }
      }
    } catch (err) {
      console.warn('Failed to save Supabase session:', err);
    }
  }

  // Also sync with extension storage if in a Chrome/Firefox extension context
  try {
    const globalObj = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
    const chromeObj = globalObj?.chrome;
    const browserObj =
      globalObj?.browser ||
      (typeof window !== 'undefined' ? (window as any)?.browser : undefined);

    const extStorage =
      chromeObj?.storage?.local
        ? chromeObj.storage.local
        : browserObj?.storage?.local
        ? browserObj.storage.local
        : null;

    const hasChromeRuntime = typeof chromeObj?.runtime?.sendMessage === 'function';
    const hasBrowserRuntime = typeof browserObj?.runtime?.sendMessage === 'function';

    if (extStorage) {
      // Read before writing. Both Firefox and Chromium extension contexts can
      // otherwise turn a mirrored session into another storage change and
      // another automatic sync request.
      void Promise.resolve(extStorage.get(SUPABASE_SESSION_KEY)).then(async (stored: any) => {
        const storedSession = stored?.[SUPABASE_SESSION_KEY] as SupabaseSessionTokens | null | undefined;
        if (areSupabaseSessionsEquivalent(storedSession, session)) return;

        if (session && session.access_token) {
          await extStorage.set({ [SUPABASE_SESSION_KEY]: session });
        } else {
          await extStorage.remove(SUPABASE_SESSION_KEY);
        }

        if (hasChromeRuntime) {
          await chromeObj.runtime.sendMessage({
            type: 'SUPABASE_SESSION_CHANGED',
            session: session || null,
          }).catch?.(() => {});
        } else if (hasBrowserRuntime) {
          await browserObj.runtime.sendMessage({
            type: 'SUPABASE_SESSION_CHANGED',
            session: session || null,
          }).catch?.(() => {});
        }
      }).catch(() => {});
    }
  } catch {}
}

/**
 * Checks whether a session's access token is expired or expiring soon.
 * @param session The Supabase session object.
 * @param marginSeconds Number of seconds before actual expiration to consider "expiring soon" (default: 300s / 5 min).
 */
export function isSessionExpiringSoon(session: SupabaseSessionTokens, marginSeconds = 300): boolean {
  if (!session?.access_token) return true;
  if (!session.expires_at) return false;
  const expiresAtMs = session.expires_at > 1e11 ? session.expires_at : session.expires_at * 1000;
  return Date.now() + marginSeconds * 1000 >= expiresAtMs;
}

let inFlightRefreshPromise: Promise<SupabaseSessionTokens | null> | null = null;

/**
 * Refreshes an existing Supabase OAuth session using its refresh_token.
 * Uses promise deduplication so multiple concurrent calls share a single refresh request.
 */
export async function refreshSupabaseSession(
  session?: SupabaseSessionTokens | null,
  serverUrl?: string
): Promise<SupabaseSessionTokens | null> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  const activeSession = session !== undefined ? session : getSupabaseSession();
  if (!activeSession?.refresh_token) {
    console.warn('[SupabaseSync] Cannot refresh session: no refresh_token present.');
    return null;
  }

  const baseHost = serverUrl || getSyncServerUrl();

  inFlightRefreshPromise = (async () => {
    try {
      const endpoint = `${baseHost.replace(/\/+$/, '')}/api/auth/refresh`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: activeSession.refresh_token,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[SupabaseSync] Token refresh endpoint returned status ${res.status}:`, errText);
        return null;
      }

      const data = await res.json();
      if (data && data.success && data.session && data.session.access_token) {
        const newSession: SupabaseSessionTokens = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token || activeSession.refresh_token,
          expires_at: data.session.expires_at,
          expires_in: data.session.expires_in,
          user: data.session.user || activeSession.user,
        };
        setSupabaseSession(newSession);
        return newSession;
      }

      return null;
    } catch (err) {
      console.warn('[SupabaseSync] Network error refreshing session:', err);
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

/**
 * Ensures a valid (unexpired) session is returned, proactively refreshing if close to expiry.
 */
export async function getOrRefreshValidSupabaseSession(params?: {
  session?: SupabaseSessionTokens | null;
  serverUrl?: string;
  marginSeconds?: number;
}): Promise<SupabaseSessionTokens | null> {
  const session = params?.session !== undefined ? params.session : getSupabaseSession();
  if (!session) return null;

  if (isSessionExpiringSoon(session, params?.marginSeconds ?? 300) && session.refresh_token) {
    const refreshed = await refreshSupabaseSession(session, params?.serverUrl);
    if (refreshed) {
      return refreshed;
    }
  }

  return session;
}

/**
 * Makes an authenticated request to the sync server with proactive expiry checking
 * and reactive 401 retry on token expiration.
 */
export async function authenticatedSupabaseFetch(
  endpointUrl: string,
  init: RequestInit,
  params?: {
    session?: SupabaseSessionTokens | null;
    serverUrl?: string;
  }
): Promise<
  | { success: true; response: Response; session: SupabaseSessionTokens }
  | { success: false; error: string; status?: number; response?: Response }
> {
  const baseHost = params?.serverUrl || getSyncServerUrl();
  let session = await getOrRefreshValidSupabaseSession({
    session: params?.session,
    serverUrl: baseHost,
  });

  if (!session?.access_token) {
    return {
      success: false,
      error: 'Not authenticated with Supabase / Google OAuth.',
    };
  }

  const makeRequest = async (token: string) => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(endpointUrl, {
      ...init,
      headers,
    });
  };

  try {
    let res = await makeRequest(session.access_token);

    // If unauthorized / token expired, attempt reactive refresh
    if (res.status === 401 && session.refresh_token) {
      console.log('[SupabaseSync] Received 401 from server. Attempting reactive token refresh...');
      const refreshed = await refreshSupabaseSession(session, baseHost);
      if (refreshed && refreshed.access_token) {
        session = refreshed;
        res = await makeRequest(session.access_token);
      } else {
        return {
          success: false,
          status: 401,
          response: res,
          error: 'Your Google OAuth session has expired. Please reconnect to continue syncing.',
        };
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        status: res.status,
        response: res,
        error: `Server error (${res.status}): ${errText || res.statusText}`,
      };
    }

    return {
      success: true,
      response: res,
      session,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network request failed',
    };
  }
}


/**
 * Gets configured sync server URL.
 */
export function getSyncServerUrl(): string {
  const fallbackUrl = getDefaultServerUrl();
  if (typeof window === 'undefined') return fallbackUrl;
  try {
    const stored = window.localStorage.getItem(SUPABASE_SERVER_URL_KEY);
    if (stored) return stored;
    if (
      window.location &&
      window.location.origin &&
      !window.location.origin.startsWith('chrome-extension:') &&
      !window.location.origin.startsWith('moz-extension:')
    ) {
      return window.location.origin;
    }
    return fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

/**
 * Sets custom sync server URL (e.g. for self-hosted or production web app).
 */
export function setSyncServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (url && url.trim()) {
      window.localStorage.setItem(SUPABASE_SERVER_URL_KEY, url.trim().replace(/\/+$/, ''));
    } else {
      window.localStorage.removeItem(SUPABASE_SERVER_URL_KEY);
    }
  } catch (err) {
    console.warn('Failed to save sync server URL:', err);
  }
}

/**
 * Gets the last confirmed server version.
 */
export function getStoredServerVersion(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(SUPABASE_VERSION_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Saves the last confirmed server version.
 */
export function setStoredServerVersion(version: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SUPABASE_VERSION_KEY, String(version));
  } catch {}
}

/**
 * Sends queued operations to Next.js sync API: `POST /api/sync/operations`
 */
export async function syncOperationsWithServer(params: {
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
  baseVersion: number;
  deviceId: string;
  deviceName?: string;
  operations: WorkspaceOperation[];
  initialState?: ArcableWorkspaceData;
}): Promise<SupabaseSyncResponse> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/operations`;
  const body: SupabaseSyncRequest = {
    baseVersion: params.baseVersion,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    operations: params.operations,
    initialState: params.initialState,
  };

  const req = await authenticatedSupabaseFetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    {
      session: params.session,
      serverUrl: baseHost,
    }
  );

  if (!req.success) {
    return {
      success: false,
      serverVersion: params.baseVersion,
      error: req.error,
    };
  }

  try {
    const data: SupabaseSyncResponse = await req.response.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      serverVersion: params.baseVersion,
      error: err?.message || 'Failed to parse sync response',
    };
  }
}

/**
 * Fetches latest consolidated workspace state from Next.js sync API: `GET /api/sync/state`
 */
export async function fetchServerWorkspaceState(params?: {
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
}): Promise<{
  success: boolean;
  version?: number;
  state?: ArcableWorkspaceData;
  error?: string;
}> {
  const baseHost = params?.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/state`;

  const req = await authenticatedSupabaseFetch(
    endpoint,
    {
      method: 'GET',
    },
    {
      session: params?.session,
      serverUrl: baseHost,
    }
  );

  if (!req.success) {
    return {
      success: false,
      error: req.error,
    };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      version: data.version,
      state: data.state,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to parse server state response',
    };
  }
}

/**
 * Sets up a Supabase Realtime listener on the `workspaces` table
 * for instant sub-second notifications when changes occur from other devices.
 */
export function setupSupabaseRealtime(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
  userId: string;
  onRemoteUpdate: (newVersion: number) => void;
}): () => void {
  try {
    const client: SupabaseClient = createClient(params.supabaseUrl, params.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
        },
      },
    });

    const channel = client
      .channel(`workspace_${params.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspaces',
          filter: `user_id=eq.${params.userId}`,
        },
        (payload: any) => {
          const newVersion = Number(payload.new?.version) || 0;
          if (newVersion > 0) {
            params.onRemoteUpdate(newVersion);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Failed to subscribe to Supabase Realtime:', err);
    return () => {};
  }
}

/**
 * Core client synchronizer: pushes pending ops and reconciles diffs/fullState.
 */
export async function performSupabaseSync(params: {
  currentState: ArcableWorkspaceData;
  onApplySnapshot: (snapshot: ArcableWorkspaceData) => void;
  onApplyDiffs?: (diffs: WorkspaceOperation[]) => void;
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
}): Promise<{ success: boolean; error?: string; serverVersion?: number }> {
  let session = params.session !== undefined ? params.session : getSupabaseSession();
  if (!session) {
    return { success: false, error: 'No active session' };
  }

  // Ensure session is fresh before beginning sync operations
  const validSession = await getOrRefreshValidSupabaseSession({
    session,
    serverUrl: params.serverUrl,
  });
  if (validSession) {
    session = validSession;
  }


  const deviceId = getOrCreateDeviceId();
  const deviceName = getStoredDeviceName();
  const pendingOps = getStoredPendingOperations();
  const syncedOpIds = pendingOps.map((o) => o.id);
  const baseVersion = getStoredServerVersion();

  // If there are no pending local operations to send, directly pull latest consolidated state from /api/sync/state
  if (pendingOps.length === 0) {
    const stateRes = await fetchServerWorkspaceState({
      serverUrl: params.serverUrl,
      session,
    });

    if (stateRes.success && stateRes.state) {
      params.onApplySnapshot(stateRes.state);
      if (stateRes.version) {
        setStoredServerVersion(stateRes.version);
      }
      return { success: true, serverVersion: stateRes.version };
    } else if (stateRes.error) {
      return { success: false, error: stateRes.error };
    }
  }

  const res = await syncOperationsWithServer({
    serverUrl: params.serverUrl,
    session,
    baseVersion,
    deviceId,
    deviceName,
    operations: pendingOps,
    initialState: params.currentState,
  });

  if (!res.success) {
    return { success: false, error: res.error };
  }

  // Remove the successfully sent ops from the local queue
  removeStoredPendingOperations(syncedOpIds);

  // Update server version
  if (res.serverVersion) {
    setStoredServerVersion(res.serverVersion);
  }

  // If fullState returned (e.g. conflict, large gap, or init), apply snapshot
  if (res.fullState) {
    params.onApplySnapshot(res.fullState);
  } else if (res.diffs && res.diffs.length > 0) {
    // If diffs returned, apply them to current state
    if (params.onApplyDiffs) {
      params.onApplyDiffs(res.diffs);
    } else {
      const mergedState = replayOperations(params.currentState, res.diffs);
      params.onApplySnapshot(mergedState);
    }
  }

  return { success: true, serverVersion: res.serverVersion };
}

/**
 * Fetches all registered devices from Supabase / Arcable Cloud.
 */
export async function fetchSupabaseDevices(params?: {
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
  currentDeviceId?: string;
  currentDeviceName?: string;
}): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params?.serverUrl || getSyncServerUrl();
  const queryParams = new URLSearchParams();
  if (params?.currentDeviceId) queryParams.set('deviceId', params.currentDeviceId);
  if (params?.currentDeviceName) queryParams.set('deviceName', params.currentDeviceName);

  const qs = queryParams.toString();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices${qs ? `?${qs}` : ''}`;

  const req = await authenticatedSupabaseFetch(
    endpoint,
    {
      method: 'GET',
    },
    {
      session: params?.session,
      serverUrl: baseHost,
    }
  );

  if (!req.success) {
    return {
      success: false,
      devices: [],
      error: req.error,
    };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      devices: sortDevicesByLastSync(data.devices || []),
    };
  } catch (err: any) {
    return {
      success: false,
      devices: [],
      error: err?.message || 'Failed to parse devices response',
    };
  }
}

/**
 * Renames a device in Supabase / Arcable Cloud.
 */
export async function renameSupabaseDevice(params: {
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
  deviceId: string;
  newName: string;
}): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices`;

  const req = await authenticatedSupabaseFetch(
    endpoint,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: params.deviceId,
        newName: params.newName,
      }),
    },
    {
      session: params.session,
      serverUrl: baseHost,
    }
  );

  if (!req.success) {
    return {
      success: false,
      devices: [],
      error: req.error,
    };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      devices: sortDevicesByLastSync(data.devices || []),
    };
  } catch (err: any) {
    return {
      success: false,
      devices: [],
      error: err?.message || 'Failed to parse rename device response',
    };
  }
}

/**
 * Deletes a single device from Supabase / Arcable Cloud.
 */
export async function deleteSupabaseDevice(params: {
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
  deviceId: string;
}): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices`;

  const req = await authenticatedSupabaseFetch(
    endpoint,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: params.deviceId,
      }),
    },
    {
      session: params.session,
      serverUrl: baseHost,
    }
  );

  if (!req.success) {
    return {
      success: false,
      devices: [],
      error: req.error,
    };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      devices: sortDevicesByLastSync(data.devices || []),
    };
  } catch (err: any) {
    return {
      success: false,
      devices: [],
      error: err?.message || 'Failed to parse delete device response',
    };
  }
}

/**
 * Deletes all other devices except keepDeviceId from Supabase / Arcable Cloud.
 */
export async function deleteAllOtherSupabaseDevices(params: {
  serverUrl?: string;
  session?: SupabaseSessionTokens | null;
  keepDeviceId: string;
}): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices`;

  const req = await authenticatedSupabaseFetch(
    endpoint,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: params.keepDeviceId,
        allOther: true,
      }),
    },
    {
      session: params.session,
      serverUrl: baseHost,
    }
  );

  if (!req.success) {
    return {
      success: false,
      devices: [],
      error: req.error,
    };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      devices: sortDevicesByLastSync(data.devices || []),
    };
  } catch (err: any) {
    return {
      success: false,
      devices: [],
      error: err?.message || 'Failed to parse delete all other devices response',
    };
  }
}
