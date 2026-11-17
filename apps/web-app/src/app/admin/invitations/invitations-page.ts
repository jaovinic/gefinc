import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmptyView, ErrorView, Icon, LoadingView, NoticeService, Select, isOfflineProblem, messageFor, toProblem, type SelectOption } from '@gefinc/ui-shared';
import { AdminApi, type AdminInvitationView } from '../admin.api';
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
  imports: [EmptyView, ErrorView, FormsModule, Icon, LoadingView, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" aria-labelledby="invitations-heading">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h2 id="invitations-heading" class="text-title-md font-bold">Convites</h2>
        <button
          type="button"
          class="gef-btn-primary inline-flex items-center gap-2"
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
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base">
            <caption class="sr-only">Convites de cadastro</caption>
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th scope="col" class="px-4 py-3">E-mail</th>
                <th scope="col" class="px-4 py-3">Situação</th>
                <th scope="col" class="px-4 py-3">Convidado por</th>
                <th scope="col" class="px-4 py-3">Criado em</th>
                <th scope="col" class="px-4 py-3">Expira em</th>
                <th scope="col" class="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (inv of invitations(); track inv.id) {
                <tr class="border-t border-gefinc-border" data-testid="invitation-row">
                  <td class="px-4 py-3 font-medium" data-testid="inv-email">
                    {{ inv.email || '—' }}
                  </td>
                  <td class="px-4 py-3" data-testid="inv-status">
                    <span
                      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold"
                      [class]="statusBadge(inv.status).tone"
                    >
                      <gef-icon [name]="statusBadge(inv.status).icon" [size]="14" />
                      {{ statusBadge(inv.status).label }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-caption text-gefinc-muted" data-testid="inv-author">
                    {{ inv.invitedBy?.label || '—' }}
                  </td>
                  <td class="px-4 py-3 text-caption text-gefinc-muted" data-testid="inv-created">
                    {{ formatDate(inv.createdAt) }}
                  </td>
                  <td class="px-4 py-3 text-caption text-gefinc-muted" data-testid="inv-expires">
                    {{ formatDate(inv.expiresAt) }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    @if (inv.status === 'PENDING') {
                      <div class="inline-flex items-center gap-2">
                        <button
                          type="button"
                          class="gef-btn-secondary text-caption py-1 px-2.5 inline-flex items-center gap-1"
                          data-testid="resend-btn"
                          [disabled]="actionBusy() === inv.id"
                          (click)="resend(inv.id)"
                        >
                          <gef-icon name="mail" [size]="14" />
                          Reenviar
                        </button>
                        <button
                          type="button"
                          class="text-caption text-gefinc-danger hover:underline inline-flex items-center gap-1"
                          data-testid="cancel-btn"
                          [disabled]="actionBusy() === inv.id"
                          (click)="cancel(inv.id)"
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

    <!-- Modal Novo Convite -->
    @if (modalOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="invite-modal">
        <div class="gef-card w-full max-w-md space-y-4 p-6" role="dialog" aria-modal="true" aria-labelledby="invite-title">
          <h3 id="invite-title" class="text-title-md font-semibold">Convidar usuário</h3>
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

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="gef-btn-secondary"
              (click)="closeInviteModal()"
              [disabled]="modalBusy()"
              data-testid="invite-cancel-btn"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="gef-btn-primary"
              (click)="submitInvite()"
              [disabled]="modalBusy() || !inviteEmail().trim()"
              data-testid="invite-submit-btn"
            >
              {{ modalBusy() ? 'Enviando…' : 'Enviar convite' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class InvitationsPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly selectedStatus = signal<string>('');

  protected readonly invitations = signal<AdminInvitationView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly offline = signal(false);

  protected readonly actionBusy = signal<number | null>(null);

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
    this.selectedStatus.set(status);
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

  cancel(id: number): void {
    if (this.actionBusy() !== null) return;
    this.actionBusy.set(id);

    this.api.cancelInvitation(id).subscribe({
      next: () => {
        this.actionBusy.set(null);
        this.notices.toast('Convite cancelado com sucesso.');
        this.load();
      },
      error: (err: unknown) => {
        this.actionBusy.set(null);
        this.notices.toast(messageFor(toProblem(err)));
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
        return { label: 'Pendente', tone: 'border-amber-500/40 text-amber-500 bg-amber-500/10', icon: 'ticket' };
      case 'ACCEPTED':
        return { label: 'Aceito', tone: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10', icon: 'check' };
      case 'CANCELED':
        return { label: 'Cancelado', tone: 'border-gefinc-border text-gefinc-muted', icon: 'undo' };
      case 'EXPIRED':
        return { label: 'Expirado', tone: 'border-rose-500/40 text-rose-500 bg-rose-500/10', icon: 'alert' };
      default:
        return { label: status, tone: 'border-gefinc-border text-gefinc-muted', icon: 'ticket' };
    }
  }
}
