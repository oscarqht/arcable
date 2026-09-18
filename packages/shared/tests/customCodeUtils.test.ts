import assert from 'node:assert/strict';
import {
  normalizeCustomCodeRules,
  normalizeRunCodeRules,
  mergeCustomCodeRules,
  mergeRunCodeRules,
} from '../src/utils/customCodeUtils';
import type { CustomCodeRule, RunCodeRule } from '../src/types/customCode';

function testNormalizeCustomCodeRules() {
  const input = [
    {
      id: 'cjc_123',
      raindropId: 9999,
      pattern: 'https://example.com/*',
      css: 'body { background: #000; }',
      js: 'console.log("hello");',
      disabled: false,
    },
    {
      id: 'cjc_456',
      raindropId: 'invalid-id',
      pattern: 'https://test.com/*',
      css: '',
      js: '',
    },
  ];

  const { rules } = normalizeCustomCodeRules(input);
  assert.equal(rules.length, 2);
  const rule1 = rules.find((r) => r.id === 'cjc_123');
  assert(rule1);
  assert.equal(rule1.raindropId, 9999, 'normalizeCustomCodeRules must preserve valid numeric raindropId');

  const rule2 = rules.find((r) => r.id === 'cjc_456');
  assert(rule2);
  assert.equal(rule2.raindropId, undefined, 'normalizeCustomCodeRules must strip non-numeric raindropId');
  console.log('✓ normalizeCustomCodeRules preserves raindropId');
}

function testNormalizeRunCodeRules() {
  const input = [
    {
      id: 'run_123',
      raindropId: 8888,
      title: 'Test Snippet',
      patterns: ['https://example.com/*'],
      code: 'alert(1);',
      disabled: true,
    },
    {
      id: 'run_456',
      raindropId: -5,
      title: 'Snippet 2',
      patterns: [],
      code: '',
    },
  ];

  const { rules } = normalizeRunCodeRules(input);
  assert.equal(rules.length, 2);
  const rule1 = rules.find((r) => r.id === 'run_123');
  assert(rule1);
  assert.equal(rule1.raindropId, 8888, 'normalizeRunCodeRules must preserve valid numeric raindropId');

  const rule2 = rules.find((r) => r.id === 'run_456');
  assert(rule2);
  assert.equal(rule2.raindropId, undefined, 'normalizeRunCodeRules must strip non-positive raindropId');
  console.log('✓ normalizeRunCodeRules preserves raindropId');
}

function testMergeRules() {
  const existingCustom: CustomCodeRule[] = [
    { id: 'cjc_1', raindropId: 100, pattern: 'https://a.com/*', css: '', js: '', disabled: false },
  ];
  const incomingCustom: CustomCodeRule[] = [
    { id: 'cjc_1', raindropId: 100, pattern: 'https://a.com/*', css: '', js: '', disabled: false },
    { id: 'cjc_2', raindropId: 200, pattern: 'https://b.com/*', css: '', js: '', disabled: false },
  ];
  const mergedCustom = mergeCustomCodeRules(existingCustom, incomingCustom);
  assert.equal(mergedCustom.merged.length, 3);
  const remapped = mergedCustom.merged.find((r) => r.id !== 'cjc_1' && r.id !== 'cjc_2');
  assert(remapped);
  assert.equal(remapped.raindropId, undefined, 're-keyed duplicate rule must clear raindropId');

  const existingRun: RunCodeRule[] = [
    { id: 'run_1', raindropId: 300, title: 'One', patterns: [], code: '', disabled: false },
  ];
  const incomingRun: RunCodeRule[] = [
    { id: 'run_1', raindropId: 300, title: 'One', patterns: [], code: '', disabled: false },
    { id: 'run_2', raindropId: 400, title: 'Two', patterns: [], code: '', disabled: false },
  ];
  const mergedRun = mergeRunCodeRules(existingRun, incomingRun);
  assert.equal(mergedRun.merged.length, 3);
  const remappedRun = mergedRun.merged.find((r) => r.id !== 'run_1' && r.id !== 'run_2');
  assert(remappedRun);
  assert.equal(remappedRun.raindropId, undefined, 're-keyed duplicate run snippet must clear raindropId');
  console.log('✓ mergeCustomCodeRules and mergeRunCodeRules clear raindropId on regenerated ids');
}

testNormalizeCustomCodeRules();
testNormalizeRunCodeRules();
testMergeRules();
console.log('All customCodeUtils tests passed.');
