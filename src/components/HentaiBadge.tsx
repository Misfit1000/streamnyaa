import {isHentaiTitle} from '../lib/webSourceProvider';

export default function HentaiBadge({anime,className='absolute bottom-16 left-2 z-20'}:{anime:any;className?:string}){
 return isHentaiTitle(anime)?<span className={`pointer-events-none inline-flex max-w-[calc(100%-16px)] items-center rounded border border-rose-300/70 bg-rose-950 px-1.5 py-1 text-[10px] font-black leading-tight tracking-wide text-white ${className}`}>Hentai · 18+</span>:null;
}
