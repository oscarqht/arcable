import { withRaindropSession } from '@/lib/raindropSession';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, getRaindropTokenFromEnv } from '@/lib/raindrop';
import { listUploadedCovers, uploadCoverToLibrary } from '@arcable/shared/utils';

export const dynamic = 'force-dynamic';

function getToken(request: NextRequest): string {
  return request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    || request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim()
    || getRaindropTokenFromEnv();
}

async function handleGET(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Connect Raindrop to use your cover library.' }, { status: 401 });
  try {
    return NextResponse.json({ data: await listUploadedCovers(token) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load uploads.' }, { status: 502 });
  }
}

async function handlePOST(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Connect Raindrop to upload covers.' }, { status: 401 });
  if (Number(request.headers.get('content-length')) > 3 * 1024 * 1024) {
    return NextResponse.json({ error: 'Choose an image smaller than 2 MB.' }, { status: 413 });
  }
  try {
    const body = await request.json();
    if (typeof body?.name !== 'string' || typeof body?.dataUrl !== 'string') {
      return NextResponse.json({ error: 'Missing image upload.' }, { status: 400 });
    }
    return NextResponse.json({ data: await uploadCoverToLibrary(token, body.name, body.dataUrl) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not upload image.' }, { status: 502 });
  }
}

export const GET = withRaindropSession(handleGET);

export const POST = withRaindropSession(handlePOST);
