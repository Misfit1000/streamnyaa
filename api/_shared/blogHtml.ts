import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { BlogPostData } from '../../src/api/blogShared.js';

const require = createRequire(path.join(process.cwd(),'package.json'));
const escape = (value:unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const scriptJson = (value:unknown) => JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

export function articleHtml(post:BlogPostData, requestPath:string) {
  const renderer=require(path.join(process.cwd(),'api/_generated/blog-renderer.cjs'));
  const article=renderer.renderArticle(post,requestPath);
  const canonical='https://www.streamnyaa.xyz'+article.canonicalPath;
  let html=readFileSync(path.join(process.cwd(),'dist/index.html'),'utf8');
  html=html.replace('<html lang="en">','<html lang="en" class="dark">');
  html=html.replace('<head>',`<head><script>try{var t=JSON.parse(localStorage.getItem('shanks-storage')||'null');document.documentElement.classList.toggle('dark',t?.state?.theme!=='light')}catch{}</script>`);
  html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escape(article.title)}</title>`)
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi,'')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi,'');
  const image=article.image||'https://www.streamnyaa.xyz/logo.svg';
  const head=`<meta name="description" content="${escape(article.description)}"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="${escape(canonical)}">`
    +[['og:title',article.title],['og:description',article.description],['og:type','article'],['og:url',canonical],['og:image',image]].map(([name,value])=>`<meta property="${name}" content="${escape(value)}">`).join('')
    +[['twitter:card','summary_large_image'],['twitter:title',article.title],['twitter:description',article.description],['twitter:image',image]].map(([name,value])=>`<meta name="${name}" content="${escape(value)}">`).join('')
    +`<script id="streamnyaa-jsonld" type="application/ld+json">${scriptJson(article.jsonLd)}</script>`;
  const bootstrap=scriptJson({path:requestPath,post});
  if(bootstrap.length>2*1024*1024)throw Error('Article exceeds the public rendering limit.');
  const root = html.includes('<!--streamnyaa-app-start-->') ? /<!--streamnyaa-app-start-->[\s\S]*?<!--streamnyaa-app-end-->/ : /<div id="root"><\/div>/;
  if (!root.test(html)) throw Error('The article rendering shell is incompatible.');
  return html.replace('</head>',()=>head+'</head>').replace(root,()=>`<div id="root">${article.body}</div><script id="streamnyaa-article" type="application/json">${bootstrap}</script>`);
}
