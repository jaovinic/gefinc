import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { AdminSession } from '@gefinc/core-models';
import { ErrorView, Icon, LoadingView, NoticeService, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import type { Subscription } from 'rxjs';
import { AdminApi } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';
import { ActionDialog } from './action-dialog';

type Pending = { kind: 'one'; session: AdminSession } | { kind: 'all' };

/**
 * Sessões abertas de um usuário (dado pessoal: IP e dispositivo, só para o painel). Cada sessão mostra
 * início, último uso, dispositivo e IP, com "Encerrar"; "Encerrar todas" some se uma delas é a do próprio
 * solicitante (a API recusa). Toda ação pede confirmação com o efeito em texto, vale na próxima ação do
 * usuário e não o avisa. A sessão do solicitante é identificada em texto ("Esta sessão") e não tem
 * botão. Somente leitura para o administrador raiz.
 */
@Component({
  selector: 'gef-admin-session-list',
  imports: [ActionDialog, ErrorView, Icon, LoadingView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gef-card space-y-3 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-title-sm font-semibold">Sessões abertas</h3>
        @if (canRevokeAll()) {
          <button type="button" class="gef-btn-secondary" data-testid="revoke-all" (click)="askAll()">
            <gef-icon name="logout" [size]="16" />Encerrar todas
          </button>
        }
      </div>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando sessões…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (sessions().length === 0) {
        <p class="text-gefinc-muted" data-testid="sessions-empty">Nenhuma sessão aberta.</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base">
            <caption class="sr-only">Sessões abertas do usuário</caption>
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th scope="col" class="px-4 py-3">Início</th>
                <th scope="col" class="px-4 py-3">Último uso</th>
                <th scope="col" class="px-4 py-3">Dispositivo</th>
                <th scope="col" class="px-4 py-3">IP</th>
                <th scope="col" class="px-4 py-3"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (session of sessions(); track session.id) {
                <tr class="border-t border-gefinc-border" data-testid="session-row">
                  <td class="whitespace-nowrap px-4 py-3">{{ date(session.startedAt) }}</td>
                  <td class="whitespace-nowrap px-4 py-3">{{ date(session.lastUsedAt) }}</td>
                  <td class="px-4 py-3">{{ session.device || 'Não informado' }}</td>
                  <td class="px-4 py-3">{{ session.ip || 'Não informado' }}</td>
                  <td class="px-4 py-3">
                    @if (session.current) {
                      <span class="inline-flex items-center gap-1 rounded-full border border-gefinc-primary/40 px-2 py-0.5 text-caption font-semibold text-gefinc-primary"><gef-icon name="check" [size]="14" />Esta sessão</span>
                    } @else if (!readonly()) {
                      <button type="button" class="gef-btn-secondary" data-testid="revoke-session" (click)="askOne(session)">
                        <gef-icon name="logout" [size]="16" />Encerrar
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <gef-action-dialog
      [open]="pending() !== null"
      [heading]="heading()"
      [effect]="effect()"
      [confirmLabel]="heading()"
      confirmIcon="logout"
      busyLabel="Encerrando…"
      [busy]="busy()"
      [error]="dialogError()"
      (confirmed)="confirm()"
      (cancelled)="close()"
    />
  `,
})
export class SessionList {
  private readonly api = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  readonly userId = input.required<number>();
  /** O pai muda este número para pedir um novo carregamento (depois de uma ação sobre a conta). */
  readonly refresh = input(0);
  /** Somente leitura (administrador raiz): sem botões. */
  readonly readonly = input(false);
  /** Uma sessão foi encerrada: o pai recarrega o detalhe (contagem de sessões abertas). */
  readonly changed = output<void>();

  protected readonly sessions = signal<AdminSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly pending = signal<Pending | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);

  protected readonly canRevokeAll = computed(
    () => !this.readonly() && !this.loading() && this.sessions().length > 0 && !this.sessions().some((s) => s.current),
  );
  protected readonly heading = computed(() => (this.pending()?.kind === 'all' ? 'Encerrar todas as sessões' : 'Encerrar sessão'));
  protected readonly effect = computed(() => {
    const pending = this.pending();
    if (pending?.kind === 'all') {
      return `Encerra todas as ${this.sessions().length} sessões abertas agora: o usuário é desconectado na próxima ação, em todos os dispositivos, e precisa entrar de novo. Ele não é avisado.`;
    }
    const device = pending?.kind === 'one' ? pending.session.device : null;
    return `Encerra a sessão${device ? ` em "${device}"` : ''} agora: o usuário é desconectado na próxima ação e precisa entrar de novo. Ele não é avisado.`;
  });

  private request: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    effect(() => {
      this.userId();
      this.refresh();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(null);
    this.request = this.api.listSessions(this.userId()).subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loadOffline.set(isOfflineProblem(problem));
        this.loadError.set(messageFor(problem));
        this.loading.set(false);
      },
    });
  }

  protected date(iso: string): string {
    return formatAdminDateTime(iso);
  }

  protected askOne(session: AdminSession): void {
    this.dialogError.set(null);
    this.pending.set({ kind: 'one', session });
  }

  protected askAll(): void {
    this.dialogError.set(null);
    this.pending.set({ kind: 'all' });
  }

  protected close(): void {
    if (!this.busy()) {
      this.pending.set(null);
    }
  }

  protected confirm(): void {
    const pending = this.pending();
    if (!pending || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.dialogError.set(null);
    const request =
      pending.kind === 'all' ? this.api.revokeAllSessions(this.userId()) : this.api.revokeSession(this.userId(), pending.session.id);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.notices.toast(pending.kind === 'all' ? 'Todas as sessões foram encerradas.' : 'Sessão encerrada.');
        this.changed.emit();
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.dialogError.set(messageFor(toProblem(error)));
      },
    });
  }
}
