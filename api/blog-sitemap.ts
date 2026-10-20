import { publishedBlogSitemap } from './blogArchive.js';
const escapeXml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export default async function handler(req:any,res:any){
  if(req.method!=='GET')return res.status(405).end();
  try{
    const origin=(process.env.SITE_URL||'https://www.streamnyaa.xyz').replace(/\/+$/,''),posts=await publishedBlogSitemap();
    const seen=new Set<string>();const urls=posts.filter(post=>typeof post.articleSlug==='string'&&/^[a-z0-9-]+$/.test(post.articleSlug)&&!seen.has(post.articleSlug)&&seen.add(post.articleSlug));
    const body=urls.map(post=>`  <url><loc>${escapeXml(`${origin}/blog/${post.articleSlug}`)}</loc>${post.updatedAt&&Number.isFinite(Date.parse(post.updatedAt))?`<lastmod>${new Date(post.updatedAt).toISOString()}</lastmod>`:''}</url>`).join('\n');
    res.setHeader('Content-Type','application/xml; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
  }catch{res.setHeader('Cache-Control','no-store');return res.status(503).send('Published content is temporarily unavailable.');}
}
