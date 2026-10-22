import {useEffect,useRef,useState} from 'react';
export function useNearViewport<T extends HTMLElement = HTMLElement>(){
 const ref=useRef<T>(null);const [eligible,setEligible]=useState(()=>typeof IntersectionObserver==='undefined');
 useEffect(()=>{if(eligible)return;const node=ref.current;if(!node)return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setEligible(true);observer.disconnect();}},{rootMargin:`${Math.max(1,window.innerHeight)}px 0px`});
  observer.observe(node);return()=>observer.disconnect();
 },[eligible]);return {ref,eligible};
}
