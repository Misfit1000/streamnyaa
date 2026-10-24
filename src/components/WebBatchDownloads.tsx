import {useMemo,useState} from 'react';
import {dedupeNyaaItems,type NyaaItem} from '../api/nyaa';
import type {SourceIdentity} from '../lib/desktopSourceIdentity';
import {isBatchRelease} from '../lib/desktopSourceIdentity';
import {batchSearchText,torrentFileUrl,webAudioMatches,type WebSource} from '../lib/webSources';
import {useWebSources} from '../lib/useWebSources';
import WebSourceProgress from './WebSourceProgress';
import type {WebSourceProvider} from '../lib/webSourceProvider';
export default function WebBatchDownloads({identity,query='',initial=[],audio='all',quality='',onAction,provider='nyaa',adultAllowed=false}:{identity?:SourceIdentity;query?:string;initial?:WebSource[];audio?:'sub'|'dub'|'all';quality?:string;provider?:WebSourceProvider;adultAllowed?:boolean;onAction:(source:NyaaItem,action:'copy'|'open')=>void}){
  const [open,setOpen]=useState(false),[notice,setNotice]=useState('');
  const result=useWebSources({identity,query:batchSearchText(query),provider,adultAllowed},open);
  const packs=useMemo(()=>(dedupeNyaaItems([...initial,...(result.data?.items||[])]) as WebSource[]).filter(item=>isBatchRelease(item.title)&&item.matchTier==='batch'&&webAudioMatches(item.title,audio)
    &&(!quality||(quality==='RAW'?item.categoryId==='1_4':item.title.toLowerCase().includes(quality.toLowerCase())))).sort((a,b)=>b.rawSeeders-a.rawSeeders),[initial,result.data,audio,quality]);
  async function copy(item:NyaaItem){try{await navigator.clipboard.writeText(item.magnet);onAction(item,'copy');setNotice('Batch magnet copied. Choose files in your torrent client.');}catch{setNotice('Copy failed. Open the release details to copy its magnet link.');}}
  return <section aria-label="Batch downloads" className="mt-6 rounded-2xl border border-border bg-secondary/20 p-4 md:p-5">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left"><span className="font-black">Batch downloads <span className="ml-2 text-xs font-semibold text-muted-foreground">{packs.length?`${packs.length} found`:'Season packs and complete releases'}</span></span><span aria-hidden="true">{open?'−':'+'}</span></button>
    {open&&<div className="mt-3 space-y-3"><p className="text-xs leading-6 text-muted-foreground">These links open the whole release in your torrent client. Inspect its file list there to choose episodes. Web does not verify which episode files a pack contains.</p>
      <WebSourceProgress data={result.data} fetching={result.isFetching} retry={()=>void result.refetch()}/>
      {result.isPending&&!packs.length?<p role="status">Finding batch releases…</p>:null}
      {result.isError&&<p role="alert">Batch search is unavailable. <button type="button" className="text-primary underline" onClick={()=>void result.refetch()}>Retry batch search</button></p>}
      {!result.isFetching&&!result.isError&&!packs.length&&<p>{result.data?.complete?'No matching batch releases were found with these filters.':'No matching packs found in the pages checked so far.'}</p>}
      {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {packs.map(item=><div key={item.infoHash||item.link} className="rounded-xl border border-border bg-background/40 p-4"><h3 className="break-words text-sm font-bold">{provider==='sukebei'&&<span className="mr-2 text-primary">Hentai · 18+</span>}{item.title}</h3><p className="mt-2 text-xs text-muted-foreground">{item.size} · {item.rawSeeders} seeders · {item.matchReason}</p><div className="mt-3 flex flex-wrap gap-2">
        {item.magnet&&<><a href={item.magnet} onClick={()=>onAction(item,'open')} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">Open batch in torrent client</a><button type="button" onClick={()=>void copy(item)} className="rounded-lg border border-border px-3 py-2 text-sm font-bold">Copy batch magnet</button></>}
        {torrentFileUrl(item.link)&&<a href={torrentFileUrl(item.link)} onClick={()=>onAction(item,'open')} className="rounded-lg border border-border px-3 py-2 text-sm font-bold">Download .torrent</a>}
        {/^https:\/\/(?:sukebei\.)?nyaa\.si\/view\/\d+$/.test(item.link)&&<a href={item.link} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm font-bold">Release details</a>}
      </div></div>)}
    </div>}
  </section>;
}
