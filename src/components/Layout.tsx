import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { useStore } from '../store/useStore';
import { useEffect } from 'react';
import { Cat } from 'lucide-react';

export default function Layout() {
  const theme = useStore((state) => state.theme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-red-600/30">
      <Navbar />
      <main>
        <Outlet />
      </main>

      <footer className="border-t border-[var(--glass-border)] mt-20 py-12 bg-secondary/20">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <Cat className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg text-foreground tracking-tight">StreamNyaa</span>
          </div>
          <p className="text-sm max-w-2xl mx-auto leading-relaxed">
            StreamNyaa acts as a frontend interface that links to metadata and media provided by 3rd party services like AniList and Nyaa.si. 
            We do not host or store any video files or torrents on our servers. All torrent files and magnet links are retrieved from Nyaa.si.
          </p>
          <p className="text-xs mt-4 opacity-60">© {new Date().getFullYear()} StreamNyaa. Not affiliated with Nyaa.si.</p>
        </div>
      </footer>
    </div>
  );
}
