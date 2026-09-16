import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const callbackRoute = await readFile(
  new URL('../src/app/api/auth/callback/raindrop/route.ts', import.meta.url),
  'utf8'
);

assert.doesNotMatch(
  callbackRoute,
  /new URL\('\/\?auth=success',\s*request\.url\)/,
  'OAuth success must not redirect to the server bind address from request.url'
);
assert.match(
  callbackRoute,
  /baseUrl\.searchParams\.set\('auth',\s*'success'\)[\s\S]*NextResponse\.redirect\(baseUrl\)/,
  'OAuth success must use the same sanitized browser URL as callback errors'
);

console.log('OAuth redirect regression test passed.');
