import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COUNTDOWN_MINUTES,
  COUNTDOWN_PRESETS,
  createDefaultCountdownConfig,
  createTargetDateFromMinutes,
  calculateCountdownStatus,
  toDatetimeLocalString,
} from '../src/utils/countdown';

test('createDefaultCountdownConfig defaults to 15 minutes from now', () => {
  const baseTime = 1700000000000;
  const config = createDefaultCountdownConfig(baseTime);

  assert.equal(config.title, 'Countdown');
  assert.ok(config.targetDate);
  const targetTime = new Date(config.targetDate).getTime();
  const diffMinutes = (targetTime - baseTime) / (60 * 1000);
  assert.equal(diffMinutes, DEFAULT_COUNTDOWN_MINUTES);
  assert.equal(diffMinutes, 15);
});

test('COUNTDOWN_PRESETS contains 1m, 5m, 10m, 15m', () => {
  assert.deepEqual(Array.from(COUNTDOWN_PRESETS), [1, 5, 10, 15]);
});

test('createTargetDateFromMinutes accurately computes target timestamps for presets and custom minutes', () => {
  const baseTime = 1700000000000;

  // 1m preset
  const target1m = new Date(createTargetDateFromMinutes(1, baseTime)).getTime();
  assert.equal((target1m - baseTime) / 1000, 60);

  // 5m preset
  const target5m = new Date(createTargetDateFromMinutes(5, baseTime)).getTime();
  assert.equal((target5m - baseTime) / 1000, 300);

  // 10m preset
  const target10m = new Date(createTargetDateFromMinutes(10, baseTime)).getTime();
  assert.equal((target10m - baseTime) / 1000, 600);

  // Custom minute value (e.g. 23.5 minutes)
  const targetCustom = new Date(createTargetDateFromMinutes(23.5, baseTime)).getTime();
  assert.equal((targetCustom - baseTime) / 1000, 23.5 * 60);
});

test('calculateCountdownStatus provides immediate mm:ss countdown when added', () => {
  const baseTime = 1700000000000;
  const targetStr = createTargetDateFromMinutes(15, baseTime);

  // Immediately at 0s elapsed: 15:00
  const status0 = calculateCountdownStatus(targetStr, baseTime);
  assert.equal(status0.displayNum, '15:00');
  assert.equal(status0.displayUnit, 'left');
  assert.equal(status0.isCompleted, false);

  // After 1 second elapsed: 14:59
  const status1 = calculateCountdownStatus(targetStr, baseTime + 1000);
  assert.equal(status1.displayNum, '14:59');
  assert.equal(status1.displayUnit, 'left');

  // After 14 minutes and 30 seconds elapsed: 00:30
  const status30s = calculateCountdownStatus(targetStr, baseTime + (14 * 60 + 30) * 1000);
  assert.equal(status30s.displayNum, '00:30');
  assert.equal(status30s.displayUnit, 'left');

  // Completed: reaches 0
  const statusDone = calculateCountdownStatus(targetStr, baseTime + 15 * 60 * 1000);
  assert.equal(statusDone.displayNum, '🎉');
  assert.equal(statusDone.displayUnit, 'Done');
  assert.equal(statusDone.isCompleted, true);
});

test('calculateCountdownStatus formats hours and days properly', () => {
  const baseTime = 1700000000000;

  // 2 hours 15 mins
  const targetHours = createTargetDateFromMinutes(135, baseTime);
  const statusHours = calculateCountdownStatus(targetHours, baseTime);
  assert.equal(statusHours.displayNum, '2h');
  assert.equal(statusHours.displayUnit, '15m left');

  // 2 days 3 hours
  const targetDays = new Date(baseTime + (2 * 24 + 3) * 3600 * 1000).toISOString();
  const statusDays = calculateCountdownStatus(targetDays, baseTime);
  assert.equal(statusDays.displayNum, '2d');
  assert.equal(statusDays.displayUnit, '3h left');
});

test('calculateCountdownStatus handles missing or empty target gracefully', () => {
  const emptyStatus = calculateCountdownStatus(undefined);
  assert.equal(emptyStatus.displayNum, '--');
  assert.equal(emptyStatus.displayUnit, 'Set date');
  assert.equal(emptyStatus.isCompleted, false);
});

test('toDatetimeLocalString formats local datetime without timezone offset skew', () => {
  const date = new Date(2026, 8, 18, 15, 30, 0); // Month is 0-indexed (8 = September)
  const formatted = toDatetimeLocalString(date);
  assert.equal(formatted, '2026-09-18T15:30');
});
