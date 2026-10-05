import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const manifests = [
  { name: 'Chrome', path: resolve(__dirname, '../manifest.chrome.json') },
  { name: 'Firefox', path: resolve(__dirname, '../manifest.firefox.json') },
];

console.log('Testing default extension keyboard shortcuts in manifests...');

for (const { name, path } of manifests) {
  const content = JSON.parse(readFileSync(path, 'utf8'));
  const commands = content.commands;

  assert.ok(commands, `${name} manifest must define commands`);

  // Verify _execute_action (Alt+A to activate extension)
  const executeAction = commands['_execute_action'];
  assert.ok(executeAction, `${name} manifest must define _execute_action command`);
  assert.deepEqual(
    executeAction.suggested_key,
    {
      default: 'Alt+A',
      mac: 'Alt+A',
    },
    `${name} manifest _execute_action must map to Alt+A by default and on Mac`
  );
  assert.strictEqual(
    executeAction.description,
    undefined,
    `${name} manifest _execute_action must NOT define a description property (reserved command)`
  );

  // Verify take-screenshot (Alt+K to screenshot)
  const takeScreenshot = commands['take-screenshot'];
  assert.ok(takeScreenshot, `${name} manifest must define take-screenshot command`);
  assert.deepEqual(
    takeScreenshot.suggested_key,
    {
      default: 'Alt+K',
      mac: 'Alt+K',
    },
    `${name} manifest take-screenshot must map to Alt+K by default and on Mac`
  );
}

console.log('✅ Default keyboard shortcut tests passed successfully!');
