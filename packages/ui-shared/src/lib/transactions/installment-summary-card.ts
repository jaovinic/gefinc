import { Component, computed, input } from '@angular/core';
import { formatBRL, isoToBR, monthLabelBR } from '@gefinc/utils';
import { Icon } from '../icons/icon';
import { belowMinimumPerInstallment, installmentOverview, installmentSummary } from './installment-amount';

/** Parcela da agenda (a mesma forma de `scheduleInstallments`). */
export interface SummaryInstallment {
  number: number;
  dueDate: string;
  amount: string;
}

export const MIN_PER_INSTALLMENT_MESSAGE = 'O valor deve ter pelo menos R$ 0,01 por parcela.';

/**
 * Resumo do parcelamento: "N× de R$ X" em destaque, total, 1º vencimento com a fatura, lista das parcelas
 * ("Ver todas as parcelas" só com mais de duas), aviso de parcelas já vencidas e o erro de valor mínimo por
 * parcela. Todo valor vem de `installmentSummary`/`installmentOverview` e da agenda, nunca de ponto flutuante.
 */
@Component({
  selector: 'gef-installment-summary-card',
  host: { class: 'block' },
  imports: [Icon],
  template: `
    @if (belowMinimum()) {
      <section class="gef-card space-y-2 p-4" aria-labelledby="gef-summary-title" data-testid="installment-card">
        <h3 id="gef-summary-title" class="flex items-center gap-2 text-body-base font-bold">
          <gef-icon name="list" [size]="16" />Resumo do parcelamento
        </h3>
        <p class="gef-alert-error flex items-start gap-2" role="status" aria-live="polite" data-testid="installment-error">
          <gef-icon name="alert" [size]="16" class="mt-0.5 shrink-0" />{{ minimumMessage }}
        </p>
      </section>
    } @else if (overview(); as o) {
      <section class="gef-card space-y-3 p-4" aria-labelledby="gef-summary-title" data-testid="installment-card">
        <h3 id="gef-summary-title" class="flex items-center gap-2 text-body-base font-bold">
          <gef-icon name="list" [size]="16" />Resumo do parcelamento
        </h3>
        <div>
          <p class="financial-value text-title-lg font-extrabold" data-testid="installment-hero">
            @if (o.hasRemainder) {
              {{ o.count - 1 }}× de {{ money(o.first) }}
            } @else {
              {{ o.count }}× de {{ money(o.first) }}
            }
          </p>
          @if (o.hasRemainder) {
            <p class="financial-value text-body-base font-semibold" data-testid="installment-last">+ 1× de {{ money(o.last) }} (última parcela)</p>
          }
          <p class="financial-value mt-1 text-body-base text-gefinc-muted">Total <span class="font-semibold text-gefinc-text">{{ money(o.total) }}</span></p>
          <p class="financial-value text-caption text-gefinc-muted" aria-live="polite" data-testid="installment-summary">{{ exact() }}</p>
        </div>
        @if (rows().length > 0) {
          <p class="flex items-start gap-2 text-body-base" data-testid="installment-first">
            <gef-icon name="clock" [size]="16" class="mt-0.5 shrink-0 text-gefinc-secondary" />
            <span>1ª parcela vence em <strong class="financial-value">{{ firstDue() }}</strong> · fatura {{ firstInvoice() }}</span>
          </p>
          <div class="rounded-lg border border-gefinc-border p-3 text-caption text-gefinc-muted" data-testid="installment-preview">
            <ul class="space-y-1">
              <li class="financial-value">{{ rows()[0].text }}</li>
              @if (rows().length > 2) {
                <li>
                  <details class="group">
                    <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-gefinc-secondary [&::-webkit-details-marker]:hidden">
                      Ver todas as parcelas ({{ rows().length }})
                      <gef-icon name="chevron-down" [size]="16" class="transition-transform group-open:rotate-180" />
                    </summary>
                    <ul class="mt-1 space-y-1">
                      @for (row of middle(); track row.number) {
                        <li class="financial-value">{{ row.text }}</li>
                      }
                    </ul>
                  </details>
                </li>
              }
              <li class="financial-value">{{ rows()[rows().length - 1].text }}</li>
            </ul>
            @if (hasOverdue()) {
              <p class="mt-2 text-gefinc-warning" data-testid="installment-overdue">Há parcelas com vencimento no passado: elas já nascem vencidas.</p>
            }
          </div>
        }
      </section>
    }
  `,
})
export class InstallmentSummaryCard {
  /** Total efetivo da compra (já considerando o modo de digitação); `null` sem valor. */
  readonly total = input<string | null>(null);
  readonly count = input.required<number>();
  /** Agenda de parcelas; vazia quando o cartão não tem fechamento e vencimento. */
  readonly schedule = input<readonly SummaryInstallment[]>([]);
  /** Hoje (ISO), para avisar das parcelas já vencidas. */
  readonly today = input.required<string>();

  protected readonly minimumMessage = MIN_PER_INSTALLMENT_MESSAGE;

  protected readonly belowMinimum = computed(() => {
    const total = this.total();
    if (!total || !/[1-9]/.test(total) || !Number.isInteger(this.count()) || this.count() < 2) {
      return false;
    }
    try {
      return belowMinimumPerInstallment(total, this.count());
    } catch {
      return false;
    }
  });
  protected readonly overview = computed(() => {
    const total = this.total();
    return total && this.count() >= 2 ? installmentOverview(total, this.count()) : null;
  });
  /** Frase completa ("10 × R$ 100,00 = R$ 1.000,00"), a mesma de antes, com o resto explicado. */
  protected readonly exact = computed(() => {
    const total = this.total();
    return total ? installmentSummary(total, this.count()) : '';
  });
  protected readonly rows = computed(() =>
    this.schedule().map((item) => ({
      number: item.number,
      text: `${item.number}/${this.count()} · fatura de ${monthLabelBR(item.dueDate)} · vence ${isoToBR(item.dueDate).slice(0, 5)} · ${formatBRL(item.amount)}`,
    })),
  );
  protected readonly middle = computed(() => this.rows().slice(1, -1));
  protected readonly firstDue = computed(() => (this.schedule().length > 0 ? isoToBR(this.schedule()[0].dueDate) : ''));
  protected readonly firstInvoice = computed(() => (this.schedule().length > 0 ? monthLabelBR(this.schedule()[0].dueDate) : ''));
  protected readonly hasOverdue = computed(() => this.schedule().some((item) => item.dueDate < this.today()));

  protected money(value: string): string {
    return formatBRL(value);
  }
}
