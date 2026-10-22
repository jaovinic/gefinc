import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoticeService, SessionService } from '@gefinc/ui-shared';
import { NetworkStatus } from './network-status';
import { OfflineBootstrap } from './offline-bootstrap';
import { OfflineState } from './offline-state';
import { PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

describe('OfflineBootstrap', () => {
  const authenticated = signal(true);
  const online = signal(false);
  const flush = jest.fn(async () => ({ sent: 0, rejected: 0, stopped: null }));

  beforeEach(() => {
    authenticated.set(true);
    online.set(false);
    flush.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: { authenticated } },
        { provide: NetworkStatus, useValue: { online, start: jest.fn() } },
        { provide: PendingQueue, useValue: { load: jest.fn(async () => undefined), ops: signal([]) } },
        { provide: SyncEngine, useValue: { flush } },
      ],
    });
  });

  it('quando a conexão volta com dados antigos na tela, avisa as telas para recarregar e tira o aviso de "dados de..."', () => {
    const state = TestBed.inject(OfflineState);
    const notices = TestBed.inject(NoticeService);
    TestBed.inject(OfflineBootstrap);
    state.markStale(new Date(2026, 10, 9, 20, 0));
    TestBed.tick();
    expect(notices.dataChangedCount()).toBe(0);

    online.set(true);
    TestBed.tick();

    expect(notices.dataChangedCount()).toBe(1);
    expect(state.staleSince()).toBeNull();
  });

  it('sem dados antigos na tela, a volta da conexão não recarrega nada à toa', () => {
    const notices = TestBed.inject(NoticeService);
    TestBed.inject(OfflineBootstrap);
    TestBed.tick();

    online.set(true);
    TestBed.tick();

    expect(notices.dataChangedCount()).toBe(0);
  });
});
