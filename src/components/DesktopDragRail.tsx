import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export default function DesktopDragRail({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ id: -1, x: 0, scroll: 0, moved: false });
  const move = (direction: number) => ref.current?.scrollBy({ left: direction * (ref.current.clientWidth * .8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return <div className="mt-4"><div className="mb-2 flex justify-end gap-2"><button className="sn-icon-action h-9 w-9" aria-label={`Scroll ${label} left`} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></button><button className="sn-icon-action h-9 w-9" aria-label={`Scroll ${label} right`} onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></button></div>
    <div ref={ref} role="region" aria-label={label} tabIndex={0} className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 outline-offset-4" style={{ touchAction:'pan-y',scrollBehavior:'auto',scrollbarWidth:'thin' }} onDragStart={e => e.preventDefault()}
      onPointerDown={e => { if(e.button !== 0 || (e.target as HTMLElement).closest('button')) return; drag.current={id:e.pointerId,x:e.clientX,scroll:e.currentTarget.scrollLeft,moved:false}; }}
      onPointerMove={e => { const state=drag.current; if(state.id !== e.pointerId) return; const delta=e.clientX-state.x; if(!state.moved && Math.abs(delta)<6) return; state.moved=true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); e.currentTarget.scrollLeft=state.scroll-delta; }}
      onPointerUp={e => { drag.current.id=-1; if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drag.current.id=-1; }} onPointerLeave={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) drag.current.id=-1; }}
      onClickCapture={e => { if(drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved=false; } }}
      onKeyDown={e => { if(e.target === e.currentTarget && ['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); move(e.key==='ArrowLeft'?-1:1); } }}>{children}</div>
  </div>;
}
