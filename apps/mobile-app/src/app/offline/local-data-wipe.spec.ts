import { TestBed } from '@angular/core/testing';
import { CACHE_KEY_STORAGE, CacheCrypto } from './cache-crypto';
import { CacheStore } from './cache-store';
import { LocalDataWipe } from './local-data-wipe';
import { PendingQueue } from './pending-queue';
import { UserScope } from './user-scope';

describe('LocalDataWipe (dados locais ao encerrar a sessão)', () => {
  const cache = { clearUser: jest.fn(async () => undefined), clearAll: jest.fn(async () => undefined) };
  const crypto = { reset: jest.fn(async () => undefined) };
  const queue = { discardAll: jest.fn(async () => undefined) };
  const removed: string[] = [];

  beforeEach(() => {
    for (const fn of [cache.clearUser, cache.clearAll, crypto.reset, queue.discardAll]) fn.mockClear();
    removed.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CacheStore, useValue: cache },
        { provide: CacheCrypto, useValue: crypto },
        { provide: PendingQueue, useValue: queue },
        { provide: UserScope, useValue: { id: () => '7' } },
        { provide: CACHE_KEY_STORAGE, useValue: {} },
      ],
    });
  });

  it('sair apaga a cópia local, a fila e a chave de cifra', async () => {
    await TestBed.inject(LocalDataWipe).onSessionEnded('logout');

    expect(cache.clearAll).toHaveBeenCalled();
    expect(queue.discardAll).toHaveBeenCalled();
    expect(crypto.reset).toHaveBeenCalled();
  });

  it('exclusão da conta apaga tudo, como sair', async () => {
    await TestBed.inject(LocalDataWipe).onSessionEnded('deleted');

    expect(queue.discardAll).toHaveBeenCalled();
    expect(crypto.reset).toHaveBeenCalled();
  });

  it('sessão expirada apaga só a cópia local: a fila e a chave ficam para o mesmo usuário continuar depois', async () => {
    await TestBed.inject(LocalDataWipe).onSessionEnded('expired');

    expect(cache.clearUser).toHaveBeenCalledWith('7');
    expect(queue.discardAll).not.toHaveBeenCalled();
    expect(crypto.reset).not.toHaveBeenCalled();
  });
});
