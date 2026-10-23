import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nyaa.ts';
for(const status of [403,429])test(`source gateway preserves upstream ${status} without trying fallback routes`,async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('Denied',{status,headers:{'Retry-After':'120'}});};
 const headers:Record<string,string>={};let actual=0;
 const res={setHeader:(key:string,value:unknown)=>{headers[key.toLowerCase()]=String(value);},status(value:number){actual=value;return this;},json(value:unknown){return value;}};
 try{await handler({method:'GET',query:{q:`source-admission-${status}`,deep:'0',pages:'1',c:'1_2'},headers:{}},res);assert.equal(actual,status);assert.equal(headers['retry-after'],'120');assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
