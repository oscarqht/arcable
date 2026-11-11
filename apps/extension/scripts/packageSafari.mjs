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

if (process.argv.includes('--build-app')) {
  // Safari may reject ad hoc signatures even with Allow unsigned extensions.
  // Use a local development certificate; never silently ship an ad hoc app.
  let identity = process.env.SAFARI_SIGNING_IDENTITY;
  if (!identity) {
    const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Could not query local code-signing identities.');
    identity = result.stdout.match(/([A-Fa-f0-9]{40}) \"(?:Apple Development|Mac Developer):[^\"]+\"/)?.[1];
  }
  if (!identity || identity === '-') {
    throw new Error('A local Apple Development certificate is required. Configure signing in Xcode or set SAFARI_SIGNING_IDENTITY. See docs/safari.md for temporary-extension testing.');
  }
  const derivedData = resolve(root, 'build/safari-developed');
  run('xcodebuild', ['-project', resolve(root, 'build/safari/Arcable/Arcable.xcodeproj'),
    '-scheme', 'Arcable', '-configuration', 'Debug', '-derivedDataPath', derivedData,
    'CODE_SIGN_STYLE=Manual', `CODE_SIGN_IDENTITY=${identity}`, 'build']);
  const app = resolve(derivedData, 'Build/Products/Debug/Arcable.app');
  run('codesign', ['--verify', '--deep', '--strict', app]);
  console.log(`Development-signed app: ${app}`);
}
