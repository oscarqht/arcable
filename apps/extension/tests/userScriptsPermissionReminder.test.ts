function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mockNavigator(props: Record<string, any>) {
  Object.defineProperty(globalThis, 'navigator', {
    value: props,
    configurable: true,
    writable: true,
  });
}

// Mock chrome environment with standard callback signature for webextension-polyfill
(globalThis as any).chrome = {
  runtime: { id: 'test-arcable-id' },
  tabs: {
    createdUrls: [] as string[],
    create: (details: any, callback?: (tab: any) => void) => {
      (globalThis as any).chrome.tabs.createdUrls.push(details.url);
      const tab = { id: 100, url: details.url };
      if (typeof callback === 'function') callback(tab);
      return Promise.resolve(tab);
    },
  },
};

const {
  isBrave,
  isFirefox,
  isUserScriptsAvailable,
  getExtensionDetailsUrl,
  openExtensionDetailsPage,
} = await import('../src/utils/browser');

const { executeManualUserCode } = await import('../src/background/runCodeRunner');

console.log('Testing User Scripts Permission Reminder logic...');

// 1. Chrome extension details URL
mockNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36' });
assert(getExtensionDetailsUrl() === 'chrome://extensions/?id=test-arcable-id', 'Should generate chrome://extensions URL in Chrome');

// 2. Brave extension details URL
mockNavigator({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Brave Chrome/138.0.0.0 Safari/537.36',
  brave: { isBrave: async () => true },
});
assert(isBrave() === true, 'Should detect Brave browser');
assert(getExtensionDetailsUrl() === 'brave://extensions/?id=test-arcable-id', 'Should generate brave://extensions URL in Brave');

// 3. Firefox extension details URL
mockNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0' });
assert(isFirefox() === true, 'Should detect Firefox browser');
assert(getExtensionDetailsUrl() === 'about:addons', 'Should generate about:addons URL in Firefox');

// 4. isUserScriptsAvailable detection
(globalThis as any).chrome.userScripts = undefined;
assert(isUserScriptsAvailable() === false, 'Should detect unavailable userScripts when undefined');

(globalThis as any).chrome.userScripts = {
  execute: async () => [{ result: true }],
};
assert(isUserScriptsAvailable() === true, 'Should detect available userScripts when execute is a function');

// Test getter throwing (as happens in Chrome 138+ when disabled)
Object.defineProperty((globalThis as any).chrome, 'userScripts', {
  configurable: true,
  get() {
    throw new Error('User scripts are not allowed');
  },
});
assert(isUserScriptsAvailable() === false, 'Should safely return false if chrome.userScripts throws on access');

// 5. executeManualUserCode setup message
mockNavigator({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Brave Chrome/138.0.0.0 Safari/537.36',
  brave: { isBrave: async () => true },
});
try {
  await executeManualUserCode(1, 'console.log("hello");');
  assert(false, 'Should have thrown setup error');
} catch (err: any) {
  assert(
    err.message.includes('Brave user scripts') && err.message.includes('Allow user scripts'),
    `Expected Brave setup message, got: ${err.message}`
  );
}

// 6. openExtensionDetailsPage navigation
(globalThis as any).chrome.tabs.createdUrls = [];
await openExtensionDetailsPage();
assert(
  (globalThis as any).chrome.tabs.createdUrls[0] === 'brave://extensions/?id=test-arcable-id',
  'openExtensionDetailsPage should create tab with browser details page'
);

console.log('✓ All user scripts permission reminder tests passed successfully!');
