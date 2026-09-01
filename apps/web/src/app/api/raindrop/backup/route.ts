import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getRaindropTokenFromEnv,
  createRaindropBackup,
  fetchRaindropBackups,
  restoreRaindropBackup,
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
    const result = await fetchRaindropBackups(token);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropBackupRoute] Error listing backups:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to list backups from Raindrop.' },
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

  const workspaceData = body?.workspaceData || body?.localState;
  if (!workspaceData) {
    return NextResponse.json(
      { success: false, error: 'workspaceData is required for creating a backup.' },
      { status: 400 }
    );
  }

  const deviceName = body?.deviceName?.trim();
  const deviceType = body?.deviceType || 'Web App';

  try {
    const result = await createRaindropBackup(token, {
      workspaceData,
      deviceName,
      deviceType,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropBackupRoute] Error creating backup:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create backup in Raindrop.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

  const backupId = Number(body?.backupId);
  if (!backupId || isNaN(backupId)) {
    return NextResponse.json(
      { success: false, error: 'A valid backupId is required for restore.' },
      { status: 400 }
    );
  }

  const deviceId = body?.deviceId?.trim();
  const deviceName = body?.deviceName?.trim();

  try {
    const result = await restoreRaindropBackup(token, backupId, {
      deviceId,
      deviceName,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropBackupRoute] Error restoring backup:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to restore backup from Raindrop.' },
      { status: 500 }
    );
  }
}
