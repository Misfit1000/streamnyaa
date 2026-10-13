import { useEffect, useState } from 'react';

/** Cosmetic clock only: provider retries and native work own their scheduling. */
export function useVisibleCountdown(deadline: number, enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled || !Number.isFinite(deadline) || deadline <= 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const refresh = () => {
      clearTimeout(timer); timer = undefined;
      if (disposed || document.visibilityState === 'hidden') return;
      const next = Date.now();
      setNow(next);
      if (next < deadline) timer = setTimeout(refresh, Math.min(1000, deadline - next));
    };
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [deadline, enabled]);
  return now;
}
