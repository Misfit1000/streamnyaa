type Player = { destroy: () => void };
type YouTube = { Player: new (iframe: HTMLIFrameElement, config: { events: { onError: (event: { data: number }) => void; onStateChange: (event: { data: number }) => void } }) => Player };
let loading: Promise<YouTube> | undefined;
export function loadTrailerApi(): Promise<YouTube> {
  const scope = window as typeof window & { YT?: YouTube; onYouTubeIframeAPIReady?: () => void };
  if (scope.YT?.Player) return Promise.resolve(scope.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prior = scope.onYouTubeIframeAPIReady;
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timer); scope.onYouTubeIframeAPIReady = prior;
      if (error || !scope.YT?.Player) { loading = undefined; script.remove(); reject(error || new Error('Trailer controls unavailable.')); }
      else resolve(scope.YT);
    };
    const timer = window.setTimeout(() => finish(new Error('Trailer controls took too long to load.')), 15_000);
    scope.onYouTubeIframeAPIReady = () => { prior?.(); finish(); };
    script.onerror = () => finish(new Error('Trailer controls could not load.'));
    document.head.appendChild(script);
  });
  return loading;
}
export function trailerEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname) || !/^\/embed\/[\w-]+$/.test(url.pathname)) return '';
    url.searchParams.set('fs', '1'); url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('origin', window.location.origin);
    return url.href;
  } catch { return ''; }
}
export function trailerErrorMessage(code: number) {
  if (code === 100) return 'This trailer is private or no longer available.';
  if (code === 101 || code === 150) return 'YouTube does not allow this trailer to play inside apps.';
  if (code === 153) return 'YouTube could not verify this app’s player identification. Retry the trailer.';
  return 'YouTube could not play this trailer. Retry, or complete any verification shown in the player.';
}
