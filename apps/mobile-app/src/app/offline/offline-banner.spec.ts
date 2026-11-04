import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OfflineBanner } from './offline-banner';
import { NetworkStatus } from './network-status';
import { OfflineState } from './offline-state';
import { PendingOp, PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

describe('OfflineBanner', () => {
  const online = signal(true);
  const pendingCount = signal(0);
  const rejected = signal<PendingOp[]>([]);
  const syncing = signal(false);
  const flush = jest.fn(async () => ({ sent: 0, rejected: 0, stopped: null }));
  let state: OfflineState;

  function render() {
    const fixture = TestBed.createComponent(OfflineBanner);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    online.set(true);
    pendingCount.set(0);
    rejected.set([]);
    syncing.set(false);
    flush.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: NetworkStatus, useValue: { online } },
        { provide: PendingQueue, useValue: { pendingCount, rejected } },
        { provide: SyncEngine, useValue: { flush, syncing } },
      ],
    });
    state = TestBed.inject(OfflineState);
  });

  it('fica oculto com conexão, dados atuais e nada pendente', () => {
    const { el } = render();

    expect(el.querySelector('[data-testid="offline-banner"]')).toBeNull();
  });

  it('sem conexão avisa e mostra a data e a hora da última sincronização dos dados exibidos', () => {
    online.set(false);
    state.markStale(new Date(2026, 10, 9, 20, 5));
    const { el } = render();

    const text = el.querySelector('[data-testid="offline-banner"]')?.textContent ?? '';
    expect(text).toContain('Sem conexão');
    expect(text).toContain('09/11/2026');
    expect(text).toContain('20:05');
  });

  it('com operações pendentes informa quantas e que painel, faturas e fluxo de caixa ainda não as incluem', () => {
    pendingCount.set(2);
    const { el } = render();

    const text = el.querySelector('[data-testid="offline-banner"]')?.textContent ?? '';
    expect(text).toContain('2 operações pendentes de envio');
    expect(text).toContain('Painel, faturas e fluxo de caixa ainda não incluem');
    expect(el.querySelector('a[href="/pendencias"]')).not.toBeNull();
  });

  it('no singular fala em uma operação', () => {
    pendingCount.set(1);
    const { el } = render();

    expect(el.textContent).toContain('1 operação pendente de envio');
  });

  it('Sincronizar agora envia a fila e fica desligado sem conexão', () => {
    pendingCount.set(1);
    const { fixture, el } = render();
    const button = () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Sincronizar agora') as HTMLButtonElement;

    button().click();
    expect(flush).toHaveBeenCalledTimes(1);

    online.set(false);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
  });

  it('operações recusadas aparecem com atalho para resolvê-las', () => {
    rejected.set([{ id: 'x', kind: 'PAY', path: '/transactions/1/pay', body: null, createdAt: 1, state: 'REJECTED', label: 'Pagar', error: 'Já pago.' }]);
    const { el } = render();

    expect(el.querySelector('[data-testid="offline-banner"]')?.textContent).toContain('1 operação recusada');
    expect(el.querySelector('a[href="/pendencias"]')).not.toBeNull();
  });

  describe('versão compacta (tela de novo lançamento, fora da casca)', () => {
    function renderCompact() {
      const fixture = TestBed.createComponent(OfflineBanner);
      fixture.componentRef.setInput('compact', true);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('com conexão fica oculta, mesmo com pendências e dados antigos', () => {
      pendingCount.set(2);
      state.markStale(new Date(2026, 10, 9, 20, 5));

      expect(renderCompact().querySelector('[data-testid="offline-banner"]')).toBeNull();
    });

    it('sem conexão mostra uma só linha dizendo que o lançamento fica salvo no aparelho e será enviado, sem botões', () => {
      online.set(false);
      pendingCount.set(2);

      const banner = renderCompact().querySelector('[data-testid="offline-banner"]') as HTMLElement;

      expect(banner.getAttribute('role')).toBe('status');
      expect(banner.textContent).toContain('Sem conexão');
      expect(banner.textContent).toContain('salvo no aparelho');
      expect(banner.textContent).toContain('enviado quando houver conexão');
      expect(banner.textContent).not.toContain('pendente');
      expect(banner.querySelector('button, a')).toBeNull();
    });
  });
});
