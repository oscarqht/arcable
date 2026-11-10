import { fileURLToPath } from 'node:url';
import { checkScreenshotEditorAssets } from '../scripts/editorAssets.mjs';
const roots = process.argv.includes('--built') ? ['../dist/chrome/', '../dist/firefox/'] : ['../src/'];
for (const relative of roots) {
  checkScreenshotEditorAssets(fileURLToPath(new URL(relative, import.meta.url)));
}
console.log('Screenshot editor dependencies are complete.');
