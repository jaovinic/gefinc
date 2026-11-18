import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AdminUserDetail } from '@gefinc/core-models';
import { CurrentUser, ErrorView, Icon, LoadingView, NoticeService, Sheet, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import type { Observable, Subscription } from 'rxjs';
import { AdminApi, type DeletionReason, type DeletionRequestInput } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';
import { roleLabel, statusBadges, type StatusBadge } from '../admin-status';
import { ActionDialog, type ActionDialogResult } from './action-dialog';
import { DeletionDialog } from './deletion-dialog';
import { EmailChangeDialog } from './email-change-dialog';
import { PasswordResetDialog, type PasswordResetMode } from './password-reset-dialog';
import { SessionList } from './session-list';

/** As ações sobre a conta que abrem o diálogo de confirmação. */
type ActionKind = 'suspend' | 'reactivate' | 'unlock' | 'grant' | 'revoke-role';

interface ActionConfig {
  heading: string;
  effect: string;
  icon: string;
  tone: 'danger' | 'primary';
  reason: boolean;
  password: boolean;
  busy: string;
  success: string;
}

const ACTIONS: Record<ActionKind, ActionConfig> = {
  suspend: {
    heading: 'Suspender conta',
    effect:
      'A conta perde o acesso agora: todas as sessões são encerradas e o usuário não consegue entrar até ser reativado. O motivo fica só na auditoria; o usuário não é avisado e vê apenas a orientação de procurar o suporte.',
    icon: 'alert',
    tone: 'danger',
    reason: true,
    password: false,
    busy: 'Suspendendo…',
    success: 'Conta suspensa.',
  },
  reactivate: {
    heading: 'Reativar conta',
    effect:
      'O usuário volta a poder entrar. As sessões antigas não voltam: ele precisará entrar de novo. Se houver exclusão pendente, ela continua.',
    icon: 'undo',
    tone: 'primary',
    reason: false,
    password: false,
    busy: 'Reativando…',
    success: 'Conta reativada.',
  },
  unlock: {
    heading: 'Retirar bloqueio de login',
    effect:
      'O login deste e-mail é liberado agora, sem esperar o fim do bloqueio. O limite por endereço IP continua valendo.',
    icon: 'check',
    tone: 'primary',
    reason: false,
    password: false,
    busy: 'Retirando…',
    success: 'Bloqueio de login retirado.',
  },
  grant: {
    heading: 'Conceder perfil de administrador',
    effect:
      'O usuário passa a acessar o painel administrativo já na próxima requisição e poderá administrar contas. Confirme com a sua senha.',
    icon: 'shield',
    tone: 'primary',
    reason: false,
    password: true,
    busy: 'Concedendo…',
    success: 'Perfil de administrador concedido.',
  },
  'revoke-role': {
    heading: 'Retirar perfil de administrador',
    effect:
      'O usuário perde o acesso ao painel administrativo já na próxima requisição. O sistema mantém ao menos um administrador ativo. Confirme com a sua senha.',
    icon: 'shield',
    tone: 'danger',
    reason: false,
    password: true,
    busy: 'Retirando…',
    success: 'Perfil de administrador retirado.',
  },
};

/**
 * Detalhe de um usuário: dados da conta, situação, sessões abertas (lista com IP e dispositivo), bloqueio
 * de login, exclusão pendente (sem a justificativa) e as últimas ações administrativas sobre a conta.
 * Abrir esta tela é auditado pelo servidor. As ações dependem do estado: o administrador raiz não tem
 * nenhuma; o próprio administrador não se suspende nem altera o próprio perfil; conta suspensa oferece
 * "Reativar"; bloqueio de login vigente oferece "Retirar bloqueio". Toda ação passa pelo diálogo de
 * confirmação, que mostra o efeito em texto. Sem nenhum dado financeiro.
 */
@Component({
  selector: 'gef-admin-user-detail',
  imports: [ActionDialog, DeletionDialog, EmailChangeDialog, ErrorView, Icon, LoadingView, PasswordResetDialog, RouterLink, SessionList, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4">
      <a class="inline-flex min-h-11 items-center gap-1 text-body-base text-gefinc-primary underline-offset-2 hover:underline" routerLink="/admin/users">
        <gef-icon name="chevron-left" [size]="16" />Voltar para a lista
      </a>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando usuário…" />
      } @else if (notFound()) {
        <p class="gef-alert-error" role="alert">Usuário não encontrado.</p>
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (user(); as u) {
        <header class="space-y-2">
          <h2 class="break-all text-title-md font-bold" tabindex="-1" data-testid="detail-heading" #heading>{{ u.name || u.email }}</h2>
          @if (u.protected) {
            <p class="inline-flex items-center gap-2 rounded-full border border-gefinc-primary/40 px-3 py-1 text-body-base font-semibold text-gefinc-primary" data-testid="protected">
              <gef-icon name="shield" [size]="16" />Administrador raiz protegido
            </p>
          }
        </header>

        <div class="gef-card space-y-3 p-4">
          <h3 class="text-title-sm font-semibold">Conta</h3>
          <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt class="text-caption text-gefinc-muted">E-mail</dt><dd class="break-all" data-testid="email">{{ u.email }}</dd></div>
            @if (u.pendingEmailChange; as pending) {
              <div class="sm:col-span-2">
                <dt class="sr-only">Troca de e-mail</dt>
                <dd class="rounded-lg border border-gefinc-warning/40 bg-gefinc-warning/5 p-3 text-caption" data-testid="pending-email-change">
                  <p class="font-semibold text-gefinc-warning">Troca de e-mail pendente</p>
                  <p>Novo e-mail: <strong class="text-gefinc-text" data-testid="pending-new-email">{{ pending.newEmail }}</strong></p>
                  <p>Expira em {{ date(pending.expiresAt) }} · Restam {{ pending.attemptsLeft }} tentativas</p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button type="button" class="gef-btn-sm" data-testid="open-email-confirm-btn" (click)="openEmailChange()">
                      Confirmar código
                    </button>
                    <button type="button" class="gef-btn-sm gef-btn-sm-danger" data-testid="cancel-email-change-btn" (click)="cancelEmailChange()">
                      Cancelar troca
                    </button>
                  </div>
                </dd>
              </div>
            }
            <div>
              <dt class="text-caption text-gefinc-muted">Nome</dt>
              <dd class="flex items-center gap-2">
                <span data-testid="name">{{ u.name || 'Sem nome' }}</span>
                <button type="button" class="gef-btn-sm gap-1.5" data-testid="action-rename" (click)="openRename()"><gef-icon name="edit" [size]="12" />Alterar</button>
              </dd>
            </div>
            <div><dt class="text-caption text-gefinc-muted">Perfil</dt><dd data-testid="role">{{ roleName(u.role) }}</dd></div>
            <div>
              <dt class="text-caption text-gefinc-muted">Situação</dt>
              <dd data-testid="status" class="flex flex-wrap gap-1">
                @for (badge of badges(u); track badge.label) {
                  <span class="gef-badge" [class]="badge.tone"><gef-icon [name]="badge.icon" [size]="14" />{{ badge.label }}</span>
                }
              </dd>
            </div>
            <div><dt class="text-caption text-gefinc-muted">Criado em</dt><dd data-testid="created-at">{{ date(u.createdAt) }}</dd></div>
            <div><dt class="text-caption text-gefinc-muted">Último acesso</dt><dd data-testid="last-access">{{ u.lastAccessAt ? date(u.lastAccessAt) : 'Nunca acessou' }}</dd></div>
          </dl>
        </div>

        <div class="gef-card space-y-3 p-4">
          <h3 class="text-title-sm font-semibold">Acesso</h3>
          <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt class="text-caption text-gefinc-muted">Sessões abertas</dt><dd data-testid="open-sessions">{{ u.openSessions }}</dd></div>
            <div>
              <dt class="text-caption text-gefinc-muted">Bloqueio de login por tentativas</dt>
              <dd data-testid="login-lock">
                @if (u.loginLock; as lock) {
                  <span class="inline-flex items-center gap-1 text-gefinc-warning"><gef-icon name="alert" [size]="14" />Bloqueado até {{ date(lock.lockedUntil) }}</span>
                } @else {
                  Sem bloqueio
                }
              </dd>
            </div>
          </dl>
        </div>

        <div class="gef-card space-y-3 p-4" data-testid="actions">
          <h3 class="text-title-sm font-semibold">Ações</h3>
          @if (u.protected) {
            <p class="inline-flex items-center gap-2" data-testid="actions-protected"><gef-icon name="shield" [size]="16" />Nenhuma ação está disponível para o administrador raiz.</p>
          } @else {
            <div class="flex flex-wrap gap-3">
              @if (u.suspended) {
                <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-reactivate" (click)="ask('reactivate')"><gef-icon name="undo" [size]="16" />Reativar conta</button>
              } @else if (!isSelf(u)) {
                <button type="button" class="gef-btn-danger gef-btn-inline" data-testid="action-suspend" (click)="ask('suspend')"><gef-icon name="alert" [size]="16" />Suspender conta</button>
              }
              @if (u.loginLock) {
                <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-unlock" (click)="ask('unlock')"><gef-icon name="check" [size]="16" />Retirar bloqueio de login</button>
              }
              @if (!isSelf(u)) {
                @if (u.role === 'USER') {
                  <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-grant" (click)="ask('grant')"><gef-icon name="shield" [size]="16" />Conceder perfil de administrador</button>
                } @else if (u.role === 'ADMIN') {
                  <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-revoke-role" (click)="ask('revoke-role')"><gef-icon name="shield" [size]="16" />Retirar perfil de administrador</button>
                }
              }
              @if (!u.suspended && !u.deletionPending) {
                <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-email-change" (click)="openEmailChange()"><gef-icon name="mail" [size]="16" />{{ u.pendingEmailChange ? 'Confirmar troca de e-mail' : 'Trocar e-mail' }}</button>
                <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-reset-send" (click)="askReset('send')"><gef-icon name="mail" [size]="16" />Reenviar e-mail de redefinição</button>
                @if (!isSelf(u)) {
                  <button type="button" class="gef-btn-danger gef-btn-inline" data-testid="action-reset-force" (click)="askReset('force')"><gef-icon name="alert" [size]="16" />Forçar redefinição de senha</button>
                }
              }
              @if (!isSelf(u)) {
                @if (u.deletionPending) {
                  <button type="button" class="gef-btn-danger gef-btn-inline" data-testid="action-delete" (click)="openDeletion()"><gef-icon name="trash" [size]="16" />Antecipar exclusão</button>
                  <button type="button" class="gef-btn-secondary gef-btn-inline" data-testid="action-cancel-deletion" (click)="cancelScheduledDeletion()"><gef-icon name="undo" [size]="16" />Cancelar exclusão</button>
                } @else {
                  <button type="button" class="gef-btn-danger gef-btn-inline" data-testid="action-delete" (click)="openDeletion()"><gef-icon name="trash" [size]="16" />Excluir conta</button>
                }
              }
            </div>
            @if (isSelf(u)) {
              <p class="text-caption text-gefinc-muted" data-testid="actions-self">Você não pode suspender a própria conta nem alterar o próprio perfil.</p>
            }
          }
          <p class="sr-only" role="status" aria-live="polite" data-testid="action-status">{{ actionStatus() }}</p>
        </div>

        <gef-admin-session-list [userId]="u.id" [refresh]="sessionsRefresh()" [readonly]="u.protected" (changed)="reload()" />

        <div class="gef-card space-y-3 p-4">
          <h3 class="text-title-sm font-semibold">Exclusão da conta</h3>
          <p data-testid="deletion">
            @if (u.deletion; as deletion) {
              Exclusão agendada, {{ deletion.origin === 'ADMIN' ? 'pedida por um administrador' : 'pedida pelo próprio usuário' }} em {{ date(deletion.requestedAt) }}, prevista para {{ date(deletion.dueAt) }}.
              @if (deletion.reasonName) {
                <span class="block mt-1 text-caption text-gefinc-muted" data-testid="deletion-reason">Motivo: {{ deletion.reasonName }}</span>
              }
              @if (deletion.noticeState === 'PENDING') {
                <span class="block mt-1 text-caption text-gefinc-warning" data-testid="deletion-notice-pending">Aviso por e-mail pendente de entrega.</span>
              }
            } @else {
              Sem exclusão pendente
            }
          </p>
        </div>

        <div class="gef-card space-y-3 p-4">
          <h3 class="text-title-sm font-semibold">Últimas ações administrativas</h3>
          @if (u.recentActions.length === 0) {
            <p class="text-gefinc-muted" data-testid="recent-actions-empty">Nenhuma ação administrativa registrada para esta conta.</p>
          } @else {
            <ol class="space-y-3">
              @for (action of u.recentActions; track action.id) {
                <li class="border-t border-gefinc-border pt-3 first:border-t-0 first:pt-0" data-testid="recent-action">
                  <p class="font-medium">
                    {{ action.summary }}
                    @if (action.result !== 'SUCCESS') {
                      <span class="gef-badge ml-1 border-gefinc-warning/40 text-gefinc-warning"><gef-icon name="alert" [size]="12" />{{ action.result === 'REFUSED' ? 'Recusada' : 'Falhou' }}</span>
                    }
                  </p>
                  <p class="text-caption text-gefinc-muted">{{ action.actor.label }} · {{ date(action.occurredAt) }}</p>
                  @if (action.reason) {
                    <p class="text-caption text-gefinc-muted">Justificativa: {{ action.reason }}</p>
                  }
                </li>
              }
            </ol>
          }
        </div>
      }
    </section>

    <gef-action-dialog
      [open]="action() !== null"
      [heading]="config().heading"
      [effect]="config().effect"
      [confirmLabel]="config().heading"
      [confirmIcon]="config().icon"
      [busyLabel]="config().busy"
      [requireReason]="config().reason"
      [requirePassword]="config().password"
      [tone]="config().tone"
      [busy]="actionBusy()"
      [error]="actionError()"
      (confirmed)="confirmAction($event)"
      (cancelled)="closeAction()"
    />

    <gef-password-reset-dialog
      [open]="resetMode() !== null"
      [mode]="currentResetMode()"
      [busy]="resetBusy()"
      [error]="resetError()"
      (confirmed)="confirmReset($event)"
      (cancelled)="closeReset()"
    />

    <gef-email-change-dialog
      [open]="emailChangeOpen()"
      [pending]="user()?.pendingEmailChange ?? null"
      [busy]="emailChangeBusy()"
      [error]="emailChangeError()"
      (requestSubmitted)="onRequestEmailChange($event)"
      (confirmSubmitted)="onConfirmEmailChange($event)"
      (cancelPending)="cancelEmailChange()"
      (cancelled)="closeEmailChange()"
    />

    <gef-deletion-dialog
      [open]="deletionOpen()"
      [targetEmail]="user()?.email ?? ''"
      [reasons]="deletionReasons()"
      [currentDueAt]="user()?.deletion?.dueAt ?? null"
      [busy]="deletionBusy()"
      [error]="deletionError()"
      (confirmed)="confirmDeletion($event)"
      (cancelled)="closeDeletion()"
    />

    <gef-sheet heading="Alterar nome" [open]="renameOpen()" [dismissible]="!renameBusy()" initialFocus="#rename-input" (closed)="closeRename()">
      @if (renameOpen()) {
        <div class="space-y-4" data-testid="rename-modal">
          <p class="text-caption text-gefinc-muted">Informe o novo nome de exibição (máximo de 80 caracteres). Deixe em branco para remover o nome.</p>
          @if (renameError(); as err) {
            <p class="gef-alert-error" role="alert" data-testid="rename-error">{{ err }}</p>
          }
          <div>
            <label class="gef-label" for="rename-input">Nome</label>
            <input id="rename-input" class="gef-input" type="text" maxlength="80" [value]="renameValue()" (input)="onRenameInput($event)" data-testid="rename-input" />
          </div>
          <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" class="gef-btn-secondary gef-btn-inline" (click)="closeRename()" [disabled]="renameBusy()" data-testid="rename-cancel">Cancelar</button>
            <button type="button" class="gef-btn-primary gef-btn-inline" (click)="submitRename()" [disabled]="renameBusy()" data-testid="rename-save">
              {{ renameBusy() ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </div>
      }
    </gef-sheet>
  `,
})
export class UserDetail implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly currentUser = inject(CurrentUser);
  private readonly notices = inject(NoticeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly user = signal<AdminUserDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly roleName = roleLabel;

  /** O pai pede à lista de sessões que recarregue depois de uma ação. */
  protected readonly sessionsRefresh = signal(0);
  protected readonly action = signal<ActionKind | null>(null);
  protected readonly actionBusy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly resetMode = signal<PasswordResetMode | null>(null);
  protected readonly resetBusy = signal(false);
  protected readonly resetError = signal<string | null>(null);

  protected readonly deletionOpen = signal(false);
  protected readonly deletionReasons = signal<readonly DeletionReason[]>([]);
  protected readonly deletionBusy = signal(false);
  protected readonly deletionError = signal<string | null>(null);

  protected readonly emailChangeOpen = signal(false);
  protected readonly emailChangeBusy = signal(false);
  protected readonly emailChangeError = signal<string | null>(null);

  protected readonly renameOpen = signal(false);
  protected readonly renameValue = signal('');
  protected readonly renameBusy = signal(false);
  protected readonly renameError = signal<string | null>(null);
  private lastResetMode: PasswordResetMode = 'send';
  protected readonly currentResetMode = computed(() => {
    const mode = this.resetMode();
    if (mode) {
      this.lastResetMode = mode;
    }
    return this.lastResetMode;
  });
  /** Resultado da última ação, anunciado em região `status` (além do toast). */
  protected readonly actionStatus = signal('');
  /** Configuração da ação aberta; fechada, mantém a última para o diálogo não piscar o texto ao fechar. */
  private lastAction: ActionKind = 'suspend';
  protected readonly config = computed(() => {
    const kind = this.action();
    if (kind) {
      this.lastAction = kind;
    }
    return ACTIONS[this.lastAction];
  });

  private userId = NaN;
  private request: Subscription | null = null;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.userId = Number(params.get('id'));
      this.load();
    });
  }

  ngOnInit(): void {
    // O perfil de quem está logado diz quando o alvo é o próprio administrador.
    this.currentUser.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  protected load(): void {
    this.request?.unsubscribe();
    this.user.set(null);
    this.notFound.set(false);
    this.loadError.set(null);
    if (!Number.isInteger(this.userId) || this.userId <= 0) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.api.getUser(this.userId).subscribe({
      next: (detail) => {
        this.user.set(detail);
        this.loading.set(false);
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loading.set(false);
        if (problem.status === 404) {
          this.notFound.set(true);
          return;
        }
        this.loadOffline.set(isOfflineProblem(problem));
        this.loadError.set(messageFor(problem));
      },
    });
  }

  /**
   * Recarrega o detalhe sem apagar a tela (depois de uma ação), devolve o foco ao título e pede a lista
   * de sessões de novo. O botão que abriu o diálogo pode ter sumido (ex.: Suspender virou Reativar).
   */
  protected reload(): void {
    this.request?.unsubscribe();
    this.request = this.api.getUser(this.userId).subscribe({
      next: (detail) => {
        this.user.set(detail);
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (error: unknown) => {
        this.actionStatus.set(messageFor(toProblem(error)));
      },
    });
  }

  protected isSelf(user: AdminUserDetail): boolean {
    return this.currentUser.profile()?.id === user.id;
  }

  protected ask(kind: ActionKind): void {
    this.actionError.set(null);
    this.action.set(kind);
  }

  protected closeAction(): void {
    if (!this.actionBusy()) {
      this.action.set(null);
    }
  }

  protected askReset(mode: PasswordResetMode): void {
    this.resetError.set(null);
    this.resetMode.set(mode);
  }

  protected openRename(): void {
    this.renameError.set(null);
    this.renameValue.set(this.user()?.name ?? '');
    this.renameOpen.set(true);
  }

  protected closeRename(): void {
    if (!this.renameBusy()) {
      this.renameOpen.set(false);
      this.renameError.set(null);
    }
  }

  protected onRenameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.renameValue.set(input.value);
  }

  protected submitRename(): void {
    if (this.renameBusy()) return;
    this.renameBusy.set(true);
    this.renameError.set(null);
    const trimmed = this.renameValue().trim();
    const newName = trimmed === '' ? null : trimmed;
    this.api.renameUser(this.userId, newName).subscribe({
      next: () => {
        this.renameBusy.set(false);
        this.renameOpen.set(false);
        const msg = 'Nome do usuário atualizado com sucesso.';
        this.notices.toast(msg);
        this.actionStatus.set(msg);
        this.reload();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.renameBusy.set(false);
        this.renameError.set(problem.fieldErrors['name'] ?? messageFor(problem));
      },
    });
  }

  protected openEmailChange(): void {
    this.emailChangeError.set(null);
    this.emailChangeOpen.set(true);
  }

  protected closeEmailChange(): void {
    if (!this.emailChangeBusy()) {
      this.emailChangeOpen.set(false);
      this.emailChangeError.set(null);
    }
  }

  protected onRequestEmailChange(newEmail: string): void {
    if (this.emailChangeBusy()) return;
    this.emailChangeBusy.set(true);
    this.emailChangeError.set(null);
    this.api.requestEmailChange(this.userId, newEmail).subscribe({
      next: () => {
        this.emailChangeBusy.set(false);
        const msg = 'Código de confirmação enviado para o novo e-mail.';
        this.notices.toast(msg);
        this.actionStatus.set(msg);
        this.sessionsRefresh.update((n) => n + 1);
        this.reload();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.emailChangeBusy.set(false);
        this.emailChangeError.set(problem.fieldErrors['newEmail'] ?? messageFor(problem));
      },
    });
  }

  protected onConfirmEmailChange(code: string): void {
    if (this.emailChangeBusy()) return;
    this.emailChangeBusy.set(true);
    this.emailChangeError.set(null);
    this.api.confirmEmailChange(this.userId, code).subscribe({
      next: () => {
        this.emailChangeBusy.set(false);
        this.emailChangeOpen.set(false);
        const msg = 'E-mail da conta alterado com sucesso.';
        this.notices.toast(msg);
        this.actionStatus.set(msg);
        this.sessionsRefresh.update((n) => n + 1);
        this.reload();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.emailChangeBusy.set(false);
        this.emailChangeError.set(problem.fieldErrors['code'] ?? messageFor(problem));
      },
    });
  }

  protected cancelEmailChange(): void {
    if (this.emailChangeBusy()) return;
    this.emailChangeBusy.set(true);
    this.emailChangeError.set(null);
    this.api.cancelEmailChange(this.userId).subscribe({
      next: () => {
        this.emailChangeBusy.set(false);
        this.emailChangeOpen.set(false);
        const msg = 'Troca de e-mail cancelada.';
        this.notices.toast(msg);
        this.actionStatus.set(msg);
        this.sessionsRefresh.update((n) => n + 1);
        this.reload();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.emailChangeBusy.set(false);
        this.emailChangeError.set(messageFor(problem));
      },
    });
  }

  protected closeReset(): void {
    if (!this.resetBusy()) {
      this.resetMode.set(null);
    }
  }

  protected confirmReset(result: { password?: string }): void {
    const mode = this.resetMode();
    if (!mode || this.resetBusy()) {
      return;
    }
    this.resetBusy.set(true);
    this.resetError.set(null);
    const call$ =
      mode === 'send'
        ? this.api.sendPasswordReset(this.userId)
        : this.api.forcePasswordReset(this.userId, result.password ?? '');
    const successMessage =
      mode === 'send'
        ? 'E-mail de redefinição enviado.'
        : 'Redefinição de senha forçada e e-mail enviado.';
    call$.subscribe({
      next: () => {
        this.resetBusy.set(false);
        this.resetMode.set(null);
        this.notices.toast(successMessage);
        this.actionStatus.set(successMessage);
        if (mode === 'force') {
          this.sessionsRefresh.update((n) => n + 1);
        }
        this.reload();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.resetBusy.set(false);
        this.resetError.set(messageFor(problem));
      },
    });
  }

  protected confirmAction(result: ActionDialogResult): void {
    const kind = this.action();
    if (!kind || this.actionBusy()) {
      return;
    }
    this.actionBusy.set(true);
    this.actionError.set(null);
    this.perform(kind, result).subscribe({
      next: () => {
        const message = ACTIONS[kind].success;
        this.actionBusy.set(false);
        this.action.set(null);
        this.notices.toast(message);
        this.actionStatus.set(message);
        this.sessionsRefresh.update((n) => n + 1);
        this.reload();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.actionBusy.set(false);
        this.actionError.set(problem.fieldErrors['reason'] ?? messageFor(problem));
      },
    });
  }

  private perform(kind: ActionKind, result: ActionDialogResult): Observable<void> {
    switch (kind) {
      case 'suspend':
        return this.api.suspend(this.userId, result.reason ?? '');
      case 'reactivate':
        return this.api.reactivate(this.userId);
      case 'unlock':
        return this.api.clearLoginLock(this.userId);
      case 'grant':
        return this.api.setRole(this.userId, 'ADMIN', result.password ?? '');
      case 'revoke-role':
        return this.api.setRole(this.userId, 'USER', result.password ?? '');
    }
  }

  protected date(iso: string): string {
    return formatAdminDateTime(iso);
  }

  protected badges(user: AdminUserDetail): StatusBadge[] {
    return statusBadges(user);
  }

  protected openDeletion(): void {
    this.deletionError.set(null);
    this.api.listDeletionReasons().subscribe({
      next: (reasons) => {
        this.deletionReasons.set(reasons);
        this.deletionOpen.set(true);
      },
      error: (error: unknown) => {
        this.notices.toast(messageFor(toProblem(error)));
      },
    });
  }

  protected closeDeletion(): void {
    if (!this.deletionBusy()) {
      this.deletionOpen.set(false);
      this.deletionError.set(null);
    }
  }

  protected confirmDeletion(input: DeletionRequestInput): void {
    if (this.deletionBusy()) return;
    this.deletionBusy.set(true);
    this.deletionError.set(null);

    this.api.requestDeletion(this.userId, input).subscribe({
      next: (outcome) => {
        this.deletionBusy.set(false);
        this.deletionOpen.set(false);
        if (outcome.status === 'EXECUTED') {
          this.notices.toast('Conta excluída permanentemente.');
          void this.router.navigateByUrl('/admin/users');
        } else {
          const msg =
            outcome.noticeState === 'PENDING'
              ? 'Exclusão agendada. O aviso por e-mail falhou e virou comunicação pendente.'
              : 'Exclusão agendada com sucesso.';
          this.notices.toast(msg);
          this.actionStatus.set(msg);
          this.reload();
        }
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.deletionBusy.set(false);
        this.deletionError.set(
          problem.fieldErrors['justification'] ??
            problem.fieldErrors['password'] ??
            problem.fieldErrors['confirmEmail'] ??
            messageFor(problem),
        );
      },
    });
  }

  protected cancelScheduledDeletion(): void {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    this.api.cancelDeletion(this.userId).subscribe({
      next: () => {
        this.actionBusy.set(false);
        const msg = 'Exclusão agendada cancelada.';
        this.notices.toast(msg);
        this.actionStatus.set(msg);
        this.reload();
      },
      error: (error: unknown) => {
        this.actionBusy.set(false);
        this.notices.toast(messageFor(toProblem(error)));
      },
    });
  }
}
