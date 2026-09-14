export interface ExtensionOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
}

export function isAllowedExtensionOAuthRedirect(value: string | null | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.extensions.allizom.org') || url.hostname.endsWith('.chromiumapp.org'))
    ) {
      return true;
    }

    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.pathname.startsWith('/mozoauth2/')
    );
  } catch {
    return false;
  }
}

export function createExtensionOAuthCallbackUrl(
  redirectUrl: string,
  tokens: ExtensionOAuthTokens
): string {
  if (!isAllowedExtensionOAuthRedirect(redirectUrl)) {
    throw new Error('Invalid browser extension OAuth redirect URL');
  }

  const callbackUrl = new URL(redirectUrl);
  const fragment = new URLSearchParams({ access_token: tokens.access_token });
  if (tokens.refresh_token) fragment.set('refresh_token', tokens.refresh_token);
  if (tokens.expires_at !== undefined) fragment.set('expires_at', String(tokens.expires_at));
  if (tokens.expires_in !== undefined) fragment.set('expires_in', String(tokens.expires_in));
  if (tokens.user) fragment.set('user', JSON.stringify(tokens.user));
  callbackUrl.hash = fragment.toString();
  return callbackUrl.toString();
}

function parseExtensionOAuthUser(value: string | null): ExtensionOAuthTokens['user'] {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
      return undefined;
    }

    return {
      id: parsed.id,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      user_metadata:
        parsed.user_metadata && typeof parsed.user_metadata === 'object'
          ? parsed.user_metadata
          : undefined,
    };
  } catch {
    return undefined;
  }
}

export function parseExtensionOAuthCallback(callbackUrl: string): ExtensionOAuthTokens | null {
  try {
    const url = new URL(callbackUrl);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    const accessToken = fragment.get('access_token') || url.searchParams.get('access_token');
    if (!accessToken) return null;

    const refreshToken = fragment.get('refresh_token') || url.searchParams.get('refresh_token');
    const expiresAt = fragment.get('expires_at') || url.searchParams.get('expires_at');
    const expiresIn = fragment.get('expires_in') || url.searchParams.get('expires_in');
    const user = parseExtensionOAuthUser(fragment.get('user') || url.searchParams.get('user'));

    return {
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
      expires_at: expiresAt ? Number(expiresAt) : undefined,
      expires_in: expiresIn ? Number(expiresIn) : undefined,
      user,
    };
  } catch {
    return null;
  }
}
