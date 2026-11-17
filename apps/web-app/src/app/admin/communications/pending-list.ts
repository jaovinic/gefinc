import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ErrorView, Icon, LoadingView, NoticeService, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import { AdminApi, type PendingCommunication } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';

/**
 * Tela de fila de comunicações de e-mail pendentes de entrega (US10 / US11).
 * Permite que o administrador veja os avisos que falharam, tente reenviá-los
 * ou os descarte permanentemente (com registro na trilha de auditoria).
 */
@Component({
  selector: 'gef-admin-pending-list',
  imports: [ErrorView, Icon, LoadingView, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" data-testid="pending-communications-page">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-title-md font-bold">Comunicações pendentes</h2>
          <p class="text-body-base text-gefinc-muted">
            Avisos de e-mail que não puderam ser entregues. Tente reenviar ou descarte o registro.
          </p>
        </div>
        <button
          type="button"
          class="gef-btn-secondary inline-flex items-center gap-1.5"
          data-testid="refresh-btn"
          (click)="load()"
          [disabled]="loading()"
        >
          <gef-icon name="undo" [size]="16" />
          Atualizar
        </button>
      </div>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando comunicações pendentes…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (items().length === 0) {
        <div class="gef-card p-8 text-center" data-testid="pending-empty">
          <p class="text-title-sm font-semibold text-gefinc-text">Nenhuma comunicação pendente</p>
          <p class="mt-1 text-caption text-gefinc-muted">Todos os avisos foram entregues ou descartados.</p>
        </div>
      } @else {
        <div class="gef-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-body-base">
              <thead class="border-b border-gefinc-border bg-gefinc-surface text-caption font-semibold text-gefinc-muted">
                <tr>
                  <th class="p-3">Destinatário</th>
                  <th class="p-3">Tipo</th>
                  <th class="p-3">Falha</th>
                  <th class="p-3 text-center">Tentativas</th>
                  <th class="p-3">Criada em</th>
                  <th class="p-3">Retenção até</th>
                  <th class="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gefinc-border">
                @for (item of items(); track item.id) {
                  <tr data-testid="pending-row">
                    <td class="p-3 font-medium" data-testid="pending-target">{{ item.targetLabel }}</td>
                    <td class="p-3 text-caption" data-testid="pending-kind">{{ kindLabel(item.kind) }}</td>
                    <td class="p-3 text-caption text-gefinc-danger" data-testid="pending-failure">
                      {{ item.failureReason || 'Falha de entrega no servidor SMTP' }}
                    </td>
                    <td class="p-3 text-center text-caption" data-testid="pending-attempts">{{ item.attempts }}</td>
                    <td class="p-3 text-caption text-gefinc-muted" data-testid="pending-created">
                      {{ formatDate(item.createdAt) }}
                    </td>
                    <td class="p-3 text-caption text-gefinc-muted" data-testid="pending-retained">
                      {{ item.retainedUntil ? formatDate(item.retainedUntil) : 'Indeterminada' }}
                    </td>
                    <td class="p-3 text-right">
                      <div class="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          class="gef-btn-secondary text-caption py-1 px-2.5 inline-flex items-center gap-1"
                          data-testid="resend-btn"
                          [disabled]="actionBusyId() === item.id"
                          (click)="resend(item)"
                        >
                          <gef-icon name="mail" [size]="14" />
                          Reenviar
                        </button>
                        <button
                          type="button"
                          class="gef-btn-danger text-caption py-1 px-2.5 inline-flex items-center gap-1"
                          data-testid="discard-btn"
                          [disabled]="actionBusyId() === item.id"
                          (click)="discard(item)"
                        >
                          <gef-icon name="trash" [size]="14" />
                          Descartar
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
})
export class PendingList implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  protected readonly items = signal<readonly PendingCommunication[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly actionBusyId = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.listPendingCommunications().subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loading.set(false);
        this.loadOffline.set(isOfflineProblem(problem));
        this.loadError.set(messageFor(problem));
      },
    });
  }

  resend(item: PendingCommunication): void {
    if (this.actionBusyId() !== null) return;
    this.actionBusyId.set(item.id);

    this.api.resendPendingCommunication(item.id).subscribe({
      next: (result) => {
        this.actionBusyId.set(null);
        if (result.state === 'DELIVERED') {
          this.notices.toast('Comunicação entregue com sucesso.');
          this.items.set(this.items().filter((i) => i.id !== item.id));
        } else {
          this.notices.toast('A nova tentativa falhou. A comunicação segue pendente.');
          this.load();
        }
      },
      error: (error: unknown) => {
        this.actionBusyId.set(null);
        this.notices.toast(messageFor(toProblem(error)));
      },
    });
  }

  discard(item: PendingCommunication): void {
    if (this.actionBusyId() !== null) return;
    this.actionBusyId.set(item.id);

    this.api.discardPendingCommunication(item.id).subscribe({
      next: () => {
        this.actionBusyId.set(null);
        this.notices.toast('Comunicação descartada com sucesso.');
        this.items.set(this.items().filter((i) => i.id !== item.id));
      },
      error: (error: unknown) => {
        this.actionBusyId.set(null);
        this.notices.toast(messageFor(toProblem(error)));
      },
    });
  }

  protected kindLabel(kind: string): string {
    switch (kind) {
      case 'ACCOUNT_DELETION':
      case 'DELETION_NOTICE':
        return 'Aviso de exclusão';
      case 'DELETION_CANCELED':
        return 'Aviso de cancelamento';
      default:
        return kind;
    }
  }

  protected formatDate(iso: string): string {
    return formatAdminDateTime(iso);
  }
}
