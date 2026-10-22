import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { RouterLink } from '@angular/router';
import type { Dashboard } from '@gefinc/core-models';
import { DashboardApi, ErrorView, LoadingView, messageFor, toProblem } from '@gefinc/ui-shared';
import { currentMonth, formatBRL } from '@gefinc/utils';
import { LogoutAction } from '../core/logout';

/**
 * Tela inicial do app: resumo do mês e o botão "Nova despesa", ponto de partida do lançamento rápido
 * (FR-041). Recarrega o resumo sempre que a tela volta a aparecer.
 */
@Component({
  selector: 'gef-home-page',
  imports: [IonContent, ErrorView, LoadingView, RouterLink],
  template: `
    <ion-content>
      <header class="flex items-center justify-between border-b border-gefinc-border bg-gefinc-surface px-4 py-3">
        <span class="text-title-md font-extrabold tracking-wide text-gefinc-primary">GEFINC</span>
        <button type="button" class="gef-btn-secondary" (click)="logout.run()">Sair</button>
      </header>
      <section class="space-y-4 p-4 pb-28">
        <h1 class="text-title-lg font-bold">Resumo de {{ monthLabel() }}</h1>
        @if (loading()) {
          <gef-loading message="Carregando o resumo…" />
        } @else if (error()) {
          <gef-error [message]="error()!" (retry)="load()" />
        } @else if (summary(); as d) {
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-3" data-indicator="total-month">
              <p class="text-caption text-gefinc-muted">Total do mês</p>
              <p class="financial-value text-title-md font-extrabold">{{ money(d.totalMonth) }}</p>
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-3" data-indicator="to-due">
              <p class="text-caption text-gefinc-muted">A vencer</p>
              <p class="financial-value text-title-md font-extrabold text-gefinc-warning">{{ money(d.totalToDue) }}</p>
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-3" data-indicator="paid">
              <p class="text-caption text-gefinc-muted">Pago</p>
              <p class="financial-value text-title-md font-extrabold text-gefinc-primary">{{ money(d.totalPaid) }}</p>
            </div>
            <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-3" data-indicator="overdue">
              <p class="text-caption text-gefinc-muted">Atrasado</p>
              <p class="financial-value text-title-md font-extrabold" [class.text-gefinc-danger]="d.overdueTotal !== '0.00'">{{ money(d.overdueTotal) }}</p>
            </div>
          </div>
        }
      </section>
      <a
        routerLink="/quick-expense"
        class="fixed bottom-6 right-6 rounded-full bg-gefinc-primary px-6 py-4 text-body-base font-bold text-gefinc-bg shadow-lg"
        >+ Nova despesa</a
      >
    </ion-content>
  `,
})
export class HomePage implements OnInit {
  private readonly api = inject(DashboardApi);
  protected readonly logout = inject(LogoutAction);

  protected readonly summary = signal<Dashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly monthLabel = computed(() => {
    const [year, month] = currentMonth().split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  });

  ngOnInit(): void {
    this.load();
  }

  /** O Ionic mantém a tela em cache; ao voltar do lançamento rápido o resumo é recarregado. */
  ionViewWillEnter(): void {
    if (!this.loading()) {
      this.load();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.dashboard(currentMonth()).subscribe({
      next: (data) => {
        this.summary.set(data);
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
}
