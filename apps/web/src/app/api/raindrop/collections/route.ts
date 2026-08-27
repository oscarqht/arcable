import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  fetchRaindropCollections,
  getRaindropTokenFromEnv,
} from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  const token = authHeader || cookieToken || getRaindropTokenFromEnv();

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized. Please login to Raindrop.' }, { status: 401 });
  }

  try {
    const collections = await fetchRaindropCollections(token);
    return NextResponse.json({ collections });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
