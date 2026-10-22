import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Dashboard } from '@gefinc/core-models';
import {
  CardBars,
  CategoryDonut,
  ChartSlice,
  DashboardApi,
  EmptyView,
  ErrorView,
  LoadingView,
  MonthPicker,
  messageFor,
  toProblem,
} from '@gefinc/ui-shared';
import { currentMonth, formatBRL } from '@gefinc/utils';

const CARD_COLORS = ['#00b4d8', '#7c3aed', '#00e599', '#f59e0b', '#f43f5e'];

/** Painel do mês por data de vencimento: indicadores, gastos por categoria e distribuição por cartão (FR-029, FR-030). */
@Component({
  selector: 'gef-dashboard-page',
  imports: [CardBars, CategoryDonut, EmptyView, ErrorView, LoadingView, MonthPicker, RouterLink],
  template: `
    <section class="space-y-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Painel do mês</h1>
        <gef-month-picker [(value)]="month" />
      </header>

      @if (loading()) {
        <gef-loading message="Carregando o painel…" />
      } @else if (error()) {
        <gef-error [message]="error()!" (retry)="load()" />
      } @else if (data(); as d) {
        @if (isEmpty(d)) {
          <gef-empty title="Sem lançamentos neste mês" hint="Cadastre uma despesa para ver os indicadores e os gráficos.">
            <a class="gef-btn-secondary inline-block" routerLink="/transactions">Ir para lançamentos</a>
          </gef-empty>
        } @else {
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4" data-indicator="total-month">
              <p class="text-caption text-gefinc-muted">Total do mês</p>
              <p class="financial-value text-display-1 font-extrabold">{{ money(d.totalMonth) }}</p>
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4" data-indicator="to-due">
              <p class="text-caption text-gefinc-muted">A vencer</p>
              <p class="financial-value text-display-1 font-extrabold text-gefinc-warning">{{ money(d.totalToDue) }}</p>
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4" data-indicator="paid">
              <p class="text-caption text-gefinc-muted">Pago</p>
              <p class="financial-value text-display-1 font-extrabold text-gefinc-primary">{{ money(d.totalPaid) }}</p>
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4" data-indicator="overdue">
              <p class="text-caption text-gefinc-muted">Atrasado</p>
              <p class="financial-value text-display-1 font-extrabold" [class.text-gefinc-danger]="d.overdueTotal !== '0.00'">{{ money(d.overdueTotal) }}</p>
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
              <h2 class="mb-3 text-title-md font-semibold">Gastos por categoria</h2>
              @if (categorySlices().length > 0) {
                <gef-category-donut [slices]="categorySlices()" />
              }
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
              <h2 class="mb-3 text-title-md font-semibold">Distribuição por cartão</h2>
              @if (cardSlices().length > 0) {
                <gef-card-bars [slices]="cardSlices()" />
              } @else {
                <p class="text-body-base text-gefinc-muted">Nenhum gasto em cartão neste mês.</p>
              }
            </div>
          </div>
        }
      }
    </section>
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);

  protected readonly month = signal(currentMonth());
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly categorySlices = computed<ChartSlice[]>(() =>
    (this.data()?.byCategory ?? []).map((c) => ({ label: c.name, value: c.amount, color: c.colorHex })),
  );
  protected readonly cardSlices = computed<ChartSlice[]>(() =>
    (this.data()?.byCard ?? []).map((c, i) => ({ label: c.name, value: c.amount, color: CARD_COLORS[i % CARD_COLORS.length] })),
  );

  constructor() {
    effect(() => {
      this.month();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.dashboard(this.month()).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(messageFor(toProblem(e)));
        this.loading.set(false);
      },
    });
  }

  protected isEmpty(d: Dashboard): boolean {
    return d.totalMonth === '0.00' && d.totalPaid === '0.00' && d.byCategory.length === 0;
  }

  protected money(value: string): string {
    return formatBRL(value);
  }
}
