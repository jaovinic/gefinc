import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmDialog, ErrorView, Icon, LoadingView, NoticeService, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import { AdminApi, type EditableParameter, type ReadOnlyParameter } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';

@Component({
  selector: 'gef-settings-page',
  imports: [ConfirmDialog, ErrorView, FormsModule, Icon, LoadingView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6" aria-labelledby="settings-heading">
      <h2 id="settings-heading" class="text-title-md font-bold">Parâmetros do sistema</h2>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando parâmetros…" />
      } @else if (error()) {
        <gef-error [message]="error()!" [variant]="offline() ? 'offline' : 'error'" (retry)="load()" />
      } @else {
        <!-- 1. Novos Cadastros -->
        <div class="space-y-4 rounded-xl border border-gefinc-border p-4" data-testid="signups-card">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-title-sm font-bold">Novos cadastros</h3>
              <p class="text-caption text-gefinc-muted">
                Controla se novos usuários podem se cadastrar por conta própria.
              </p>
            </div>
            <span
              data-testid="signups-status-badge"
              class="rounded-full px-2.5 py-0.5 text-caption font-semibold"
              [class.bg-emerald-500/10]="signupsOpen()"
              [class.text-emerald-500]="signupsOpen()"
              [class.bg-amber-500/10]="!signupsOpen()"
              [class.text-amber-500]="!signupsOpen()"
            >
              {{ signupsOpen() ? 'Cadastros abertos' : 'Cadastros fechados' }}
            </span>
          </div>

          @if (signupsParam(); as sp) {
            <p class="text-caption text-gefinc-muted">
              Última alteração: {{ formatDateTime(sp.updatedAt) }}
              @if (sp.updatedBy?.label; as author) {
                por <span class="font-medium text-gefinc-text">{{ author }}</span>
              }
            </p>
          }

          <div>
            <button
              type="button"
              class="gef-btn-secondary"
              data-testid="signups-toggle-btn"
              [disabled]="savingSignups()"
              (click)="toggleSignups()"
            >
              {{ signupsOpen() ? 'Fechar novos cadastros' : 'Abrir novos cadastros' }}
            </button>
          </div>
        </div>

        <!-- 2. Modo de Manutenção -->
        <div class="space-y-4 rounded-xl border border-gefinc-border p-4" data-testid="maintenance-card">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-title-sm font-bold">Modo de manutenção</h3>
              <p class="text-caption text-gefinc-muted">
                Em manutenção, usuários comuns são bloqueados com aviso amigável; administradores continuam operando.
              </p>
            </div>
            <span
              data-testid="maint-status-badge"
              class="rounded-full px-2.5 py-0.5 text-caption font-semibold"
              [class.bg-emerald-500/10]="!maintenanceEnabled()"
              [class.text-emerald-500]="!maintenanceEnabled()"
              [class.bg-amber-500/10]="maintenanceEnabled()"
              [class.text-amber-500]="maintenanceEnabled()"
            >
              {{ maintenanceEnabled() ? 'Em manutenção' : 'Operação normal' }}
            </span>
          </div>

          @if (maintenanceParam(); as mp) {
            <p class="text-caption text-gefinc-muted">
              Última alteração: {{ formatDateTime(mp.updatedAt) }}
              @if (mp.updatedBy?.label; as author) {
                por <span class="font-medium text-gefinc-text">{{ author }}</span>
              }
            </p>
          }

          <div class="space-y-2">
            <label class="gef-label" for="maint-message">Mensagem personalizada</label>
            <textarea
              id="maint-message"
              class="gef-input"
              rows="3"
              data-testid="maint-message-input"
              maxlength="280"
              placeholder="Ex: Estamos realizando melhorias no sistema. Previsão de retorno às 14h."
              [ngModel]="maintenanceMessage()"
              (ngModelChange)="maintenanceMessage.set($event)"
            ></textarea>
            <p class="text-right text-caption text-gefinc-muted" data-testid="maint-counter">
              {{ maintenanceMessage().length }}/280
            </p>
          </div>

          <div>
            <button
              type="button"
              class="gef-btn-secondary"
              data-testid="maint-toggle-btn"
              [disabled]="savingMaintenance()"
              (click)="toggleMaintenance()"
            >
              {{ maintenanceEnabled() ? 'Desativar modo de manutenção' : 'Ativar modo de manutenção' }}
            </button>
          </div>
        </div>

        <!-- 3. Parâmetros Somente Leitura -->
        <div class="space-y-4 rounded-xl border border-gefinc-border p-4" data-testid="readonly-parameters">
          <h3 class="text-title-sm font-bold">Parâmetros da implantação</h3>
          <p class="text-caption text-gefinc-muted">
            Configurados no ambiente do servidor; exibidos somente para consulta.
          </p>

          <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (p of readOnlyParams(); track p.key) {
              <div class="rounded-lg border border-gefinc-border/60 bg-gefinc-surface/40 p-3" [attr.data-testid]="'readonly-' + p.key">
                <div class="flex items-center justify-between gap-2">
                  <dt class="text-caption font-medium text-gefinc-muted">{{ p.label }}</dt>
                  <span class="rounded bg-gefinc-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gefinc-muted">
                    Somente leitura
                  </span>
                </div>
                <dd class="mt-1 font-semibold text-gefinc-text">{{ p.value }}</dd>
              </div>
            }
          </dl>
        </div>

        <!-- 4. Emergência: Revogação Global de Sessões -->
        <div class="space-y-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4" data-testid="emergency-card">
          <div class="flex items-start gap-3">
            <gef-icon name="alert" [size]="20" class="mt-0.5 shrink-0 text-red-500" />
            <div class="space-y-1">
              <h3 class="text-title-sm font-bold text-red-500">Encerramento global de sessões</h3>
              <p class="text-caption text-gefinc-muted">
                Em caso de incidente de segurança, encerra as sessões de todos os usuários do sistema.
                Sua sessão atual e todas as sessões de administradores raiz serão preservadas.
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              class="gef-btn-danger"
              data-testid="revoke-all-open-btn"
              (click)="openRevokeDialog()"
            >
              Encerrar todas as sessões
            </button>
          </div>
        </div>
      }
    </section>

    <!-- Diálogo de confirmação de encerramento global -->
    <gef-confirm-dialog
      data-testid="revoke-all-dialog"
      [open]="revokeDialogOpen()"
      heading="Encerrar todas as sessões do sistema"
      confirmLabel="Encerrar todas as sessões"
      confirmIcon="alert"
      busyLabel="Encerrando sessões…"
      [busy]="revokingSessions()"
      [error]="revokeError()"
      tone="danger"
      (confirmed)="confirmRevokeAll()"
      (cancelled)="closeRevokeDialog()"
    >
      <div class="space-y-3">
        <p class="text-body-sm text-gefinc-muted">
          Esta ação forçará o encerramento das sessões ativas de todos os usuários e administradores,
          exigindo novo login. Digite exatamente a palavra <strong class="text-gefinc-text">ENCERRAR</strong>
          e informe sua senha para confirmar.
        </p>

        <div>
          <label class="gef-label" for="confirm-word-input">Palavra de confirmação</label>
          <input
            id="confirm-word-input"
            class="gef-input"
            type="text"
            data-testid="confirm-word-input"
            placeholder="Digite ENCERRAR"
            autocomplete="off"
            [ngModel]="confirmWord()"
            (ngModelChange)="confirmWord.set($event)"
          />
        </div>

        <div>
          <label class="gef-label" for="admin-password-input">Sua senha de administrador</label>
          <input
            id="admin-password-input"
            class="gef-input"
            type="password"
            data-testid="admin-password-input"
            autocomplete="current-password"
            [ngModel]="adminPassword()"
            (ngModelChange)="adminPassword.set($event)"
          />
        </div>
      </div>
    </gef-confirm-dialog>
  `,
})
export class SettingsPage implements OnInit {
  private readonly adminApi = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly offline = signal(false);

  readonly signupsOpen = signal(true);
  readonly signupsParam = signal<EditableParameter | null>(null);
  readonly savingSignups = signal(false);

  readonly maintenanceEnabled = signal(false);
  readonly maintenanceMessage = signal('');
  readonly maintenanceParam = signal<EditableParameter | null>(null);
  readonly savingMaintenance = signal(false);

  readonly readOnlyParams = signal<readonly ReadOnlyParameter[]>([]);

  // Diálogo de revogação global
  readonly revokeDialogOpen = signal(false);
  readonly revokingSessions = signal(false);
  readonly revokeError = signal<string | null>(null);
  readonly confirmWord = signal('');
  readonly adminPassword = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.offline.set(false);

    this.adminApi.getParameters().subscribe({
      next: (res) => {
        this.loading.set(false);
        const signups = res.editable.find((p) => p.key === 'SIGNUPS_OPEN');
        if (signups) {
          this.signupsParam.set(signups);
          this.signupsOpen.set(signups.value === 'true');
        }

        const maint = res.editable.find((p) => p.key === 'MAINTENANCE_ENABLED');
        if (maint) {
          this.maintenanceParam.set(maint);
          this.maintenanceEnabled.set(maint.value === 'true');
        }

        const maintMsg = res.editable.find((p) => p.key === 'MAINTENANCE_MESSAGE');
        if (maintMsg) {
          this.maintenanceMessage.set(maintMsg.value);
        }

        this.readOnlyParams.set(res.readOnly);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const problem = toProblem(err);
        this.offline.set(isOfflineProblem(problem));
        this.error.set(messageFor(problem));
      },
    });
  }

  toggleSignups(): void {
    const nextState = !this.signupsOpen();
    this.savingSignups.set(true);

    this.adminApi.setSignupsOpen(nextState).subscribe({
      next: () => {
        this.savingSignups.set(false);
        this.signupsOpen.set(nextState);
        this.notices.toast(nextState ? 'Novos cadastros abertos.' : 'Novos cadastros fechados.');
        this.load();
      },
      error: (err: unknown) => {
        this.savingSignups.set(false);
        this.notices.toast(messageFor(toProblem(err)));
      },
    });
  }

  toggleMaintenance(): void {
    const nextState = !this.maintenanceEnabled();
    const message = this.maintenanceMessage().trim();
    this.savingMaintenance.set(true);

    this.adminApi.setMaintenance(nextState, message).subscribe({
      next: () => {
        this.savingMaintenance.set(false);
        this.maintenanceEnabled.set(nextState);
        this.notices.toast(nextState ? 'Modo de manutenção ativado.' : 'Modo de manutenção desativado.');
        this.load();
      },
      error: (err: unknown) => {
        this.savingMaintenance.set(false);
        this.notices.toast(messageFor(toProblem(err)));
      },
    });
  }

  openRevokeDialog(): void {
    this.confirmWord.set('');
    this.adminPassword.set('');
    this.revokeError.set(null);
    this.revokeDialogOpen.set(true);
  }

  closeRevokeDialog(): void {
    this.revokeDialogOpen.set(false);
  }

  confirmRevokeAll(): void {
    if (this.confirmWord().trim() !== 'ENCERRAR') {
      this.revokeError.set('Digite exatamente a palavra ENCERRAR.');
      return;
    }
    if (!this.adminPassword()) {
      this.revokeError.set('Informe sua senha de administrador.');
      return;
    }

    this.revokingSessions.set(true);
    this.revokeError.set(null);

    this.adminApi.revokeAllGlobalSessions(this.adminPassword(), this.confirmWord().trim()).subscribe({
      next: (res) => {
        this.revokingSessions.set(false);
        this.closeRevokeDialog();
        this.notices.toast(`${res.revoked} ${res.revoked === 1 ? 'sessão encerrada' : 'sessões encerradas'}.`);
      },
      error: (err: unknown) => {
        this.revokingSessions.set(false);
        const problem = toProblem(err);
        this.revokeError.set(messageFor(problem));
      },
    });
  }

  protected formatDateTime(iso: string): string {
    return formatAdminDateTime(iso);
  }
}
