/** Restore after a suspended route hydrates, but never fight user scrolling. */
export function restoreDesktopScroll(element: HTMLElement, target: number) {
  let stopped = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => schedule());
  const resize = new ResizeObserver(() => schedule());
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    observer.disconnect();
    resize.disconnect();
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) element.removeEventListener(event, stop);
  };
  function schedule() {
    if (stopped) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 1) stop();
      else for (const child of element.children) resize.observe(child);
    });
  }
  observer.observe(element, { childList: true, subtree: true });
  for (const child of element.children) resize.observe(child);
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) element.addEventListener(event, stop, { passive: true });
  timer = setTimeout(stop, 10_000);
  schedule();
  return stop;
}
