import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getRaindropTokenFromEnv,
  searchRaindrop,
} from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  const token = authHeader || cookieToken || getRaindropTokenFromEnv();

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized. Please login to Raindrop.' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || searchParams.get('search') || searchParams.get('q') || '';

  if (!query.trim()) {
    return NextResponse.json({ items: [], collections: [] });
  }

  try {
    const data = await searchRaindrop(token, query.trim());
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to search Raindrop bookmarks' },
      { status: 500 }
    );
  }
}
