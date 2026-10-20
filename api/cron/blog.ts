import { scheduledGeneration } from '../_shared/publishing.js';
export const maxDuration=300;
export default async function handler(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{const jobs=await scheduledGeneration();return res.status(jobs.some((job:any)=>job.status==='failed')?502:200).json({ok:!jobs.some((job:any)=>job.status==='failed'),jobs,published:jobs.reduce((count:number,job:any)=>count+job.published.length,0)});}
  catch(error){return res.status(503).json({ok:false,error:(error as Error).message});}
}
