import { ArcableWorkspaceData } from '../types/workspace';
import {
  WorkspaceOperation,
  WorkspaceSyncRequest,
  WorkspaceSyncResponse,
  SyncProvider,
  DeviceSyncRecord,
} from '../types/sync';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  getStoredPendingOperations,
  removeStoredPendingOperations,
  replayOperations,
} from './syncEngine';

export { resolveSyncProvider } from './syncProvider';

export const SYNC_PROVIDER_KEY = 'arcable_sync_provider';
export const SERVER_URL_KEY = 'arcable_server_url';
export const SERVER_VERSION_KEY = 'arcable_server_version';
export const DEV_SERVER_URL = 'http://localhost:3000';
export const PROD_SERVER_URL = 'https://arcable.vercel.app';

/**
 * Detects whether current execution context is development mode.
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
 * Returns current sync provider: 'raindrop' | 'local'
 */
export function getSyncProvider(): SyncProvider {
  if (typeof window === 'undefined') return 'raindrop';
  try {
    const provider = window.localStorage.getItem(SYNC_PROVIDER_KEY) as SyncProvider;
    if (provider === 'raindrop' || provider === 'local') {
      return provider;
    }
    return 'local';
  } catch {
    return 'local';
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
 * Gets configured sync server URL.
 */
export function getSyncServerUrl(): string {
  const fallbackUrl = getDefaultServerUrl();
  if (typeof window === 'undefined') return fallbackUrl;
  try {
    const stored = window.localStorage.getItem(SERVER_URL_KEY);
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
 * Sets configured sync server URL.
 */
export function setSyncServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SERVER_URL_KEY, url);
  } catch (err) {
    console.warn('Failed to store sync server url:', err);
  }
}

/**
 * Returns the last confirmed server version.
 */
export function getStoredServerVersion(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const v = window.localStorage.getItem(SERVER_VERSION_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
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
    window.localStorage.setItem(SERVER_VERSION_KEY, String(version));
  } catch {}
}

/**
 * Helper to perform authenticated fetch to Next.js sync endpoints.
 */
export async function authenticatedSyncFetch(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<{ success: boolean; response?: any; status?: number; error?: string }> {
  try {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        status: res.status,
        error: `Server error (${res.status}): ${errText || res.statusText}`,
      };
    }

    return {
      success: true,
      status: res.status,
      response: res,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network request failed',
    };
  }
}

/**
 * Sends queued operations to Next.js sync API: `POST /api/sync/operations`
 */
export async function syncOperationsWithServer(params: {
  serverUrl?: string;
  token?: string;
  baseVersion: number;
  deviceId: string;
  deviceName?: string;
  operations: WorkspaceOperation[];
  initialState?: ArcableWorkspaceData;
}): Promise<WorkspaceSyncResponse> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/operations`;
  const body: WorkspaceSyncRequest = {
    baseVersion: params.baseVersion,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    operations: params.operations,
    initialState: params.initialState,
  };

  const req = await authenticatedSyncFetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    params.token
  );

  if (!req.success) {
    return {
      success: false,
      serverVersion: params.baseVersion,
      error: req.error,
    };
  }

  try {
    const data: WorkspaceSyncResponse = await req.response.json();
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
  token?: string;
  deviceId?: string;
  deviceName?: string;
}): Promise<{
  success: boolean;
  version?: number;
  state?: ArcableWorkspaceData;
  error?: string;
}> {
  const baseHost = params?.serverUrl || getSyncServerUrl();
  const queryParams = new URLSearchParams();
  if (params?.deviceId) queryParams.set('deviceId', params.deviceId);
  if (params?.deviceName) queryParams.set('deviceName', params.deviceName);
  const qs = queryParams.toString();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/state${qs ? `?${qs}` : ''}`;

  const req = await authenticatedSyncFetch(
    endpoint,
    { method: 'GET' },
    params?.token
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
 * Executes a full synchronization cycle:
 * 1. Pushes pending local operations to `/api/sync/operations`
 * 2. If client has 0 pending operations, pulls latest state
 * 3. Applies returned diffs or fullState
 */
export async function syncWorkspaceWithCloudServer(params: {
  token: string;
  currentState: ArcableWorkspaceData;
  onApplySnapshot: (snapshot: ArcableWorkspaceData) => void;
  onApplyDiffs?: (diffs: WorkspaceOperation[]) => void;
  serverUrl?: string;
  deviceName?: string;
}): Promise<{ success: boolean; error?: string; serverVersion?: number }> {
  if (!params.token) {
    return { success: false, error: 'No active Raindrop token provided.' };
  }

  const deviceId = getOrCreateDeviceId();
  const deviceName = params.deviceName || getStoredDeviceName();
  const pendingOps = getStoredPendingOperations();
  const syncedOpIds = pendingOps.map((o) => o.id);
  const baseVersion = getStoredServerVersion();

  // If there are no pending operations to send, pull latest state
  if (pendingOps.length === 0) {
    const stateRes = await fetchServerWorkspaceState({
      serverUrl: params.serverUrl,
      token: params.token,
      deviceId,
      deviceName,
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
    token: params.token,
    baseVersion,
    deviceId,
    deviceName,
    operations: pendingOps,
    initialState: params.currentState,
  });

  if (!res.success) {
    return { success: false, error: res.error };
  }

  // Remove successfully sent operations from local queue
  removeStoredPendingOperations(syncedOpIds);

  // Update stored server version
  if (res.serverVersion) {
    setStoredServerVersion(res.serverVersion);
  }

  // Apply returned state
  if (res.fullState) {
    params.onApplySnapshot(res.fullState);
  } else if (res.diffs && res.diffs.length > 0) {
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
 * Fetches all registered devices from `/api/sync/devices`.
 */
export async function fetchCloudDevices(params?: {
  serverUrl?: string;
  token?: string;
  currentDeviceId?: string;
  currentDeviceName?: string;
}): Promise<{ success: boolean; devices: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params?.serverUrl || getSyncServerUrl();
  const queryParams = new URLSearchParams();
  if (params?.currentDeviceId) queryParams.set('deviceId', params.currentDeviceId);
  if (params?.currentDeviceName) queryParams.set('deviceName', params.currentDeviceName);

  const qs = queryParams.toString();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices${qs ? `?${qs}` : ''}`;

  const req = await authenticatedSyncFetch(
    endpoint,
    { method: 'GET' },
    params?.token
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
      devices: Array.isArray(data.devices) ? data.devices : [],
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
 * Renames a device in the remote workspace registry via `/api/sync/devices`.
 */
export async function renameCloudDevice(params: {
  deviceId: string;
  newName: string;
  serverUrl?: string;
  token?: string;
}): Promise<{ success: boolean; devices?: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices`;

  const req = await authenticatedSyncFetch(
    endpoint,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: params.deviceId,
        newName: params.newName,
      }),
    },
    params.token
  );

  if (!req.success) {
    return { success: false, error: req.error };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      devices: Array.isArray(data.devices) ? data.devices : [],
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to parse response',
    };
  }
}

/**
 * Deletes a device from the remote workspace registry via `/api/sync/devices`.
 */
export async function deleteCloudDevice(params: {
  deviceId?: string;
  allOther?: boolean;
  keepDeviceId?: string;
  serverUrl?: string;
  token?: string;
}): Promise<{ success: boolean; devices?: DeviceSyncRecord[]; error?: string }> {
  const baseHost = params.serverUrl || getSyncServerUrl();
  const endpoint = `${baseHost.replace(/\/+$/, '')}/api/sync/devices`;

  const req = await authenticatedSyncFetch(
    endpoint,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: params.deviceId,
        allOther: params.allOther,
        keepDeviceId: params.keepDeviceId,
      }),
    },
    params.token
  );

  if (!req.success) {
    return { success: false, error: req.error };
  }

  try {
    const data = await req.response.json();
    return {
      success: true,
      devices: Array.isArray(data.devices) ? data.devices : [],
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to parse response',
    };
  }
}
