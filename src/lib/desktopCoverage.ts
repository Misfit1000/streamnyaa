export type WatchedCoverage = {version:2; duration?:number; intervals:[number,number][]; furthest:number; lastPosition:number};
export function mergeCoverage(previous:Partial<WatchedCoverage>|undefined,incoming:Partial<WatchedCoverage>|undefined,duration:number,legacy=0):WatchedCoverage {
 const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 if(previous?.duration && duration>0 && Math.abs(previous.duration-duration)>Math.max(10,duration*.02)){previous=undefined;legacy=0;}
 const ranges=[...(Array.isArray(previous?.intervals)?previous.intervals:[]),...(Array.isArray(incoming?.intervals)?incoming.intervals:[])].filter(r=>Array.isArray(r)&&finite(r[0])&&finite(r[1])&&r[1]>r[0]).map(r=>[r[0],duration>0?Math.min(r[1],duration):r[1]] as [number,number]).filter(r=>r[1]>r[0]).sort((a,b)=>a[0]-b[0]);
 const intervals:[number,number][]=[];
 for(const range of ranges){const last=intervals.at(-1);if(last&&range[0]<=last[1]+.05)last[1]=Math.max(last[1],range[1]);else intervals.push(range);}
 const furthest=Math.max(finite(legacy)?legacy:0,...intervals.map(r=>r[1]),finite(previous?.furthest)?previous.furthest:0);
 return {version:2,duration,intervals,furthest:duration>0?Math.min(furthest,duration):furthest,lastPosition:finite(incoming?.lastPosition)?incoming.lastPosition:previous?.lastPosition || 0};
}
export const coveragePercent=(coverage:WatchedCoverage,duration:number)=>duration>0?Math.min(100,coverage.intervals.reduce((sum,[a,b])=>sum+b-a,0)/duration*100):0;
