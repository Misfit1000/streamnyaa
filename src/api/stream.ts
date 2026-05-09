export interface StreamSource {
  url?: string;
  file?: string;
  src?: string;
  quality?: string;
  isM3U8?: boolean;
  type?: string;
}

export interface EpisodeStreamResult {
  hlsUrl?: string;
  embedUrl?: string;
  provider?: string;
  sources: StreamSource[];
}

function formatEpisodeId(rawTitle: string, episodeNumber: number | string) {
  const parts = String(rawTitle || '').split('-');
  const titleWithoutId = Number.isNaN(Number(parts[0])) ? String(rawTitle || '') : parts.slice(1).join('-');
  const cleanTitle = titleWithoutId
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

  return `${cleanTitle}-episode-${episodeNumber}`;
}

function isHlsSource(source: StreamSource) {
  const url = source.url || source.file || source.src || '';
  return Boolean(url && (source.isM3U8 || source.type === 'hls' || source.type === 'm3u8' || url.includes('.m3u8')));
}

function normalizeSources(payload: any): StreamSource[] {
  const candidates = [
    payload?.sources,
    payload?.source,
    payload?.streams,
    payload?.stream,
    payload?.data?.sources,
    payload?.data?.source,
    payload?.data?.streams,
    payload?.data?.stream,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (typeof candidate === 'string') return [{ url: candidate }];
    if (candidate?.url || candidate?.file || candidate?.src) return [candidate];
  }

  if (typeof payload === 'string') return [{ url: payload }];
  return [];
}

export async function fetchEpisodeStream(rawTitle: string, episodeNumber: number | string): Promise<EpisodeStreamResult> {
  const streamApiBase = (import.meta as any).env?.VITE_STREAM_API_BASE_URL;
  if (!streamApiBase) {
    throw new Error('Licensed stream API is not configured.');
  }

  const episodeId = formatEpisodeId(rawTitle, episodeNumber);
  const endpoint = `${String(streamApiBase).replace(/\/+$/, '')}/${encodeURIComponent(episodeId)}`;
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Licensed stream source could not load.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  const sources = normalizeSources(payload);
  const hlsSource = sources.find(isHlsSource);
  const hlsUrl = hlsSource?.url || hlsSource?.file || hlsSource?.src;
  const embedUrl = typeof payload === 'object'
    ? payload?.embedUrl || payload?.iframe || payload?.embed || payload?.data?.embedUrl || payload?.data?.iframe || payload?.data?.embed
    : undefined;

  return {
    hlsUrl,
    embedUrl,
    provider: typeof payload === 'object' ? payload?.provider || payload?.data?.provider : undefined,
    sources,
  };
}
