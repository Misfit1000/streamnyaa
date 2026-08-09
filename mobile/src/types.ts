export type AnimeTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

export type Anime = {
  id: number;
  anilistId?: number;
  kitsuId?: string;
  metadataProvider?: 'AniList' | 'Jikan' | 'Kitsu';
  mediaType?: 'ANIME' | 'MANGA';
  malId?: number | null;
  title: string;
  titles?: AnimeTitle;
  description?: string;
  cover?: string;
  banner?: string;
  color?: string;
  score?: number;
  popularity?: number;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  format?: string;
  status?: string;
  season?: string;
  year?: number;
  source?: string;
  countryOfOrigin?: string;
  genres?: string[];
  studios?: string[];
  isAdult?: boolean;
  trailerId?: string;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  relations?: Anime[];
  recommendations?: Anime[];
};

export type ScheduleEntry = {
  episode?: number;
  airingAt: number;
  anime: Anime;
  provider?: 'AniList' | 'Jikan';
};

export type AnimeEpisode = {
  number: number;
  title: string;
  aired?: string;
  filler?: boolean;
  recap?: boolean;
};

export type TorrentSource = {
  title: string;
  link?: string;
  pubDate?: string;
  seeders: number;
  leechers: number;
  downloads?: number;
  infoHash: string;
  category?: string;
  size?: string;
  trusted?: boolean;
  remake?: boolean;
  sourceScore?: number;
  matchScore?: number;
  magnet: string;
  metadataUrls?: string[];
};

export type PlaybackHistoryItem = {
  key: string;
  animeId: string;
  animeTitle: string;
  episode: number;
  sourceTitle: string;
  magnet: string;
  image?: string;
  progressPercent: number;
  resumeSeconds: number;
  durationSeconds: number;
  updatedAt: string;
};

export type LibraryItem = {
  animeId: string;
  animeTitle: string;
  anime: Anime;
  bookmarked: boolean;
  liked: boolean;
  updatedAt: string;
};

export type AccountUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: AccountUser;
};

export type TorrentStreamStatus = {
  state: 'idle' | 'metadata' | 'buffering' | 'ready' | 'playing' | 'paused' | 'error';
  message: string;
  progress: number;
  bufferedPercent: number;
  peers: number;
  trackerCount?: number;
  connectionStage?: 'idle' | 'engine-start' | 'peer-discovery' | 'buffering' | 'ready' | 'paused' | 'failed';
  downloadRate: number;
  waitSeconds?: number;
  fileName?: string;
  streamUrl?: string;
  error?: string;
};

export type TorrentStartOptions = {
  wifiOnly: boolean;
  maxCacheMiB: number;
  batterySaver: boolean;
};

export type TorrentCacheStats = {
  bytes: number;
  freeBytes: number;
  maxBytes: number;
};

export type RootStackParamList = {
  Tabs: undefined;
  Anime: { animeId: number; anilistId?: number; malId?: number | null; kitsuId?: string; title?: string };
  Manga: { mangaId: number; anilistId?: number; malId?: number | null; kitsuId?: string; title?: string };
  Catalog: { title: string; genre?: string; season?: string; year?: number; sort?: 'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC' };
  Watch: { anime: Anime; episode?: number; source?: TorrentSource; resumeSeconds?: number; autoPlay?: boolean };
  Downloads: { anime: Anime; episode?: number };
  Sources: { anime?: Anime; query?: string; episode?: number };
  History: undefined;
  Settings: undefined;
  Compare: undefined;
  SignIn: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Schedule: undefined;
  Library: undefined;
  Profile: undefined;
};
