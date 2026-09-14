import { NextResponse } from 'next/server';
import {
  authenticateUserFromRequest,
  getCorsHeaders,
  getSupabaseAdminClient,
} from '@/lib/supabaseServer';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: Request) {
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

  try {
    const { data: record, error } = await supabase
      .from('workspaces')
      .select('version, state, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error querying workspace state:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!record) {
      return NextResponse.json(
        { success: true, version: 1, state: null },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        version: Number(record.version) || 1,
        state: record.state,
        updatedAt: record.updated_at,
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
