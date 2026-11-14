import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AdminUserDetail } from '@gefinc/core-models';
import { CurrentUser, ErrorView, Icon, LoadingView, NoticeService, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import type { Observable, Subscription } from 'rxjs';
import { AdminApi } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';
import { roleLabel, statusBadges, type StatusBadge } from '../admin-status';
import { ActionDialog, type ActionDialogResult } from './action-dialog';
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
  imports: [ActionDialog, ErrorView, Icon, LoadingView, RouterLink, SessionList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4">
      <a class="inline-flex items-center gap-1 text-body-base text-gefinc-primary underline-offset-2 hover:underline" routerLink="/admin/users">
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
          <h2 class="text-title-md font-bold" tabindex="-1" data-testid="detail-heading" #heading>{{ u.name || u.email }}</h2>
          @if (u.protected) {
            <p class="inline-flex items-center gap-2 rounded-full border border-gefinc-primary/40 px-3 py-1 text-body-base font-semibold text-gefinc-primary" data-testid="protected">
              <gef-icon name="shield" [size]="16" />Administrador raiz protegido
            </p>
          }
        </header>

        <div class="gef-card space-y-3 p-4">
          <h3 class="text-title-sm font-semibold">Conta</h3>
          <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt class="text-caption text-gefinc-muted">E-mail</dt><dd data-testid="email">{{ u.email }}</dd></div>
            <div><dt class="text-caption text-gefinc-muted">Nome</dt><dd data-testid="name">{{ u.name || 'Sem nome' }}</dd></div>
            <div><dt class="text-caption text-gefinc-muted">Perfil</dt><dd data-testid="role">{{ roleName(u.role) }}</dd></div>
            <div>
              <dt class="text-caption text-gefinc-muted">Situação</dt>
              <dd data-testid="status" class="flex flex-wrap gap-1">
                @for (badge of badges(u); track badge.label) {
                  <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold" [class]="badge.tone"><gef-icon [name]="badge.icon" [size]="14" />{{ badge.label }}</span>
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
                <button type="button" class="gef-btn-secondary" data-testid="action-reactivate" (click)="ask('reactivate')"><gef-icon name="undo" [size]="16" />Reativar conta</button>
              } @else if (!isSelf(u)) {
                <button type="button" class="gef-btn-danger" data-testid="action-suspend" (click)="ask('suspend')"><gef-icon name="alert" [size]="16" />Suspender conta</button>
              }
              @if (u.loginLock) {
                <button type="button" class="gef-btn-secondary" data-testid="action-unlock" (click)="ask('unlock')"><gef-icon name="check" [size]="16" />Retirar bloqueio de login</button>
              }
              @if (!isSelf(u)) {
                @if (u.role === 'USER') {
                  <button type="button" class="gef-btn-secondary" data-testid="action-grant" (click)="ask('grant')"><gef-icon name="shield" [size]="16" />Conceder perfil de administrador</button>
                } @else if (u.role === 'ADMIN') {
                  <button type="button" class="gef-btn-secondary" data-testid="action-revoke-role" (click)="ask('revoke-role')"><gef-icon name="shield" [size]="16" />Retirar perfil de administrador</button>
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
                      <span class="ml-1 inline-flex items-center gap-1 rounded-full border border-gefinc-warning/40 px-2 py-0.5 text-caption font-semibold text-gefinc-warning"><gef-icon name="alert" [size]="12" />{{ action.result === 'REFUSED' ? 'Recusada' : 'Falhou' }}</span>
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
  `,
})
export class UserDetail implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly currentUser = inject(CurrentUser);
  private readonly notices = inject(NoticeService);
  private readonly route = inject(ActivatedRoute);
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
}
