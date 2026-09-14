import {forgetDownload,openDownloadDestination,chooseDownloadDirectory} from '../lib/desktopDownloads';
import DesktopOfflineEpisodeLink from './DesktopOfflineEpisodeLink';
import { useHideEpisodeSpoilers } from '../lib/desktopSpoilers';
import { useEffect, useState } from 'react';
import { selectDownloadFiles, relinkOfflineFolder, controlDownloads, listenDownloadsChanged, getDownloadQueue, getOfflineFiles, playOfflineFile, removeDownload, setDownloadLimit, type DesktopDownloadQueue } from '../lib/desktopDownloads';

export default function DesktopDownloads({selectionOnly=false}:{selectionOnly?:boolean}) {
  const hideSpoilers = useHideEpisodeSpoilers();
  const [fileSelection,setFileSelection] = useState<Record<string,number[]>>({});
  const [relink,setRelink] = useState('');
  const [directory,setDirectory] = useState('');
  const [filter,setFilter] = useState('all');
  const [search,setSearch] = useState('');
  const [queue, setQueue] = useState<DesktopDownloadQueue>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const [removing, setRemoving] = useState('');
  useEffect(() => {
    let disposed = false, pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try { const value = await getDownloadQueue(); if (!disposed) { setQueue(value); setError(''); } }
      catch (issue) { if (!disposed) setError(String(issue instanceof Error ? issue.message : issue)); }
      finally { pending = false; }
    };
    void refresh(); const timer = window.setInterval(refresh, 3000);
    let unlisten: (() => void) | undefined;
    void listenDownloadsChanged(() => void refresh()).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); window.clearInterval(timer); };
  }, []);
  const act = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); setQueue(await getDownloadQueue()); }
    catch (issue) { setError(String(issue instanceof Error ? issue.message : issue)); }
    finally { setBusy(false); }
  };
  return <section aria-label="Downloads and Offline Library" className="my-6 rounded-xl border border-white/10 bg-white/[0.025] p-5">
    <h2 className="text-xl font-semibold">Downloads &amp; Offline Library</h2>
    {queue?.downloadDirectory && <p className="mt-2 break-all text-xs text-white/55">New downloads: {queue.downloadDirectory} · Change in Settings → Downloads</p>}
    <p className="mt-2 text-sm text-white/60">Download full releases or choose individual files from the Watch source list. Downloads continue independently of playback, one at a time. After restarting the app, select Resume. Cancel retains partial files; Remove deletes them. Retry verifies retained files and repairs missing pieces.</p>
    <button className="sn-secondary-action mt-3 px-3 py-2" onClick={()=>void act(()=>chooseDownloadDirectory())}>Change download location</button>
    <div className="mt-4 flex flex-wrap gap-3"><input className="sn-input px-3 py-2" aria-label="Search downloads" placeholder="Find a download…" value={search} onChange={e=>setSearch(e.target.value)} /><select aria-label="Download view" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded bg-zinc-900 p-2"><option value="all">All downloads</option><option value="completed">Offline videos</option><option value="active">Active</option><option value="queued">Queued</option><option value="cancelled">Cancelled</option><option value="paused">Paused / choose files</option><option value="failed">Needs attention</option></select><p className="self-center text-sm text-white/60">{((queue?.items.reduce((sum,item)=>sum+item.downloaded,0) || 0)/1_000_000_000).toFixed(2)} GB verified in queue</p></div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="text-sm">Download speed <select aria-label="Download speed limit" disabled={busy} value={queue?.limitBps || 0} onChange={event => void act(() => setDownloadLimit(Number(event.target.value)))} className="ml-2 rounded bg-zinc-900 p-2">
        <option value={0}>Unlimited</option>{[1, 2, 5, 10, 20].map(n => <option key={n} value={n * 1_000_000}>{n} MB/s</option>)}
      </select></label>
      {(['pause', 'resume', 'cancel', 'retry'] as const).map(action => <button key={action} disabled={busy || !selected.length} className="sn-secondary-action px-3 py-2 disabled:opacity-40" onClick={() => void act(() => controlDownloads(selected, action))}>{action[0].toUpperCase() + action.slice(1)} selected</button>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {!queue && !error && <p role="status" className="mt-3 text-sm text-white/60">Loading your download queue…</p>}
    {queue && !queue.items.length && <p className="mt-4 text-sm text-white/60">No downloads yet. Choose Download on a Watch page to save episodes for offline playback.</p>}
    {queue && queue.items.length > 0 && <button disabled={busy} className="sn-secondary-action mt-3 px-3 py-2" onClick={() => setSelected(selected.length === queue.items.length ? [] : queue.items.map(item => item.id))}>{selected.length === queue.items.length ? 'Clear selection' : 'Select all downloads'}</button>}
    {queue && queue.items.length > 0 && !queue.items.some(item => (!selectionOnly || (item.chooseFiles && item.state === 'paused')) && (filter === 'all' || (filter === 'active' ? ['downloading','verifying'].includes(item.state) : item.state === filter)) && item.title.toLowerCase().includes(search.toLowerCase())) && <p className="mt-3 text-sm text-white/60">No downloads match this view. Clear the search or choose All downloads.</p>}
    <ul className="mt-4 space-y-3">{queue?.items.filter(item => (!selectionOnly || (item.chooseFiles && item.state === 'paused')) && (filter === 'all' || (filter === 'active' ? ['downloading','verifying'].includes(item.state) : item.state === filter)) && item.title.toLowerCase().includes(search.toLowerCase())).map(item => <li key={item.id} className="rounded-lg border border-white/10 p-3">
      <progress aria-label={`Download progress for ${item.title}`} max={Math.max(1,item.total)} value={item.downloaded} className="mb-3 h-1.5 w-full accent-rose-600" />
      <div className="flex flex-wrap items-center gap-3">
        <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(item.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm text-white/60">{item.state}{item.total > 0 ? ` · ${Math.min(100, Math.floor(item.downloaded * 100 / item.total))}% verified` : ''}</p>{item.error && <p className="mt-1 text-sm text-red-300">{item.error}</p>}</div>
        <p className="w-full text-xs text-white/65">{(item.downloaded/1e6).toFixed(1)} / {(item.total/1e6).toFixed(1)} MB{item.state==='downloading' ? item.speedBps ? ` · ${(item.speedBps/1e6).toFixed(1)} MB/s · ${Math.ceil(Math.max(0,item.total-item.downloaded)/item.speedBps/60)} min left` : ' · Calculating speed / ETA' : ''}</p><button className="text-sm underline" onClick={()=>void act(()=>openDownloadDestination(item.id))}>Open folder</button>
        {item.storageRoot && <p className="w-full break-all text-xs text-white/45">{item.relocatedFolder || `${item.storageRoot}\\${item.id}`}</p>}
        {(['queued','downloading'].includes(item.state) ? ['pause','cancel'] as const : item.state === 'failed' ? ['retry'] as const : ['paused','cancelled'].includes(item.state) ? ['resume'] as const : []).map(action => <button key={action} disabled={busy} className="sn-secondary-action px-3 py-2" onClick={() => void act(() => controlDownloads([item.id], action))}>{action[0].toUpperCase() + action.slice(1)}</button>)}
        {item.state === 'completed' && <button disabled={busy} className="sn-primary-action px-3 py-2" onClick={() => void act(async () => { const value = await getOfflineFiles(item.id); setFiles(previous => ({ ...previous, [item.id]: value })); })}>Offline videos</button>}
        {!['queued', 'downloading'].includes(item.state) && <button disabled={busy} className="sn-secondary-action px-3 py-2" onClick={() => setRemoving(item.id)}>Delete downloaded files</button>}
      </div>
      {!['queued','downloading','verifying'].includes(item.state)&&<button disabled={busy} className="mt-2 text-sm underline" onClick={()=>void act(()=>forgetDownload(item.id))}>Remove from list (keep files)</button>}
      {item.chooseFiles && !item.files?.length && item.state === 'downloading' && <p role="status" className="mt-2 text-sm text-white/60">Resolving release metadata before file selection…</p>}
      {!!item.files?.length && <details className="mt-3"><summary className="cursor-pointer text-sm">Choose episodes / files · {item.selectedFiles?.length || 0} selected</summary><p className="mt-2 text-xs text-white/55">Select videos and any external subtitle files you need. Embedded subtitles stay with their video.</p><button className="mt-2 underline text-sm" onClick={()=>setFileSelection(value=>({...value,[item.id]:item.files!.filter(file=>/\.(mkv|mp4|webm|avi|m4v|srt|ass|ssa|vtt)$/i.test(file.name)).map(file=>file.index)}))}>Select all videos &amp; subtitles</button><div className="mt-2 max-h-64 overflow-y-auto">{item.files!.map(file => { const selectedFiles=fileSelection[item.id] || item.selectedFiles || []; return <label key={file.index} className="flex items-start gap-2 border-t border-white/5 py-2 text-sm"><input type="checkbox" checked={selectedFiles.includes(file.index)} onChange={event=>setFileSelection(value=>({...value,[item.id]:event.target.checked?[...selectedFiles,file.index]:selectedFiles.filter(index=>index!==file.index)}))} /><span className="min-w-0 break-words">{hideSpoilers ? `File ${file.index+1} · ${file.name.split('.').pop()}` : file.name}<small className="ml-2 text-white/45">{(file.bytes/1_000_000).toFixed(1)} MB</small></span></label>; })}</div><button disabled={busy || ['queued','downloading','verifying'].includes(item.state) || !(fileSelection[item.id] || item.selectedFiles)?.length} className="sn-primary-action mt-3 px-3 py-2 disabled:opacity-40" onClick={()=>void act(()=>selectDownloadFiles(item.id,fileSelection[item.id] || item.selectedFiles || []))}>Download selected files</button></details>}
      {item.state === 'completed' && <button className="mt-2 text-sm underline" onClick={()=>{setRelink(item.id);setDirectory('');}}>Locate moved release folder</button>}
      {relink === item.id && <form className="mt-3 flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();void act(async()=>{await relinkOfflineFolder(item.id,directory);setRelink('');setFiles(value=>{const next={...value};delete next[item.id];return next;});});}}><input aria-label="Moved release folder path" placeholder="Full path to the original release folder" className="sn-input min-w-0 flex-1 px-3 py-2" value={directory} onChange={event=>setDirectory(event.target.value)} /><button disabled={busy || !directory.trim()} className="sn-secondary-action px-3 py-2">Locate</button><button type="button" onClick={()=>setRelink('')}>Cancel</button></form>}
      {removing === item.id && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>{item.relocatedFolder ? 'Remove this entry? Relocated files will be kept.' : 'Delete this release and its local files?'}</span><button disabled={busy} className="sn-primary-action px-3 py-2" onClick={() => void act(async () => { await removeDownload(item.id); setFiles(previous => { const next = { ...previous }; delete next[item.id]; return next; }); setRemoving(''); setSelected(ids => ids.filter(id => id !== item.id)); })}>{item.relocatedFolder ? 'Remove entry' : 'Delete files'}</button><button onClick={() => setRemoving('')}>Keep files</button></div>}
      {files[item.id]?.length === 0 && <p role="status" className="mt-2 text-sm text-amber-200">No playable files were found. Select this release and Retry to verify and restore missing files.</p>}
      {files[item.id]?.map((file,index) => { const progress=item.progress?.[file]; const resume=!!progress && !progress.completed && progress.seconds>5; return <div key={file} className="mt-2 flex flex-wrap items-center gap-3 rounded bg-white/5 p-3"><button disabled={busy} onClick={() => void act(() => playOfflineFile(item.id, file, resume))} className="min-w-0 flex-1 break-words text-left text-sm">{resume ? `Resume at ${Math.floor(progress.seconds/60)}:${String(Math.floor(progress.seconds%60)).padStart(2,'0')}` : progress?.completed ? 'Watch again' : 'Play'} · {hideSpoilers ? `Video ${index+1}` : file}</button>{resume && <button disabled={busy} className="text-xs underline" onClick={()=>void act(()=>playOfflineFile(item.id,file,false))}>Start over</button>}{progress?.completed && <span className="text-xs text-emerald-200">Watched</span>}<DesktopOfflineEpisodeLink id={item.id} file={file} identity={item.episodeLinks?.[file]} onSaved={() => void act(async () => {})} /></div>; })}
    </li>)}</ul>
  </section>;
}
