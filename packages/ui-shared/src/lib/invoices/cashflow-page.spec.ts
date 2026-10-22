import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API, configureHttpTesting } from '../../testing/testbed';
import { Viewport } from '../viewport/viewport';
import { CashflowPage } from './cashflow-page';

describe('CashflowPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra receitas, despesas e saldo residual, destacando o saldo negativo', async () => {
    const { http } = configureHttpTesting();
    const fixture = TestBed.createComponent(CashflowPage);
    fixture.detectChanges();
    const request = http.expectOne((r) => r.url === `${API}/cashflow`);
    expect(request.request.params.get('months')).toBe('12');
    request.flush([
      { month: '2026-11', expectedIncome: '5000.00', expectedExpense: '1200.00', residual: '3800.00' },
      { month: '2026-12', expectedIncome: '0.00', expectedExpense: '9000.00', residual: '-9000.00' },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('R$ 3.800,00');
    expect(el.textContent).toContain('-R$ 9.000,00');
    const negatives = el.querySelectorAll('[data-negative="true"]');
    expect(negatives).toHaveLength(1);
    expect(negatives[0].className).toContain('text-gefinc-danger');
  });

  it('erro ao carregar mostra nova tentativa', async () => {
    const { http } = configureHttpTesting();
    const fixture = TestBed.createComponent(CashflowPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/cashflow`).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
  });

  it('no celular mostra um cartão por mês, sem tabela, destacando o saldo negativo', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: Viewport, useValue: { compact: signal(true) } }] });
    const { http } = configureHttpTesting();
    const fixture = TestBed.createComponent(CashflowPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/cashflow`).flush([
      { month: '2026-11', expectedIncome: '5000.00', expectedExpense: '1200.00', residual: '3800.00' },
      { month: '2026-12', expectedIncome: '0.00', expectedExpense: '9000.00', residual: '-9000.00' },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('table')).toBeNull();
    const cards = el.querySelectorAll('[data-testid="cashflow-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('2026-11');
    expect(cards[0].textContent).toContain('Receitas previstas');
    expect(cards[0].textContent).toContain('R$ 5.000,00');
    expect(cards[0].textContent).toContain('Despesas previstas');
    expect(cards[0].textContent).toContain('R$ 3.800,00');
    const negatives = el.querySelectorAll('[data-negative="true"]');
    expect(negatives).toHaveLength(1);
    expect(negatives[0].className).toContain('text-gefinc-danger');
    expect(negatives[0].textContent).toContain('-R$ 9.000,00');
  });
});
