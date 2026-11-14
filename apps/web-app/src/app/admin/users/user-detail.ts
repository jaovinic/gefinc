import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AdminUserDetail } from '@gefinc/core-models';
import { ErrorView, Icon, LoadingView, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import type { Subscription } from 'rxjs';
import { AdminApi } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';
import { roleLabel, statusBadges, type StatusBadge } from '../admin-status';

/**
 * Detalhe de um usuário: dados da conta, situação, sessões abertas (só a contagem), bloqueio de login,
 * exclusão pendente (sem a justificativa) e as últimas ações administrativas sobre a conta. Abrir esta
 * tela é auditado pelo servidor. Sem botões de ação nesta etapa e sem nenhum dado financeiro.
 */
@Component({
  selector: 'gef-admin-user-detail',
  imports: [ErrorView, Icon, LoadingView, RouterLink],
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
  `,
})
export class UserDetail implements OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly user = signal<AdminUserDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly roleName = roleLabel;

  private userId = NaN;
  private request: Subscription | null = null;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.userId = Number(params.get('id'));
      this.load();
    });
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

  protected date(iso: string): string {
    return formatAdminDateTime(iso);
  }

  protected badges(user: AdminUserDetail): StatusBadge[] {
    return statusBadges(user);
  }
}
