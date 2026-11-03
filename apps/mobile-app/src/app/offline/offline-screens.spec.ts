jest.mock('chart.js', () => {
  class Chart {
    static register = jest.fn();
    destroy = jest.fn();
    update = jest.fn();
  }
  return { Chart, DoughnutController: {}, ArcElement: {}, BarController: {}, BarElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {} };
});

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, DashboardPage, MemoryTokenStore, TokenStore, authInterceptor } from '@gefinc/ui-shared';
import { TransactionsPage } from '@gefinc/ui-shared/pages';
import { currentMonth } from '@gefinc/utils';
import { CACHE_BACKEND, CACHE_KEY_STORAGE, CacheStore, MemoryCacheBackend } from './cache-store';
import { NetworkStatus } from './network-status';
import { offlineInterceptor } from './offline.interceptor';
import { DATA_FRESHNESS_PROVIDER } from './offline.providers';
import { PendingQueue } from './pending-queue';
import { UserScope } from './user-scope';

const API = 'http://api.test/api/v1';
const month = currentMonth();
const SYNCED = new Date(2026, 10, 3, 14, 30);

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

class NeverVisible {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

const emptyMonth = {
  month, totalMonth: '0.00', totalToDue: '0.00', totalPaid: '0.00', overdueTotal: '0.00', totalIncome: '0.00', totalReceived: '0.00',
  byCategory: [], byCard: [],
};
const busyMonth = { ...emptyMonth, totalMonth: '240.50', totalToDue: '240.50', byCategory: [{ categoryId: 10, name: 'Alimentação', colorHex: '#F97316', amount: '240.50' }] };
const noBalances = { asOf: '2026-11-03', total: '0.00', accounts: [], unlinkedCardPayments: '0.00' };
const emptyList = { content: [], page: 0, size: 25, totalElements: 0 };

/**
 * Telas de leitura com o interceptor offline REAL e a cópia local REAL (cifrada, em memória): reproduz o que o
 * usuário viu no painel sem conexão e garante que o estado vazio nunca aparece como se fosse dado atual.
 */
describe('telas de leitura sem conexão (interceptor real + cópia local real)', () => {
  const online = signal(false);
  const realObserver = globalThis.IntersectionObserver;
  beforeAll(() => ((globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NeverVisible));
  afterAll(() => ((globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realObserver));

  /** Abre a tela com a cópia local já preenchida (gravada em `SYNCED`) e a conexão no estado pedido. */
  async function open<T>(component: Type<T>, seed: Record<string, unknown>, connected = false) {
    online.set(connected);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, offlineInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: TokenStore, useClass: MemoryTokenStore },
        { provide: CACHE_BACKEND, useValue: new MemoryCacheBackend() },
        { provide: CACHE_KEY_STORAGE, useValue: new MemoryKeyStorage() },
        { provide: UserScope, useValue: { id: () => '7' } },
        { provide: NetworkStatus, useValue: { online } },
        { provide: PendingQueue, useValue: { ops: signal([]) } },
        DATA_FRESHNESS_PROVIDER,
      ],
    });
    const cache = TestBed.inject(CacheStore);
    const now = jest.spyOn(Date, 'now').mockReturnValue(SYNCED.getTime());
    for (const [url, body] of Object.entries(seed)) {
      await cache.put(`${API}${url}`, body);
    }
    now.mockRestore();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    if (connected) {
      // conectado, mas o servidor não responde: todo pedido cai como erro de rede
      for (const request of http.match(() => true)) {
        request.error(new ProgressEvent('error'), { status: 0 });
      }
    }
    // A leitura da cópia (descriptografia assíncrona) não é rastreada pelo whenStable: espera, com teto, a tela sair do carregamento.
    const limit = Date.now() + 3000;
    do {
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
      fixture.detectChanges();
    } while (/Carregando/.test((fixture.nativeElement as HTMLElement).textContent ?? '') && Date.now() < limit);
    return { fixture, el: fixture.nativeElement as HTMLElement, http };
  }
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const reference = { '/accounts?includeInactive=true': [], '/categories': [] };
  const dashboardSeed = (month_: unknown) => ({ [`/dashboard?month=${month}`]: month_, '/balances': noBalances, ...reference });

  describe('Painel', () => {
    it('sem cópia local e sem rede: aviso de falta de conexão com "Tentar novamente", nunca "Sem lançamentos" nem "ação"', async () => {
      const { el } = await open(DashboardPage, {});
      const view = el.querySelector('gef-error [data-variant="offline"]');

      expect(view?.textContent).toContain('Sem conexão');
      expect(view?.textContent).toContain('Sem conexão e sem dados salvos desta tela');
      expect(view?.textContent).toContain('Tentar novamente');
      expect(el.textContent).not.toContain('Sem lançamentos');
      expect(el.textContent).not.toContain('Esta ação');
    });

    it('REPRODUÇÃO: cópia guardada com o mês vazio e sem rede: não afirma "neste mês", diz que estava vazio na última sincronização', async () => {
      const { el } = await open(DashboardPage, dashboardSeed(emptyMonth));

      expect(el.textContent).toContain('Sem lançamentos na última sincronização (03/11 14:30)');
      expect(el.textContent).not.toContain('Sem lançamentos neste mês');
      expect(el.querySelector('[data-variant="offline"]')).toBeNull();
    });

    it('cópia com dados e sem rede: mostra os valores da cópia', async () => {
      const { el } = await open(DashboardPage, dashboardSeed(busyMonth));

      expect(el.querySelector('[data-indicator="total-month"]')?.textContent).toContain('R$ 240,50');
      expect(el.textContent).not.toContain('Sem lançamentos');
    });

    it('conectado mas sem servidor (rede cai com erro) e cópia vazia: o mesmo aviso de última sincronização', async () => {
      const { el } = await open(DashboardPage, dashboardSeed(emptyMonth), true);

      expect(el.textContent).toContain('Sem lançamentos na última sincronização (03/11 14:30)');
    });

    it('conectado mas sem servidor e sem cópia: aviso de falta de conexão', async () => {
      const { el } = await open(DashboardPage, {}, true);

      expect(el.querySelector('gef-error [data-variant="offline"]')?.textContent).toContain('Tentar novamente');
      expect(el.textContent).not.toContain('Sem lançamentos');
    });
  });

  describe('Lançamentos', () => {
    const list = (body: unknown) => ({ [`/transactions?month=${month}&page=0&size=25`]: body, ...reference });

    it('sem cópia local e sem rede: aviso de falta de conexão, nunca "Nenhum lançamento"', async () => {
      const { el } = await open(TransactionsPage, {});

      expect(el.querySelector('gef-error [data-variant="offline"]')?.textContent).toContain('Sem conexão');
      expect(el.textContent).not.toContain('Nenhum lançamento');
    });

    it('cópia da lista vazia e sem rede: "Nenhum lançamento na última sincronização"', async () => {
      const { el } = await open(TransactionsPage, list(emptyList));

      expect(el.textContent).toContain('Nenhum lançamento na última sincronização (03/11 14:30)');
      expect(el.textContent).not.toContain('Nenhum lançamento neste mês');
    });
  });
});
