function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let executeScriptCalls = 0;
let lastInjection: any;
(globalThis as any).chrome = {
  runtime: { id: 'arcable-test-extension' },
  userScripts: {
    execute: async (details: any) => {
      executeScriptCalls += 1;
      lastInjection = details;
      return [{ result: null }];
    },
  },
};

const { executeAutomaticCustomCode, buildUserScriptCode } = await import('../src/background/runCodeRunner');

for (const bgFetch of [true, false]) {
  const generated = buildUserScriptCode('const x = 1 + 2;', '[Test Label]', 'arcable-run-code-test.js', bgFetch);
  new Function(generated);
}

const code = 'document.documentElement.dataset.arcableTest = "ran";';
await executeAutomaticCustomCode(42, code, 'document-1');
assert(executeScriptCalls === 1, 'Non-empty custom JavaScript should execute once.');
assert(lastInjection.world === 'MAIN', 'Custom JavaScript must run in the main page world.');
assert(lastInjection.js[0].code === code, 'Custom JavaScript must be injected directly, not evaluated in the page.');
assert(lastInjection.target.tabId === 42 && lastInjection.target.documentIds[0] === 'document-1', 'Injection must target the requesting document.');

await executeAutomaticCustomCode(42, code);
assert(lastInjection.target.frameIds[0] === 0, 'Without a document ID injection must target only the top frame.');

await executeAutomaticCustomCode(42, '   ').then(
  () => { throw new Error('Blank custom JavaScript must be rejected.'); },
  (error) => assert(error.message === 'Custom code contains no JavaScript.', 'Blank-code error should explain the problem.'),
);
assert(executeScriptCalls === 2, 'Blank custom JavaScript must not be injected.');

(globalThis as any).chrome.userScripts = undefined;
await executeAutomaticCustomCode(42, code).then(
  () => { throw new Error('Missing user-script permission must be reported.'); },
  (error) => assert(error.message.includes('Allow user scripts'), 'Missing permission should have actionable guidance.'),
);

// Verify context menu matching rules are strictly ordered like the options page
const mockStorageData: Record<string, any> = {
  runCodeInPageRules: [
    { id: '1', title: 'Zeta Snippet', patterns: ['https://example.com/*'], code: 'console.log("z");' },
    { id: '2', title: 'Beta Snippet', patterns: ['https://example.com/*'], code: 'console.log("b");' },
    { id: '3', title: 'Alpha Snippet', patterns: ['https://example.com/*'], code: 'console.log("a");' },
  ],
};
(globalThis as any).chrome.storage = {
  local: {
    get: (keys: any, callback?: (res: any) => void) => {
      const data = typeof keys === 'string' ? { [keys]: mockStorageData[keys] } : mockStorageData;
      if (typeof callback === 'function') callback(data);
      return Promise.resolve(data);
    },
    set: (items: any, callback?: () => void) => {
      Object.assign(mockStorageData, items);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
  },
};

const { getMatchingCodeRules } = await import('../src/background/contextMenus');
const matching = await getMatchingCodeRules('https://example.com/page');
assert(matching.length === 3, 'All 3 matching rules should be returned');
assert(matching[0].title === 'Alpha Snippet', 'First snippet in context menu must be Alpha Snippet');
assert(matching[1].title === 'Beta Snippet', 'Second snippet in context menu must be Beta Snippet');
assert(matching[2].title === 'Zeta Snippet', 'Third snippet in context menu must be Zeta Snippet');

console.log('Custom code execution tests passed.');
