import { beforeEach, describe, expect, it } from 'vitest';
import { applyNativeCheckpoint, type NativeCheckpoint } from '../../src/lib/desktopNativeProgress';
import { loadDesktopWatchProgress } from '../../src/lib/desktop';
const record=(overrides:Partial<NativeCheckpoint>={}):NativeCheckpoint=>({version:1,sessionId:'session',generation:1,sequence:1,updatedAt:10000,
 context:{owner:'a',animeId:'42',title:'Example',episode:'2',sourceKey:'source'},
 coverage:{version:2,duration:100,intervals:[[0,93]],furthest:93,lastPosition:93},completed:true,state:'eof',...overrides});
beforeEach(()=>localStorage.clear());
describe('native progress bridge',()=>{
 it('records completion without a mounted Watch page or history entry',()=>{applyNativeCheckpoint(record(),'a');expect(loadDesktopWatchProgress()[0].completed).toBe(true);});
 it('isolates account changes',()=>{applyNativeCheckpoint(record(),'b');expect(loadDesktopWatchProgress()).toEqual([]);});
 it('does not count a seek to the end as completion',()=>{applyNativeCheckpoint(record({coverage:{version:2,duration:100,intervals:[[0,20]],furthest:20,lastPosition:100}}),'a');expect(loadDesktopWatchProgress()[0].completed).toBe(false);expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);});
 it('does not regress durable coverage on stale replay',()=>{applyNativeCheckpoint(record(),'a');applyNativeCheckpoint(record({updatedAt:9000,coverage:{version:2,duration:100,intervals:[[0,5]],furthest:5,lastPosition:5}}),'a');expect(loadDesktopWatchProgress()[0].completed).toBe(true);});
});
