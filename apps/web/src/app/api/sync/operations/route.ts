import { NextResponse } from 'next/server';
import {
  authenticateRaindropUserFromRequest,
  getCorsHeaders,
  reconcileAndPersistWorkspace,
} from '@/lib/raindropSyncServer';
import { WorkspaceSyncRequest } from '@arcable/shared/types';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  // 1. Authenticate user via Raindrop token
  const auth = await authenticateRaindropUserFromRequest(request);
  if (!auth.token) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  let body: WorkspaceSyncRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const result = await reconcileAndPersistWorkspace(auth.token, body);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[SyncOperationsRoute] Error reconciling workspace:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server reconcile error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
