import { NextResponse } from 'next/server';
import {
  getCorsHeaders,
  refreshSupabaseUserSession,
} from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload.' },
      { status: 400, headers: corsHeaders }
    );
  }

  const refreshToken = body?.refresh_token?.trim();
  if (!refreshToken) {
    return NextResponse.json(
      { success: false, error: 'refresh_token is required.' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const { data, error } = await refreshSupabaseUserSession(refreshToken);

    if (error || !data?.session) {
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'Failed to refresh token. Refresh token may be invalid or expired.',
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const session = data.session;
    return NextResponse.json(
      {
        success: true,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          user: session.user
            ? {
                id: session.user.id,
                email: session.user.email,
                user_metadata: session.user.user_metadata,
              }
            : undefined,
        },
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while refreshing token.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
