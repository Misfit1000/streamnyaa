import {describe,it,expect} from 'vitest';
import {mergeCoverage,coveragePercent} from '../../src/lib/desktopCoverage';
describe('actual watched coverage',()=>{
 it('does not count a forward seek as watched',()=>{const result=mergeCoverage({version:2,intervals:[[0,300]],furthest:300},{lastPosition:1200,intervals:[]},1440);expect(result.furthest).toBe(300);expect(coveragePercent(result,1440)).toBeCloseTo(20.8333);});
 it('counts actual playback after a forward seek without filling the gap',()=>{const result=mergeCoverage({intervals:[[0,300]],furthest:300},{intervals:[[1200,1210]],lastPosition:1210},1440);expect(result.furthest).toBe(1210);expect(result.intervals).toEqual([[0,300],[1200,1210]]);});
 it('merges overlapping rewatches and keeps furthest resume',()=>{const result=mergeCoverage({intervals:[[0,300],[1200,1210]],furthest:1210},{intervals:[[100,350]],lastPosition:350},1440);expect(result.intervals).toEqual([[0,350],[1200,1210]]);expect(result.furthest).toBe(1210);});
 it('migrates checkpoints without fabricating watched coverage',()=>{const result=mergeCoverage(undefined,{lastPosition:0},1440,300);expect(result.furthest).toBe(300);expect(coveragePercent(result,1440)).toBe(0);});
 it('does not merge incompatible durations',()=>{const result=mergeCoverage({duration:1440,intervals:[[0,300]],furthest:300},{intervals:[[0,10]]},720);expect(result.furthest).toBe(10);});
 it('rejects malformed intervals',()=>{expect(mergeCoverage(undefined,{intervals:[[NaN,10],[0,Infinity],[20,10]]},100).intervals).toEqual([]);});
});
