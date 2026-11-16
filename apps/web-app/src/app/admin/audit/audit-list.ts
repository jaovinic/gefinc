import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AuditAction, AuditEntry, AuditResult } from '@gefinc/core-models';
import { EmptyView, ErrorView, Icon, LoadingView, Select, isOfflineProblem, messageFor, toProblem, type SelectOption } from '@gefinc/ui-shared';
import type { Subscription } from 'rxjs';
import { AdminApi, type AdminAuditListParams } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';
import { AuditDetail } from './audit-detail';

const PAGE_LIMIT = 50;

let nextId = 0;

export const AUDIT_ACTION_OPTIONS: SelectOption[] = [
  { value: '', label: 'Todas as ações' },
  { value: 'USER_DETAIL_OPENED', label: 'Detalhe do usuário aberto' },
  { value: 'USER_SUSPENDED', label: 'Usuário suspenso' },
  { value: 'USER_REACTIVATED', label: 'Usuário reativado' },
  { value: 'LOGIN_LOCK_CLEARED', label: 'Bloqueio de login retirado' },
  { value: 'SESSION_REVOKED', label: 'Sessão encerrada' },
  { value: 'SESSIONS_REVOKED_ALL', label: 'Todas as sessões encerradas' },
  { value: 'SYSTEM_SESSIONS_REVOKED', label: 'Sessões do sistema encerradas' },
  { value: 'PASSWORD_RESET_SENT', label: 'E-mail de redefinição enviado' },
  { value: 'PASSWORD_RESET_FORCED', label: 'Redefinição de senha forçada' },
  { value: 'USER_RENAMED', label: 'Nome de exibição alterado' },
  { value: 'EMAIL_CHANGE_REQUESTED', label: 'Troca de e-mail solicitada' },
  { value: 'EMAIL_CHANGE_CONFIRMED', label: 'Troca de e-mail confirmada' },
  { value: 'EMAIL_CHANGE_FAILED', label: 'Troca de e-mail não concluída' },
  { value: 'EMAIL_CHANGE_CANCELED', label: 'Troca de e-mail cancelada' },
  { value: 'ROLE_GRANTED', label: 'Perfil de administrador concedido' },
  { value: 'ROLE_REVOKED', label: 'Perfil de administrador retirado' },
  { value: 'DELETION_REQUESTED', label: 'Exclusão da conta agendada' },
  { value: 'DELETION_ANTICIPATED', label: 'Exclusão da conta antecipada' },
  { value: 'DELETION_CANCELED', label: 'Exclusão da conta cancelada' },
  { value: 'ACCOUNT_ERASED', label: 'Conta excluída definitivamente' },
  { value: 'COMMUNICATION_RESENT', label: 'Comunicação reenviada' },
  { value: 'COMMUNICATION_DISCARDED', label: 'Comunicação descartada' },
  { value: 'EMAIL_TEST_SENT', label: 'E-mail de teste enviado' },
  { value: 'INVITATION_CREATED', label: 'Convite criado' },
  { value: 'INVITATION_RESENT', label: 'Convite reenviado' },
  { value: 'INVITATION_CANCELED', label: 'Convite cancelado' },
  { value: 'REASON_CREATED', label: 'Motivo de exclusão criado' },
  { value: 'REASON_UPDATED', label: 'Motivo de exclusão alterado' },
  { value: 'REASON_DEACTIVATED', label: 'Motivo de exclusão desativado' },
  { value: 'REASON_ACTIVATED', label: 'Motivo de exclusão ativado' },
  { value: 'PARAMETER_CHANGED', label: 'Parâmetro do sistema alterado' },
  { value: 'ACCESS_DENIED', label: 'Acesso ao painel negado' },
  { value: 'REVERT_ATTEMPT', label: 'Tentativa de reverter decisão' },
];

export const AUDIT_RESULT_OPTIONS: SelectOption[] = [
  { value: '', label: 'Todos os resultados' },
  { value: 'SUCCESS', label: 'Sucesso' },
  { value: 'REFUSED', label: 'Recusada' },
  { value: 'FAILED', label: 'Falhou' },
];

interface ResultBadge {
  label: string;
  icon: string;
  tone: string;
}

/**
 * Consulta da trilha de auditoria imutável (`GET /admin/audit`): filtros por período (`from`,
 * `to`), autor (`actorId`), alvo (`targetUserId`), ação (`action`) e resultado (`result`);
 * paginação incremental por cursor opaco ("Carregar mais"); detalhe expansível (`AuditDetail`);
 * exibição de `anônimo-…` quando a conta já foi excluída. Superfície exclusivamente de leitura:
 * não oferece edição, exclusão nem exportação.
 */
@Component({
  selector: 'gef-admin-audit-list',
  imports: [AuditDetail, EmptyView, ErrorView, FormsModule, Icon, LoadingView, RouterLink, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" aria-labelledby="audit-heading">
      <h2 id="audit-heading" class="text-title-md font-bold" tabindex="-1" data-testid="results-heading" #resultsHeading>Auditoria</h2>

      <div class="grid gap-3 md:grid-cols-3 lg:grid-cols-6 md:items-end">
        <gef-select label="Ação" [options]="actionOptions" [ngModel]="action()" (ngModelChange)="onAction($event)" />
        <gef-select label="Resultado" [options]="resultOptions" [ngModel]="result()" (ngModelChange)="onResult($event)" />
        <div>
          <label class="gef-label" [attr.for]="fromId">De (data inicial)</label>
          <input
            type="date"
            class="gef-input"
            [id]="fromId"
            [value]="fromDate()"
            (change)="onFromDate($event)"
            data-testid="filter-from"
          />
        </div>
        <div>
          <label class="gef-label" [attr.for]="toId">Até (data final)</label>
          <input
            type="date"
            class="gef-input"
            [id]="toId"
            [value]="toDate()"
            (change)="onToDate($event)"
            data-testid="filter-to"
          />
        </div>
        <div>
          <label class="gef-label" [attr.for]="actorIdInput">Autor (ID)</label>
          <input
            type="number"
            min="1"
            class="gef-input"
            [id]="actorIdInput"
            [value]="actorId()"
            (change)="onActorId($event)"
            data-testid="filter-actor"
          />
        </div>
        <div>
          <label class="gef-label" [attr.for]="targetIdInput">Alvo (ID do usuário)</label>
          <input
            type="number"
            min="1"
            class="gef-input"
            [id]="targetIdInput"
            [value]="targetUserId()"
            (change)="onTargetUserId($event)"
            data-testid="filter-target"
          />
        </div>
      </div>

      <p class="sr-only" role="status" aria-live="polite" data-testid="result-status">{{ announcement() }}</p>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando auditoria…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (items().length === 0) {
        <gef-empty icon="audit" [title]="'Nenhum registro encontrado'" hint="Ajuste o período ou limpe os filtros para ver mais registros.">
          <button type="button" class="gef-btn-secondary" (click)="clearFilters()">Limpar filtros</button>
        </gef-empty>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base">
            <caption class="sr-only">Registros da trilha de auditoria</caption>
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th scope="col" class="px-4 py-3">Data e hora</th>
                <th scope="col" class="px-4 py-3">Ação</th>
                <th scope="col" class="px-4 py-3">Autor</th>
                <th scope="col" class="px-4 py-3">Alvo</th>
                <th scope="col" class="px-4 py-3">Resultado</th>
                <th scope="col" class="px-4 py-3 text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="border-t border-gefinc-border" data-testid="audit-row">
                  <td class="whitespace-nowrap px-4 py-3" data-testid="occurred-at">{{ date(item.occurredAt) }}</td>
                  <td class="px-4 py-3" data-testid="summary">
                    <span class="font-medium">{{ item.summary }}</span>
                    @if (item.refusalCode) {
                      <span class="ml-2 text-caption text-gefinc-muted">({{ item.refusalCode }})</span>
                    }
                  </td>
                  <td class="px-4 py-3" data-testid="actor">
                    @if (item.actor.userId && !isAnonymous(item.actor.label)) {
                      <a class="text-gefinc-primary underline-offset-2 hover:underline" [routerLink]="['/admin/users', item.actor.userId]">{{ item.actor.label }}</a>
                    } @else {
                      <span>{{ item.actor.label }}</span>
                    }
                  </td>
                  <td class="px-4 py-3" data-testid="target">
                    @if (item.target; as t) {
                      @if (t.userId && !isAnonymous(t.label)) {
                        <a class="text-gefinc-primary underline-offset-2 hover:underline" [routerLink]="['/admin/users', t.userId]">{{ t.label }}</a>
                      } @else {
                        <span>{{ t.label }}</span>
                      }
                    } @else if (item.subject) {
                      <span class="text-gefinc-muted">{{ item.subject }}</span>
                    } @else {
                      <span class="text-gefinc-muted">—</span>
                    }
                  </td>
                  <td class="px-4 py-3" data-testid="result">
                    @let badge = resultBadge(item.result);
                    <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold" [class]="badge.tone">
                      <gef-icon [name]="badge.icon" [size]="14" />{{ badge.label }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button
                      type="button"
                      class="gef-btn-secondary text-caption"
                      [attr.aria-expanded]="expandedId() === item.id"
                      [attr.aria-controls]="'audit-detail-' + item.id"
                      data-testid="toggle-detail"
                      (click)="toggleDetail(item.id)"
                    >
                      {{ expandedId() === item.id ? 'Ocultar detalhes' : 'Ver detalhes' }}
                    </button>
                  </td>
                </tr>
                @if (expandedId() === item.id) {
                  <tr class="border-t border-gefinc-border/60 bg-gefinc-surface/30" [id]="'audit-detail-' + item.id" data-testid="audit-detail-row">
                    <td colspan="6" class="px-4 py-3">
                      <gef-admin-audit-detail [auditId]="item.id" [initial]="item" />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (moreError()) {
          <p class="gef-alert-error" role="alert" data-testid="more-error">{{ moreError() }}</p>
        }

        @if (nextCursor()) {
          <div class="flex justify-center">
            <button
              type="button"
              class="gef-btn-secondary"
              [disabled]="loadingMore()"
              data-testid="load-more"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Carregando mais…' : 'Carregar mais' }}
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class AuditList implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('resultsHeading');

  protected readonly fromId = `admin-audit-from-${nextId++}`;
  protected readonly toId = `admin-audit-to-${nextId++}`;
  protected readonly actorIdInput = `admin-audit-actor-${nextId++}`;
  protected readonly targetIdInput = `admin-audit-target-${nextId++}`;
  protected readonly actionOptions = AUDIT_ACTION_OPTIONS;
  protected readonly resultOptions = AUDIT_RESULT_OPTIONS;

  protected readonly action = signal<'' | AuditAction>('');
  protected readonly result = signal<'' | AuditResult>('');
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly actorId = signal('');
  protected readonly targetUserId = signal('');

  protected readonly items = signal<AuditEntry[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly expandedId = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly moreError = signal<string | null>(null);
  protected readonly announcement = signal('');

  private request: Subscription | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  protected onAction(value: string | number): void {
    this.action.set(String(value) as '' | AuditAction);
    this.load();
  }

  protected onResult(value: string | number): void {
    this.result.set(String(value) as '' | AuditResult);
    this.load();
  }

  protected onFromDate(event: Event): void {
    this.fromDate.set((event.target as HTMLInputElement).value.trim());
    this.load();
  }

  protected onToDate(event: Event): void {
    this.toDate.set((event.target as HTMLInputElement).value.trim());
    this.load();
  }

  protected onActorId(event: Event): void {
    this.actorId.set((event.target as HTMLInputElement).value.trim());
    this.load();
  }

  protected onTargetUserId(event: Event): void {
    this.targetUserId.set((event.target as HTMLInputElement).value.trim());
    this.load();
  }

  protected clearFilters(): void {
    this.action.set('');
    this.result.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.actorId.set('');
    this.targetUserId.set('');
    this.load();
  }

  protected toggleDetail(id: number): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected load(moveFocus = false): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.loadError.set(null);
    this.moreError.set(null);
    this.expandedId.set(null);
    this.announcement.set('');
    this.request = this.api.listAudit(this.buildParams()).subscribe({
      next: (page) => {
        this.items.set(page.content);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loading.set(false);
        this.announcement.set(this.announce(page.content.length));
        if (moveFocus) {
          afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
        }
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loadOffline.set(isOfflineProblem(problem));
        this.loadError.set(messageFor(problem));
        this.loading.set(false);
      },
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) {
      return;
    }
    this.request?.unsubscribe();
    this.loadingMore.set(true);
    this.moreError.set(null);
    this.request = this.api.listAudit({ ...this.buildParams(), cursor }).subscribe({
      next: (page) => {
        const merged = [...this.items(), ...page.content];
        this.items.set(merged);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loadingMore.set(false);
        this.announcement.set(this.announce(merged.length));
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.moreError.set(messageFor(problem));
        this.loadingMore.set(false);
      },
    });
  }

  protected date(iso: string): string {
    return formatAdminDateTime(iso);
  }

  protected isAnonymous(label: string): boolean {
    return label.startsWith('anônimo-');
  }

  protected resultBadge(result: AuditResult): ResultBadge {
    switch (result) {
      case 'SUCCESS':
        return { label: 'Sucesso', icon: 'check', tone: 'border-gefinc-primary/40 text-gefinc-primary' };
      case 'REFUSED':
        return { label: 'Recusada', icon: 'alert', tone: 'border-gefinc-warning/40 text-gefinc-warning' };
      case 'FAILED':
        return { label: 'Falhou', icon: 'alert', tone: 'border-gefinc-danger/40 text-gefinc-danger' };
    }
  }

  private buildParams(): AdminAuditListParams {
    const params: AdminAuditListParams = { limit: PAGE_LIMIT };
    if (this.action()) {
      params.action = this.action() as AuditAction;
    }
    if (this.result()) {
      params.result = this.result() as AuditResult;
    }
    const from = this.toIsoStart(this.fromDate());
    if (from) {
      params.from = from;
    }
    const to = this.toIsoEndExclusive(this.toDate());
    if (to) {
      params.to = to;
    }
    const actor = Number(this.actorId());
    if (this.actorId() && Number.isInteger(actor) && actor > 0) {
      params.actorId = actor;
    }
    const target = Number(this.targetUserId());
    if (this.targetUserId() && Number.isInteger(target) && target > 0) {
      params.targetUserId = target;
    }
    return params;
  }

  private toIsoStart(raw: string): string | undefined {
    if (!raw) {
      return undefined;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return `${raw}T00:00:00Z`;
    }
    return raw;
  }

  private toIsoEndExclusive(raw: string): string | undefined {
    if (!raw) {
      return undefined;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(`${raw}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().replace('.000Z', 'Z');
      }
    }
    return raw;
  }

  private announce(count: number): string {
    if (count === 0) {
      return 'Nenhum registro encontrado.';
    }
    const noun = count === 1 ? 'registro exibido' : 'registros exibidos';
    return `${count} ${noun}.`;
  }
}
