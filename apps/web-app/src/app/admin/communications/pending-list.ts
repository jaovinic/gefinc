import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { ConfirmDialog, EmptyView, ErrorView, Icon, LoadingView, NoticeService, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import { AdminApi, type PendingCommunication } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';

/**
 * Tela de fila de comunicações de e-mail pendentes de entrega (US10 / US11).
 * Permite que o administrador veja os avisos que falharam, tente reenviá-los
 * ou os descarte permanentemente (com registro na trilha de auditoria). Descartar não tem volta e deixa
 * o destinatário sem o aviso, por isso pede confirmação.
 */
@Component({
  selector: 'gef-admin-pending-list',
  imports: [ConfirmDialog, EmptyView, ErrorView, Icon, LoadingView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" data-testid="pending-communications-page">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-title-md font-bold" tabindex="-1" data-testid="pending-heading" #heading>Comunicações pendentes</h2>
          <p class="text-body-base text-gefinc-muted">
            Avisos de e-mail que não puderam ser entregues. Tente reenviar ou descarte o registro.
          </p>
        </div>
        <button
          type="button"
          class="gef-btn-secondary gef-btn-inline"
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
        <gef-empty
          data-testid="pending-empty"
          icon="mail"
          title="Nenhuma comunicação pendente"
          hint="Todos os avisos foram entregues ou descartados."
        />
      } @else {
        <div class="gef-table-wrap">
          <table class="gef-table">
            <caption class="sr-only">Comunicações de e-mail pendentes de entrega</caption>
            <thead>
              <tr>
                <th scope="col">Destinatário</th>
                <th scope="col">Tipo</th>
                <th scope="col">Falha</th>
                <th scope="col" class="text-center">Tentativas</th>
                <th scope="col">Criada em</th>
                <th scope="col">Retenção até</th>
                <th scope="col" class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr data-testid="pending-row">
                  <td class="font-medium" data-testid="pending-target">{{ item.targetLabel }}</td>
                  <td class="text-caption" data-testid="pending-kind">{{ kindLabel(item.kind) }}</td>
                  <td class="text-caption text-gefinc-danger" data-testid="pending-failure">
                    {{ item.failureReason || 'Falha de entrega no servidor SMTP' }}
                  </td>
                  <td class="text-center text-caption" data-testid="pending-attempts">{{ item.attempts }}</td>
                  <td class="text-caption text-gefinc-muted" data-testid="pending-created">
                    {{ formatDate(item.createdAt) }}
                  </td>
                  <td class="text-caption text-gefinc-muted" data-testid="pending-retained">
                    {{ item.retainedUntil ? formatDate(item.retainedUntil) : 'Indeterminada' }}
                  </td>
                  <td class="text-right">
                    <div class="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        class="gef-btn-sm gap-1.5"
                        data-testid="resend-btn"
                        [disabled]="actionBusyId() === item.id"
                        (click)="resend(item)"
                      >
                        <gef-icon name="mail" [size]="14" />
                        Reenviar
                      </button>
                      <button
                        type="button"
                        class="gef-btn-sm gef-btn-sm-danger gap-1.5"
                        data-testid="discard-btn"
                        [disabled]="actionBusyId() !== null"
                        (click)="askDiscard(item)"
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
      }
    </section>

    <gef-confirm-dialog
      data-testid="discard-dialog"
      [open]="discardTarget() !== null"
      heading="Descartar comunicação"
      confirmLabel="Descartar comunicação"
      confirmIcon="trash"
      busyLabel="Descartando…"
      cancelLabel="Voltar"
      tone="danger"
      [busy]="discardBusy()"
      [error]="discardError()"
      (confirmed)="discard()"
      (cancelled)="closeDiscard()"
    >
      <p>
        O aviso para <strong class="text-gefinc-text">{{ discardTarget()?.targetLabel }}</strong> não será enviado.
      </p>
      <p class="text-gefinc-muted">Esta ação não pode ser desfeita. O descarte fica registrado na auditoria.</p>
    </gef-confirm-dialog>
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
  protected readonly discardTarget = signal<PendingCommunication | null>(null);
  protected readonly discardBusy = signal(false);
  protected readonly discardError = signal<string | null>(null);

  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

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

  protected askDiscard(item: PendingCommunication): void {
    if (this.actionBusyId() !== null) return;
    this.discardError.set(null);
    this.discardTarget.set(item);
  }

  protected closeDiscard(): void {
    if (this.discardBusy()) return;
    this.discardTarget.set(null);
    this.discardError.set(null);
  }

  /** Confirmado no diálogo: descarta a comunicação; a falha aparece dentro do diálogo, que continua aberto. */
  protected discard(): void {
    const item = this.discardTarget();
    if (!item || this.discardBusy()) return;
    this.discardBusy.set(true);
    this.discardError.set(null);

    this.api.discardPendingCommunication(item.id).subscribe({
      next: () => {
        this.discardBusy.set(false);
        this.discardTarget.set(null);
        this.notices.toast('Comunicação descartada com sucesso.');
        this.items.set(this.items().filter((i) => i.id !== item.id));
        // a linha (e o botão que abriu o diálogo) sumiu: o foco vai para o título da lista
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (error: unknown) => {
        this.discardBusy.set(false);
        this.discardError.set(messageFor(toProblem(error)));
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
