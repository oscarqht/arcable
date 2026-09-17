function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let executeScriptCalls = 0;
(globalThis as any).chrome = {
  runtime: { id: 'arcable-test-extension' },
  scripting: {
    executeScript: async (details: any) => {
      executeScriptCalls += 1;
      assert(details.args[0] === 'document.documentElement.dataset.arcableTest = "ran";', 'Custom JavaScript should be passed to the page evaluator.');
      return [{ result: { success: true } }];
    },
  },
};

const { executeAutomaticCustomCode, buildUserScriptCode } = await import('../src/background/runCodeRunner');

// Verify buildUserScriptCode produces syntactically valid JavaScript
for (const bgFetch of [true, false]) {
  const generated = buildUserScriptCode(
    'const x = 1 + 2;',
    '[Test Label]',
    'arcable-run-code-test.js',
    bgFetch
  );
  // Parsing via new Function will throw SyntaxError if there is any syntax error in generated
  new Function(generated);
}

await executeAutomaticCustomCode(42, 'document.documentElement.dataset.arcableTest = "ran";');
assert(executeScriptCalls === 1, 'Non-empty custom JavaScript should execute once.');

await executeAutomaticCustomCode(42, '   ').then(
  () => {
    throw new Error('Blank custom JavaScript must be rejected.');
  },
  (error) => assert(error.message === 'Custom code contains no JavaScript.', 'Blank-code error should explain the problem.'),
);
assert(executeScriptCalls === 1, 'Blank custom JavaScript must not reach the page evaluator.');

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
