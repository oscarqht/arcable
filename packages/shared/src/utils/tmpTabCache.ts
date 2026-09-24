import type { TmpTab } from '../types/workspace';
import { RAINDROP_TMP_TABS_TTL_MS } from './tmpTabSync';

export const REMOTE_TMP_TABS_CACHE_PREFIX = 'arcable_remote_tmp_tabs_cache_';

export interface RemoteTmpTabsCacheData {
  tabs: TmpTab[];
  updatedAt: Record<string, number>;
  cachedAt: number;
}

export function getRemoteTmpTabsCacheKey(userId?: string | number | null): string {
  const safeId = userId !== undefined && userId !== null && String(userId).trim() !== ''
    ? String(userId).trim()
    : 'default';
  return `${REMOTE_TMP_TABS_CACHE_PREFIX}${safeId}`;
}

export function loadCachedRemoteTmpTabs(
  userId?: string | number | null,
  now: number = Date.now()
): { tabs: TmpTab[]; updatedAt: Record<string, number> } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const key = getRemoteTmpTabsCacheKey(userId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RemoteTmpTabsCacheData>;
    if (!parsed || !Array.isArray(parsed.tabs)) return null;

    const deviceUpdatedAt: Record<string, number> = {};
    if (parsed.updatedAt && typeof parsed.updatedAt === 'object') {
      for (const [devId, time] of Object.entries(parsed.updatedAt)) {
        if (typeof time === 'number' && Number.isFinite(time)) {
          if (now - time <= RAINDROP_TMP_TABS_TTL_MS) {
            deviceUpdatedAt[devId] = time;
          }
        }
      }
    }

    const validTabs = parsed.tabs.filter((tab) => {
      if (!tab || typeof tab !== 'object' || !tab.url || typeof tab.url !== 'string') return false;
      const deviceTime = tab.deviceId ? parsed.updatedAt?.[tab.deviceId] : undefined;
      const effectiveTime = typeof deviceTime === 'number' && Number.isFinite(deviceTime)
        ? deviceTime
        : tab.updatedAt;
      if (typeof effectiveTime === 'number' && Number.isFinite(effectiveTime)) {
        if (now - effectiveTime > RAINDROP_TMP_TABS_TTL_MS) return false;
      }
      return true;
    });

    return {
      tabs: validTabs,
      updatedAt: deviceUpdatedAt,
    };
  } catch (err) {
    console.warn('[TmpTabCache] Failed to load cached remote temporary tabs:', err);
    return null;
  }
}

export function saveCachedRemoteTmpTabs(
  userId: string | number | null | undefined,
  data: { tabs: TmpTab[]; updatedAt: Record<string, number> }
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const key = getRemoteTmpTabsCacheKey(userId);
  try {
    const payload: RemoteTmpTabsCacheData = {
      tabs: Array.isArray(data.tabs) ? data.tabs : [],
      updatedAt: data.updatedAt && typeof data.updatedAt === 'object' ? data.updatedAt : {},
      cachedAt: Date.now(),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('[TmpTabCache] Failed to save cached remote temporary tabs:', err);
  }
}

export function clearCachedRemoteTmpTabs(userId?: string | number | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const key = getRemoteTmpTabsCacheKey(userId);
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn('[TmpTabCache] Failed to clear cached remote temporary tabs:', err);
  }
}
