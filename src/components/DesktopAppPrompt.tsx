import { useEffect, useState } from 'react';
import { Download, MonitorPlay, X } from 'lucide-react';
import { isDesktopApp } from '../lib/desktop';

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
    <div className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-xl rounded-2xl border border-primary/25 bg-background/92 p-4 shadow-2xl shadow-black/35 backdrop-blur-2xl md:bottom-6 md:left-auto md:right-6">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Dismiss desktop app prompt"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="grid gap-3 pr-8 sm:grid-cols-[44px_1fr] sm:items-start">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <MonitorPlay className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-black text-foreground">StreamNyaa desktop app is being built</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            The desktop version will keep the same web design and add local torrent playback with a desktop player.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://github.com/Misfit1000/streamnyaa/releases"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              Desktop app releases
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full border border-border bg-background/60 px-4 py-2 text-xs font-black text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Keep using web
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
