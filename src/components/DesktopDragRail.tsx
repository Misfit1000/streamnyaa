import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export default function DesktopDragRail({ children, label, compact = false }: { children: ReactNode; label: string; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges,setEdges]=useState({left:true,right:false,overflow:false});
  const measure=()=>{const node=ref.current;if(node)setEdges({left:node.scrollLeft<=1,right:node.scrollLeft+node.clientWidth>=node.scrollWidth-1,overflow:node.scrollWidth>node.clientWidth+1});};
  useEffect(()=>{measure();const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);if(ref.current)resize?.observe(ref.current);window.addEventListener('resize',measure);return()=>{resize?.disconnect();window.removeEventListener('resize',measure);};},[children]);
  const drag = useRef({ id: -1, x: 0, scroll: 0, moved: false });
  const move = (direction: number) => ref.current?.scrollBy({ left: direction * (ref.current.clientWidth * .8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return <div className={compact?'mt-2':'mt-4'}>{(!compact||edges.overflow)&&<div className="mb-2 flex justify-end gap-2"><button disabled={edges.left} className="sn-icon-action h-9 w-9 disabled:opacity-30" aria-label={`Scroll ${label} left`} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></button><button disabled={edges.right} className="sn-icon-action h-9 w-9 disabled:opacity-30" aria-label={`Scroll ${label} right`} onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></button></div>}
    <div ref={ref} role="region" aria-label={label} tabIndex={0} onScroll={measure} className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 outline-offset-4" style={{ touchAction:'pan-x pan-y',scrollBehavior:'auto',scrollbarWidth:'thin' }} onDragStart={e => e.preventDefault()}
      onPointerDown={e => { if(e.button !== 0 || e.pointerType==='touch' || (e.target as HTMLElement).closest('button')) return; drag.current={id:e.pointerId,x:e.clientX,scroll:e.currentTarget.scrollLeft,moved:false}; }}
      onPointerMove={e => { const state=drag.current; if(state.id !== e.pointerId) return; const delta=e.clientX-state.x; if(!state.moved && Math.abs(delta)<6) return; state.moved=true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); e.currentTarget.scrollLeft=state.scroll-delta; }}
      onPointerUp={e => { drag.current.id=-1; if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drag.current.id=-1; }} onPointerLeave={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) drag.current.id=-1; }}
      onClickCapture={e => { if(drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved=false; } }}
      onKeyDown={e => { if(e.target !== e.currentTarget)return;if(['Home','End'].includes(e.key)){e.preventDefault();e.currentTarget.scrollTo({left:e.key==='Home'?0:e.currentTarget.scrollWidth,behavior:'auto'});}else if(['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); move(e.key==='ArrowLeft'?-1:1); } }}>{children}</div>
  </div>;
}
