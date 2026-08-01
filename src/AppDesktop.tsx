import { Component, lazy, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import ScrollToTop from './components/ScrollToTop';
import DesktopShell from './components/DesktopShell';
import { AuthProvider } from './context/AuthContext';
import { AccountSyncProvider } from './context/AccountSyncContext';
import { createAppQueryClient } from './lib/queryClient';
import { desktopPageLoaders } from './lib/desktopRoutePreload';

const DesktopHome = lazy(desktopPageLoaders.home);
const DesktopWatch = lazy(desktopPageLoaders.watch);
const DesktopExplore = lazy(desktopPageLoaders.explore);
const DesktopSchedule = lazy(desktopPageLoaders.schedule);
const DesktopSources = lazy(desktopPageLoaders.sources);
const DesktopLibrary = lazy(desktopPageLoaders.library);
const AnimeLanding = lazy(desktopPageLoaders.animeLanding);
const MangaDetails = lazy(desktopPageLoaders.mangaDetails);
const AnimeDownloads = lazy(desktopPageLoaders.downloads);
const AnimeCompare = lazy(desktopPageLoaders.compare);
const DesktopSettings = lazy(desktopPageLoaders.settings);
const DesktopHistory = lazy(desktopPageLoaders.history);
const DesktopProfile = lazy(desktopPageLoaders.profile);
const Login = lazy(desktopPageLoaders.login);

const queryClient = createAppQueryClient();

class DesktopRouteBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Desktop route failed', error, info.componentStack);
  }

  componentDidUpdate(previousProps: { children: ReactNode }) {
    if (previousProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-2xl border border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_52%,rgba(244,63,94,0.06))] p-6 text-white shadow-2xl shadow-black/25">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">Desktop route failed</p>
          <h1 className="mt-3 text-2xl font-semibold">This page could not render.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
            {this.state.error.message || 'A desktop page failed before it could display content.'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

function AnimeToDesktopWatch() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  return <Navigate to={`/watch/${id || ''}${location.search}`} replace />;
}

export default function AppDesktop() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountSyncProvider>
          <BrowserRouter>
            <ScrollToTop />
            <DesktopRouteBoundary>
              <Routes>
                <Route path="/" element={<DesktopShell />}>
                  <Route index element={<DesktopHome />} />
                  <Route path="search" element={<DesktopExplore />} />
                  <Route path="schedule" element={<DesktopSchedule />} />
                  <Route path="anime/popular" element={<AnimeLanding />} />
                  <Route path="anime/genre/:genre" element={<AnimeLanding />} />
                  <Route path="anime/season/:seasonSlug" element={<AnimeLanding />} />
                  <Route path="season/:seasonSlug" element={<AnimeLanding />} />
                  <Route path="anime/:id" element={<AnimeToDesktopWatch />} />
                  <Route path="manga/:id" element={<MangaDetails />} />
                  <Route path="anime/:id/downloads" element={<AnimeDownloads />} />
                  <Route path="watch/:id" element={<DesktopWatch />} />
                  <Route path="my-list" element={<DesktopLibrary />} />
                  <Route path="nyaa" element={<DesktopSources />} />
                  <Route path="desktop-settings" element={<DesktopSettings />} />
                  <Route path="compare" element={<AnimeCompare />} />
                  <Route path="login" element={<Login />} />
                  <Route path="reset-password" element={<Login />} />
                  <Route path="dashboard" element={<DesktopHistory />} />
                  <Route path="profile" element={<DesktopProfile />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </DesktopRouteBoundary>
          </BrowserRouter>
        </AccountSyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
