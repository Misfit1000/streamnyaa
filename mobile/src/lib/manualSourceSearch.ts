export type ManualSourceIntent = {
  title: string;
  episode?: number;
  queries: string[];
};

export function manualSourceIntent(value: string): ManualSourceIntent {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const episodeMatch = normalized.match(/^(.*?)(?:\s+(?:episode|ep|e)\s*#?0*(\d{1,4}))$/i)
    || normalized.match(/^(.*?)\s+#0*(\d{1,4})$/i);
  if (!episodeMatch) return { title: normalized, queries: normalized ? [normalized] : [] };

  const title = String(episodeMatch[1] || '').trim();
  const episode = Number(episodeMatch[2]);
  if (!title || !Number.isInteger(episode) || episode < 1) return { title: normalized, queries: normalized ? [normalized] : [] };

  const focused = `${title} ${String(episode).padStart(2, '0')}`;
  return {
    title,
    episode,
    queries: [...new Set([focused, normalized])],
  };
}
