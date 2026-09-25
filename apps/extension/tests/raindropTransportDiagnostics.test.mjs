import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../src/background/index.ts', import.meta.url), 'utf8');

assert.match(background, /Workspace fetch exhausted transport retries\.[\s\S]*result\.errorDetails/,
  'workspace hydration failures must log the token-safe transport diagnostics after retries are exhausted');
assert.match(background, /Raindrop collection fetch exhausted transport retries\.[\s\S]*errorDetails/,
  'collection fetch failures must return the token-safe diagnostics to extension callers');
assert.match(background, /errorDetails:\s*result\.errorDetails/,
  'Raindrop sync failures must preserve transport diagnostics in the extension response');

console.log('Extension Raindrop transport diagnostics tests passed.');
