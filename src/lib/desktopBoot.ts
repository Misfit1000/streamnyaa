type DesktopBootUpdate = { percent: number; label: string };

export function updateDesktopBoot({ percent, label }: DesktopBootUpdate) {
  const boot = document.getElementById('streamnyaa-desktop-boot');
  if (!boot) return;
  if (!Number.isFinite(percent)) return;
  const stored = Number(boot.dataset.progress || 0);
  const previous = Number.isFinite(stored) ? stored : 0;
  const reported = Math.min(100, Math.max(0, Math.round(percent)));
  if (reported < previous) return; // A late task must not replace the current stage label either.
  const next = Math.max(previous, reported);
  boot.dataset.progress = String(next);
  boot.setAttribute('aria-valuenow', String(next));
  const bar = boot.querySelector<HTMLElement>('.sn-boot__bar');
  const status = boot.querySelector<HTMLElement>('.sn-boot__status-label');
  const value = boot.querySelector<HTMLElement>('.sn-boot__value');
  if (bar) bar.style.width = `${next}%`;
  if (status) status.textContent = label;
  if (value) value.textContent = `${next}%`;
}

export function completeDesktopBoot(label = 'Ready') {
  updateDesktopBoot({ percent: 100, label });
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const boot = document.getElementById('streamnyaa-desktop-boot');
      if (!boot) return;
      boot.classList.add('sn-boot--leaving');
      window.setTimeout(() => boot.remove(), 220);
    });
  });
}
