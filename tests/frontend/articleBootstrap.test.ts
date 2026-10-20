import { afterEach, expect, it } from 'vitest';
import { readArticleBootstrap } from '../../src/lib/articleBootstrap';
afterEach(()=>document.getElementById('streamnyaa-article')?.remove());
it('reuses only the server article for the exact route and rejects malformed payloads',()=>{
  const script=document.createElement('script');script.id='streamnyaa-article';script.type='application/json';document.body.append(script);
  const post={slug:'anime-trending-news-today',title:'Confirmed news',items:[],article:{paragraphs:['Confirmed body']}};
  script.textContent=JSON.stringify({path:'/blog/confirmed-news',post});expect(readArticleBootstrap('confirmed-news')).toEqual(post);expect(readArticleBootstrap('other')).toBeUndefined();
  for(const value of ['{broken',JSON.stringify({path:'/blog/confirmed-news',post:{...post,items:null}}),' '.repeat(2*1024*1024+1)]){script.textContent=value;expect(readArticleBootstrap('confirmed-news')).toBeUndefined();}
});
