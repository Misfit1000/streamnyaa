import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { recoverChunkError } from '../../src/lib/webStartup';
beforeEach(()=>{sessionStorage.clear();document.body.innerHTML='';});
afterEach(()=>vi.restoreAllMocks());
it('recovers an old deployment import only once per build/session',()=>{const reload=vi.fn();expect(recoverChunkError(reload)).toBe(true);expect(recoverChunkError(reload)).toBe(false);expect(reload).toHaveBeenCalledOnce();});
it('preserves editing, offline sessions and unavailable storage',()=>{
 const input=document.createElement('input');input.defaultValue='';input.value='pending edit';document.body.append(input);expect(recoverChunkError(vi.fn())).toBe(false);input.remove();
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});expect(recoverChunkError(vi.fn())).toBe(false);
});
