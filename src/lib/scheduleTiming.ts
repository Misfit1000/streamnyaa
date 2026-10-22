/** Provider precision below one minute is not evidence of a broadcast move. */
export function scheduleTimeChanged(previousMs: number, currentMs: number) {
  return Number.isFinite(previousMs) && Number.isFinite(currentMs)
    && previousMs > 0 && currentMs > 0 && Math.abs(previousMs - currentMs) >= 60_000;
}
