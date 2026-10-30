jest.mock('chart.js', () => {
  class Chart {
    static register = jest.fn();
    data: unknown;
    constructor(_canvas: unknown, config: { data: unknown }) {
      this.data = config.data;
    }
    update = jest.fn();
    destroy = jest.fn();
  }
  return { Chart, DoughnutController: {}, ArcElement: {}, BarController: {}, BarElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {} };
});

import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NoticeService } from '../api';
import { APP_PATHS } from '../layout/app-paths';
import { provideRouter } from '@angular/router';
import { currentMonth } from '@gefinc/utils';
import { API, configureHttpTesting } from '../../testing/testbed';
import { DashboardPage } from './dashboard-page';

const month = currentMonth();
const full = {
  month, totalMonth: '380.50', totalToDue: '250.00', totalPaid: '40.00', overdueTotal: '90.50',
  totalIncome: '5000.00', totalReceived: '3000.00',
  byCategory: [
    { categoryId: 10, name: 'Alimentação', colorHex: '#F97316', amount: '240.50' },
    { categoryId: 11, name: 'Lazer', colorHex: '#EC4899', amount: '40.00' },
  ],
  byCard: [{ accountId: 2, name: 'Nubank', amount: '100.00' }],
};

const balances = {
  asOf: '2026-11-10',
  total: '1300.00',
  accounts: [
    { accountId: 1, name: 'Itaú', type: 'CHECKING', active: true, balance: '1500.00', openingBalance: '0.00' },
    { accountId: 3, name: 'Carteira', type: 'CASH', active: true, balance: '-200.00', openingBalance: '0.00' },
  ],
  unlinkedCardPayments: '0.00',
};
const emptyMonth = {
  ...full, totalMonth: '0.00', totalPaid: '0.00', totalToDue: '0.00', overdueTotal: '0.00', totalIncome: '0.00', totalReceived: '0.00', byCategory: [], byCard: [],
};

describe('DashboardPage', () => {
  async function setup(body: object, balancesBody: object = balances) {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    ctx.flushReference();
    const request = ctx.http.expectOne((r) => r.url === `${API}/dashboard`);
    expect(request.request.params.get('month')).toBe(month);
    request.flush(body);
    ctx.http.expectOne((r) => r.method === 'GET' && r.url === `${API}/balances`).flush(balancesBody);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra os quatro indicadores em reais', async () => {
    const { el } = await setup(full);
    const text = (id: string) => el.querySelector(`[data-indicator="${id}"]`)?.textContent ?? '';
    expect(text('total-month')).toContain('R$ 380,50');
    expect(text('to-due')).toContain('R$ 250,00');
    expect(text('paid')).toContain('R$ 40,00');
    expect(text('overdue')).toContain('R$ 90,50');
  });

  it('a legenda por cartão mostra o ícone do cartão', async () => {
    const { el } = await setup(full);
    const legend = el.querySelector('ul[aria-label="Legenda do gráfico por cartão"]')!;
    expect(legend.textContent).toContain('Nubank');
    expect(legend.querySelector('svg')).not.toBeNull();
  });

  it('mostra os gráficos por categoria e por cartão com a legenda', async () => {
    const { el } = await setup(full);
    expect(el.textContent).toContain('Gastos por categoria');
    expect(el.querySelector('[aria-label="Legenda do gráfico por categoria"]')?.textContent).toContain('Alimentação');
    expect(el.querySelector('[aria-label="Legenda do gráfico por cartão"]')?.textContent).toContain('Nubank');
  });

  it('não mostra mais o card "Saldo do mês" (o saldo vem das contas)', async () => {
    const { el } = await setup(full);
    expect(el.querySelector('[data-indicator="balance"]')).toBeNull();
    expect(el.textContent).not.toContain('Saldo do mês');
  });

  it('mostra o painel de saldo com o saldo geral e uma linha por conta', async () => {
    const { el } = await setup(full);
    const panel = el.querySelector('gef-balance-panel')!;
    expect(panel.querySelector('[data-indicator="balance-total"] .financial-value')?.textContent).toContain('R$ 1.300,00');
    expect(panel.querySelectorAll('[data-testid="account-balance"]')).toHaveLength(2);
    expect(panel.textContent).toContain('-R$ 200,00');
  });

  it('o seletor de mês vem antes do painel de saldo e do "Neste mês"', async () => {
    const { el } = await setup(full);
    const order = (selector: string) => Array.from(el.querySelectorAll('*')).indexOf(el.querySelector(selector)!);
    expect(el.querySelector('h1')?.textContent).toContain('Painel do mês');
    expect(order('h1')).toBeLessThan(order('gef-month-picker'));
    expect(order('gef-month-picker')).toBeLessThan(order('gef-balance-panel'));
    expect(order('gef-balance-panel')).toBeLessThan(order('#month-heading'));
    expect(el.querySelector('#month-heading')?.textContent).toContain('Neste mês');
  });

  it('A receber mostra o que falta entrar das receitas do mês, sempre visível', async () => {
    const { el } = await setup(full);
    expect(el.querySelector('[data-indicator="to-receive"]')?.textContent).toContain('R$ 2.000,00');
    expect(el.querySelector('[data-indicator="to-receive"]')?.textContent).toContain('A receber');
  });

  it('A receber fica zerado quando tudo já entrou', async () => {
    const { el } = await setup({ ...full, totalIncome: '100.00', totalReceived: '100.00' });
    expect(el.querySelector('[data-indicator="to-receive"] .financial-value')?.textContent).toContain('R$ 0,00');
  });

  it('o rótulo de A vencer passa a A pagar e o total do mês vira legenda pequena', async () => {
    const { el } = await setup(full);
    expect(el.querySelector('[data-indicator="to-due"]')?.textContent).toContain('A pagar');
    const legend = el.querySelector('[data-indicator="total-month"]')!;
    expect(legend.tagName).toBe('P');
    expect(legend.textContent).toContain('Total do mês');
  });

  it('falha no saldo mostra erro próprio e não apaga o painel do mês', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    ctx.flushReference();
    ctx.http.expectOne((r) => r.url === `${API}/dashboard`).flush(full);
    ctx.http.expectOne((r) => r.url === `${API}/balances`).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="balances-error"]')?.textContent).toContain('erro inesperado');
    expect(el.querySelector('gef-balance-panel')).toBeNull();
    expect(el.querySelector('[data-indicator="paid"]')?.textContent).toContain('R$ 40,00');

    (el.querySelector('[data-testid="balances-error"] button') as HTMLButtonElement).click();
    ctx.http.expectOne((r) => r.url === `${API}/balances`).flush(balances);
    fixture.detectChanges();
    expect(el.querySelector('gef-balance-panel')).not.toBeNull();
    expect(el.querySelector('[data-testid="balances-error"]')).toBeNull();
  });

  it('falha no painel do mês não apaga o saldo', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    ctx.flushReference();
    ctx.http.expectOne((r) => r.url === `${API}/dashboard`).flush({}, { status: 500, statusText: 'Server Error' });
    ctx.http.expectOne((r) => r.url === `${API}/balances`).flush(balances);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('gef-balance-panel')).not.toBeNull();
    expect(el.querySelector('gef-error')).not.toBeNull();
  });

  it('mês só com receita não é vazio', async () => {
    const { el } = await setup({ ...full, totalMonth: '0.00', totalPaid: '0.00', totalToDue: '0.00', overdueTotal: '0.00', byCategory: [], byCard: [] });
    expect(el.querySelector('[data-indicator="to-receive"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Sem lançamentos neste mês');
  });

  it('mês sem dados mostra o estado vazio com orientação', async () => {
    const { el } = await setup(emptyMonth);
    expect(el.textContent).toContain('Sem lançamentos neste mês');
    expect(el.querySelector('a[href="/transactions"]')).not.toBeNull();
    expect(el.querySelector('[data-indicator="to-due"]')).toBeNull();
    expect(el.querySelector('gef-balance-panel')).not.toBeNull();
  });

  it('sem gasto em cartão avisa em vez de mostrar o gráfico de cartões', async () => {
    const { el } = await setup({ ...full, byCard: [] });
    expect(el.textContent).toContain('Nenhum gasto em cartão neste mês.');
  });

  it('erro mostra a mensagem com nova tentativa', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    ctx.flushReference();
    ctx.http.expectOne((r) => r.url === `${API}/dashboard`).flush({}, { status: 500, statusText: 'Server Error' });
    ctx.http.expectOne((r) => r.url === `${API}/balances`).flush(balances);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
  });

  it('o atalho do estado vazio usa o caminho de lançamentos configurado pelo app', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: APP_PATHS, useValue: { transactions: '/lancamentos', accounts: '/contas' } }] });
    const { el } = await setup(emptyMonth);
    expect(el.querySelector('a[href="/lancamentos"]')).not.toBeNull();
  });

  it('o seletor de mês é o primeiro elemento, acima do saldo e do painel do mês', async () => {
    const { el } = await setup(full);
    const section = el.querySelector('section') as HTMLElement;
    const children = Array.from(section.children);
    expect(children[0].tagName).toBe('H1');
    expect(children[1].tagName.toLowerCase()).toBe('gef-month-picker');
    expect(children[2].tagName.toLowerCase()).toBe('gef-balance-panel');
    expect(children[3].querySelector('#month-heading')?.textContent).toContain('Neste mês');
    expect(el.textContent).not.toContain('Gerenciar contas');
  });

  it('os quatro indicadores ficam compactos: duas colunas no celular, quatro a partir de sm, valor em title-md', async () => {
    const { el } = await setup(full);
    const grid = el.querySelector('[data-indicator="to-due"]')?.parentElement as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('sm:grid-cols-4');
    expect(grid.className).toContain('gap-2');
    for (const id of ['to-due', 'paid', 'overdue', 'to-receive']) {
      const tile = el.querySelector(`[data-indicator="${id}"]`) as HTMLElement;
      expect(tile.className).toContain('p-3');
      expect(tile.className).toContain('gef-kpi');
      expect(tile.querySelector('.financial-value')?.className).toContain('text-title-md');
    }
  });

  it('recarrega o painel e o saldo quando os dados mudam por fora da tela', async () => {
    const { http, fixture, el } = await setup(full);
    TestBed.inject(NoticeService).dataChanged();
    fixture.detectChanges();
    await fixture.whenStable();

    http.expectOne((r) => r.url === `${API}/dashboard`).flush(full);
    http.expectOne((r) => r.url === `${API}/balances`).flush({ ...balances, total: '1400.00' });
    fixture.detectChanges();
    expect(el.querySelector('[data-indicator="balance-total"]')?.textContent).toContain('R$ 1.400,00');
  });

  it('trocar o mês recarrega só o painel do mês; o saldo é global', async () => {
    const { http, fixture } = await setup(full);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Mês anterior"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    http.expectOne((r) => r.url === `${API}/dashboard`).flush(full);
    http.expectNone((r) => r.url === `${API}/balances`);
  });
});
