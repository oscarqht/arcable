import { NextRequest, NextResponse } from 'next/server';
import { SYNC_PROVIDER_CAPABILITIES } from '@arcable/shared/utils';
import {
  applyGoogleSession,
  getActiveSyncProvider,
  getGoogleSession,
  getGoogleUserForSession,
} from '@/lib/google';

export const dynamic = 'force-dynamic';

/** Active sync backend plus Google sign-in state. Raindrop state stays on /api/auth/me. */
export async function GET(request: NextRequest) {
  const provider = getActiveSyncProvider(request);
  const session = await getGoogleSession(request);
  const user = await getGoogleUserForSession(session);
  return applyGoogleSession(
    NextResponse.json({
      provider,
      capabilities: SYNC_PROVIDER_CAPABILITIES[provider],
      google: user ? { isAuthenticated: true, user } : { isAuthenticated: false },
    }),
    session
  );
}
