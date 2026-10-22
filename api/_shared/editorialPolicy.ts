import {calculateRanking,type EvidenceBrief,type Ranking} from './publishingData.js';
import type {EditorialDraft} from '../../src/api/editorialTypes.js';
import {publicActivityEvidence} from '../../src/lib/activityEvidence.js';
export function periodLabel(ranking:Pick<Ranking,'start'|'end'>){return `${ranking.start.slice(0,10)}–${new Date(Date.parse(ranking.end)-1).toISOString().slice(0,10)} UTC`;}
export function prepareEditorialBrief(brief:EvidenceBrief){
  if(brief.editorialVersion===3)return;
  brief.editorialVersion=3;
  if(brief.ranking){
    const r=brief.ranking,leader=r.rows[0];
    const positions=new Map([...r.rows,...r.honorableMentions].map((row,i)=>[row.id,i]));brief.items.sort((a,b)=>(positions.get(a.id)??99)-(positions.get(b.id)??99));
    brief.readerQuestion='Which anime led recorded AniList activity in this observed sample, and what can this metric establish?';
    const displayTitle=leader.title.length>85?leader.title.slice(0,82).trimEnd()+'…':leader.title;
    brief.headline=`${displayTitle} leads the AniList activity sample, ${periodLabel(r)}`;
    brief.findings=[{id:'sample-leader',mediaIds:[leader.id],sourceIds:['anilist-activity'],text:`${leader.title} led the ${r.candidateCount}-title observed sample for ${periodLabel(r)}, averaging ${Math.round(leader.mean*100)/100} recorded AniList activity across ${leader.days} days. This measures activity on AniList, not worldwide viewers.`}];
    const second=r.rows[1],evidence=brief.activityEvidence;
    if(second&&evidence){
      const leadDays=new Map(evidence.observations.filter(row=>row.mediaId===leader.id).map(row=>[new Date(row.date*1000).toISOString().slice(0,10),row.activity]));
      const common=evidence.observations.filter(row=>row.mediaId===second.id&&leadDays.has(new Date(row.date*1000).toISOString().slice(0,10)));
      const higher=common.filter(row=>leadDays.get(new Date(row.date*1000).toISOString().slice(0,10))!>row.activity).length;
      if(common.length>=4)brief.findings.push({id:'daily-comparison',mediaIds:[leader.id,second.id],sourceIds:['anilist-activity'],text:`${leader.title} recorded more daily AniList activity than ${second.title} on ${higher} of their ${common.length} shared recorded days. This compares the same observed dates; it does not explain the cause of the difference.`});
    }
    brief.charts=[{title:'Mean recorded daily AniList activity',unit:'activity',values:[...r.rows,...r.honorableMentions].map(row=>({label:row.title,value:Math.round(row.mean*100)/100,days:row.days}))}];
    brief.development=brief.findings[0].text;brief.context=[r.coverage];brief.unknowns=['The records do not establish why activity changed or how many people watched a title.'];
  }else{
    const text=brief.sources.filter(s=>s.primary).map(s=>s.text).join(' ');
    const sentences=text.split(/(?<=[.!?。])\s*/u).filter(s=>s.length>=45&&s.length<=900);
    brief.readerQuestion=`What has been confirmed about ${brief.subject}, and what does it change for the reader?`;
    brief.development=sentences.find(s=>s.toLowerCase().includes(brief.subject.toLowerCase()))||sentences[0]||'';
    brief.context=[...new Set(sentences.filter(s=>s!==brief.development))].slice(0,4);
    brief.unknowns=['Do not treat an omitted date, release track, territory or explanation as confirmed.'];
  }
}
export function reportNovelty(brief:EvidenceBrief,recent:any[]):string|undefined{
  if(brief.kind!=='data-report'||!brief.ranking)return;
  const prior=recent.find(post=>post.ranking&&['data-report','weekly-ranking'].includes(post.contentKind));
  if(!prior)return;
  const a=brief.ranking,b=prior.ranking;
  if(a.start===b.start&&a.end===b.end)return 'No eligible new story: this activity period has already been covered.';
  const ids=(value:any)=>value.activityEvidence?.candidateIds||value.ranking?.candidateIds;
  const oldIds=ids(prior);
  if(!oldIds||JSON.stringify([...a.candidateIds].sort((x,y)=>x-y))!==JSON.stringify([...oldIds].sort((x:number,y:number)=>x-y))||Date.parse(a.start)<Date.parse(b.end)||[...a.rows,...b.rows].some(row=>row.days!==7))return 'No eligible new story: the previous activity sample is not comparable; a shifted date window alone is not a finding.';
  if(JSON.stringify(a.rows.map(row=>row.id))===JSON.stringify(b.rows.map((row:any)=>row.id)))return 'No eligible new story: the comparable ranking is unchanged; numerical drift alone is not a new report.';
}
export function editorialInstructions(brief:EvidenceBrief){
  return `EDITORIAL POLICY 3 (additional strict requirements): Answer ${JSON.stringify(brief.readerQuestion)}. Use a specific subject-and-development headline, never a vague report heading or unsupported why/cause. Plain text only: no Markdown, HTML, inline source tokens, lists or statistics dumps. Reference sources using sourceIds only. Every block must add a distinct useful point; do not repeat the excerpt, results or methodology. ${brief.ranking?`Use this exact code-verified headline: ${JSON.stringify(brief.headline)}. The code will insert the supplied findings and render the complete chart/table and one methodology panel; do not restate them. Write one or two concise paragraphs explaining what the specific within-period comparisons establish and what remains unresolved. Avoid interchangeable methodology filler. No sections, dates or numerical statistical claims in your prose; the code owns values and title associations. Do not explain causes, popularity, audience reactions or rank movements not established in evidence. Use findingIds:["sample-leader"] on each paragraph. The period ends EXCLUSIVELY at ${brief.ranking.end}; the displayed period is ${periodLabel(brief.ranking)}.`:'Identify the actual confirmed development early, attribute it, and explain sourced practical consequences or meaningful unresolved details. If the source is too thin to add useful context, return rejectReason instead of expanding the announcement.'}`;
}
export function validateEditorialV3(raw:EditorialDraft,brief:EvidenceBrief){
  const errors:string[]=[],blocks=[...(raw.paragraphs||[]).map(p=>p.text),...(raw.sections||[]).map(s=>s.body)],all=[raw.headline,raw.excerpt,...blocks].join(' ');
  if(/<\/?[a-z][^>]*>|\*\*|(?:^|\s)[*#]\s|\[[\w-]+\]|```/i.test(all))errors.push('Plain text only: remove raw Markdown, HTML and inline citation tokens.');
  if(/\bwhy\b|activity report:|what seven days|everything you need|most popular|worldwide ranking/i.test(raw.headline))errors.push('The headline must describe the verified subject and finding, without unsupported causes or broad ranking claims.');
  const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>3);
  const overlap=(a:string,b:string)=>{const x=new Set(normalized(a)),y=new Set(normalized(b));return [...x].filter(w=>y.has(w)).length/Math.max(1,Math.min(x.size,y.size));};
  for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)if(overlap(blocks[i],blocks[j])>.75)errors.push('Blocks repeat their substantive information. Combine the repeated points.');
  if(brief.ranking){
    const evidence=publicActivityEvidence(brief.activityEvidence);
    if(!evidence)errors.push('A data report requires bounded, valid captured observations.');
    else{
      const titles=new Map(evidence.titles.map(t=>[t.id,t.title]));
      const computed=calculateRanking(evidence.observations.map(row=>({mediaId:row.mediaId,date:row.date,trending:row.activity,popularity:row.popularity,media:{title:{english:titles.get(row.mediaId)}}})),{start:Date.parse(evidence.start),end:Date.parse(evidence.endExclusive)});
      const project=(r:Ranking)=>[...r.rows,...r.honorableMentions].map(row=>[row.id,row.title,row.mean,row.days]);
      if(evidence.start!==brief.ranking.start||evidence.endExclusive!==brief.ranking.end||brief.ranking.candidateCount!==evidence.candidateIds.length||JSON.stringify([...evidence.candidateIds].sort((a,b)=>a-b))!==JSON.stringify([...brief.ranking.candidateIds].sort((a,b)=>a-b))||computed.eligibleCount!==brief.ranking.eligibleCount||JSON.stringify(project(computed))!==JSON.stringify(project(brief.ranking)))errors.push('The ranked title, period, daily coverage and value must match the captured observations.');
    }
    if(raw.headline!==brief.headline)errors.push('Use the supplied code-verified headline and inclusive reporting dates.');
    if(raw.sections?.length)errors.push('Do not duplicate the code-rendered results or methodology with prose sections.');
    if((raw.paragraphs||[]).some(p=>!p.findingIds?.includes('sample-leader')))errors.push('Bind data-report paragraphs to the supplied findingIds.');
    const titles=[...brief.ranking.rows,...brief.ranking.honorableMentions].map(row=>row.title).sort((a,b)=>b.length-a.length);
    let prose=[raw.excerpt,...blocks].join(' ');for(const title of titles)prose=prose.split(title).join('');
    if(/\d|\b(?:first|second|third|highest|leading|led|ranked|average|mean|percent|places|rose|fell|increase|decrease|growth|surge|doubled|tripled)\b/i.test(prose))errors.push('Do not generate statistical claims in prose. The verified finding and table own title, metric, period and value associations.');
    if(blocks.some(text=>/methodology|tie.break|at least.*days|missing days|UTC/i.test(text)))errors.push('Keep methodology and missing-day details in the single code-rendered coverage panel.');
  }else{
    if(!raw.headline.toLowerCase().includes(brief.subject.toLowerCase()))errors.push('The headline must identify the affected installment.');
    if(!brief.development||(brief.context||[]).length<1)errors.push('The primary evidence does not support an identifiable development and useful context.');
  }
  return [...new Set(errors)];
}
