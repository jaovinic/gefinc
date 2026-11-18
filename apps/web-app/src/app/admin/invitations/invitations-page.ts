import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmDialog, EmptyView, ErrorView, Icon, LoadingView, NoticeService, Select, Sheet, isOfflineProblem, messageFor, toProblem, type SelectOption } from '@gefinc/ui-shared';
import { AdminApi, type AdminInvitationView, type InvitationStatus } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'Todas as situações' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'ACCEPTED', label: 'Aceitos' },
  { value: 'CANCELED', label: 'Cancelados' },
  { value: 'EXPIRED', label: 'Expirados' },
];

@Component({
  selector: 'gef-invitations-page',
  imports: [ConfirmDialog, EmptyView, ErrorView, FormsModule, Icon, LoadingView, Select, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" aria-labelledby="invitations-heading">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h2 id="invitations-heading" class="text-title-md font-bold" tabindex="-1" #heading>Convites</h2>
        <button
          type="button"
          class="gef-btn-primary gef-btn-inline"
          data-testid="invite-open-btn"
          (click)="openInviteModal()"
        >
          <gef-icon name="plus" [size]="16" />
          Convidar usuário
        </button>
      </div>

      <div class="max-w-xs">
        <gef-select
          label="Filtrar por situação"
          [options]="statusOptions"
          [ngModel]="selectedStatus()"
          (ngModelChange)="onStatusChange($event)"
        />
      </div>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando convites…" />
      } @else if (error()) {
        <gef-error [message]="error()!" [variant]="offline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (invitations().length === 0) {
        <gef-empty icon="ticket" title="Nenhum convite encontrado" hint="Crie um novo convite de cadastro ou mude o filtro de situação.">
          @if (selectedStatus()) {
            <button type="button" class="gef-btn-secondary" (click)="onStatusChange('')">Limpar filtro</button>
          }
        </gef-empty>
      } @else {
        <div class="gef-table-wrap">
          <table class="gef-table">
            <caption class="sr-only">Convites de cadastro</caption>
            <thead>
              <tr>
                <th scope="col">E-mail</th>
                <th scope="col">Situação</th>
                <th scope="col">Convidado por</th>
                <th scope="col">Criado em</th>
                <th scope="col">Expira em</th>
                <th scope="col" class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (inv of invitations(); track inv.id) {
                <tr data-testid="invitation-row">
                  <td class="font-medium" data-testid="inv-email">
                    {{ inv.email || '—' }}
                  </td>
                  <td data-testid="inv-status">
                    <span class="gef-badge" [class]="statusBadge(inv.status).tone">
                      <gef-icon [name]="statusBadge(inv.status).icon" [size]="14" />
                      {{ statusBadge(inv.status).label }}
                    </span>
                  </td>
                  <td class="text-caption text-gefinc-muted" data-testid="inv-author">
                    {{ inv.invitedBy.label || '—' }}
                  </td>
                  <td class="text-caption text-gefinc-muted" data-testid="inv-created">
                    {{ formatDate(inv.createdAt) }}
                  </td>
                  <td class="text-caption text-gefinc-muted" data-testid="inv-expires">
                    {{ formatDate(inv.expiresAt) }}
                  </td>
                  <td class="text-right">
                    @if (inv.status === 'PENDING') {
                      <div class="inline-flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          class="gef-btn-sm gap-1.5"
                          data-testid="resend-btn"
                          [disabled]="actionBusy() === inv.id"
                          (click)="resend(inv.id)"
                        >
                          <gef-icon name="mail" [size]="14" />
                          Reenviar
                        </button>
                        <button
                          type="button"
                          class="gef-btn-sm gef-btn-sm-danger"
                          data-testid="cancel-btn"
                          [disabled]="actionBusy() === inv.id"
                          (click)="askCancel(inv)"
                        >
                          Cancelar
                        </button>
                      </div>
                    } @else {
                      <span class="text-caption text-gefinc-muted">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <gef-sheet heading="Convidar usuário" [open]="modalOpen()" [dismissible]="!modalBusy()" initialFocus="#invite-email" (closed)="closeInviteModal()">
      @if (modalOpen()) {
        <div class="space-y-4" data-testid="invite-modal">
          <p class="text-caption text-gefinc-muted">
            Informe o e-mail da pessoa a ser convidada. Um e-mail com link de cadastro válido por 7 dias será enviado.
          </p>

          @if (modalError(); as err) {
            <p class="gef-alert-error" role="alert" data-testid="invite-error">{{ err }}</p>
          }

          <div>
            <label class="gef-label" for="invite-email">E-mail</label>
            <input
              id="invite-email"
              class="gef-input"
              type="email"
              autocomplete="off"
              [value]="inviteEmail()"
              (input)="onEmailInput($event)"
              placeholder="exemplo@dominio.com"
              data-testid="invite-email-input"
            />
          </div>

          <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="gef-btn-secondary gef-btn-inline"
              (click)="closeInviteModal()"
              [disabled]="modalBusy()"
              data-testid="invite-cancel-btn"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="gef-btn-primary gef-btn-inline"
              (click)="submitInvite()"
              [disabled]="modalBusy() || !inviteEmail().trim()"
              data-testid="invite-submit-btn"
            >
              {{ modalBusy() ? 'Enviando…' : 'Enviar convite' }}
            </button>
          </div>
        </div>
      }
    </gef-sheet>

    <gef-confirm-dialog
      data-testid="cancel-dialog"
      [open]="cancelTarget() !== null"
      heading="Cancelar convite"
      confirmLabel="Cancelar convite"
      busyLabel="Cancelando…"
      cancelLabel="Voltar"
      tone="danger"
      [busy]="cancelBusy()"
      [error]="cancelError()"
      (confirmed)="cancel()"
      (cancelled)="closeCancel()"
    >
      <p>
        O convite para <strong class="text-gefinc-text">{{ cancelTarget()?.email || 'este convite' }}</strong> será cancelado.
      </p>
      <p class="text-gefinc-muted">O link de cadastro já enviado deixa de funcionar. Esta ação não pode ser desfeita.</p>
    </gef-confirm-dialog>
  `,
})
export class InvitationsPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly selectedStatus = signal<InvitationStatus | ''>('');

  protected readonly invitations = signal<AdminInvitationView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly offline = signal(false);

  protected readonly actionBusy = signal<number | null>(null);
  protected readonly cancelTarget = signal<AdminInvitationView | null>(null);
  protected readonly cancelBusy = signal(false);
  protected readonly cancelError = signal<string | null>(null);

  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly modalOpen = signal(false);
  protected readonly inviteEmail = signal('');
  protected readonly modalBusy = signal(false);
  protected readonly modalError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listInvitations(this.selectedStatus() || undefined).subscribe({
      next: (list) => {
        this.invitations.set(list);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const prob = toProblem(err);
        this.loading.set(false);
        this.offline.set(isOfflineProblem(prob));
        this.error.set(messageFor(prob));
      },
    });
  }

  onStatusChange(status: string): void {
    this.selectedStatus.set(status as InvitationStatus | '');
    this.load();
  }

  openInviteModal(): void {
    this.inviteEmail.set('');
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  closeInviteModal(): void {
    if (!this.modalBusy()) {
      this.modalOpen.set(false);
      this.modalError.set(null);
    }
  }

  onEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.inviteEmail.set(input.value);
  }

  submitInvite(): void {
    const email = this.inviteEmail().trim();
    if (!email || this.modalBusy()) return;

    this.modalBusy.set(true);
    this.modalError.set(null);

    this.api.createInvitation(email).subscribe({
      next: () => {
        this.modalBusy.set(false);
        this.modalOpen.set(false);
        this.notices.toast('Convite enviado com sucesso.');
        this.load();
      },
      error: (err: unknown) => {
        const prob = toProblem(err);
        this.modalBusy.set(false);
        this.modalError.set(prob.fieldErrors['email'] ?? messageFor(prob));
      },
    });
  }

  resend(id: number): void {
    if (this.actionBusy() !== null) return;
    this.actionBusy.set(id);

    this.api.resendInvitation(id).subscribe({
      next: () => {
        this.actionBusy.set(null);
        this.notices.toast('Convite reenviado com sucesso.');
        this.load();
      },
      error: (err: unknown) => {
        this.actionBusy.set(null);
        this.notices.toast(messageFor(toProblem(err)));
      },
    });
  }

  askCancel(inv: AdminInvitationView): void {
    if (this.actionBusy() !== null) return;
    this.cancelError.set(null);
    this.cancelTarget.set(inv);
  }

  closeCancel(): void {
    if (this.cancelBusy()) return;
    this.cancelTarget.set(null);
    this.cancelError.set(null);
  }

  /** Confirmado no diálogo: cancela o convite; a falha aparece dentro do diálogo, que continua aberto. */
  cancel(): void {
    const inv = this.cancelTarget();
    if (!inv || this.cancelBusy()) return;
    this.cancelBusy.set(true);
    this.cancelError.set(null);

    this.api.cancelInvitation(inv.id).subscribe({
      next: () => {
        this.cancelBusy.set(false);
        this.cancelTarget.set(null);
        this.notices.toast('Convite cancelado com sucesso.');
        this.load();
        // a lista é recarregada (o botão que abriu o diálogo some): o foco vai para o título
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (err: unknown) => {
        this.cancelBusy.set(false);
        this.cancelError.set(messageFor(toProblem(err)));
      },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return formatAdminDateTime(iso);
  }

  statusBadge(status: string): { label: string; tone: string; icon: 'check' | 'alert' | 'ticket' | 'undo' } {
    switch (status) {
      case 'PENDING':
        return { label: 'Pendente', tone: 'border-gefinc-warning/40 bg-gefinc-warning/10 text-gefinc-warning', icon: 'ticket' };
      case 'ACCEPTED':
        return { label: 'Aceito', tone: 'border-gefinc-primary/40 bg-gefinc-primary/10 text-gefinc-primary', icon: 'check' };
      case 'CANCELED':
        return { label: 'Cancelado', tone: 'border-gefinc-border text-gefinc-muted', icon: 'undo' };
      case 'EXPIRED':
        return { label: 'Expirado', tone: 'border-gefinc-danger/40 bg-gefinc-danger/10 text-gefinc-danger', icon: 'alert' };
      default:
        return { label: status, tone: 'border-gefinc-border text-gefinc-muted', icon: 'ticket' };
    }
  }
}
