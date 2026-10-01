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
    onClicked: { addListener: () => {} },
  },
  storage: {
    local: {
      get: (_keys: any, callback?: (res: any) => void) => {
        if (typeof callback === 'function') callback({});
        return Promise.resolve({});
      },
    },
  },
};

const { SCREENSHOT_MENU_IDS, updateRunCodeContextMenus } = await import('../src/background/contextMenus');
const { DOWNLOAD_MARKDOWN_MENU_ID } = await import('../src/background/markdownDownload');

console.log('Testing Download as Markdown context menu item...');

await updateRunCodeContextMenus('https://example.com');

const item = createdMenus.find((m) => m.id === DOWNLOAD_MARKDOWN_MENU_ID);
assert.ok(item, 'Download as Markdown menu item must exist');
assert.strictEqual(item.parentId, SCREENSHOT_MENU_IDS.TOOL_PARENT, 'must live under the Tool parent');
assert.strictEqual(item.title, '📥 Download as Markdown');

console.log('✅ Markdown context menu tests passed successfully!');
