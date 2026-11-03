import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Balances, Dashboard } from '@gefinc/core-models';
import { BalancesApi, DashboardApi, NoticeService, ReferenceData, messageFor, toProblem } from '../api';
import { BalancePanel } from '../balances/balance-panel';
import { CardBars } from '../charts/card-bars';
import { Icon } from '../icons/icon';
import { CategoryDonut } from '../charts/category-donut';
import { ChartSlice } from '../charts/chart-slice';
import { APP_PATHS } from '../layout/app-paths';
import { MonthPicker } from '../month-picker/month-picker';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';
import { currentMonth, formatBRL, fromCents, toCents } from '@gefinc/utils';

const CARD_COLORS = ['#00b4d8', '#7c3aed', '#00e599', '#f59e0b', '#f43f5e'];

/** Painel: saldo das contas (global, até hoje) e, por data de vencimento do mês, indicadores, gastos por categoria e distribuição por cartão (FR-029, FR-030). */
@Component({
  selector: 'gef-dashboard-page',
  imports: [BalancePanel, Icon, CardBars, CategoryDonut, EmptyView, ErrorView, LoadingView, MonthPicker, RouterLink],
  template: `
    <section class="space-y-6">
      <h1 class="text-title-lg font-bold">Painel do mês</h1>

      <gef-month-picker [(value)]="month" />

      @if (balancesLoading()) {
        <div role="status" aria-live="polite">
          <div class="gef-skeleton h-28" aria-hidden="true"></div>
          <span class="sr-only">Carregando o saldo…</span>
        </div>
      } @else if (balancesError()) {
        <div class="gef-alert-error flex flex-wrap items-center justify-between gap-3" role="alert" data-testid="balances-error">
          <span>{{ balancesError() }}</span>
          <button type="button" class="gef-btn-secondary" (click)="loadBalances()">Tentar novamente</button>
        </div>
      } @else if (balances(); as b) {
        <gef-balance-panel [data]="b" [accounts]="accounts()" />
      }

      <section class="space-y-3" aria-labelledby="month-heading">
        <h2 id="month-heading" class="text-title-md font-semibold">Neste mês</h2>
        @if (loading()) {
          <gef-loading variant="cards" message="Carregando o painel…" />
        } @else if (error()) {
          <gef-error [message]="error()!" (retry)="load()" />
        } @else if (data(); as d) {
          @if (isEmpty(d)) {
            <gef-empty icon="dashboard" title="Sem lançamentos neste mês" hint="Cadastre uma receita ou despesa para ver os indicadores e os gráficos.">
              <a class="gef-btn-secondary inline-block" [routerLink]="paths.transactions">Ir para lançamentos</a>
            </gef-empty>
          } @else {
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div class="gef-kpi gef-card p-3" data-indicator="to-due">
                <p class="flex items-center gap-1.5 text-caption text-gefinc-muted"><gef-icon name="clock" [size]="14" />A pagar</p>
                <p class="financial-value text-title-md font-extrabold text-gefinc-warning">{{ money(d.totalToDue) }}</p>
              </div>
              <div class="gef-kpi gef-card p-3" data-indicator="paid">
                <p class="flex items-center gap-1.5 text-caption text-gefinc-muted"><gef-icon name="check" [size]="14" />Pago</p>
                <p class="financial-value text-title-md font-extrabold text-gefinc-primary">{{ money(d.totalPaid) }}</p>
              </div>
              <div class="gef-kpi gef-card p-3" [class.border-gefinc-danger]="d.overdueTotal !== '0.00'" data-indicator="overdue">
                <p class="flex items-center gap-1.5 text-caption text-gefinc-muted"><gef-icon name="alert" [size]="14" />Atrasado</p>
                <p class="financial-value text-title-md font-extrabold" [class.text-gefinc-danger]="d.overdueTotal !== '0.00'">{{ money(d.overdueTotal) }}</p>
              </div>
              <div class="gef-kpi gef-card p-3" data-indicator="to-receive">
                <p class="flex items-center gap-1.5 text-caption text-gefinc-muted"><gef-icon name="arrow-up" [size]="14" />A receber</p>
                <p class="financial-value text-title-md font-extrabold">{{ money(toReceive(d)) }}</p>
              </div>
            </div>
            <p class="text-caption text-gefinc-muted" data-indicator="total-month">
              Total do mês <span class="financial-value font-semibold text-gefinc-text">{{ money(d.totalMonth) }}</span>
            </p>

              <div class="grid gap-6 lg:grid-cols-2">
                <div class="gef-card p-4">
                  <h2 class="mb-3 text-title-md font-semibold">Gastos por categoria</h2>
                  @if (categorySlices().length > 0) {
                    <gef-category-donut [slices]="categorySlices()" />
                  }
                </div>
                <div class="gef-card p-4">
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
    </section>
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly balancesApi = inject(BalancesApi);
  private readonly notices = inject(NoticeService);
  private readonly reference = inject(ReferenceData);
  protected readonly paths = inject(APP_PATHS);

  protected readonly month = signal(currentMonth());
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Saldo das contas: carga própria, para a falha dele não apagar o painel do mês (e vice-versa). */
  protected readonly balances = signal<Balances | null>(null);
  protected readonly balancesLoading = signal(true);
  protected readonly balancesError = signal<string | null>(null);
  protected readonly accounts = this.reference.accounts;

  protected readonly categorySlices = computed<ChartSlice[]>(() =>
    (this.data()?.byCategory ?? []).map((c) => ({ label: c.name, value: c.amount, color: c.colorHex })),
  );
  protected readonly cardSlices = computed<ChartSlice[]>(() =>
    (this.data()?.byCard ?? []).map((c, i) => ({
      label: c.name,
      value: c.amount,
      color: CARD_COLORS[i % CARD_COLORS.length],
      icon: this.reference.account(c.accountId)?.icon ?? 'card',
    })),
  );

  constructor() {
    this.reference.refresh();
    this.loadBalances();
    effect(() => {
      this.month();
      untracked(() => this.load());
    });
    // Operações pendentes enviadas (app móvel): recarrega o painel e o saldo com os valores atuais.
    effect(() => {
      if (this.notices.dataChangedCount() > 0) {
        untracked(() => {
          this.load();
          this.loadBalances();
        });
      }
    });
  }

  protected loadBalances(): void {
    this.balancesLoading.set(this.balances() === null);
    this.balancesError.set(null);
    this.balancesApi.get().subscribe({
      next: (balances) => {
        this.balances.set(balances);
        this.balancesLoading.set(false);
      },
      error: (e: unknown) => {
        this.balancesError.set(messageFor(toProblem(e)));
        this.balancesLoading.set(false);
      },
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
    return d.totalMonth === '0.00' && d.totalPaid === '0.00' && d.totalIncome === '0.00' && d.byCategory.length === 0;
  }

  /** Receitas do mês que ainda não foram recebidas. */
  protected toReceive(d: Dashboard): string {
    return fromCents(toCents(d.totalIncome) - toCents(d.totalReceived));
  }

  protected money(value: string): string {
    return formatBRL(value);
  }
}
