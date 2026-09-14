import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { animeIdentity } from '../lib/animeIdentity';
import { loadLocalPlaybackHistory } from '../lib/desktop';
import { linkOfflineEpisode, type OfflineEpisodeIdentity } from '../lib/desktopDownloads';

export default function DesktopOfflineEpisodeLink({ id, file, identity, onSaved }: { id: string; file: string; identity?: OfflineEpisodeIdentity; onSaved: () => void }) {
  const { myList, likedAnimes } = useStore();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [animeId, setAnimeId] = useState(identity?.animeId || ''), [episode, setEpisode] = useState(identity?.episode || 1);
  const options = useMemo(() => {
    const entries: OfflineEpisodeIdentity[] = [...myList, ...likedAnimes].map(anime => ({ animeId: animeIdentity(anime), title: anime.title, episode: 1, poster: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url }));
    for (const source of loadLocalPlaybackHistory()) if (source.animeId && source.animeTitle) entries.push({ animeId: String(source.animeId), title: source.animeTitle, episode: 1, poster: source.poster });
    if (identity) entries.unshift(identity);
    return [...new Map(entries.filter(entry => entry.animeId && entry.title).map(entry => [entry.animeId,entry])).values()];
  }, [myList, likedAnimes, identity]);
  const save = async (unlink = false) => {
    const anime = options.find(value => value.animeId === animeId);
    if (!unlink && (!anime || !Number.isSafeInteger(episode) || episode < 1 || episode > 100000)) { setError('Choose an anime and a valid episode number.'); return; }
    setBusy(true); setError('');
    try { await linkOfflineEpisode(id, file, unlink ? null : { ...anime!, episode, poster: anime?.poster?.startsWith('https://') ? anime.poster : undefined }); onSaved(); setOpen(false); }
    catch (issue) { setError(String(issue)); } finally { setBusy(false); }
  };
  return <div className="w-full text-xs"><button className="underline text-white/65" onClick={() => setOpen(!open)}>{identity ? `${identity.title} · Episode ${identity.episode} · Edit link` : 'Link episode to History & account sync'}</button>
    {open && <div className="mt-2 space-y-2 rounded border border-white/10 p-3"><p>Choose the anime and episode this file contains. Its saved progress will update History and your connected account.</p>
      <select aria-label="Anime for offline file" value={animeId} onChange={e => setAnimeId(e.target.value)} className="max-w-full rounded bg-zinc-900 p-2"><option value="">Choose a saved anime…</option>{options.map(anime => <option key={anime.animeId} value={anime.animeId}>{anime.title}</option>)}</select>
      {!options.length && <p>Save the anime to Library or watch it online first, then return here.</p>}
      <label className="ml-2">Episode <input type="number" min={1} max={100000} value={episode} onChange={e => setEpisode(Number(e.target.value))} className="w-20 rounded bg-zinc-900 p-2" /></label>
      <div className="flex gap-3"><button disabled={busy} className="sn-primary-action px-3 py-2" onClick={() => void save()}>Save link</button>{identity && <button disabled={busy} onClick={() => void save(true)}>Unlink future updates</button>}<button disabled={busy} onClick={() => setOpen(false)}>Cancel</button></div>
      {error && <p role="alert" className="text-red-300">{error}</p>}</div>}
  </div>;
}
