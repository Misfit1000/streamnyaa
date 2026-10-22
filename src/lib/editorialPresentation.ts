import type {EditorialDraft,EditorialFinding} from '../api/editorialTypes';
import type {BlogArticleContent,BlogPostData} from '../api/blogShared';
export function publicArticleContent(post:BlogPostData):BlogPostData{
  if(post.qualityVersion!==3||!post.activityEvidence)return post;
  const {activityEvidence,...view}=post;return{...view,hasActivityEvidence:true};
}
/** Shared conversion for private preview and published version-3 content. */
export function articleFromEditorialDraft(draft:EditorialDraft,findings:EditorialFinding[]=[]):BlogArticleContent{
  const blocks=[...findings.map(f=>({text:f.text,sourceIds:f.sourceIds})),...draft.paragraphs];
  const citations:Record<string,string[]>={};
  blocks.forEach((block,i)=>citations[`paragraph:${i}`]=block.sourceIds);
  draft.sections.forEach((block,i)=>citations[`section:${i}`]=block.sourceIds);
  return{headline:draft.headline,excerpt:draft.excerpt,seoTitle:`${draft.headline} | StreamNyaa`,metaDescription:draft.excerpt.slice(0,155),heroCallout:'',
    paragraphs:blocks.map(block=>block.text),sections:draft.sections.map(({heading,body})=>({heading,body})),citations,takeaways:[],faq:[]};
}
