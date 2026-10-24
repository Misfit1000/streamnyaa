export type WebSourceProvider='nyaa'|'sukebei';
export function isHentaiTitle(anime:any){
 return (anime?.genres||[]).some((genre:any)=>/^hentai$/i.test(String(genre?.name||genre))) || /\bhentai\b/i.test(String(anime?.rating||''));
}
export function titleSourceProvider(anime:any):WebSourceProvider{return isHentaiTitle(anime)?'sukebei':'nyaa';}
