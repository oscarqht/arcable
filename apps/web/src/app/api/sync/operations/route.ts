import { NextResponse } from 'next/server';
import {
  authenticateUserFromRequest,
  getCorsHeaders,
  getSupabaseAdminClient,
} from '@/lib/supabaseServer';
import {
  WorkspaceOperation,
  SupabaseSyncRequest,
  SupabaseSyncResponse,
} from '@arcable/shared/types';
import { replayOperations } from '@arcable/shared/utils';
import { ArcableWorkspaceData } from '@arcable/shared/types';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: Request) {
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

  let body: SupabaseSyncRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      { status: 400, headers: corsHeaders }
    );
  }

  const {
    baseVersion = 1,
    deviceId = 'unknown_device',
    operations = [],
    initialState,
  } = body;

  try {
    // 2. Fetch current workspace snapshot from DB
    const { data: existingWorkspace, error: fetchErr } = await supabase
      .from('workspaces')
      .select('version, state')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.error('Error fetching workspace:', fetchErr);
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500, headers: corsHeaders }
      );
    }

    // ================= Case 1: First-time initialization =================
    if (!existingWorkspace) {
      const defaultState: ArcableWorkspaceData = initialState || {
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
      };

      const finalState = operations.length > 0
        ? replayOperations(defaultState, operations)
        : defaultState;

      const initialVersion = 1 + operations.length;
      finalState.version = initialVersion;

      // Insert snapshot
      const { error: insertErr } = await supabase
        .from('workspaces')
        .insert({
          user_id: userId,
          version: initialVersion,
          state: finalState,
        });

      if (insertErr) {
        console.error('Error creating initial workspace:', insertErr);
        return NextResponse.json(
          { success: false, error: insertErr.message },
          { status: 500, headers: corsHeaders }
        );
      }

      // Log initial operations if any
      if (operations.length > 0) {
        const rowsToInsert = operations.map((op, idx) => ({
          user_id: userId,
          version: 1 + idx + 1,
          device_id: op.deviceId || deviceId,
          type: op.type,
          payload: op.payload || null,
          timestamp: op.timestamp || Date.now(),
        }));
        await supabase.from('workspace_operations').insert(rowsToInsert);
      }

      const response: SupabaseSyncResponse = {
        success: true,
        serverVersion: initialVersion,
        fullState: finalState,
      };
      return NextResponse.json(response, { headers: corsHeaders });
    }

    // ================= Case 2: Existing workspace =================
    const currentServerVersion = Number(existingWorkspace.version) || 1;
    const currentServerState = existingWorkspace.state as ArcableWorkspaceData;

    // Subcase 2A: Client has no operations to push (Poll / Sync check)
    if (operations.length === 0) {
      const response: SupabaseSyncResponse = {
        success: true,
        serverVersion: currentServerVersion,
        fullState: currentServerState,
      };
      return NextResponse.json(response, { headers: corsHeaders });
    }

    // Subcase 2B: Client pushed 1 or more operations
    const newServerVersion = currentServerVersion + operations.length;
    const reconciledState = replayOperations(currentServerState, operations);
    reconciledState.version = newServerVersion;

    // Update snapshot
    const { error: updateErr } = await supabase
      .from('workspaces')
      .update({
        version: newServerVersion,
        state: reconciledState,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      console.error('Failed to update workspace:', updateErr);
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500, headers: corsHeaders }
      );
    }

    // Append operations to log
    const opRows = operations.map((op, idx) => ({
      user_id: userId,
      version: currentServerVersion + idx + 1,
      device_id: op.deviceId || deviceId,
      type: op.type,
      payload: op.payload || null,
      timestamp: op.timestamp || Date.now(),
    }));

    const { error: logErr } = await supabase.from('workspace_operations').insert(opRows);
    if (logErr) {
      console.warn('Failed to insert workspace operations log:', logErr);
    }

    // If baseVersion was behind currentServerVersion, check if client needs diffs from concurrent changes
    if (baseVersion < currentServerVersion) {
      const versionGap = currentServerVersion - baseVersion;
      if (versionGap <= 50) {
        const { data: missedRows } = await supabase
          .from('workspace_operations')
          .select('id, version, device_id, type, payload, timestamp')
          .eq('user_id', userId)
          .gt('version', baseVersion)
          .lte('version', currentServerVersion)
          .order('version', { ascending: true });

        if (missedRows && missedRows.length > 0) {
          const diffs: WorkspaceOperation[] = missedRows.map((r) => ({
            id: r.id,
            type: r.type as any,
            entityId: r.payload?.id || r.payload?.entityId || '',
            payload: r.payload,
            deviceId: r.device_id,
            timestamp: Number(r.timestamp),
            lamportSeq: Number(r.version),
          }));

          const response: SupabaseSyncResponse = {
            success: true,
            serverVersion: newServerVersion,
            diffs,
          };
          return NextResponse.json(response, { headers: corsHeaders });
        }
      }

      // Gap is large: return reconciled full state
      const response: SupabaseSyncResponse = {
        success: true,
        serverVersion: newServerVersion,
        fullState: reconciledState,
      };
      return NextResponse.json(response, { headers: corsHeaders });
    }

    // Clean sync without concurrency
    const response: SupabaseSyncResponse = {
      success: true,
      serverVersion: newServerVersion,
      diffs: [],
    };
    return NextResponse.json(response, { headers: corsHeaders });
  } catch (err: any) {
    console.error('Unhandled sync operations error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server internal error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
