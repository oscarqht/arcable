import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getRaindropTokenFromEnv,
  syncWorkspaceWithRaindrop,
} from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const explicitToken = body?.token?.trim();
  const token = explicitToken || authHeader || cookieToken || getRaindropTokenFromEnv();

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Missing Raindrop access or API token.' },
      { status: 401 }
    );
  }

  try {
    const result = await syncWorkspaceWithRaindrop(token, {
      localState: body?.localState,
      deviceId: body?.deviceId,
      deviceName: body?.deviceName || 'Arcable Web App',
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropSyncRoute] Error syncing workspace:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync workspace with Raindrop.' },
      { status: 500 }
    );
  }
}
