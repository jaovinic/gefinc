import { Component, effect, signal, untracked, inject } from '@angular/core';
import type { CashflowMonth } from '@gefinc/core-models';
import { InvoicesApi, NoticeService, messageFor, toProblem } from '../api';
import { MonthPicker } from '../month-picker/month-picker';
import { ErrorView, LoadingView } from '../state-views/state-views';
import { Viewport } from '../viewport/viewport';
import { currentMonth, formatBRL } from '@gefinc/utils';

/** Saldo residual por mês: receitas previstas menos despesas previstas (FR-028). */
@Component({
  selector: 'gef-cashflow-page',
  imports: [ErrorView, LoadingView, MonthPicker],
  template: `
    <section class="space-y-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Fluxo de caixa</h1>
        <gef-month-picker [(value)]="from" />
      </header>
      @if (loading()) {
        <gef-loading message="Calculando saldo residual…" />
      } @else if (error()) {
        <gef-error [message]="error()!" (retry)="load()" />
      } @else if (viewport.compact()) {
        <ul class="space-y-3" aria-label="Saldo residual por mês">
          @for (row of rows(); track row.month) {
            <li data-testid="cashflow-card" class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
              <p class="font-semibold">{{ row.month }}</p>
              <dl class="mt-2 space-y-1 text-body-base">
                <div class="flex justify-between gap-3">
                  <dt class="text-gefinc-muted">Receitas previstas</dt>
                  <dd class="financial-value text-gefinc-primary">{{ money(row.expectedIncome) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-gefinc-muted">Despesas previstas</dt>
                  <dd class="financial-value">{{ money(row.expectedExpense) }}</dd>
                </div>
                <div class="flex justify-between gap-3 border-t border-gefinc-border pt-1">
                  <dt class="font-semibold">Saldo residual</dt>
                  <dd class="financial-value font-semibold" [class.text-gefinc-danger]="isNegative(row)" [attr.data-negative]="isNegative(row)">{{ money(row.residual) }}</dd>
                </div>
              </dl>
            </li>
          }
        </ul>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base" aria-label="Saldo residual por mês">
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th class="px-4 py-3">Mês</th>
                <th class="px-4 py-3 text-right">Receitas previstas</th>
                <th class="px-4 py-3 text-right">Despesas previstas</th>
                <th class="px-4 py-3 text-right">Saldo residual</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.month) {
                <tr class="border-t border-gefinc-border">
                  <td class="px-4 py-3 font-medium">{{ row.month }}</td>
                  <td class="financial-value px-4 py-3 text-right text-gefinc-primary">{{ money(row.expectedIncome) }}</td>
                  <td class="financial-value px-4 py-3 text-right">{{ money(row.expectedExpense) }}</td>
                  <td class="financial-value px-4 py-3 text-right font-semibold" [class.text-gefinc-danger]="isNegative(row)" [attr.data-negative]="isNegative(row)">
                    {{ money(row.residual) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class CashflowPage {
  private readonly api = inject(InvoicesApi);
  private readonly notices = inject(NoticeService);
  protected readonly viewport = inject(Viewport);

  protected readonly from = signal(currentMonth());
  protected readonly rows = signal<CashflowMonth[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.from();
      untracked(() => this.load());
    });
    effect(() => {
      if (this.notices.dataChangedCount() > 0) {
        untracked(() => this.load());
      }
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.cashflow(this.from(), 12).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(messageFor(toProblem(e)));
        this.loading.set(false);
      },
    });
  }

  protected money(value: string): string {
    return formatBRL(value);
  }

  protected isNegative(row: CashflowMonth): boolean {
    return row.residual.startsWith('-');
  }
}
