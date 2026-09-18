import { CountdownConfig } from '../types/workspace';

export const DEFAULT_COUNTDOWN_MINUTES = 15;
export const COUNTDOWN_PRESETS = [1, 5, 10, 15] as const;

/**
 * Creates default CountdownConfig: 15 minutes from now.
 */
export function createDefaultCountdownConfig(baseTimestamp = Date.now()): CountdownConfig {
  return {
    title: 'Countdown',
    targetDate: new Date(baseTimestamp + DEFAULT_COUNTDOWN_MINUTES * 60 * 1000).toISOString(),
  };
}

/**
 * Returns an ISO date string for a given number of minutes from baseTimestamp.
 */
export function createTargetDateFromMinutes(minutes: number, baseTimestamp = Date.now()): string {
  return new Date(baseTimestamp + minutes * 60 * 1000).toISOString();
}

/**
 * Calculates remaining time breakdown and shelf display strings.
 */
export interface CountdownStatus {
  diffMs: number;
  totalSeconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isCompleted: boolean;
  displayNum: string;
  displayUnit: string;
}

export function calculateCountdownStatus(
  targetDateStr?: string,
  nowTimestamp = Date.now()
): CountdownStatus {
  if (!targetDateStr) {
    return {
      diffMs: 0,
      totalSeconds: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isCompleted: false,
      displayNum: '--',
      displayUnit: 'Set date',
    };
  }

  const targetTime = new Date(targetDateStr).getTime();
  if (isNaN(targetTime)) {
    return {
      diffMs: 0,
      totalSeconds: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isCompleted: false,
      displayNum: '--',
      displayUnit: 'Set date',
    };
  }

  const diffMs = Math.max(0, targetTime - nowTimestamp);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const isCompleted = diffMs <= 0;

  let displayNum = '--';
  let displayUnit = '';

  if (isCompleted) {
    displayNum = '🎉';
    displayUnit = 'Done';
  } else if (days > 0) {
    displayNum = `${days}d`;
    displayUnit = `${hours}h left`;
  } else if (hours > 0) {
    displayNum = `${hours}h`;
    displayUnit = `${minutes}m left`;
  } else {
    // Under 1 hour: display mm:ss to show real-time countdown immediately
    displayNum = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    displayUnit = 'left';
  }

  return {
    diffMs,
    totalSeconds,
    days,
    hours,
    minutes,
    seconds,
    isCompleted,
    displayNum,
    displayUnit,
  };
}

/**
 * Converts a Date object to datetime-local format string (YYYY-MM-DDTHH:mm).
 */
export function toDatetimeLocalString(date: Date): string {
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
