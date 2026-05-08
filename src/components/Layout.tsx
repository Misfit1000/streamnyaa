import { Link, Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { useStore } from '../store/useStore';
import { useEffect } from 'react';
import { Cat } from 'lucide-react';
import RouteSeo from './RouteSeo';

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
      <RouteSeo />
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
            StreamNyaa is an anime download and discovery interface that connects users with title information, release schedules, and third-party source results.
            We do not host, upload, or distribute anime video files or copyrighted media.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold">
            <Link to="/blog" className="hover:text-primary transition-colors">Blog</Link>
            <Link to="/about" className="hover:text-primary transition-colors">About</Link>
            <Link to="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">Terms</Link>
            <Link to="/disclaimer" className="hover:text-primary transition-colors">Disclaimer</Link>
          </div>
          <p className="text-xs mt-4 opacity-60">Copyright {new Date().getFullYear()} StreamNyaa. Independent anime discovery project.</p>
        </div>
      </footer>
    </div>
  );
}
