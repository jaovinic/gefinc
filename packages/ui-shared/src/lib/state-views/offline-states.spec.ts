jest.mock('chart.js', () => {
  class Chart {
    static register = jest.fn();
    destroy = jest.fn();
    update = jest.fn();
  }
  return { Chart, DoughnutController: {}, ArcElement: {}, BarController: {}, BarElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {} };
});

import { HttpTestingController } from '@angular/common/http/testing';
import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { currentMonth } from '@gefinc/utils';
import { ACCOUNTS, API, CATEGORIES, configureHttpTesting } from '../../testing/testbed';
import { AccountsPage } from '../accounts/accounts-page';
import { DATA_FRESHNESS } from '../api/data-freshness';
import { CategoriesPage } from '../categories/categories-page';
import { DashboardPage } from '../dashboard/dashboard-page';
import { CashflowPage } from '../invoices/cashflow-page';
import { InvoicesPage } from '../invoices/invoices-page';
import { TransactionsPage } from '../transactions/transactions-page';

const month = currentMonth();
const OFFLINE = Symbol('offline');
const SYNCED = new Date(2026, 10, 3, 14, 30);

class NeverVisible {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

const emptyDashboard = {
  month, totalMonth: '0.00', totalToDue: '0.00', totalPaid: '0.00', overdueTotal: '0.00', totalIncome: '0.00', totalReceived: '0.00',
  byCategory: [], byCard: [],
};
const emptyBalances = { asOf: '2026-11-03', total: '0.00', accounts: [], unlinkedCardPayments: '0.00' };
const emptyInvoice = { accountId: 2, month, dueDate: `${month}-17`, total: '0.00', paidIndividually: '0.00', paidByInvoicePayments: '0.00', remaining: '0.00', items: [], payments: [] };

type Replies = Record<string, unknown>;

/** Responde tudo o que a tela pediu (e o que ela pede em seguida) até não restar nada; o que não tem resposta cai como "sem conexão". */
async function answer<T>(fixture: ComponentFixture<T>, http: HttpTestingController, replies: Replies) {
  for (let round = 0; round < 6; round++) {
    const open = http.match(() => true);
    if (open.length === 0) {
      break;
    }
    for (const request of open) {
      const path = request.request.url.slice(API.length);
      const reply = replies[path];
      if (reply === undefined || reply === OFFLINE) {
        request.error(new ProgressEvent('error'), { status: 0 });
      } else {
        request.flush(reply);
      }
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

describe('telas sem conexão e dados da última sincronização', () => {
  const freshness = signal<Date | null>(null);
  const realObserver = globalThis.IntersectionObserver;
  beforeAll(() => ((globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NeverVisible));
  afterAll(() => ((globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realObserver));

  async function open<T>(component: Type<T>, replies: Replies, stale: Date | null = null) {
    freshness.set(stale);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: DATA_FRESHNESS, useValue: freshness }] });
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    await answer(fixture, ctx.http, replies);
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const pages: { name: string; component: Type<unknown>; empty: Replies; emptyText: [string, string]; staleText: string }[] = [
    {
      name: 'Painel',
      component: DashboardPage,
      empty: { '/dashboard': emptyDashboard, '/balances': emptyBalances, '/accounts': [], '/categories': [] },
      emptyText: ['Sem lançamentos neste mês', 'Sem lançamentos na última sincronização (03/11 14:30)'],
      staleText: 'Sem lançamentos na última sincronização (03/11 14:30)',
    },
    {
      name: 'Lançamentos',
      component: TransactionsPage,
      empty: { '/transactions': { content: [], page: 0, size: 25, totalElements: 0 }, '/accounts': [], '/categories': [] },
      emptyText: ['Nenhum lançamento neste mês', 'Nenhum lançamento na última sincronização (03/11 14:30)'],
      staleText: 'Nenhum lançamento na última sincronização (03/11 14:30)',
    },
    {
      name: 'Faturas',
      component: InvoicesPage,
      empty: {
        '/accounts': ACCOUNTS, '/categories': CATEGORIES, [`/accounts/2/invoices/${month}`]: emptyInvoice,
        '/invoices/projection': { months: [month], cards: [] },
      },
      emptyText: ['Fatura sem lançamentos', 'Fatura sem lançamentos na última sincronização (03/11 14:30)'],
      staleText: 'Fatura sem lançamentos na última sincronização (03/11 14:30)',
    },
    {
      name: 'Contas',
      component: AccountsPage,
      empty: { '/accounts': [], '/balances': emptyBalances, '/categories': [] },
      emptyText: ['Nenhuma conta cadastrada', 'Nenhuma conta na última sincronização (03/11 14:30)'],
      staleText: 'Nenhuma conta na última sincronização (03/11 14:30)',
    },
    {
      name: 'Categorias',
      component: CategoriesPage,
      empty: { '/categories': [], '/accounts': [] },
      emptyText: ['Nenhuma categoria', 'Nenhuma categoria na última sincronização (03/11 14:30)'],
      staleText: 'Nenhuma categoria na última sincronização (03/11 14:30)',
    },
  ];

  for (const page of pages) {
    describe(page.name, () => {
      it('sem rede e sem dados salvos mostra o aviso de falta de conexão com "Tentar novamente", nunca o estado vazio', async () => {
        const { el } = await open(page.component, {});
        const view = el.querySelector('gef-error[data-variant="offline"], gef-error [data-variant="offline"]');
        expect(view).not.toBeNull();
        expect(view?.textContent).toContain('Sem conexão');
        expect(view?.textContent).toContain('Tentar novamente');
        expect(view?.querySelector('svg')).not.toBeNull();
        expect(el.textContent).not.toMatch(/Sem lançamentos|Nenhum lançamento|Nenhuma conta|Nenhuma categoria|Fatura sem lançamentos/);
      });

      it('com dados do servidor e nada para mostrar, o vazio fica como era', async () => {
        const { el } = await open(page.component, page.empty);
        expect(el.textContent).toContain(page.emptyText[0]);
        expect(el.textContent).not.toContain('última sincronização');
        expect(el.querySelector('[data-variant="offline"]')).toBeNull();
      });

      it('com dados vindos da cópia local e nada para mostrar, diz que está vazio na última sincronização (com data e hora)', async () => {
        const { el } = await open(page.component, page.empty, SYNCED);
        expect(el.textContent).toContain(page.staleText);
        expect(el.textContent).not.toMatch(new RegExp(`${page.emptyText[0].replace(/[()]/g, '\\$&')}(?! na última)`));
      });
    });
  }

  describe('Faturas sem cartão na cópia local', () => {
    it('não afirma que não há cartão cadastrado: diz que não havia na última sincronização', async () => {
      const { el } = await open(InvoicesPage, { '/accounts': [ACCOUNTS[0]], '/categories': CATEGORIES }, SYNCED);
      expect(el.textContent).toContain('Nenhum cartão na última sincronização (03/11 14:30)');
      expect(el.textContent).not.toContain('Nenhum cartão cadastrado');
    });
  });

  describe('Fluxo de caixa', () => {
    it('sem rede e sem dados salvos mostra o aviso de falta de conexão com "Tentar novamente"', async () => {
      const { el } = await open(CashflowPage, {});
      const view = el.querySelector('gef-error [data-variant="offline"]');
      expect(view?.textContent).toContain('Sem conexão');
      expect(view?.textContent).toContain('Tentar novamente');
    });
  });

  describe('erro do servidor (5xx) continua com o aviso de erro comum, sem o de falta de conexão', () => {
    const SERVER_ERROR = { status: 500, statusText: 'Server Error' };

    /** Abre a tela, responde com 500 ao que ela pede primeiro e confere o aviso de erro (nunca o de "Sem conexão"). */
    async function expectServerError(component: Type<unknown>, failing: string, others: Replies = {}) {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const ctx = configureHttpTesting();
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      for (let round = 0; round < 6; round++) {
        const open = ctx.http.match(() => true);
        if (open.length === 0) {
          break;
        }
        for (const request of open) {
          const path = request.request.url.slice(API.length);
          if (path === failing || path.startsWith(`${failing}?`)) {
            request.flush({}, SERVER_ERROR);
          } else if (path in others) {
            request.flush(others[path]);
          } else {
            request.error(new ProgressEvent('error'), { status: 0 });
          }
        }
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      }
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-variant="error"]')?.textContent).toContain('erro inesperado');
      expect(el.querySelector('[data-variant="offline"]')).toBeNull();
      expect(el.textContent).not.toContain('Sem conexão');
    }

    it('Fluxo de caixa', () => expectServerError(CashflowPage, '/cashflow'));
    it('Painel', () => expectServerError(DashboardPage, '/dashboard', { '/balances': emptyBalances, '/accounts': [], '/categories': [] }));
    it('Lançamentos', () => expectServerError(TransactionsPage, '/transactions', { '/accounts': [], '/categories': [] }));
    it('Contas', () => expectServerError(AccountsPage, '/accounts', { '/balances': emptyBalances, '/categories': [] }));
    it('Categorias', () => expectServerError(CategoriesPage, '/categories', { '/accounts': [] }));
    it('Faturas, quando as contas dão erro do servidor', () => expectServerError(InvoicesPage, '/accounts', { '/categories': CATEGORIES }));
    it('Faturas, quando a fatura do cartão dá erro do servidor', () =>
      expectServerError(InvoicesPage, `/accounts/2/invoices/${month}`, { '/accounts': ACCOUNTS, '/categories': CATEGORIES }));
  });

  describe('Faturas: o aviso de contas segue o tipo do erro', () => {
    it('sem rede e sem dados salvos nas contas mostra o aviso de falta de conexão', async () => {
      const { el } = await open(InvoicesPage, { '/categories': CATEGORIES });
      expect(el.querySelector('[data-variant="offline"]')?.textContent).toContain('Sem conexão');
    });

    it('"Tentar novamente" recarrega as contas e, com resposta, mostra os cartões', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const ctx = configureHttpTesting();
      const fixture = TestBed.createComponent(InvoicesPage);
      fixture.detectChanges();
      ctx.http.expectOne((r) => r.url === `${API}/accounts`).flush({}, { status: 503, statusText: 'Unavailable' });
      ctx.http.match(() => true).forEach((r) => r.error(new ProgressEvent('error'), { status: 0 }));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-variant="error"]')).not.toBeNull();

      (el.querySelector('[data-variant="error"] button') as HTMLButtonElement).click();
      ctx.http.expectOne((r) => r.url === `${API}/accounts`).flush(ACCOUNTS);
      ctx.http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);
      fixture.detectChanges();

      expect(el.querySelector('[data-variant="error"]')).toBeNull();
      expect(el.querySelector('[data-variant="offline"]')).toBeNull();
      ctx.http.match(() => true).forEach((r) => r.error(new ProgressEvent('error'), { status: 0 }));
    });
  });
});
