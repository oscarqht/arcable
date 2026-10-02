import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const settingsModal = await readFile(
  new URL('../../../packages/shared/src/components/workspace/SettingsModal.tsx', import.meta.url),
  'utf8'
);
const meRoute = await readFile(new URL('../src/app/api/auth/me/route.ts', import.meta.url), 'utf8');
const tokenRoute = await readFile(new URL('../src/app/api/auth/token/route.ts', import.meta.url), 'utf8');

// 1. Webapp Page Settings Button & Modal
assert.match(
  page,
  /import\s*\{[^}]*SettingsModal[^}]*SettingsIcon[^}]*\}\s*from\s*['"]@arcable\/shared\/components['"]/,
  'page.tsx must import SettingsModal and SettingsIcon from @arcable/shared/components'
);

assert.match(
  page,
  /const\s*\[isSettingsModalOpen,\s*setIsSettingsModalOpen\]\s*=\s*useState\(false\)/,
  'page.tsx must have isSettingsModalOpen state'
);

assert.match(
  page,
  /setIsSettingsModalOpen\(true\)[\s\S]*?<SettingsIcon size=\{14\}/,
  'page.tsx must provide a Settings button with SettingsIcon in the header'
);

assert.match(
  page,
  /<SettingsIcon size=\{14\}[^>]*\/>\s*Configure Raindrop API Token/,
  'page.tsx login card must provide a Configure Raindrop API Token button'
);

assert.match(
  page,
  /Configure Raindrop Test API Token in Settings/,
  'page.tsx login card must provide an explicit Settings shortcut when client ID or auth fails'
);

assert.match(
  page,
  /const handleLoginWithToken = async \(token: string\)/,
  'page.tsx must implement handleLoginWithToken'
);

assert.match(
  page,
  /<SettingsModal[\s\S]*?isOpen=\{isSettingsModalOpen\}[\s\S]*?onLoginWithToken=\{handleLoginWithToken\}/,
  'page.tsx must render SettingsModal with handleLoginWithToken'
);

// 2. SettingsModal implementation
assert.match(
  settingsModal,
  /Raindrop Test API Token/,
  'SettingsModal must support setting Raindrop Test API Token'
);

assert.match(
  settingsModal,
  /https:\/\/app\.raindrop\.io\/settings\/integrations/,
  'SettingsModal must link to Raindrop integration settings'
);

assert.match(
  settingsModal,
  /type=\{showToken \? 'text' : 'password'\}/,
  'SettingsModal must provide masked token input with show/hide toggle'
);

assert.match(
  settingsModal,
  /onLoginWithToken\(clean\)/,
  'SettingsModal must submit clean token to onLoginWithToken handler'
);

assert.match(
  settingsModal,
  /Update Raindrop Test API Token/,
  'SettingsModal must support updating token when authenticated'
);

// 3. API Routes
assert.match(
  meRoute,
  /authType\s*=\s*hasRefreshToken\s*\?\s*['"]oauth['"]\s*:\s*['"]token['"]/,
  '/api/auth/me must determine authType based on refresh token presence'
);

assert.match(
  meRoute,
  /authType,/,
  '/api/auth/me must return authType in JSON response'
);

assert.match(
  tokenRoute,
  /export async function DELETE\(\)/,
  '/api/auth/token must support DELETE to clear token cookie'
);

console.log('Raindrop test API token settings tests passed.');
