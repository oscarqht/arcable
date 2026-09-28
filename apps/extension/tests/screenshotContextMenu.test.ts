import assert from 'node:assert';

const createdMenus: chrome.contextMenus.CreateProperties[] = [];

(globalThis as any).chrome = {
  runtime: { id: 'test-ext', lastError: undefined },
  tabs: {},
  contextMenus: {
    removeAll: (cb: () => void) => cb(),
    create: (props: chrome.contextMenus.CreateProperties) => {
      createdMenus.push(props);
    },
    onClicked: {
      addListener: () => {},
    },
  },
  storage: {
    local: {
      get: (keys: any, callback?: (res: any) => void) => {
        const res = {};
        if (typeof callback === 'function') callback(res);
        return Promise.resolve(res);
      },
    },
  },
};

const {
  SCREENSHOT_MENU_IDS,
  updateRunCodeContextMenus,
} = await import('../src/background/contextMenus');

console.log('Testing screenshot context menu items under Tool parent...');

// 1. Verify IDs
assert.strictEqual(SCREENSHOT_MENU_IDS.TOOL_PARENT, 'arcable_tool_parent');
assert.strictEqual(SCREENSHOT_MENU_IDS.TAKE_SCREENSHOT, 'arcable_take_screenshot');
assert.strictEqual(SCREENSHOT_MENU_IDS.CAPTURE_FULL_PAGE, 'arcable_capture_full_page');

// 2. Run updateRunCodeContextMenus
await updateRunCodeContextMenus('https://example.com');

// 3. Check created menu items
const toolParentMenu = createdMenus.find((m) => m.id === SCREENSHOT_MENU_IDS.TOOL_PARENT);
assert.ok(toolParentMenu, 'Tool parent menu item must exist');
assert.strictEqual(toolParentMenu.title, '🛠️ Tool', 'Tool parent menu title must match');
assert.strictEqual(toolParentMenu.parentId, undefined, 'Tool parent menu must be top-level');

const takeScreenshotItem = createdMenus.find((m) => m.id === SCREENSHOT_MENU_IDS.TAKE_SCREENSHOT);
assert.ok(takeScreenshotItem, 'Take Screenshot menu item must exist');
assert.strictEqual(
  takeScreenshotItem.parentId,
  SCREENSHOT_MENU_IDS.TOOL_PARENT,
  'Take Screenshot menu item must have Tool parent as parentId'
);

const captureFullPageItem = createdMenus.find((m) => m.id === SCREENSHOT_MENU_IDS.CAPTURE_FULL_PAGE);
assert.ok(captureFullPageItem, 'Capture Full Page menu item must exist');
assert.strictEqual(
  captureFullPageItem.parentId,
  SCREENSHOT_MENU_IDS.TOOL_PARENT,
  'Capture Full Page menu item must have Tool parent as parentId'
);

console.log('✅ Screenshot context menu under Tool parent tests passed successfully!');
