import { NextRequest, NextResponse } from 'next/server';
import { driveSyncProvider, getDefaultDeviceName } from '@arcable/shared/utils';
import { applyGoogleSession, getGoogleSession } from '@/lib/google';

export const dynamic = 'force-dynamic';

const unauthorized = () =>
  NextResponse.json({ success: false, error: 'Unauthorized. Connect Google Drive first.' }, { status: 401 });

export async function GET(request: NextRequest) {
  const session = await getGoogleSession(request);
  if (!session.accessToken) return unauthorized();
  const activeSpaceId = request.nextUrl.searchParams.get('activeSpaceId') || undefined;
  const result = await driveSyncProvider.fetchWorkspace(session.accessToken, activeSpaceId);
  return applyGoogleSession(NextResponse.json(result, { status: result.success ? 200 : 400 }), session);
}

export async function POST(request: NextRequest) {
  const session = await getGoogleSession(request);
  if (!session.accessToken) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const result = await driveSyncProvider.sync(session.accessToken, {
    localState: body?.localState,
    deviceId: body?.deviceId,
    deviceName: body?.deviceName || getDefaultDeviceName('Web App'),
    pendingOps: body?.pendingOps,
    replaceBaseline: body?.replaceBaseline,
  });
  return applyGoogleSession(NextResponse.json(result, { status: result.success ? 200 : 400 }), session);
}
