import { NextRequest, NextResponse } from 'next/server';
import { getDefaultDeviceName, migrateWorkspace } from '@arcable/shared/utils';
import type { SyncProviderId } from '@arcable/shared/types';
import { ACCESS_TOKEN_COOKIE, getRaindropTokenFromEnv } from '@/lib/raindrop';
import {
  applyGoogleSession,
  getActiveSyncProvider,
  getGoogleSession,
  setSyncProviderCookie,
} from '@/lib/google';

export const dynamic = 'force-dynamic';

/** Copies the workspace from the active backend to `to` and makes `to` active. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const to: SyncProviderId | undefined = body?.to === 'raindrop' || body?.to === 'drive' ? body.to : undefined;
  if (!to) {
    return NextResponse.json({ success: false, error: 'Unknown sync backend' }, { status: 400 });
  }
  const from = getActiveSyncProvider(request);
  const session = await getGoogleSession(request);
  const raindropToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim() || getRaindropTokenFromEnv();
  const tokens: Record<SyncProviderId, string> = { raindrop: raindropToken, drive: session.accessToken || '' };

  const result = await migrateWorkspace({
    from,
    to,
    fromToken: tokens[from],
    toToken: tokens[to],
    localState: body?.localState,
    pendingOps: body?.pendingOps,
    deviceId: body?.deviceId,
    deviceName: body?.deviceName || getDefaultDeviceName('Web App'),
  });
  const response = NextResponse.json(result, { status: result.success ? 200 : 400 });
  if (result.success) setSyncProviderCookie(response, to);
  return applyGoogleSession(response, session);
}
