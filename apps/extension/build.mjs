import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const target = process.argv[2] || 'all';

async function buildTarget(browserName) {
  console.log(`\n📦 Building Arcable extension for ${browserName.toUpperCase()}...`);
  const outDir = resolve(__dirname, `dist/${browserName}`);

  // Clean target dir
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Build Popup & Options HTML
  await build({
    configFile: false,
    root: __dirname,
    plugins: [react()],
    base: './',
    resolve: {
      alias: {
        '@arcable/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/index.html'),
          options: resolve(__dirname, 'src/options/index.html'),
          sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  });

  // 2. Build Background Service Worker / Script
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: {
        '@arcable/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/background/index.ts'),
        name: 'Background',
        formats: ['iife'],
        fileName: () => 'background.js',
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  // 3. Build Content Script
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: {
        '@arcable/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/content/index.ts'),
        name: 'Content',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  // 3.5 Build OAuth Bridge Content Script
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: {
        '@arcable/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/content/oauth-bridge.ts'),
        name: 'OAuthBridge',
        formats: ['iife'],
        fileName: () => 'oauth-bridge.js',
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  // 4. Copy appropriate manifest
  const manifestSrc = resolve(__dirname, `manifest.${browserName}.json`);
  const manifestDest = resolve(outDir, 'manifest.json');
  fs.copyFileSync(manifestSrc, manifestDest);

  // If Vite outputs src/popup/index.html, ensure it matches manifest path (popup/index.html)
  if (fs.existsSync(resolve(outDir, 'src/popup/index.html'))) {
    fs.mkdirSync(resolve(outDir, 'popup'), { recursive: true });
    let popupHtml = fs.readFileSync(resolve(outDir, 'src/popup/index.html'), 'utf-8');
    // Fix relative paths from 2 levels deep (src/popup) to 1 level deep (popup)
    popupHtml = popupHtml.replace(/\.\.\/\.\.\//g, '../');
    fs.writeFileSync(resolve(outDir, 'popup/index.html'), popupHtml);
  }
  if (fs.existsSync(resolve(outDir, 'src/options/index.html'))) {
    fs.mkdirSync(resolve(outDir, 'options'), { recursive: true });
    let optionsHtml = fs.readFileSync(resolve(outDir, 'src/options/index.html'), 'utf-8');
    optionsHtml = optionsHtml.replace(/\.\.\/\.\.\//g, '../');
    fs.writeFileSync(resolve(outDir, 'options/index.html'), optionsHtml);
  }
  if (fs.existsSync(resolve(outDir, 'src/sidepanel/index.html'))) {
    fs.mkdirSync(resolve(outDir, 'sidepanel'), { recursive: true });
    let sidepanelHtml = fs.readFileSync(resolve(outDir, 'src/sidepanel/index.html'), 'utf-8');
    sidepanelHtml = sidepanelHtml.replace(/\.\.\/\.\.\//g, '../');
    fs.writeFileSync(resolve(outDir, 'sidepanel/index.html'), sidepanelHtml);
  }

  // Clean up temporary src directory in dist
  if (fs.existsSync(resolve(outDir, 'src'))) {
    fs.rmSync(resolve(outDir, 'src'), { recursive: true, force: true });
  }

  console.log(`✅ ${browserName.toUpperCase()} extension build complete in dist/${browserName}`);
}

async function main() {
  if (target === 'chrome' || target === 'all') {
    await buildTarget('chrome');
  }
  if (target === 'firefox' || target === 'all') {
    await buildTarget('firefox');
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
