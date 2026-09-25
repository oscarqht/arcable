import { NextResponse } from 'next/server';
import { clearGoogleCookies } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearGoogleCookies(response);
  return response;
}
