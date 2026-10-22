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
  byCategory: [
    { categoryId: 10, name: 'Alimentação', colorHex: '#F97316', amount: '240.50' },
    { categoryId: 11, name: 'Lazer', colorHex: '#EC4899', amount: '40.00' },
  ],
  byCard: [{ accountId: 2, name: 'Nubank', amount: '100.00' }],
};

describe('DashboardPage', () => {
  async function setup(body: object) {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    const request = ctx.http.expectOne((r) => r.url === `${API}/dashboard`);
    expect(request.request.params.get('month')).toBe(month);
    request.flush(body);
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

  it('mostra os gráficos por categoria e por cartão com a legenda', async () => {
    const { el } = await setup(full);
    expect(el.textContent).toContain('Gastos por categoria');
    expect(el.querySelector('[aria-label="Legenda do gráfico por categoria"]')?.textContent).toContain('Alimentação');
    expect(el.querySelector('[aria-label="Legenda do gráfico por cartão"]')?.textContent).toContain('Nubank');
  });

  it('mês sem dados mostra o estado vazio com orientação', async () => {
    const { el } = await setup({ ...full, totalMonth: '0.00', totalPaid: '0.00', totalToDue: '0.00', overdueTotal: '0.00', byCategory: [], byCard: [] });
    expect(el.textContent).toContain('Sem lançamentos neste mês');
    expect(el.querySelector('a[href="/transactions"]')).not.toBeNull();
    expect(el.querySelector('[data-indicator]')).toBeNull();
  });

  it('sem gasto em cartão avisa em vez de mostrar o gráfico de cartões', async () => {
    const { el } = await setup({ ...full, byCard: [] });
    expect(el.textContent).toContain('Nenhum gasto em cartão neste mês.');
  });

  it('erro mostra a mensagem com nova tentativa', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/dashboard`).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
  });

  it('o atalho do estado vazio usa o caminho de lançamentos configurado pelo app', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: APP_PATHS, useValue: { transactions: '/lancamentos' } }] });
    const { el } = await setup({ ...full, totalMonth: '0.00', totalPaid: '0.00', totalToDue: '0.00', overdueTotal: '0.00', byCategory: [], byCard: [] });
    expect(el.querySelector('a[href="/lancamentos"]')).not.toBeNull();
  });

  it('os indicadores ficam em duas colunas no celular e os valores cabem na tela', async () => {
    const { el } = await setup(full);
    const grid = el.querySelector('[data-indicator]')?.parentElement as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
    for (const id of ['total-month', 'to-due', 'paid', 'overdue']) {
      expect(el.querySelector(`[data-indicator="${id}"] .financial-value`)?.className).toContain('text-title-lg');
    }
  });

  it('recarrega o painel quando os dados mudam por fora da tela', async () => {
    const { http, fixture } = await setup(full);
    TestBed.inject(NoticeService).dataChanged();
    fixture.detectChanges();
    await fixture.whenStable();

    http.expectOne((r) => r.url === `${API}/dashboard`).flush(full);
  });
});
