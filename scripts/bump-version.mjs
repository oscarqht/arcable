import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const FILES_TO_UPDATE = [
  'package.json',
  'apps/extension/package.json',
  'apps/web/package.json',
  'packages/shared/package.json',
  'apps/extension/manifest.chrome.json',
  'apps/extension/manifest.firefox.json',
];

function bumpMinor(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  if (isNaN(major) || isNaN(minor)) {
    throw new Error(`Invalid semver numbers in version: ${version}`);
  }
  return `${major}.${minor + 1}.0`;
}

function main() {
  const rootPkgPath = path.join(rootDir, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  const currentVersion = rootPkg.version;
  const newVersion = bumpMinor(currentVersion);
  const newTag = `v${newVersion}`;

  console.log(`Bumping minor version: ${currentVersion} -> ${newVersion} (Tag: ${newTag})`);

  for (const relPath of FILES_TO_UPDATE) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Warning: file not found: ${relPath}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(content);
    json.version = newVersion;
    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`Updated ${relPath} to version ${newVersion}`);
  }

  // Export outputs for GitHub Actions if available
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `current_version=${currentVersion}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_version=${newVersion}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_tag=${newTag}\n`);
  }
}

main();
