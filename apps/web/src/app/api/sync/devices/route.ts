import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRaindropUserFromRequest,
  getCorsHeaders,
  getWorkspaceDevices,
  renameWorkspaceDevice,
  deleteWorkspaceDevice,
} from '@/lib/raindropSyncServer';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

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
    const result = await getWorkspaceDevices(auth.token, deviceId, deviceName);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  const auth = await authenticateRaindropUserFromRequest(request);
  if (!auth.token) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const deviceId = body?.deviceId?.trim();
  const newName = body?.newName?.trim();

  if (!deviceId || !newName) {
    return NextResponse.json(
      { success: false, error: 'deviceId and newName are required.' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const result = await renameWorkspaceDevice(auth.token, deviceId, newName);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  const auth = await authenticateRaindropUserFromRequest(request);
  if (!auth.token) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

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
  const keepDeviceId = (body?.keepDeviceId || deviceId).trim();

  try {
    const result = await deleteWorkspaceDevice(auth.token, {
      deviceId,
      allOther: isAllOther,
      keepDeviceId,
    });
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
