import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Transpile packages/shared/src/utils/zoom.ts
const zoomSource = await readFile(new URL('../../../packages/shared/src/utils/zoom.ts', import.meta.url), 'utf8');
const zoomCompiled = ts.transpileModule(zoomSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Transpile apps/extension/src/sidepanel/zoomSync.ts
const zoomSyncSource = await readFile(new URL('../src/sidepanel/zoomSync.ts', import.meta.url), 'utf8');
const zoomSyncCompiled = ts.transpileModule(zoomSyncSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createEnvironment(initialMocks = {}) {
  const styles = {};
  const docElement = {
    style: {
      transform: '',
      transformOrigin: '',
      width: '',
      height: '',
      setProperty(name, val) {
        styles[name] = String(val);
      },
      getPropertyValue(name) {
        return styles[name] || '';
      },
    },
  };

  const listeners = {
    focus: [],
  };

  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    addEventListener(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter((cb) => cb !== fn);
      }
    },
    trigger(evt) {
      if (listeners[evt]) {
        listeners[evt].forEach((fn) => fn());
      }
    },
  };

  const doc = {
    documentElement: docElement,
  };

  const mockBrowser = {
    tabs: {
      query: async () => [{ id: 101, active: true }],
      getZoom: async (id) => (id === 101 ? 1.25 : 1.0),
      onZoomChange: {
        _listeners: [],
        addListener(fn) {
          this._listeners.push(fn);
        },
        removeListener(fn) {
          this._listeners = this._listeners.filter((cb) => cb !== fn);
        },
        trigger(info) {
          this._listeners.forEach((fn) => fn(info));
        },
      },
      onActivated: {
        _listeners: [],
        addListener(fn) {
          this._listeners.push(fn);
        },
        removeListener(fn) {
          this._listeners = this._listeners.filter((cb) => cb !== fn);
        },
        trigger(info) {
          this._listeners.forEach((fn) => fn(info));
        },
      },
    },
    storage: {
      local: {
        _store: {},
        async get(key) {
          return { [key]: this._store[key] };
        },
        async set(obj) {
          Object.assign(this._store, obj);
        },
      },
      onChanged: {
        _listeners: [],
        addListener(fn) {
          this._listeners.push(fn);
        },
        removeListener(fn) {
          this._listeners = this._listeners.filter((cb) => cb !== fn);
        },
        trigger(changes, area) {
          this._listeners.forEach((fn) => fn(changes, area));
        },
      },
    },
    runtime: {
      getBrowserInfo: async () => ({ name: 'Zen' }),
    },
    ...initialMocks.browser,
  };

  const mockBrowserUtils = {
    browser: mockBrowser,
    getActiveTab: async () => {
      const tabs = await mockBrowser.tabs.query({ active: true });
      return tabs[0];
    },
    isZenBrowser: async () => true,
    ...initialMocks.browserUtils,
  };

  const sandbox = {
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    document: doc,
    window: win,
    browser: mockBrowser,
    require(id) {
      if (id === 'react') {
        return {
          useEffect: (effect) => {
            const cleanup = effect();
            return cleanup;
          },
        };
      }
      if (id === '../utils/browser') {
        return mockBrowserUtils;
      }
      throw new Error(`Unexpected require in test: ${id}`);
    },
  };

  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  // Load zoom.ts into sandbox
  const zoomExports = {};
  vm.runInContext(
    `(function(exports) { ${zoomCompiled} })(zoomExports)`,
    Object.assign(context, { zoomExports })
  );

  // Load zoomSync.ts into sandbox
  vm.runInContext(zoomSyncCompiled, context);

  return {
    docElement,
    styles,
    win,
    mockBrowser,
    mockBrowserUtils,
    zoomSync: context.exports,
    zoomUtils: context.zoomExports,
  };
}

test('applyZoomToExtensionPage applies CSS scale, origin, and inverse dimensions (Option A)', () => {
  const { docElement, styles, zoomSync } = createEnvironment();

  // Test 120% zoom
  zoomSync.applyZoomToExtensionPage(1.2);
  assert.equal(styles['--extension-zoom-factor'], '1.2');
  assert.equal(docElement.style.transform, 'scale(1.2)');
  assert.equal(docElement.style.transformOrigin, 'top left');
  assert.equal(docElement.style.width, `${100 / 1.2}%`);
  assert.equal(docElement.style.height, `${100 / 1.2}%`);

  // Test 80% zoom
  zoomSync.applyZoomToExtensionPage(0.8);
  assert.equal(styles['--extension-zoom-factor'], '0.8');
  assert.equal(docElement.style.transform, 'scale(0.8)');
  assert.equal(docElement.style.transformOrigin, 'top left');
  assert.equal(docElement.style.width, '125%');
  assert.equal(docElement.style.height, '125%');

  // Test 100% zoom (1.0) resets inline transform and dimensions
  zoomSync.applyZoomToExtensionPage(1.0);
  assert.equal(styles['--extension-zoom-factor'], '1');
  assert.equal(docElement.style.transform, '');
  assert.equal(docElement.style.transformOrigin, '');
  assert.equal(docElement.style.width, '');
  assert.equal(docElement.style.height, '');
});

test('applyZoomToExtensionPage safely sanitizes invalid factors (0, negative, NaN)', () => {
  const { docElement, styles, zoomSync } = createEnvironment();

  zoomSync.applyZoomToExtensionPage(0);
  assert.equal(styles['--extension-zoom-factor'], '1');
  assert.equal(docElement.style.transform, '');

  zoomSync.applyZoomToExtensionPage(-1.5);
  assert.equal(styles['--extension-zoom-factor'], '1');
  assert.equal(docElement.style.transform, '');

  zoomSync.applyZoomToExtensionPage(NaN);
  assert.equal(styles['--extension-zoom-factor'], '1');
  assert.equal(docElement.style.transform, '');
});

test('shared zoom coordinate normalizations accurately scale rectangles, points, and viewport dimensions', () => {
  const { zoomSync, zoomUtils } = createEnvironment();

  // Normal at zoom = 1
  zoomSync.applyZoomToExtensionPage(1);
  assert.equal(zoomUtils.getEffectiveZoomFactor(), 1);

  const rect = { top: 100, bottom: 200, left: 50, right: 150, width: 100, height: 100 };
  const normRect1 = zoomUtils.normalizeRectForZoom(rect);
  assert.equal(normRect1.top, 100);
  assert.equal(normRect1.bottom, 200);
  assert.equal(normRect1.left, 50);
  assert.equal(normRect1.right, 150);
  assert.equal(normRect1.width, 100);
  assert.equal(normRect1.height, 100);

  const normPoint1 = zoomUtils.normalizePointForZoom({ x: 300, y: 400 });
  assert.equal(normPoint1.x, 300);
  assert.equal(normPoint1.y, 400);

  const dim1 = zoomUtils.getScaledViewportDimensions();
  assert.equal(dim1.width, 1000);
  assert.equal(dim1.height, 800);

  // Scaled at zoom = 2
  zoomSync.applyZoomToExtensionPage(2);
  assert.equal(zoomUtils.getEffectiveZoomFactor(), 2);

  const scaledRect = zoomUtils.normalizeRectForZoom(rect);
  assert.equal(scaledRect.top, 50);
  assert.equal(scaledRect.bottom, 100);
  assert.equal(scaledRect.left, 25);
  assert.equal(scaledRect.right, 75);
  assert.equal(scaledRect.width, 50);
  assert.equal(scaledRect.height, 50);

  const scaledPoint = zoomUtils.normalizePointForZoom({ x: 300, y: 400 });
  assert.equal(scaledPoint.x, 150);
  assert.equal(scaledPoint.y, 200);

  const scaledDim = zoomUtils.getScaledViewportDimensions();
  assert.equal(scaledDim.width, 500);
  assert.equal(scaledDim.height, 400);
});

test('getActiveTabZoom retrieves zoom from browser.tabs.getZoom', async () => {
  const { zoomSync, mockBrowser } = createEnvironment();

  mockBrowser.tabs.getZoom = async (id) => (id === 42 ? 1.75 : 1.25);

  const defaultZoom = await zoomSync.getActiveTabZoom();
  assert.equal(defaultZoom, 1.25);

  const tab42Zoom = await zoomSync.getActiveTabZoom(42);
  assert.equal(tab42Zoom, 1.75);
});

test('isZenZoomSyncActive defaults to true in Zen Browser and respects user setting override', async () => {
  const { zoomSync, mockBrowser, mockBrowserUtils } = createEnvironment();

  // In Zen with no setting stored -> true
  mockBrowserUtils.isZenBrowser = async () => true;
  assert.equal(await zoomSync.isZenZoomSyncActive(), true);

  // In non-Zen with no setting stored -> false
  mockBrowserUtils.isZenBrowser = async () => false;
  assert.equal(await zoomSync.isZenZoomSyncActive(), false);

  // Explicit storage override to false -> false even in Zen
  mockBrowserUtils.isZenBrowser = async () => true;
  mockBrowser.storage.local._store[zoomSync.STORAGE_KEY_ZEN_ZOOM_SYNC] = false;
  assert.equal(await zoomSync.isZenZoomSyncActive(), false);

  // Explicit storage override to true -> true even in non-Zen
  mockBrowserUtils.isZenBrowser = async () => false;
  mockBrowser.storage.local._store[zoomSync.STORAGE_KEY_ZEN_ZOOM_SYNC] = true;
  assert.equal(await zoomSync.isZenZoomSyncActive(), true);
});

test('setupZenZoomSync synchronizes zoom events, tab activations, storage changes, and cleanup', async () => {
  const { docElement, styles, win, mockBrowser, zoomSync } = createEnvironment();

  // Active tab starts with id 101, zoom 1.25
  mockBrowser.tabs.query = async () => [{ id: 101, active: true }];
  mockBrowser.tabs.getZoom = async (id) => (id === 101 ? 1.25 : 1.0);

  const cleanup = zoomSync.setupZenZoomSync();

  // Initial sync
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(styles['--extension-zoom-factor'], '1.25');
  assert.equal(docElement.style.transform, 'scale(1.25)');

  // 1. Zoom change on active tab -> updates extension zoom
  mockBrowser.tabs.onZoomChange.trigger({ tabId: 101, oldZoomFactor: 1.25, newZoomFactor: 1.5 });
  assert.equal(styles['--extension-zoom-factor'], '1.5');
  assert.equal(docElement.style.transform, 'scale(1.5)');

  // 2. Zoom change on background tab -> ignored
  mockBrowser.tabs.onZoomChange.trigger({ tabId: 999, oldZoomFactor: 1.0, newZoomFactor: 0.8 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(styles['--extension-zoom-factor'], '1.5');

  // 3. Tab switched to tab 202 (which has zoom 1.1)
  mockBrowser.tabs.query = async () => [{ id: 202, active: true }];
  mockBrowser.tabs.getZoom = async (id) => (id === 202 ? 1.1 : 1.0);
  mockBrowser.tabs.onActivated.trigger({ tabId: 202 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(styles['--extension-zoom-factor'], '1.1');
  assert.equal(docElement.style.transform, 'scale(1.1)');

  // 4. Window focus -> re-syncs active tab
  mockBrowser.tabs.getZoom = async (id) => (id === 202 ? 1.3 : 1.0);
  win.trigger('focus');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(styles['--extension-zoom-factor'], '1.3');

  // 5. Setting toggled off in storage -> immediately resets zoom to 1.0
  mockBrowser.storage.onChanged.trigger(
    { [zoomSync.STORAGE_KEY_ZEN_ZOOM_SYNC]: { newValue: false } },
    'local'
  );
  assert.equal(styles['--extension-zoom-factor'], '1');
  assert.equal(docElement.style.transform, '');

  // 6. Setting toggled on in storage -> re-enables and syncs
  mockBrowser.storage.onChanged.trigger(
    { [zoomSync.STORAGE_KEY_ZEN_ZOOM_SYNC]: { newValue: true } },
    'local'
  );
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(styles['--extension-zoom-factor'], '1.3');

  // 7. Cleanup removes all listeners and resets zoom to 1.0
  cleanup();
  assert.equal(mockBrowser.tabs.onZoomChange._listeners.length, 0);
  assert.equal(mockBrowser.tabs.onActivated._listeners.length, 0);
  assert.equal(mockBrowser.storage.onChanged._listeners.length, 0);
  assert.equal(styles['--extension-zoom-factor'], '1');
  assert.equal(docElement.style.transform, '');
});
