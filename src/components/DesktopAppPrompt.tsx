import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { DESKTOP_RELEASES_URL, isDesktopApp } from '../lib/desktop';

const DISMISS_KEY = 'streamnyaa.desktopPromptDismissed';

export default function DesktopAppPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDesktopApp()) return undefined;
    if (localStorage.getItem(DISMISS_KEY) === '1') return undefined;
    const timer = window.setTimeout(() => setVisible(true), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="fixed left-3 top-20 z-[70] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-primary/25 bg-background/88 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-2xl md:left-5">
      <a
        href={DESKTOP_RELEASES_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-xs font-black text-foreground transition-colors hover:text-primary"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Download className="h-3.5 w-3.5" />
        </span>
        Download desktop app
      </a>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Dismiss desktop app prompt"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
