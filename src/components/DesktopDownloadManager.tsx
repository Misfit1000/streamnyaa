import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import DesktopDownloads from './DesktopDownloads';
import {synchronizeOfflineProgress} from '../lib/desktopOfflineProgress';
import {getDownloadQueue,listenDownloadsChanged,controlDownloads,type DesktopDownloadQueue} from '../lib/desktopDownloads';
export default function DesktopDownloadManager(){
 const [queue,setQueue]=useState<DesktopDownloadQueue>();const [open,setOpen]=useState(false);const [error,setError]=useState('');const [choose,setChoose]=useState(false);const chooser=useRef<HTMLDialogElement>(null);const previous=useRef(new Map<string,string>());const navigate=useNavigate();
 useEffect(()=>{let disposed=false,busy=false,stop:(()=>void)|undefined,nativeStop:(()=>void)|undefined;
 const refresh=async()=>{if(busy)return;busy=true;try{const next=await getDownloadQueue();if(disposed)return;setQueue(next);synchronizeOfflineProgress(next);
 const active=next.items.filter(i=>['downloading','verifying'].includes(i.state)&&(!i.chooseFiles || !!i.selectedFiles?.length));
 if(active.some(i=>!['downloading','verifying'].includes(previous.current.get(i.id)||'')))setOpen(true);
 if(!active.length)setOpen(false);
 const pending=next.items.some(i=>i.chooseFiles&&i.state==='paused'&&!!i.files?.length&&!i.selectedFiles?.length);
 if(!pending)setChoose(false);else if(next.items.some(i=>i.chooseFiles&&i.state==='paused'&&previous.current.get(i.id)!=='paused'))setChoose(true);
 for(const i of next.items)if(i.state==='failed'&&previous.current.get(i.id)!=='failed')setError(i.error||'A download needs attention.');
 previous.current=new Map(next.items.map(i=>[i.id,i.state]));
 }catch(e){if(!disposed)setError(String(e));}finally{busy=false;}};
 void refresh();const timer=window.setInterval(refresh,2000);void listenDownloadsChanged(()=>void refresh()).then(fn=>disposed?fn():stop=fn).catch(()=>{});
 void window.__TAURI__?.event?.listen<{error?:string}>('streamnyaa-open-downloads',event=>{if(event.payload.error)setError(event.payload.error);void refresh();}).then(fn=>disposed?fn():nativeStop=fn).catch(()=>{});
 const show=()=>{if([...previous.current.values()].some(s=>['downloading','verifying'].includes(s)))setOpen(true);else {navigate('/my-list?tab=offline');void refresh();}};window.addEventListener('streamnyaa-open-download-manager',show);window.addEventListener('streamnyaa-refresh-downloads',refresh);
 return()=>{disposed=true;stop?.();nativeStop?.();clearInterval(timer);window.removeEventListener('streamnyaa-open-download-manager',show);window.removeEventListener('streamnyaa-refresh-downloads',refresh);};},[navigate]);
 useEffect(()=>{if(choose&&!chooser.current?.open)chooser.current?.showModal();if(!choose)chooser.current?.close();},[choose]);
 const active=queue?.items.filter(i=>['downloading','verifying'].includes(i.state)&&(!i.chooseFiles || !!i.selectedFiles?.length))||[];
 const viewAll=()=>{setOpen(false);setError('');navigate('/my-list?tab=offline');};
 return <>{open&&active.length>0&&<aside aria-label="Active downloads" className="fixed bottom-5 right-5 z-50 w-[min(350px,92vw)] rounded-xl border border-white/20 bg-[#101014] p-4 text-white shadow-2xl"><header className="flex justify-between"><strong>Downloading</strong><button aria-label="Dismiss download panel" onClick={()=>setOpen(false)}>×</button></header>{active.map(item=><div key={item.id} className="mt-3"><p className="truncate text-sm">{item.title}</p><progress aria-label={`Download progress for ${item.title}`} className="mt-2 h-1.5 w-full accent-rose-600" max={Math.max(1,item.total)} value={item.downloaded}/><p className="mt-1 text-xs text-white/70">{(item.downloaded/1e6).toFixed(1)} / {(item.total/1e6).toFixed(1)} MB · {item.speedBps?`${(item.speedBps/1e6).toFixed(1)} MB/s · ${Math.ceil(Math.max(0,item.total-item.downloaded)/item.speedBps/60)} min left`:'Calculating speed / ETA'}</p><button className="mt-2 text-sm underline" onClick={()=>void controlDownloads([item.id],'pause').catch(e=>setError(String(e)))}>Pause</button></div>)}<button onClick={viewAll} className="sn-secondary-action mt-3 w-full">View all downloads</button></aside>}
 {error&&<div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-white/15 bg-[#151519] p-4"><p className="text-sm">{error}</p><button className="mt-2 underline" onClick={viewAll}>Open downloads</button><button className="ml-4" onClick={()=>setError('')}>Dismiss</button></div>}
 <dialog ref={chooser} aria-label="Choose download files" onCancel={()=>setChoose(false)} className="m-auto max-h-[85vh] w-[min(760px,94vw)] overflow-auto rounded-xl bg-[#111114] p-5 text-white backdrop:bg-black/60"><button onClick={()=>setChoose(false)}>Close</button>{choose&&<DesktopDownloads selectionOnly/>}</dialog></>;
}
