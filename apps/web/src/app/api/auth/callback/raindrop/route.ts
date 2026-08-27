import { NextRequest, NextResponse } from 'next/server';
import {
  getRaindropConfig,
  exchangeRaindropOAuthCode,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  STATE_COOKIE,
  getAuthCookieOptions,
} from '@/lib/raindrop';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const baseUrl = new URL('/', request.url);

  if (error) {
    baseUrl.searchParams.set('error', errorDescription || error);
    return NextResponse.redirect(baseUrl);
  }

  if (!code) {
    baseUrl.searchParams.set('error', 'No authorization code provided from Raindrop');
    return NextResponse.redirect(baseUrl);
  }

  const { clientId, clientSecret, redirectUri } = getRaindropConfig();

  // Validate state signature if secret exists
  let statePayload: any = null;
  if (state) {
    if (state.includes('.')) {
      const [payloadB64, signature] = state.split('.');
      try {
        const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf-8');
        if (clientSecret) {
          const hmac = crypto.createHmac('sha256', clientSecret);
          hmac.update(payloadStr);
          const expectedSignature = hmac.digest('base64url');

          const expectedBuf = Buffer.from(expectedSignature, 'utf8');
          const providedBuf = Buffer.from(signature, 'utf8');

          if (
            expectedBuf.length === providedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, providedBuf)
          ) {
            statePayload = JSON.parse(payloadStr);
          }
        } else {
          statePayload = JSON.parse(payloadStr);
        }
      } catch (e) {
        // ignore state parsing issues
      }
    } else {
      try {
        statePayload = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      } catch (e) {
        // ignore
      }
    }
  }

  const savedState = request.cookies.get(STATE_COOKIE)?.value;
  if (savedState && state && savedState !== state) {
    baseUrl.searchParams.set('error', 'Invalid state parameter (CSRF protection)');
    return NextResponse.redirect(baseUrl);
  }

  try {
    const tokenData = await exchangeRaindropOAuthCode(
      code,
      clientId,
      clientSecret,
      redirectUri
    );

    // If request originated from extension or has bridge, render HTML bridge page or redirect
    const maxAge = tokenData.expires_in || 60 * 60 * 24 * 30; // 30 days default

    // If state requested an extension flow or external bridge
    if (statePayload?.fromExt || statePayload?.extId) {
      const bridgeHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Arcable Raindrop Auth Success</title>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
    .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; }
    h2 { color: #16a34a; margin-top: 0; }
    p { color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Connected to Raindrop.io!</h2>
    <p>You have successfully logged in. You can close this tab and return to the Arcable Extension.</p>
  </div>
  <script>
    const authData = {
      type: 'oauth_success',
      provider: 'raindrop',
      tokens: {
        access_token: ${JSON.stringify(tokenData.access_token)},
        refresh_token: ${JSON.stringify(tokenData.refresh_token || '')},
        expires_in: ${JSON.stringify(tokenData.expires_in || 2592000)}
      }
    };

    window.postMessage(authData, '*');

    // If extension ID is available and Chrome runtime exists
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const extId = ${JSON.stringify(statePayload?.extId || '')};
        if (extId) {
          chrome.runtime.sendMessage(extId, authData);
        } else {
          chrome.runtime.sendMessage(authData);
        }
      } catch (e) {
        console.log('Bridge runtime message error', e);
      }
    }
  </script>
</body>
</html>`;

      const response = new NextResponse(bridgeHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
      response.cookies.set(ACCESS_TOKEN_COOKIE, tokenData.access_token, getAuthCookieOptions(maxAge));
      if (tokenData.refresh_token) {
        response.cookies.set(REFRESH_TOKEN_COOKIE, tokenData.refresh_token, getAuthCookieOptions(60 * 60 * 24 * 90));
      }
      response.cookies.set(STATE_COOKIE, '', getAuthCookieOptions(0));
      return response;
    }

    const redirectResponse = NextResponse.redirect(new URL('/?auth=success', request.url));

    redirectResponse.cookies.set(
      ACCESS_TOKEN_COOKIE,
      tokenData.access_token,
      getAuthCookieOptions(maxAge)
    );

    if (tokenData.refresh_token) {
      redirectResponse.cookies.set(
        REFRESH_TOKEN_COOKIE,
        tokenData.refresh_token,
        getAuthCookieOptions(60 * 60 * 24 * 90)
      );
    }

    // Clear state cookie
    redirectResponse.cookies.set(STATE_COOKIE, '', getAuthCookieOptions(0));

    return redirectResponse;
  } catch (err: any) {
    baseUrl.searchParams.set(
      'error',
      err?.message || 'Failed to exchange Raindrop authorization code'
    );
    return NextResponse.redirect(baseUrl);
  }
}
