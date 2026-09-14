import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateUserFromRequest,
  getCorsHeaders,
  getSupabaseAdminClient,
} from '@/lib/supabaseServer';
import { ArcableWorkspaceData, DeviceSyncRecord } from '@arcable/shared/types';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  // 1. Authenticate user from Bearer JWT
  const auth = await authenticateUserFromRequest(request);
  if (!auth.user) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  const userId = auth.user.id;
  const supabase = getSupabaseAdminClient();

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId')?.trim();
  const deviceName = searchParams.get('deviceName')?.trim();

  try {
    const { data: record, error } = await supabase
      .from('workspaces')
      .select('version, state')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching workspace for devices:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    let state: ArcableWorkspaceData;
    let version = 1;

    if (!record) {
      // First-time workspace initialization
      state = {
        spaces: [
          {
            id: 'space_personal',
            name: 'Personal',
            emojiIcon: '🌟',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        folders: [],
        tabs: [],
        tmpTabs: [],
        widgets: [],
        customCodeRules: [],
        runCodeInPageRules: [],
        activeSpaceId: 'space_personal',
        version: 1,
        devices: {},
      };

      if (deviceId) {
        state.devices = {
          [deviceId]: {
            deviceId,
            deviceName: deviceName || 'Web App',
            lastSyncAt: Date.now(),
          },
        };
      }

      const { error: insertErr } = await supabase.from('workspaces').insert({
        user_id: userId,
        version: 1,
        state,
      });

      if (insertErr) {
        console.error('Error inserting initial workspace with device:', insertErr);
        return NextResponse.json(
          { success: false, error: insertErr.message },
          { status: 500, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { success: true, devices: Object.values(state.devices || {}) },
        { headers: corsHeaders }
      );
    }

    state = (record.state || {}) as ArcableWorkspaceData;
    version = Number(record.version) || 1;
    const devices: Record<string, DeviceSyncRecord> = { ...(state.devices || {}) };

    let stateModified = false;
    if (deviceId) {
      const existing = devices[deviceId];
      const now = Date.now();
      devices[deviceId] = {
        deviceId,
        deviceName: deviceName || existing?.deviceName || 'Device',
        lastSyncAt: now,
      };
      state.devices = devices;
      stateModified = true;
    }

    if (stateModified) {
      await supabase
        .from('workspaces')
        .update({
          state,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    return NextResponse.json(
      { success: true, devices: Object.values(devices) },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('Unhandled GET /api/sync/devices error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server internal error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  // 1. Authenticate user from Bearer JWT
  const auth = await authenticateUserFromRequest(request);
  if (!auth.user) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  const userId = auth.user.id;
  const supabase = getSupabaseAdminClient();

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
    const { data: record, error } = await supabase
      .from('workspaces')
      .select('version, state')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !record) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Workspace not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const state = (record.state || {}) as ArcableWorkspaceData;
    const devices: Record<string, DeviceSyncRecord> = { ...(state.devices || {}) };

    if (!devices[deviceId]) {
      devices[deviceId] = {
        deviceId,
        deviceName: newName,
        lastSyncAt: Date.now(),
      };
    } else {
      devices[deviceId] = {
        ...devices[deviceId],
        deviceName: newName,
      };
    }

    state.devices = devices;

    const { error: updateErr } = await supabase
      .from('workspaces')
      .update({
        state,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true, devices: Object.values(devices) },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('Unhandled PATCH /api/sync/devices error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server internal error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  // 1. Authenticate user from Bearer JWT
  const auth = await authenticateUserFromRequest(request);
  if (!auth.user) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  const userId = auth.user.id;
  const supabase = getSupabaseAdminClient();

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

  if (!deviceId && !keepDeviceId) {
    return NextResponse.json(
      { success: false, error: 'deviceId is required' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const { data: record, error } = await supabase
      .from('workspaces')
      .select('version, state')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !record) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Workspace not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const state = (record.state || {}) as ArcableWorkspaceData;
    let devices: Record<string, DeviceSyncRecord> = { ...(state.devices || {}) };

    if (isAllOther) {
      const current = devices[keepDeviceId] || {
        deviceId: keepDeviceId,
        deviceName: 'Device',
        lastSyncAt: Date.now(),
      };
      devices = { [keepDeviceId]: current };

      // Prune tmpTabs from other devices
      if (state.tmpTabs) {
        state.tmpTabs = state.tmpTabs.filter((t) => !t.deviceId || t.deviceId === keepDeviceId);
      }
    } else {
      delete devices[deviceId];

      // Prune tmpTabs from removed device
      if (state.tmpTabs) {
        state.tmpTabs = state.tmpTabs.filter((t) => t.deviceId !== deviceId);
      }
    }

    state.devices = devices;

    const { error: updateErr } = await supabase
      .from('workspaces')
      .update({
        state,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true, devices: Object.values(devices) },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('Unhandled DELETE /api/sync/devices error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server internal error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
