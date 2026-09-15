import { areUrlsMatching } from '../src/utils/format';

function assertEqual(actual: boolean, expected: boolean, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

assertEqual(
  areUrlsMatching('http://100.99.123.84:3200/', 'http://100.99.123.84:23333/#/instances'),
  false,
  'different ports must not associate an open tab with a saved tab',
);
assertEqual(
  areUrlsMatching('http://example.com/projects', 'https://example.com/projects'),
  false,
  'different protocols must not match',
);
assertEqual(
  areUrlsMatching('https://example.com/projects', 'https://example.com/settings'),
  false,
  'different paths must not match',
);
assertEqual(
  areUrlsMatching('https://example.com/projects?view=grid', 'https://example.com/projects?view=list'),
  false,
  'different search queries must not match',
);
assertEqual(
  areUrlsMatching('https://example.com/projects/?view=grid#section', 'https://example.com/projects?view=grid'),
  true,
  'trailing slashes and hashes should not prevent a match',
);
