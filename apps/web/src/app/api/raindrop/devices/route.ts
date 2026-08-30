import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getRaindropTokenFromEnv,
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
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

  const { searchParams } = new URL(request.url);
  const currentDeviceId = searchParams.get('deviceId') || undefined;

  try {
    const result = await fetchRaindropDevices(token, currentDeviceId);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropDevicesRoute] Error fetching devices:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch devices from Raindrop.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

  const deviceId = body?.deviceId?.trim();
  const newName = body?.newName?.trim();

  if (!deviceId || !newName) {
    return NextResponse.json(
      { success: false, error: 'deviceId and newName are required.' },
      { status: 400 }
    );
  }

  try {
    const result = await renameRaindropDevice(token, deviceId, newName, body?.localState);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropDevicesRoute] Error renaming device:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to rename device.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { searchParams } = new URL(request.url);
  const deviceIdParam = searchParams.get('deviceId');
  const allOtherParam = searchParams.get('allOther') === 'true';
  const isAllOther = body?.allOther === true || allOtherParam;
  const deviceId = (body?.deviceId || deviceIdParam || '').trim();

  const token = extractToken(request, body?.token);
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Missing Raindrop access or API token.' },
      { status: 401 }
    );
  }

  if (!deviceId) {
    return NextResponse.json(
      { success: false, error: 'deviceId is required.' },
      { status: 400 }
    );
  }

  try {
    if (isAllOther) {
      const result = await deleteAllOtherRaindropDevices(token, deviceId, body?.localState);
      if (!result.success) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const result = await deleteRaindropDevice(token, deviceId, body?.localState);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[RaindropDevicesRoute] Error deleting device:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete device.' },
      { status: 500 }
    );
  }
}
