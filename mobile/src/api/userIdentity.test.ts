import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(()=>vi.resetModules());
afterEach(()=>vi.unstubAllGlobals());
it('reuses a stored identity, caches it, and preserves both legacy query parameters',async()=>{
  const storage={getItem:vi.fn().mockResolvedValue('  saved-user  '),setItem:vi.fn()};vi.stubGlobal('require',()=>({default:storage}));
  const {getOrCreateUserId,getUserIdentityQueryString}=await import('./userIdentity');
  expect(await getOrCreateUserId()).toBe('saved-user');expect(await getOrCreateUserId()).toBe('saved-user');expect(storage.getItem).toHaveBeenCalledTimes(1);expect(storage.setItem).not.toHaveBeenCalled();
  const params=new URLSearchParams(await getUserIdentityQueryString());expect(params.get('user_id')).toBe('saved-user');expect(params.get('bubble_user_id')).toBe('saved-user');
});
it.each(['undefined','null',''])('replaces invalid persisted identity %s instead of sending it to the API',async stored=>{
  const storage={getItem:vi.fn().mockResolvedValue(stored),setItem:vi.fn().mockResolvedValue(undefined)};vi.stubGlobal('require',()=>({default:storage}));
  const {getOrCreateUserId}=await import('./userIdentity');const id=await getOrCreateUserId();expect(id).toMatch(/^user_/);expect(storage.setItem).toHaveBeenCalledWith('app:user-id',id);
});
it.each(['absent','throws','unsupported'])('keeps an in-memory identity when native storage is %s',async mode=>{
  vi.stubGlobal('require',mode==='absent'?undefined:()=>{if(mode==='throws')throw new Error('native missing');return {};});
  const {getOrCreateUserId}=await import('./userIdentity');const id=await getOrCreateUserId();expect(id).toMatch(/^user_/);expect(await getOrCreateUserId()).toBe(id);
});
