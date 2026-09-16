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

const {
  buildUserScriptCode,
  executeAutomaticCustomCode,
} = await import('../src/background/runCodeRunner');

const generatedUserScript = buildUserScriptCode(
  'document.body.dataset.arcableTest = "ran";',
  '[Arcable RunCode] Execution error:',
  'arcable-user-code.js',
  true,
);
new Function(generatedUserScript);

await executeAutomaticCustomCode(42, 'document.documentElement.dataset.arcableTest = "ran";');
assert(executeScriptCalls === 1, 'Non-empty custom JavaScript should execute once.');

await executeAutomaticCustomCode(42, '   ').then(
  () => {
    throw new Error('Blank custom JavaScript must be rejected.');
  },
  (error) => assert(error.message === 'Custom code contains no JavaScript.', 'Blank-code error should explain the problem.'),
);
assert(executeScriptCalls === 1, 'Blank custom JavaScript must not reach the page evaluator.');

(globalThis as any).chrome.userScripts = {
  configureWorld: async () => undefined,
  execute: async () => [{ error: 'The page disallowed the user script.' }],
};

const { executeManualUserCode } = await import('../src/background/runCodeRunner');
await executeManualUserCode(42, 'document.body.dataset.arcableTest = "ran";').then(
  () => {
    throw new Error('User-script execution results containing an error must reject.');
  },
  (error) => assert(
    error.message.includes('The page disallowed the user script.'),
    'User-script injection errors should be exposed to the caller.'
  ),
);

console.log('Custom code execution tests passed.');
