import { useRef } from 'react';
import { Link } from 'react-router-dom';
export default function DesktopWatchDesk({recent,resumable}:{recent:number;resumable:number}) {
 const dialog=useRef<HTMLDialogElement>(null);
 return <><button className="sn-secondary-action fixed right-0 top-1/3 z-30 rounded-l-xl px-3 py-2" onClick={()=>dialog.current?.showModal()}>Watch desk</button>
 <dialog ref={dialog} aria-label="Your watch desk" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}} className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-[min(380px,94vw)] border-l border-white/15 bg-[#101014] p-6 text-white backdrop:bg-black/50">
 <button autoFocus className="sn-secondary-action float-right px-3 py-2" onClick={()=>dialog.current?.close()}>Close</button><p className="mt-16 text-xs text-primary">YOUR WATCH DESK</p><h2 className="mt-3 text-xl font-semibold">Pick up where you left off</h2><p className="mt-3 text-sm text-white/70">{recent} recent episode entries this week · {resumable} resumable releases</p><Link onClick={()=>dialog.current?.close()} to="/schedule?scope=tracked" className="sn-secondary-action mt-6">Your upcoming releases ↗</Link></dialog></>;
}
