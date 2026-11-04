import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { scheduleInstallments } from '@gefinc/utils';
import { InstallmentSummaryCard, type SummaryInstallment } from './installment-summary-card';

@Component({
  imports: [InstallmentSummaryCard],
  template: `<gef-installment-summary-card [total]="total()" [count]="count()" [schedule]="schedule()" today="2026-11-05" />`,
})
class Host {
  total = signal<string | null>('1000.00');
  count = signal(10);
  schedule = signal<SummaryInstallment[]>([]);
}

const plan = (total: string, count: number, purchaseDate = '2026-11-05') =>
  scheduleInstallments({ closingDay: 10, dueDay: 17, purchaseDate, total, count });

describe('InstallmentSummaryCard', () => {
  function render(total: string | null, count: number, schedule: SummaryInstallment[] = []) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.total.set(total);
    fixture.componentInstance.count.set(count);
    fixture.componentInstance.schedule.set(schedule);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = (testid: string) => el.querySelector(`[data-testid="${testid}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    return { fixture, el, text };
  }

  it('sem resto: "10× de R$ 100,00", total e a frase exata de antes', () => {
    const { el, text } = render('1000.00', 10, plan('1000.00', 10));

    expect(el.querySelector('h3')?.textContent).toContain('Resumo do parcelamento');
    expect(text('installment-hero')).toBe('10× de R$ 100,00');
    expect(el.textContent).toContain('R$ 1.000,00');
    expect(text('installment-summary')).toBe('10 × R$ 100,00 = R$ 1.000,00');
    expect(el.querySelector('[data-testid="installment-last"]')).toBeNull();
  });

  it('com resto: 9 parcelas iguais e a última maior, nas duas formas de texto', () => {
    const { text } = render('333.31', 10, plan('333.31', 10));

    expect(text('installment-hero')).toBe('9× de R$ 33,33');
    expect(text('installment-last')).toBe('+ 1× de R$ 33,34 (última parcela)');
    expect(text('installment-summary')).toBe('9 × R$ 33,33 + 1 × R$ 33,34');
  });

  it('mostra o 1º vencimento com a fatura, a prévia e "Ver todas" só com mais de duas parcelas', () => {
    const { el, text } = render('1000.00', 10, plan('1000.00', 10));

    expect(text('installment-first')).toBe('1ª parcela vence em 17/11/2026 · fatura nov/2026');
    const preview = el.querySelector('[data-testid="installment-preview"]') as HTMLElement;
    expect(preview.className).toContain('border-gefinc-border');
    expect(preview.textContent).toContain('1/10 · fatura de nov/2026 · vence 17/11 · R$ 100,00');
    expect(preview.textContent).toContain('10/10 · fatura de ago/2027 · vence 17/08 · R$ 100,00');
    expect(preview.querySelector('details summary')?.textContent).toContain('Ver todas as parcelas');
    expect(preview.querySelector('details summary')?.textContent).toContain('(10)');
    expect(preview.querySelector('details')?.classList.contains('group')).toBe(true);
    expect(preview.querySelector('details summary gef-icon')?.getAttribute('name')).toBe('chevron-down');
    expect(preview.querySelectorAll('details li')).toHaveLength(8);
  });

  it('com duas parcelas não há "Ver todas"', () => {
    const { el } = render('200.00', 2, plan('200.00', 2));
    expect(el.querySelector('details')).toBeNull();
    expect(el.querySelector('[data-testid="installment-preview"]')?.textContent).toContain('2/2');
  });

  it('avisa das parcelas que já nascem vencidas', () => {
    expect(render('300.00', 3, plan('300.00', 3)).el.querySelector('[data-testid="installment-overdue"]')).toBeNull();

    const { el } = render('300.00', 3, plan('300.00', 3, '2020-01-05'));
    expect(el.querySelector('[data-testid="installment-overdue"]')?.textContent).toContain('já nascem vencidas');
  });

  it('abaixo de R$ 0,01 por parcela mostra só o erro, anunciado, sem resumo nem prévia', () => {
    const { el, text } = render('0.05', 10, []);

    expect(text('installment-error')).toBe('O valor deve ter pelo menos R$ 0,01 por parcela.');
    expect(el.querySelector('[data-testid="installment-error"]')?.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('[data-testid="installment-summary"]')).toBeNull();
    expect(el.querySelector('[data-testid="installment-preview"]')).toBeNull();
  });

  it('sem agenda (cartão sem fechamento) mostra o resumo, sem 1º vencimento nem "undefined"', () => {
    const { el, text } = render('1000.00', 10, []);

    expect(text('installment-hero')).toBe('10× de R$ 100,00');
    expect(el.querySelector('[data-testid="installment-first"]')).toBeNull();
    expect(el.querySelector('[data-testid="installment-preview"]')).toBeNull();
    expect(el.textContent).not.toContain('undefined');
  });

  it('sem total, com total zerado ou com uma só parcela não mostra nada', () => {
    expect(render(null, 10).el.querySelector('section')).toBeNull();
    expect(render('0.00', 10).el.querySelector('section')).toBeNull();
    expect(render('100.00', 1).el.querySelector('section')).toBeNull();
  });
});
