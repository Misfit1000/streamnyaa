import {dangerouslyDeleteByTag,invalidateByTag} from '@vercel/functions';
export const articleCacheTag=(slug:string)=>`blog-article-${slug}`;
/** Invalidate only Blog responses; normal metadata and source caches stay warm. */
export async function refreshBlogCache(slug:string,removed=false){
 try{
  await Promise.all([removed?dangerouslyDeleteByTag(articleCacheTag(slug)):invalidateByTag(articleCacheTag(slug)),invalidateByTag(['blog-archive','blog-sitemap','blog-sections'])]);
  return true;
 }catch{return false;}
}
