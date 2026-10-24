export type WebSourceProvider='nyaa'|'sukebei';
export function isHentaiTitle(anime:any){
 return (anime?.genres||[]).some((genre:any)=>/^hentai$/i.test(String(genre?.name||genre))) || /\bhentai\b/i.test(String(anime?.rating||''));
}
export function titleSourceProvider(anime:any):WebSourceProvider{return isHentaiTitle(anime)?'sukebei':'nyaa';}
export function isChineseTitle(anime:any){return ['CN','CHINA'].includes(String(anime?.countryOfOrigin||anime?.country_of_origin||'').toUpperCase());}
export function webContentAllowed(anime:any,adult:boolean,hideChinese=false){return (adult||!isHentaiTitle(anime))&&(!hideChinese||!isChineseTitle(anime));}
