jest.mock('chart.js', () => {
  class Chart {
    static register = jest.fn();
    destroy = jest.fn();
    update = jest.fn();
  }
  return { Chart, DoughnutController: {}, ArcElement: {}, BarController: {}, BarElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {} };
});
jest.mock('@capacitor/app', () => ({ App: { addListener: jest.fn(async () => ({ remove: jest.fn() })) } }));

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, DashboardPage, SessionService } from '@gefinc/ui-shared';
import { AccountsPage, CashflowPage, CategoriesPage, InvoicesPage, TransactionsPage, TransfersPage } from '@gefinc/ui-shared/pages';
import { currentMonth } from '@gefinc/utils';
import { AppLockService } from '../lock/app-lock.service';
import { NetworkStatus } from './network-status';
import { OfflineWarmup } from './offline-warmup';
import { UserScope } from './user-scope';

const API = 'http://api.test/api/v1';
const month = currentMonth();

class NeverVisible {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

const accounts = [
  { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 },
  { id: 2, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, holderType: 'PF', icon: 'card', bankAccountId: 1, active: true, version: 0 },
];
const invoice = { accountId: 2, month, dueDate: `${month}-17`, total: '0.00', paidIndividually: '0.00', paidByInvoicePayments: '0.00', remaining: '0.00', items: [], payments: [] };

function replyFor(path: string): unknown {
  if (path.startsWith('/accounts?')) return accounts;
  if (path.startsWith('/accounts/')) return invoice;
  if (path.startsWith('/dashboard')) {
    return { month, totalMonth: '0.00', totalToDue: '0.00', totalPaid: '0.00', overdueTotal: '0.00', totalIncome: '0.00', totalReceived: '0.00', byCategory: [], byCard: [] };
  }
  if (path.startsWith('/balances')) return { asOf: `${month}-01`, total: '0.00', accounts: [], unlinkedCardPayments: '0.00' };
  if (path.startsWith('/transfers')) return { content: [], page: 0, size: 25, totalElements: 0 };
  if (path.startsWith('/transactions')) return { content: [], page: 0, size: 25, totalElements: 0 };
  if (path.startsWith('/invoices/projection')) return { months: [month], cards: [] };
  return [];
}

/** A chave da cópia local é a URL completa (parâmetros em ordem alfabética): é com ela que a tela e o aquecimento têm de coincidir. */
function cacheKey(url: string): string {
  const parsed = new URL(url, 'http://local');
  parsed.searchParams.sort();
  return `${parsed.pathname}${parsed.search}`;
}

async function collect<T>(fixture: ComponentFixture<T>, http: HttpTestingController): Promise<string[]> {
  const urls: string[] = [];
  for (let round = 0; round < 6; round++) {
    const open = http.match(() => true);
    if (open.length === 0) {
      break;
    }
    for (const request of open) {
      urls.push(cacheKey(request.request.urlWithParams));
      request.flush(replyFor(request.request.urlWithParams.slice(API.length).split('?')[0] + (request.request.urlWithParams.includes('?') ? '?' : '')));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return urls;
}

describe('aquecimento x telas: as URLs que a tela pede ao abrir são as que o aquecimento busca', () => {
  const realObserver = globalThis.IntersectionObserver;
  beforeAll(() => ((globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NeverVisible));
  afterAll(() => ((globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realObserver));

  async function screenUrls(component: Type<unknown>): Promise<string[]> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    const urls = await collect(fixture, http);
    http.verify();
    return urls;
  }

  async function warmedUrls(): Promise<Set<string>> {
    jest.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
        { provide: SessionService, useValue: { authenticated: signal(true) } },
        { provide: NetworkStatus, useValue: { online: signal(true) } },
        { provide: AppLockService, useValue: { locked: signal(false) } },
        { provide: UserScope, useValue: { id: () => '7' } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(OfflineWarmup);
    TestBed.tick();
    await jest.advanceTimersByTimeAsync(1_000);
    const urls = new Set<string>();
    for (let guard = 0; guard < 40; guard++) {
      const open = http.match(() => true);
      if (open.length === 0) break;
      for (const request of open) {
        urls.add(cacheKey(request.request.urlWithParams));
        request.flush(replyFor(request.request.urlWithParams.slice(API.length)));
      }
      await jest.advanceTimersByTimeAsync(0);
    }
    jest.useRealTimers();
    return urls;
  }

  const screens: [string, Type<unknown>][] = [
    ['Painel', DashboardPage],
    ['Lançamentos', TransactionsPage],
    ['Faturas', InvoicesPage],
    ['Fluxo de caixa', CashflowPage],
    ['Contas', AccountsPage],
    ['Categorias', CategoriesPage],
    ['Transferências', TransfersPage],
  ];

  it.each(screens)('%s: todas as leituras da tela já estão no aquecimento', async (_name, component) => {
    const warmed = await warmedUrls();
    const asked = await screenUrls(component);

    expect(asked.length).toBeGreaterThan(0);
    for (const url of asked) {
      expect(warmed).toContain(url);
    }
  });
});
