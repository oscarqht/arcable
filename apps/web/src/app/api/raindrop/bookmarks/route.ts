import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  createRaindropBookmark,
  fetchRaindropItems,
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

  const searchParams = request.nextUrl.searchParams;
  const collectionId = parseInt(searchParams.get('collectionId') || '0', 10);
  const search = searchParams.get('search') || undefined;
  const page = parseInt(searchParams.get('page') || '0', 10);
  const perpage = parseInt(searchParams.get('perpage') || '25', 10);

  try {
    const data = await fetchRaindropItems(token, collectionId, { page, perpage, search });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch bookmarks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  const token = authHeader || cookieToken || getRaindropTokenFromEnv();

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized. Please login to Raindrop.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body?.link) {
      return NextResponse.json({ error: 'Link is required' }, { status: 400 });
    }

    const bookmark = await createRaindropBookmark(token, {
      title: body.title,
      link: body.link,
      excerpt: body.excerpt,
      tags: body.tags,
      collectionId: body.collectionId,
    });

    return NextResponse.json({ success: true, bookmark });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create bookmark in Raindrop' },
      { status: 500 }
    );
  }
}
