import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PendingListPage } from './pending-list.page';
import { PendingOp, PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, TokenStore } from '@gefinc/ui-shared';

describe('PendingListPage (pendências de envio)', () => {
  const ops = signal<PendingOp[]>([]);
  const queue = {
    ops,
    remove: jest.fn(async (id: string) => ops.update((l) => l.filter((o) => o.id !== id))),
    retry: jest.fn(async () => undefined),
  };
  const flush = jest.fn(async () => ({ sent: 0, rejected: 0, stopped: null }));

  const pending: PendingOp = { id: 'a', kind: 'CREATE_GROUP', path: '/transaction-groups', body: { description: 'Mercado' }, createdAt: 1, state: 'PENDING', label: 'Mercado' };
  const rejected: PendingOp = { id: 'b', kind: 'PAY', path: '/transactions/9/pay', body: { paymentDate: '2026-11-10' }, createdAt: 2, state: 'REJECTED', label: 'Pagamento do lançamento 9', error: 'Este lançamento já está pago.' };

  function render() {
    const fixture = TestBed.createComponent(PendingListPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    ops.set([pending, rejected]);
    queue.remove.mockClear();
    queue.retry.mockClear();
    flush.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: TokenStore, useClass: MemoryTokenStore },
        { provide: PendingQueue, useValue: queue },
        { provide: SyncEngine, useValue: { flush, syncing: signal(false) } },
      ],
    });
  });

  it('separa o que aguarda envio do que foi recusado, com o motivo da recusa', () => {
    const { el } = render();

    expect(el.querySelector('h1')?.textContent).toContain('Pendências de envio');
    expect(el.querySelector('[data-testid="waiting"]')?.textContent).toContain('Mercado');
    const recused = el.querySelector('[data-testid="rejected"]') as HTMLElement;
    expect(recused.textContent).toContain('Pagamento do lançamento 9');
    expect(recused.textContent).toContain('Este lançamento já está pago.');
  });

  it('descartar remove a operação', () => {
    const { el } = render();

    (el.querySelector('button[aria-label="Descartar Pagamento do lançamento 9"]') as HTMLButtonElement).click();

    expect(queue.remove).toHaveBeenCalledWith('b');
  });

  it('tentar de novo volta a operação para a fila e envia', async () => {
    const { el } = render();

    (el.querySelector('button[aria-label="Tentar de novo Pagamento do lançamento 9"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.retry).toHaveBeenCalledWith('b');
    expect(flush).toHaveBeenCalled();
  });

  it('sem pendências mostra o estado vazio', () => {
    ops.set([]);
    const { el } = render();

    expect(el.textContent).toContain('Nenhuma pendência');
  });
});
