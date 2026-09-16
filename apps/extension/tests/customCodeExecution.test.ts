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

const { executeAutomaticCustomCode } = await import('../src/background/runCodeRunner');

await executeAutomaticCustomCode(42, 'document.documentElement.dataset.arcableTest = "ran";');
assert(executeScriptCalls === 1, 'Non-empty custom JavaScript should execute once.');

await executeAutomaticCustomCode(42, '   ').then(
  () => {
    throw new Error('Blank custom JavaScript must be rejected.');
  },
  (error) => assert(error.message === 'Custom code contains no JavaScript.', 'Blank-code error should explain the problem.'),
);
assert(executeScriptCalls === 1, 'Blank custom JavaScript must not reach the page evaluator.');

console.log('Custom code execution tests passed.');
