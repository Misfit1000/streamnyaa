export function episodeRangeContains(title: string, episode: number) {
  const match = title.match(/(?:^|[\s._\-\[\(])(\d{1,3})\s*-\s*(\d{1,3})(?:[\s._\-\]\)]|$)/);
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start > 0 && end >= start && episode >= start && episode <= end;
}

export function isEpisodeInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
}

export function isIntentionalHorizontalDrag(deltaX: number, deltaY: number, threshold: number) {
  return Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
}

/** A stale aired count must never prevent a user's explicit episode jump. */
export function manualEpisodeTarget(input: string, status: unknown, confirmedTotal: unknown): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const number = Number(input.trim());
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  const total = Number(confirmedTotal);
  const maximum = /FINISHED|COMPLETED/i.test(String(status)) && Number.isInteger(total) && total > 0 ? total : 9999;
  return Math.min(number, maximum);
}
