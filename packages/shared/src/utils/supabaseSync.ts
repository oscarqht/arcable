import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ArcableWorkspaceData } from '../types/workspace';
import {
  WorkspaceOperation,
  SupabaseSyncRequest,
  SupabaseSyncResponse,
  SupabaseSessionTokens,
  SyncProvider,
} from '../types/sync';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  removeStoredPendingOperations,
  replayOperations,
} from './syncEngine';


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
 * Stores or clears the Supabase session tokens in localStorage.
 */
export function setSupabaseSession(session: SupabaseSessionTokens | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session && session.access_token) {
      window.localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
      window.dispatchEvent(new CustomEvent('arcable_supabase_session_changed', { detail: session }));
    } else {
      window.localStorage.removeItem(SUPABASE_SESSION_KEY);
      window.dispatchEvent(new CustomEvent('arcable_supabase_session_changed', { detail: null }));
    }
  } catch (err) {
    console.warn('Failed to save Supabase session:', err);
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
  const session = params.session !== undefined ? params.session : getSupabaseSession();

  if (!session?.access_token) {
    return {
      success: false,
      serverVersion: params.baseVersion,
      error: 'Not authenticated with Supabase / Google OAuth.',
    };
  }

  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/operations`;
  const body: SupabaseSyncRequest = {
    baseVersion: params.baseVersion,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    operations: params.operations,
    initialState: params.initialState,
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        serverVersion: params.baseVersion,
        error: `Server error (${res.status}): ${errText || res.statusText}`,
      };
    }

    const data: SupabaseSyncResponse = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      serverVersion: params.baseVersion,
      error: err?.message || 'Network request failed',
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
  const session = params?.session !== undefined ? params?.session : getSupabaseSession();

  if (!session?.access_token) {
    return {
      success: false,
      error: 'Not authenticated with Supabase / Google OAuth.',
    };
  }

  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/state`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Server error (${res.status}): ${errText || res.statusText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      version: data.version,
      state: data.state,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network request failed',
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
  const session = params.session !== undefined ? params.session : getSupabaseSession();
  if (!session) {
    return { success: false, error: 'No active session' };
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
