import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client with elevated / service role permissions for server routes.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing.'
    );
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedAdminClient;
}

/**
 * Extracts Bearer token from the incoming Request Authorization header
 * and validates it against Supabase Auth.
 */
export async function authenticateUserFromRequest(request: Request): Promise<{
  user: User | null;
  token: string | null;
  error?: string;
}> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, token: null, error: 'Missing or invalid Authorization header.' };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { user: null, token: null, error: 'Empty bearer token.' };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return { user: null, token, error: error?.message || 'Unauthorized token.' };
    }

    return { user: data.user, token };
  } catch (err: any) {
    return { user: null, token, error: err?.message || 'Failed to authenticate user.' };
  }
}

const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/**
 * Refreshes a user session statelessly using their refresh_token against Supabase Auth.
 * Uses the client-facing anon key directly rather than the cached admin client to prevent
 * session pollution and commit guard collisions across multiple devices.
 */
export async function refreshSupabaseUserSession(refreshToken: string): Promise<{
  data: {
    session: {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
      expires_in?: number;
      user?: any;
    } | null;
    user?: any;
  } | null;
  error: Error | null;
}> {
  const anonKey = SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!SUPABASE_URL || !anonKey) {
    return {
      data: null,
      error: new Error('Supabase configuration missing (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).'),
    };
  }

  try {
    const endpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const message =
        errBody?.msg ||
        errBody?.error_description ||
        errBody?.error ||
        `Token refresh failed with status ${res.status}`;
      return { data: null, error: new Error(message) };
    }

    const data = await res.json();
    if (!data?.access_token) {
      return { data: null, error: new Error('No access_token returned by refresh endpoint.') };
    }

    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      user: data.user,
    };

    return {
      data: {
        session,
        user: data.user,
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(err?.message || 'Network error during token refresh'),
    };
  }
}

/**
 * Generates CORS headers allowing Chrome/Firefox extensions and localhost web requests.
 */
export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
    'Access-Control-Allow-Credentials': 'true',
  };
}

