import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

test('scripts/zen-hide-sidebar-header.ps1 exists and has correct PowerShell logic', () => {
  const ps1Path = path.join(projectRoot, 'scripts/zen-hide-sidebar-header.ps1');
  assert.ok(fs.existsSync(ps1Path), 'PowerShell script must exist');

  const content = fs.readFileSync(ps1Path, 'utf8');

  // Verify preference and CSS selectors
  assert.ok(
    content.includes('toolkit.legacyUserProfileCustomizations.stylesheets'),
    'Must enable toolkit.legacyUserProfileCustomizations.stylesheets'
  );
  assert.ok(
    content.includes('#zen-sidebar-web-header'),
    'Must target #zen-sidebar-web-header'
  );
  assert.ok(
    content.includes('#sidebar-header'),
    'Must target #sidebar-header'
  );

  // Verify Windows environment variables checked
  assert.ok(content.includes('$env:APPDATA'), 'Must check APPDATA');
  assert.ok(content.includes('$env:USERPROFILE'), 'Must check USERPROFILE');

  // Verify profiles.ini parsing and path normalization
  assert.ok(content.includes('profiles.ini'), 'Must parse profiles.ini');
  assert.ok(content.includes("-replace '/', '\\'"), 'Must normalize slashes for Windows paths');

  // Verify non-destructive return instead of session-killing exit
  assert.ok(!content.includes('exit 1'), 'Must not call exit 1 so iex doesn\'t close PowerShell session');
});

test('scripts/zen-hide-sidebar-header.sh supports macOS, Linux, and Windows Git Bash/WSL', () => {
  const shPath = path.join(projectRoot, 'scripts/zen-hide-sidebar-header.sh');
  assert.ok(fs.existsSync(shPath), 'Bash script must exist');

  const content = fs.readFileSync(shPath, 'utf8');

  // Verify Mac support
  assert.ok(content.includes('Library/Application Support/zen'), 'Must check macOS Zen dir');

  // Verify Linux support
  assert.ok(content.includes('.var/app/app.zen_browser.zen/.zen'), 'Must check Flatpak Zen dir');

  // Verify Windows (Git Bash / Cygwin / WSL) support
  assert.ok(content.includes('APPDATA'), 'Must check APPDATA');
  assert.ok(content.includes('USERPROFILE'), 'Must check USERPROFILE');
  assert.ok(content.includes('cygpath'), 'Must support cygpath for POSIX path translation on Windows');
  assert.ok(content.includes('${rel_path//\\\\//}'), 'Must normalize backslashes in profiles.ini');

  // Verify preference and CSS rules
  assert.ok(
    content.includes('toolkit.legacyUserProfileCustomizations.stylesheets'),
    'Must enable toolkit.legacyUserProfileCustomizations.stylesheets'
  );
  assert.ok(
    content.includes('#zen-sidebar-web-header'),
    'Must target #zen-sidebar-web-header'
  );
});

test('README.md and options App.tsx reference consistent Windows and macOS setup commands', () => {
  const readmePath = path.join(projectRoot, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');

  const appTsxPath = path.join(projectRoot, 'apps/extension/src/options/App.tsx');
  const appTsx = fs.readFileSync(appTsxPath, 'utf8');

  const expectedMacCommand = 'curl -fsSL https://raw.githubusercontent.com/oscarqht/arcable/main/scripts/zen-hide-sidebar-header.sh | bash';
  const expectedWinCommand = 'irm https://raw.githubusercontent.com/oscarqht/arcable/main/scripts/zen-hide-sidebar-header.ps1 | iex';

  // Check README
  assert.ok(readme.includes(expectedMacCommand), 'README must document macOS/Linux command');
  assert.ok(readme.includes(expectedWinCommand), 'README must document Windows command');

  // Check App.tsx
  assert.ok(appTsx.includes(expectedMacCommand), 'App.tsx must include macOS/Linux command');
  assert.ok(appTsx.includes(expectedWinCommand), 'App.tsx must include Windows command');
  assert.ok(appTsx.includes('Windows (PowerShell)'), 'App.tsx must have Windows platform switcher');
  assert.ok(appTsx.includes('macOS & Linux (Terminal)'), 'App.tsx must have macOS/Linux platform switcher');
});
