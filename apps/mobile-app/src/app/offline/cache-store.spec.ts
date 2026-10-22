import { TestBed } from '@angular/core/testing';
import { UserScope } from './user-scope';
import { CACHE_BACKEND, CACHE_KEY_STORAGE, CACHE_MAX_BYTES, CacheStore, MemoryCacheBackend } from './cache-store';

class MemoryKeyStorage {
  value: string | null = null;
  async read() {
    return this.value;
  }
  async write(key: string) {
    this.value = key;
  }
  async remove() {
    this.value = null;
  }
}

describe('CacheStore (cópia local cifrada)', () => {
  let backend: MemoryCacheBackend;
  let user: string | null;

  function store(maxBytes = 20 * 1024 * 1024) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CACHE_BACKEND, useValue: backend },
        { provide: CACHE_KEY_STORAGE, useValue: new MemoryKeyStorage() },
        { provide: CACHE_MAX_BYTES, useValue: maxBytes },
        { provide: UserScope, useValue: { id: () => user } },
      ],
    });
    return TestBed.inject(CacheStore);
  }

  beforeEach(() => {
    backend = new MemoryCacheBackend();
    user = '7';
  });

  it('guarda a resposta cifrada e devolve com a data da gravação', async () => {
    const s = store();
    const before = Date.now();
    await s.put('http://api/transactions?month=2026-11', { total: 3, description: 'Aluguel' });

    const hit = await s.get<{ total: number }>('http://api/transactions?month=2026-11');

    expect(hit?.value).toEqual({ total: 3, description: 'Aluguel' });
    expect(hit!.syncedAt.getTime()).toBeGreaterThanOrEqual(before);
    const raw = JSON.stringify([...backend.entries.values()]);
    expect(raw).not.toContain('Aluguel');
  });

  it('trata a mesma consulta com parâmetros em outra ordem como a mesma entrada', async () => {
    const s = store();
    await s.put('http://api/transactions?month=2026-11&status=PENDING', ['a']);

    expect((await s.get('http://api/transactions?status=PENDING&month=2026-11'))?.value).toEqual(['a']);
  });

  it('isola o cache por usuário', async () => {
    const s = store();
    await s.put('http://api/accounts', ['da-ana']);
    user = '8';

    expect(await s.get('http://api/accounts')).toBeNull();
  });

  it('sem usuário identificado não grava nem lê', async () => {
    const s = store();
    user = null;

    await s.put('http://api/accounts', ['x']);

    expect(await s.get('http://api/accounts')).toBeNull();
    expect(backend.entries.size).toBe(0);
  });

  it('respeita o limite de tamanho descartando as entradas mais antigas', async () => {
    const s = store(900);
    const big = 'x'.repeat(250);
    await s.put('http://api/a', big);
    await new Promise((r) => setTimeout(r, 2));
    await s.put('http://api/b', big);
    await new Promise((r) => setTimeout(r, 2));
    await s.put('http://api/c', big);
    await new Promise((r) => setTimeout(r, 2));
    await s.put('http://api/d', big);

    expect(await s.get('http://api/a')).toBeNull();
    expect(await s.get('http://api/d')).not.toBeNull();
    expect([...backend.entries.values()].reduce((sum, e) => sum + e.size, 0)).toBeLessThanOrEqual(900);
  });

  it('entrada ilegível vira ausência e é removida', async () => {
    const s = store();
    await s.put('http://api/accounts', ['x']);
    const [key] = [...backend.entries.keys()];
    backend.entries.set(key, { ...backend.entries.get(key)!, payload: 'v1.AAAA.BBBB' });

    expect(await s.get('http://api/accounts')).toBeNull();
    expect(backend.entries.size).toBe(0);
  });

  it('clearUser apaga só as entradas do usuário e clearAll apaga tudo', async () => {
    const s = store();
    await s.put('http://api/accounts', ['da-ana']);
    user = '8';
    await s.put('http://api/accounts', ['do-bruno']);

    await s.clearUser('7');
    expect(backend.entries.size).toBe(1);
    expect((await s.get('http://api/accounts'))?.value).toEqual(['do-bruno']);

    await s.clearAll();
    expect(backend.entries.size).toBe(0);
  });
});
