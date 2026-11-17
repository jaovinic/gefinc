import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@gefinc/ui-shared';
import { AdminApi } from '../admin.api';

/**
 * Alerta permanente exibido na casca do painel administrativo (`admin-layout.ts`) quando há comunicações
 * de e-mail com falha que viraram pendências (US10 / US11).
 *
 * Fornece acesso direto à fila de reenvio/descarte em `/admin/communications/pending`.
 */
@Component({
  selector: 'gef-pending-alert',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (currentCount() > 0) {
      <aside
        role="alert"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gefinc-warning/50 bg-gefinc-warning/10 px-4 py-3 text-body-base text-gefinc-warning"
        data-testid="pending-communications-alert"
      >
        <div class="flex items-center gap-2">
          <gef-icon name="alert" [size]="20" />
          <span data-testid="pending-alert-message">
            Existem <strong>{{ currentCount() }}</strong>
            {{ currentCount() === 1 ? 'comunicação' : 'comunicações' }} com envio pendente de e-mail.
          </span>
        </div>
        <a
          routerLink="/admin/communications/pending"
          class="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
          data-testid="pending-alert-link"
        >
          Ver pendências
          <gef-icon name="chevron-right" [size]="14" />
        </a>
      </aside>
    }
  `,
})
export class PendingAlert implements OnInit {
  private readonly api = inject(AdminApi);

  /** Permite injetar a contagem diretamente em testes ou componentes pais. */
  readonly count = input<number | null>(null);

  protected readonly serverCount = signal(0);

  protected get currentCount(): () => number {
    return () => {
      const explicit = this.count();
      return explicit !== null && explicit !== undefined ? explicit : this.serverCount();
    };
  }

  ngOnInit(): void {
    if (this.count() === null || this.count() === undefined) {
      this.refresh();
    }
  }

  refresh(): void {
    this.api.getAlerts().subscribe({
      next: (alerts) => this.serverCount.set(alerts.pendingCommunications),
      error: () => {
        // Silencioso em caso de erro transitório de rede.
      },
    });
  }
}
