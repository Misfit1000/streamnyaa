export type EditorialDraft = {
  headline: string; excerpt: string;
  paragraphs: {text:string;sourceIds:string[];findingIds?:string[]}[];
  sections: {heading:string;body:string;sourceIds:string[];findingIds?:string[]}[];
  rejectReason?:string;
};
export type ActivityEvidence = {
  version: 1; calculationVersion: 1; provider:'anilist'; retrievedAt:string;
  start:string; endExclusive:string; candidateIds:number[];
  titles:{id:number;title:string}[];
  observations:{mediaId:number;date:number;activity:number;popularity:number;retrievedAt?:string}[];
};
export type EditorialFinding = {id:string;text:string;sourceIds:string[];mediaIds:number[]};
