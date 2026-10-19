import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),rpc:vi.fn(),refresh:vi.fn()}));
vi.mock('../../src/lib/accountSync',()=>({accountHistoryV3:mocks.rpc,fetchLegacyHistoryRows:vi.fn()}));
vi.mock('../../src/lib/desktopHistoryArchive',()=>({flushHistoryWrites:vi.fn(),historyRequest:mocks.request,refreshHistoryProjection:mocks.refresh,toHistoryEpisode:vi.fn()}));
import { syncDesktopHistory } from '../../src/lib/desktopHistorySync';
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();});
it('stops a deferred remote page instead of fetching it in an endless loop',async()=>{
  mocks.request.mockImplementation(async(action:string)=>action==='cursor'?0:action==='outbox'?[]:true);
  mocks.rpc.mockResolvedValue({version:3,migrated:true,tracking:[],resumes:[],cursor:10,hasMore:true});
  await expect(syncDesktopHistory({access_token:'test',user:{id:'a'}} as any,()=>true)).rejects.toThrow('next pass');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.refresh).not.toHaveBeenCalled();
});
it('keeps a failed cloud batch queued until it is acknowledged',async()=>{
  mocks.request.mockImplementation(async(action:string)=>action==='cursor'?0:action==='outbox'?[{sequence:1,identity:'mal:1',kind:'progress'}]:true);
  mocks.rpc.mockResolvedValueOnce({version:3,migrated:true,tracking:[],resumes:[],cursor:0}).mockRejectedValueOnce(new Error('offline'));
  await expect(syncDesktopHistory({access_token:'test',user:{id:'a'}} as any,()=>true)).rejects.toThrow('offline');
  expect(mocks.request.mock.calls.some(([action])=>action==='cloudApply'||action==='ack')).toBe(false);
});
