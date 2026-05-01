import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import Schedule from './pages/Schedule';
import AnimeDetails from './pages/AnimeDetails';
import MangaDetails from './pages/MangaDetails';
import Watch from './pages/Watch';
import MyList from './pages/MyList';
import TorrentPlayer from './pages/TorrentPlayer';
import NyaaSearchPage from './pages/NyaaSearchPage';
import AnimeDownloads from './pages/AnimeDownloads';

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="anime/:id" element={<AnimeDetails />} />
            <Route path="manga/:id" element={<MangaDetails />} />
            <Route path="anime/:id/downloads" element={<AnimeDownloads />} />
            <Route path="watch/:id" element={<Watch />} />
            <Route path="my-list" element={<MyList />} />
            <Route path="torrent" element={<TorrentPlayer />} />
            <Route path="nyaa" element={<NyaaSearchPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
