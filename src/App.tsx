import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import Schedule from './pages/Schedule';
import AnimeDetails from './pages/AnimeDetails';
import AnimeLanding from './pages/AnimeLanding';
import MangaDetails from './pages/MangaDetails';
import Watch from './pages/Watch';
import MyList from './pages/MyList';
import NyaaSearchPage from './pages/NyaaSearchPage';
import AnimeDownloads from './pages/AnimeDownloads';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Login, { AdminLogin } from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import { About, Disclaimer, PrivacyPolicy, Terms } from './pages/InfoPages';
import { AuthProvider } from './context/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
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
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="about" element={<About />} />
              <Route path="privacy-policy" element={<PrivacyPolicy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="disclaimer" element={<Disclaimer />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
