import { useLocation } from 'react-router-dom';
import Seo from './Seo';

const routeMeta: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'StreamNyaa',
    description: 'Discover anime, track release schedules, browse seasonal shows, follow episode updates, and search anime metadata with StreamNyaa.',
  },
  '/search': {
    title: 'Browse Anime by Title, Genre and Status | StreamNyaa',
    description: 'Search anime by title, genre, format, airing status and rating with fast filters and detailed anime pages.',
  },
  '/schedule': {
    title: 'Anime Release Schedule | StreamNyaa',
    description: 'Track upcoming and currently airing anime episodes with a simple release schedule view.',
  },
  '/nyaa': {
    title: 'Anime Torrent Metadata Search | StreamNyaa',
    description: 'Search public Nyaa RSS metadata, compare seeders and file sizes, and open magnet links with your preferred client.',
  },
  '/torrent': {
    title: 'Magnet Link Player | StreamNyaa',
    description: 'Paste a magnet URI and try browser-based playback options when compatible sources are available.',
  },
  '/my-list': {
    title: 'My Anime List | StreamNyaa',
    description: 'Keep a local browser-based list of anime titles you want to follow.',
  },
  '/blog': {
    title: 'Anime Blog - Trending Anime, Schedules and Episode Updates | StreamNyaa',
    description: 'Read auto-updated anime blog posts about trending anime, popular airing shows, upcoming anime, daily release schedules, and recent episode updates.',
  },
  '/about': {
    title: 'About StreamNyaa',
    description: 'Learn what StreamNyaa is, how it works, and how it uses public anime metadata and third-party services.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | StreamNyaa',
    description: 'Read how StreamNyaa handles local storage, analytics, advertising partners, third-party embeds, and external services.',
  },
  '/terms': {
    title: 'Terms of Use | StreamNyaa',
    description: 'Read the terms that apply when using StreamNyaa and its anime discovery, metadata, and link search features.',
  },
  '/disclaimer': {
    title: 'Disclaimer | StreamNyaa',
    description: 'Important information about third-party content, metadata sources, external links, and copyright concerns.',
  },
};

export default function RouteSeo() {
  const { pathname } = useLocation();
  const meta = routeMeta[pathname] || {
    title: pathname.startsWith('/anime/')
      ? 'Anime Details | StreamNyaa'
      : pathname.startsWith('/manga/')
        ? 'Manga Details | StreamNyaa'
        : 'StreamNyaa',
    description: 'StreamNyaa helps users discover anime, track schedules, browse metadata, and search public anime torrent indexes.',
  };

  return <Seo title={meta.title} description={meta.description} canonicalPath={pathname} />;
}
