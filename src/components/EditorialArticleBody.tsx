import type {BlogPostData} from '../api/blogShared';
import ArticleEvidence,{ArticleCitations} from './ArticleEvidence';
/** Version-3 body is identical in authenticated preview and initial/public HTML. */
export default function EditorialArticleBody({post,preview=false}:{post:BlogPostData;preview?:boolean}){
  return <div className="space-y-6">
    <section className="space-y-5 rounded-2xl border border-border bg-[var(--glass)] p-5 md:p-6" aria-label="Article body">
      {post.article?.paragraphs.map((text,i)=><p key={i} className="text-sm leading-8 text-muted-foreground md:text-base">{text}<ArticleCitations post={post} block={`paragraph:${i}`}/></p>)}
    </section>
    {post.article?.sections.map((section,i)=><section key={i} className="rounded-2xl border border-border bg-secondary/30 p-5 md:p-6"><h2 className="mb-3 text-xl font-black">{section.heading}</h2><p className="text-sm leading-8 text-muted-foreground md:text-base">{section.body}<ArticleCitations post={post} block={`section:${i}`}/></p></section>)}
    <ArticleEvidence post={post} preview={preview}/>
  </div>;
}
