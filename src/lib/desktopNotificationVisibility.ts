const DAY = 24 * 60 * 60 * 1000;

/** Presentation only: never erase native delivery markers or revision identity. */
export function desktopNotificationVisible(deliveredAt: number, lastReadAt: number, now: number) {
  if (!Number.isFinite(deliveredAt) || deliveredAt <= 0) return false;
  const age = Math.max(0, now - deliveredAt);
  return age < 7 * DAY && !(deliveredAt <= lastReadAt && age >= DAY);
}
