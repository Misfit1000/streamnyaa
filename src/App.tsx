import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Home from './pages/Home';
import { AuthProvider } from './context/AuthContext';

const Search = lazy(() => import('./pages/Search'));
const Schedule = lazy(() => import('./pages/Schedule'));
const AnimeDetails = lazy(() => import('./pages/AnimeDetails'));
const AnimeLanding = lazy(() => import('./pages/AnimeLanding'));
const MangaDetails = lazy(() => import('./pages/MangaDetails'));
const Watch = lazy(() => import('./pages/Watch'));
const MyList = lazy(() => import('./pages/MyList'));
const NyaaSearchPage = lazy(() => import('./pages/NyaaSearchPage'));
const AnimeDownloads = lazy(() => import('./pages/AnimeDownloads'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const Login = lazy(() => import('./pages/Login'));
const AdminLogin = lazy(() => import('./pages/Login').then((module) => ({ default: module.AdminLogin })));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const About = lazy(() => import('./pages/InfoPages').then((module) => ({ default: module.About })));
const PrivacyPolicy = lazy(() => import('./pages/InfoPages').then((module) => ({ default: module.PrivacyPolicy })));
const Terms = lazy(() => import('./pages/InfoPages').then((module) => ({ default: module.Terms })));
const Disclaimer = lazy(() => import('./pages/InfoPages').then((module) => ({ default: module.Disclaimer })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 12,
      gcTime: 1000 * 60 * 45,
    },
  },
});

queryClient.setQueryDefaults(['seasonalAnime'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });
queryClient.setQueryDefaults(['recentEpisodes'], { staleTime: 1000 * 60 * 8, gcTime: 1000 * 60 * 30 });
queryClient.setQueryDefaults(['upcomingAnime'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
queryClient.setQueryDefaults(['todaySchedule'], { staleTime: 1000 * 60 * 3, gcTime: 1000 * 60 * 15 });
queryClient.setQueryDefaults(['genres'], { staleTime: 1000 * 60 * 60 * 6, gcTime: 1000 * 60 * 60 * 12 });
queryClient.setQueryDefaults(['anime'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
queryClient.setQueryDefaults(['episodes'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
queryClient.setQueryDefaults(['anime-download-episodes'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
queryClient.setQueryDefaults(['nyaa'], { staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 8 });
queryClient.setQueryDefaults(['nyaaSearch'], { staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 8 });
queryClient.setQueryDefaults(['nyaa-download'], { staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 8 });
queryClient.setQueryDefaults(['blog'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });

function RouteFallback() {
  return (
    <div className="flex min-h-[48vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="search" element={<Search />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="anime/popular" element={<AnimeLanding />} />
                <Route path="anime/genre/:genre" element={<AnimeLanding />} />
                <Route path="anime/season/:seasonSlug" element={<AnimeLanding />} />
                <Route path="anime/:id" element={<AnimeDetails />} />
                <Route path="manga/:id" element={<MangaDetails />} />
                <Route path="anime/:id/downloads" element={<AnimeDownloads />} />
                <Route path="watch/:id" element={<Watch />} />
                <Route path="my-list" element={<MyList />} />
                <Route path="nyaa" element={<NyaaSearchPage />} />
                <Route path="blog" element={<Blog />} />
                <Route path="blog/:slug" element={<BlogPost />} />
                <Route path="login" element={<Login />} />
                <Route path="login/admin" element={<AdminLogin />} />
                <Route path="reset-password" element={<Login />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="about" element={<About />} />
                <Route path="privacy-policy" element={<PrivacyPolicy />} />
                <Route path="terms" element={<Terms />} />
                <Route path="disclaimer" element={<Disclaimer />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
