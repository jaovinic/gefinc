import { TestBed } from '@angular/core/testing';
import { OFFLINE_WRITES, PENDING_CHANGE, PENDING_MARKER, SESSION_ENDED } from '@gefinc/ui-shared';
import { BackgroundReads } from './background-reads';
import { LocalDataWipe } from './local-data-wipe';
import { OfflineBootstrap } from './offline-bootstrap';
import { OfflineState } from './offline-state';
import { OfflineWarmup } from './offline-warmup';
import { provideOffline } from './offline.providers';

describe('provideOffline (fim da sessão)', () => {
  const wipe = { onSessionEnded: jest.fn(async () => undefined) };
  const background = { cancelAll: jest.fn() };

  beforeEach(() => {
    wipe.onSessionEnded.mockClear();
    background.cancelAll.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideOffline(),
        { provide: LocalDataWipe, useValue: wipe },
        { provide: BackgroundReads, useValue: background },
        { provide: OfflineBootstrap, useValue: { start: jest.fn(async () => undefined) } },
        { provide: OfflineWarmup, useValue: { start: jest.fn(async () => undefined) } },
      ],
    });
  });

  it.each(['logout', 'expired', 'deleted'] as const)('ao encerrar a sessão (%s) zera a data de sincronização, cancela as leituras em segundo plano e limpa os dados locais', async (reason) => {
    const state = TestBed.inject(OfflineState);
    state.markStale(new Date(2026, 10, 3, 14, 30));

    await TestBed.inject(SESSION_ENDED)(reason);

    expect(state.staleSince()).toBeNull();
    expect(background.cancelAll).toHaveBeenCalled();
    expect(wipe.onSessionEnded).toHaveBeenCalledWith(reason);
  });
});

describe('provideOffline (itens do app móvel na lista)', () => {
  it('liga a marcação de itens locais e de alterações pendentes, e a exclusão sem conexão', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideOffline(),
        { provide: OfflineBootstrap, useValue: { start: jest.fn(async () => undefined) } },
        { provide: OfflineWarmup, useValue: { start: jest.fn(async () => undefined) } },
      ],
    });

    const isLocal = TestBed.inject(PENDING_MARKER);
    const hasChange = TestBed.inject(PENDING_CHANGE);

    expect(isLocal({ id: -1 } as never)).toBe(true);
    expect(isLocal({ id: 5 } as never)).toBe(false);
    expect(hasChange({ id: 5, pendingChange: true } as never)).toBe(true);
    expect(hasChange({ id: 5 } as never)).toBe(false);
    expect(TestBed.inject(OFFLINE_WRITES)).toBe(true);
  });
});

describe('OfflineState', () => {
  it('reset esquece a data de sincronização do usuário anterior', () => {
    TestBed.resetTestingModule();
    const state = TestBed.inject(OfflineState);
    state.markStale(new Date());

    state.reset();

    expect(state.staleSince()).toBeNull();
  });
});
