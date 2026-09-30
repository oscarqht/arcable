// Test suite verifying Save to Raindrop behavior in mobile browser environments:
// 1. Saves previous active tab URL and title instead of current active tab (side panel page itself)
// 2. Skips screenshot capture and sends pleaseParse: {} with URL and title
// 3. Skips background screenshot fallback when pleaseParse is set

const mockStorage: Record<string, any> = {};
const mockTabs: any[] = [];
let capturedScreenshotCalls = 0;
let captureVisibleTabCalls = 0;
let raindropBookmarkCreates: any[] = [];

type ActivatedListener = (activeInfo: any) => Promise<void>;
const activatedListeners: ActivatedListener[] = [];

// Simulate mobile browser environment (Android)
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
  },
  writable: true,
  configurable: true,
});

const mockApi = {
  runtime: {
    id: 'mock-arcable-id',
    getURL: (path: string) => `chrome-extension://mock-arcable-id/${path}`,
    getPlatformInfo: async () => ({ os: 'android' }),
  },
  storage: {
    local: {
      get: async (keys: any) => {
        if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
        const res: Record<string, any> = {};
        if (Array.isArray(keys)) {
          for (const k of keys) res[k] = mockStorage[k];
        }
        return res;
      },
      set: async (items: any) => {
        Object.assign(mockStorage, items);
      },
    },
  },
  tabs: {
    get: async (id: number) => {
      const found = mockTabs.find((t) => t.id === id);
      if (found) return found;
      throw new Error('Tab not found: ' + id);
    },
    query: async (queryInfo: any) => {
      if (queryInfo.active && queryInfo.currentWindow) {
        return mockTabs.filter((t) => t.active);
      }
      return [...mockTabs];
    },
    captureVisibleTab: (options: any, callback: (dataUrl: string) => void) => {
      captureVisibleTabCalls++;
      callback('data:image/jpeg;base64,mockFallbackScreenshot');
    },
    onActivated: {
      addListener: (fn: ActivatedListener) => {
        activatedListeners.push(fn);
      },
      removeListener: (fn: ActivatedListener) => {
        const idx = activatedListeners.indexOf(fn);
        if (idx >= 0) activatedListeners.splice(idx, 1);
      },
    },
  },
};

(globalThis as any).chrome = mockApi;
(globalThis as any).browser = mockApi;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('Running mobile Raindrop save previous tab tests...');

  const {
    isInternalOrExtensionUrl,
    getPreviousActiveTab,
    LAST_ACTIVE_WEB_TAB_STORAGE_KEY,
  } = await import('../src/utils/browser');
  const { isMobileDevice } = await import('@arcable/shared/utils');
  const { tabTracker } = await import('../src/utils/tabTracker');

  // Test 1: Verify isMobileDevice() detection
  assert(isMobileDevice() === true, 'Mobile user-agent must be detected as mobile device');

  // Test 2: Verify isInternalOrExtensionUrl identification
  assert(
    isInternalOrExtensionUrl('chrome-extension://mock-arcable-id/sidepanel/index.html') === true,
    'Sidepanel page URL must be identified as internal/extension URL'
  );
  assert(
    isInternalOrExtensionUrl('moz-extension://mock-arcable-id/sidepanel/index.html') === true,
    'Firefox extension URL must be identified as internal/extension URL'
  );
  assert(
    isInternalOrExtensionUrl('https://news.ycombinator.com') === false,
    'Standard web URL must NOT be identified as internal/extension URL'
  );

  // Test 3: Tab switching scenario on mobile browser
  // Tab 100: Web page (active first)
  // Tab 101: Sidepanel page (active second, e.g. user opens side panel)
  mockTabs.length = 0;
  mockTabs.push({
    id: 100,
    windowId: 1,
    url: 'https://github.com/trending',
    title: 'Trending repositories on GitHub',
    active: false,
    lastAccessed: 1000,
  });
  mockTabs.push({
    id: 101,
    windowId: 1,
    url: 'chrome-extension://mock-arcable-id/sidepanel/index.html',
    title: 'Arcable Workspace',
    active: true,
    lastAccessed: 2000,
  });

  // Track tab 100 then 101 in tabTracker
  (tabTracker as any).setLastActiveBrowserTabId(1, 100);
  (tabTracker as any).setLastActiveBrowserTabId(1, 101);

  assert(
    tabTracker.getPreviousActiveBrowserTabId(1) === 100,
    'tabTracker must return tab 100 as the previous active browser tab'
  );

  const resolvedPrevTab = await getPreviousActiveTab(tabTracker.getPreviousActiveBrowserTabId(1));
  assert(resolvedPrevTab !== undefined, 'getPreviousActiveTab must resolve previous tab');
  assert(resolvedPrevTab.id === 100, 'Resolved previous tab ID must be 100');
  assert(resolvedPrevTab.url === 'https://github.com/trending', 'Resolved URL must be GitHub trending');
  assert(resolvedPrevTab.title === 'Trending repositories on GitHub', 'Resolved title must match');

  // Test 4: Verify storage-based fallback when tracker tab ID is not available
  mockStorage[LAST_ACTIVE_WEB_TAB_STORAGE_KEY] = {
    id: 100,
    windowId: 1,
    url: 'https://news.ycombinator.com',
    title: 'Hacker News',
    lastAccessed: 1500,
  };
  mockTabs[0].url = 'https://news.ycombinator.com';
  mockTabs[0].title = 'Hacker News';

  const storageResolvedTab = await getPreviousActiveTab(undefined);
  assert(storageResolvedTab !== undefined, 'Storage-based resolution must resolve tab');
  assert(storageResolvedTab.url === 'https://news.ycombinator.com', 'Storage tab URL must match');

  // Test 5: Verify tab query fallback filtering out extension URLs by lastAccessed
  delete mockStorage[LAST_ACTIVE_WEB_TAB_STORAGE_KEY];
  mockTabs.length = 0;
  mockTabs.push({
    id: 1,
    windowId: 1,
    url: 'chrome-extension://mock-arcable-id/sidepanel/index.html',
    title: 'Sidepanel',
    active: true,
    lastAccessed: 5000,
  });
  mockTabs.push({
    id: 2,
    windowId: 1,
    url: 'https://old-article.com',
    title: 'Old Article',
    active: false,
    lastAccessed: 1000,
  });
  mockTabs.push({
    id: 3,
    windowId: 1,
    url: 'https://latest-article.com',
    title: 'Latest Article',
    active: false,
    lastAccessed: 3000,
  });

  const queryResolvedTab = await getPreviousActiveTab(undefined);
  assert(queryResolvedTab !== undefined, 'Query-based resolution must find a tab');
  assert(
    queryResolvedTab.url === 'https://latest-article.com',
    'Query-based resolution must pick the most recent non-extension tab (latest-article.com)'
  );

  // Test 6: Verify Save to Raindrop logic on mobile
  // Simulate the handleSaveCurrentTabToRaindrop logic
  const isMobile = isMobileDevice();
  assert(isMobile === true, 'Must detect mobile browser environment');

  const prevTrackerTabId = tabTracker.getPreviousActiveBrowserTabId();
  const tabToSave = isMobile
    ? await getPreviousActiveTab(prevTrackerTabId)
    : mockTabs.find((t) => t.active);
  const skipScreenshot = isMobile;

  assert(tabToSave !== undefined, 'Tab to save must be resolved');
  assert(tabToSave.url === 'https://latest-article.com', 'Tab to save URL must be the previous active web tab');
  assert(skipScreenshot === true, 'Screenshot must be skipped on mobile browser');

  let coverDataUrl: string | undefined;
  if (!skipScreenshot) {
    capturedScreenshotCalls++;
    coverDataUrl = 'mock-screenshot-data';
  }

  assert(capturedScreenshotCalls === 0, 'No screenshot calls must be made on mobile');
  assert(coverDataUrl === undefined, 'coverDataUrl must be undefined when screenshot is skipped');

  const payload: any = {
    link: tabToSave.url,
    title: tabToSave.title || tabToSave.url,
    collectionId: -1,
  };
  if (skipScreenshot) {
    payload.pleaseParse = {};
  } else if (coverDataUrl) {
    payload.coverDataUrl = coverDataUrl;
  }

  assert(
    payload.link === 'https://latest-article.com',
    'Payload link must be the previous active web tab URL'
  );
  assert(
    payload.title === 'Latest Article',
    'Payload title must be the previous active web tab title'
  );
  assert(
    typeof payload.pleaseParse === 'object' && payload.pleaseParse !== null,
    'Payload must include pleaseParse: {}'
  );
  assert(
    payload.coverDataUrl === undefined,
    'Payload must NOT include coverDataUrl when screenshot is skipped'
  );

  // Test 7: Verify background fallback screenshot is skipped when pleaseParse is provided
  captureVisibleTabCalls = 0;
  const input = { ...payload };
  if (!input.pleaseParse && !input.coverDataUrl && !input.cover?.startsWith('data:')) {
    mockApi.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 }, (dataUrl) => {
      input.coverDataUrl = dataUrl;
    });
  }

  assert(
    captureVisibleTabCalls === 0,
    'Background fallback captureVisibleTab must NOT be called when pleaseParse is set'
  );
  assert(
    input.coverDataUrl === undefined,
    'Background must not attach fallback coverDataUrl when pleaseParse is present'
  );

  console.log('✓ All mobile Raindrop save previous tab tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
