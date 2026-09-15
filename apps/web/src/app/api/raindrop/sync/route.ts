import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getRaindropTokenFromEnv,
  syncWorkspaceWithRaindrop,
  fetchRaindropWorkspace,
} from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

function extractToken(request: NextRequest, bodyToken?: string): string {
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  return bodyToken?.trim() || authHeader || cookieToken || getRaindropTokenFromEnv();
}

export async function GET(request: NextRequest) {
  const token = extractToken(request);

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Missing Raindrop access or API token.' },
      { status: 401 }
    );
  }

  try {
    const result = await fetchRaindropWorkspace(token);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropSyncRoute] Error fetching workspace:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch workspace from Raindrop.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const token = extractToken(request, body?.token);

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Missing Raindrop access or API token.' },
      { status: 401 }
    );
  }

  try {
    const result = await syncWorkspaceWithRaindrop(token, {
      localState: body?.localState,
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

