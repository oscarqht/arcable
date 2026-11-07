// Find the closest legal start coordinate without moving existing handles.
export function nearestDockPosition(
  desired: number, size: number, extent: number,
  occupied: Array<{ start: number; end: number }>, gap = 5,
): number | undefined {
  const max = extent - size;
  if (max < 0) return undefined;
  const intervals = occupied
    .map(({ start, end }) => ({ start: start - gap - size, end: end + gap }))
    .sort((a, b) => a.start - b.start);
  const candidates = [Math.max(0, Math.min(desired, max)), 0, max];
  for (const interval of intervals) candidates.push(interval.start, interval.end);
  return candidates
    .filter((p) => p >= 0 && p <= max && intervals.every((i) => p <= i.start || p >= i.end))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0];
}
