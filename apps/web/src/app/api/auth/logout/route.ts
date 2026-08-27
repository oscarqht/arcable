import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  STATE_COOKIE,
  getAuthCookieOptions,
} from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });

  const clearCookieOptions = getAuthCookieOptions(0);

  response.cookies.set(ACCESS_TOKEN_COOKIE, '', clearCookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', clearCookieOptions);
  response.cookies.set(STATE_COOKIE, '', clearCookieOptions);

  return response;
}
