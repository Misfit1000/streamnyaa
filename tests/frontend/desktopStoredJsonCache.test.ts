import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneDesktopStoredJson, createDesktopStoredJsonReader } from '../../src/lib/desktopStoredJsonCache';

describe('desktop decoded storage reuse', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('parses unchanged storage once while checking its current raw value on every read', () => {
    localStorage.setItem('fixture', '{"value":1}');
    const read = createDesktopStoredJsonReader('fixture');
    const parse = vi.spyOn(JSON, 'parse');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    for (let index = 0; index < 60; index++) expect(read()).toEqual({ value: 1 });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(60);
  });

  it('observes direct same-window writes, removal, and clear without synthetic events', () => {
    const read = createDesktopStoredJsonReader('fixture');
    expect(read()).toBeNull();
    localStorage.setItem('fixture', '{"value":1}');
    expect(read()).toEqual({ value: 1 });
    localStorage.setItem('fixture', '{"value":2}');
    expect(read()).toEqual({ value: 2 });
    localStorage.removeItem('fixture');
    expect(read()).toBeNull();
    localStorage.setItem('fixture', '{"value":3}');
    expect(read()).toEqual({ value: 3 });
    localStorage.clear();
    expect(read()).toBeNull();
  });

  it('observes external storage updates and does not invalidate for unrelated keys', () => {
    const read = createDesktopStoredJsonReader('fixture');
    localStorage.setItem('fixture', '{"value":1}');
    read();
    const parse = vi.spyOn(JSON, 'parse');
    localStorage.setItem('other', 'changed');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'changed' }));
    expect(read()).toEqual({ value: 1 });
    expect(parse).not.toHaveBeenCalled();
    localStorage.setItem('fixture', '{"value":2}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'fixture', newValue: '{"value":2}' }));
    expect(read()).toEqual({ value: 2 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('does not repeatedly parse corruption and recovers when storage is repaired', () => {
    const read = createDesktopStoredJsonReader('fixture');
    localStorage.setItem('fixture', 'corrupt');
    const parse = vi.spyOn(JSON, 'parse');
    expect(read).toThrow();
    expect(read).toThrow();
    expect(parse).toHaveBeenCalledTimes(1);
    localStorage.setItem('fixture', '{"repaired":true}');
    expect(read()).toEqual({ repaired: true });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('retains byte limits before parsing and observes removal of oversized payloads', () => {
    const read = createDesktopStoredJsonReader('fixture', 10);
    localStorage.setItem('fixture', '{"value":12345}');
    const parse = vi.spyOn(JSON, 'parse');
    expect(read).toThrow(RangeError);
    expect(parse).not.toHaveBeenCalled();
    localStorage.removeItem('fixture');
    expect(read()).toBeNull();
  });

  it('does not serve an old value when reading storage fails', () => {
    const read = createDesktopStoredJsonReader('fixture');
    localStorage.setItem('fixture', '{"value":1}');
    expect(read()).toEqual({ value: 1 });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    expect(read).toThrow('Denied');
    get.mockRestore();
    localStorage.setItem('fixture', '{"value":2}');
    expect(read()).toEqual({ value: 2 });
  });

  it('binds decoded data to the current storage object across runtime/account replacement', () => {
    const read = createDesktopStoredJsonReader('fixture');
    localStorage.setItem('fixture', '{"value":1}');
    read();
    const replacement = { getItem: vi.fn(() => '{"value":1}') } as unknown as Storage;
    const storage = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(replacement);
    const parse = vi.spyOn(JSON, 'parse');
    expect(read()).toEqual({ value: 1 });
    expect(parse).toHaveBeenCalledTimes(1);
    storage.mockRestore();
  });

  it('clones selected JSON results with nested-object isolation, including the compatibility path', () => {
    const source = JSON.parse('{"nested":[{"value":1}],"__proto__":{"safe":true}}');
    const copied = cloneDesktopStoredJson(source);
    copied.nested[0].value = 2;
    expect(source.nested[0].value).toBe(1);
    vi.stubGlobal('structuredClone', undefined);
    try {
      const fallback = cloneDesktopStoredJson(source);
      fallback.nested[0].value = 3;
      expect(source.nested[0].value).toBe(1);
      expect(Object.getPrototypeOf(fallback)).toBe(Object.prototype);
      expect(Object.hasOwn(fallback, '__proto__')).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
