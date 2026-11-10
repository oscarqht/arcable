import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('Safari packaging requires macOS and Xcode.');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ['build.mjs', 'safari']);
// Output is entirely generated. Resource references point at dist/safari, so
// subsequent web builds are picked up by Xcode without copying stale assets.
run('xcrun', ['safari-web-extension-converter', resolve(root, 'dist/safari'),
  '--project-location', resolve(root, 'build/safari'), '--app-name', 'Arcable',
  '--bundle-identifier', 'dev.arcable.Arcable', '--swift', '--macos-only',
  '--no-open', '--no-prompt', '--force']);
console.log('Open apps/extension/build/safari/Arcable/Arcable.xcodeproj. See docs/safari.md.');
