import { NextResponse } from 'next/server';
import {
  authenticateRaindropUserFromRequest,
  getCorsHeaders,
  getWorkspaceState,
} from '@/lib/raindropSyncServer';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  // 1. Authenticate user via Raindrop token
  const auth = await authenticateRaindropUserFromRequest(request);
  if (!auth.token) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId')?.trim() || undefined;
  const deviceName = searchParams.get('deviceName')?.trim() || undefined;

  try {
    const result = await getWorkspaceState(auth.token, deviceId, deviceName);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to fetch state' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        version: result.version || 1,
        state: result.state,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
