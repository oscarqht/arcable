import fs from 'node:fs';
import path from 'node:path';

/** The screenshot editor is copied without bundling, so Vite cannot check its imports. */
export function checkScreenshotEditorAssets(root) {
  const visited = new Set();
  function check(relative) {
    const filename = path.resolve(root, relative);
    if (visited.has(filename)) return;
    visited.add(filename);
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      throw new Error(`Missing screenshot editor asset: ${relative}`);
    }
    const extension = path.extname(filename);
    if (!['.html', '.css', '.js', '.mjs'].includes(extension)) return;
    const source = fs.readFileSync(filename, 'utf8');
    const pattern = extension === '.html' ? /(?:src|href)=["']([^"']+)["']/g
      : extension === '.css' ? /url\(\s*["']?([^\s"')]+)["']?\s*\)/g
      : /(?:from\s*|import\s*)["'](\.[^"']+)["']/g;
    for (const match of source.matchAll(pattern)) {
      const reference = match[1];
      if (/^(?:[a-z]+:|\/|#|%23)/i.test(reference)) continue;
      check(path.relative(root, path.resolve(path.dirname(filename), reference.split(/[?#]/)[0])));
    }
  }
  check('editor/index.html');
  // getAssetUrls resolves these at runtime rather than through static imports.
  for (const directory of ['fonts', 'icons', 'translations', 'embed-icons']) {
    const relative = `libs/tldraw/assets/${directory}`;
    const folder = path.resolve(root, relative);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory() || !fs.readdirSync(folder).length) {
      throw new Error(`Missing screenshot editor asset directory: ${relative}`);
    }
  }
}
