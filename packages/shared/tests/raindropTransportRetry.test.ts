import assert from 'node:assert/strict';
import {
  fetchRaindropCollections,
  fetchRaindropUser,
  getRaindropRequestFailureDetails,
} from '../src/utils/raindropClient';

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function main(): Promise<void> {
  let rootAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith('/collections')) {
      rootAttempts += 1;
      if (rootAttempts < 3) throw new TypeError('NetworkError when attempting to fetch resource.');
      return jsonResponse({ items: [{ _id: 1, title: 'Arcable' }] });
    }
    if (pathname.endsWith('/collections/childrens')) return jsonResponse({ items: [] });
    throw new Error(`Unexpected request: ${pathname}`);
  }) as typeof fetch;

  const collections = await fetchRaindropCollections('token');
  assert.equal(rootAttempts, 3, 'a transient root collection transport failure should retry twice');
  assert.equal(collections[0]?._id, 1, 'the successful retry should hydrate the collection list');

  rootAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith('/collections')) {
      rootAttempts += 1;
      throw new TypeError('NetworkError when attempting to fetch resource.');
    }
    if (pathname.endsWith('/collections/childrens')) return jsonResponse({ items: [] });
    throw new Error(`Unexpected request: ${pathname}`);
  }) as typeof fetch;

  await assert.rejects(fetchRaindropCollections('token'), (error: unknown) => {
    const details = getRaindropRequestFailureDetails(error);
    assert.deepEqual(details, {
      operation: 'GET',
      endpoint: '/rest/v1/collections',
      retryCount: 2,
      errorName: 'TypeError',
      errorMessage: 'NetworkError when attempting to fetch resource.',
    });
    return true;
  });
  assert.equal(rootAttempts, 3, 'an exhausted transport failure should make the initial request plus two retries');

  rootAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith('/collections')) {
      rootAttempts += 1;
      return jsonResponse({ result: false }, 401);
    }
    if (pathname.endsWith('/collections/childrens')) return jsonResponse({ items: [] });
    throw new Error(`Unexpected request: ${pathname}`);
  }) as typeof fetch;
  await assert.rejects(fetchRaindropCollections('token'));
  assert.equal(rootAttempts, 1, 'HTTP auth failures must not be retried');

  let userAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input)).pathname;
    assert.equal(pathname, '/rest/v1/user');
    userAttempts += 1;
    if (userAttempts === 1) return jsonResponse({ result: false }, 429, { 'retry-after': '0' });
    return jsonResponse({ result: true, user: { _id: 1, fullName: 'Arcable User' } });
  }) as typeof fetch;
  const user = await fetchRaindropUser('token');
  assert.equal(userAttempts, 2, 'HTTP 429 should retain the existing server-directed retry behavior');
  assert.equal(user?.name, 'Arcable User');

  globalThis.fetch = originalFetch;
  console.log('Raindrop transport retry tests passed.');
}

void main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
