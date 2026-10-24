import type {EvidenceBrief} from './publishingData.js';

const normalize=(value:string)=>value.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
/** Titles are names, not invented speech. Everything else still needs source text. */
export function quotationErrors(text:string,brief:EvidenceBrief):string[]{
  const sourceText=normalize(brief.sources.map(source=>source.text||'').join('\n'));
  const titles=new Set([brief.subject,...(brief.items||[]).map(item=>item.title)].filter((title):title is string=>typeof title==='string').map(normalize));
  const errors:string[]=[];
  // Consume short pairs too. Skipping their opening quote lets its closing
  // quote incorrectly capture the prose before the next quoted title.
  for(const match of text.matchAll(/“([^”]*)”|"([^"\n]*)"/g)){
    const quoted=match[1]??match[2]??'';
    const quote=normalize(quoted).replace(/[.,;:!?]+$/,'');
    if(quote.length<18)continue;
    if(!titles.has(quote)&&!sourceText.includes(quote))errors.push(`A quoted passage is not present in the evidence: “${quoted.slice(0,160)}”. Use a sourced direct quote or an accurate, attributed paraphrase without quotation marks.`);
  }
  return errors;
}
