import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { EmailConfig, EmailDelivery, EmailFailureReason, EmailKind, EmailTestResult } from '@gefinc/core-models';
import { EmptyView, ErrorView, Icon, LoadingView, NoticeService, Select, isOfflineProblem, messageFor, toProblem, type SelectOption } from '@gefinc/ui-shared';
import type { Subscription } from 'rxjs';
import { AdminApi, type AdminEmailDeliveryParams } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';

const PAGE_LIMIT = 50;

export const EMAIL_STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'Todas as situações' },
  { value: 'SENT', label: 'Enviado' },
  { value: 'FAILED', label: 'Falhou' },
];

const KIND_LABELS: Record<EmailKind, string> = {
  PASSWORD_RESET: 'Redefinição de senha',
  TEST: 'Teste',
  INVITATION: 'Convite',
  DELETION_NOTICE: 'Aviso de exclusão',
  CANCELLATION_NOTICE: 'Aviso de cancelamento',
  EMAIL_CHANGE_CODE: 'Código de troca de e-mail',
  EMAIL_CHANGE_NOTICE: 'Aviso de troca de e-mail',
};

export const EMAIL_KIND_OPTIONS: SelectOption[] = [
  { value: '', label: 'Todos os tipos' },
  ...(Object.keys(KIND_LABELS) as EmailKind[]).map((kind) => ({ value: kind, label: KIND_LABELS[kind] })),
];

const FAILURE_LABELS: Record<EmailFailureReason, string> = {
  AUTHENTICATION: 'Usuário ou senha do servidor de e-mail recusados.',
  PERMANENT_REJECTION: 'O servidor de e-mail recusou a mensagem.',
  TRANSIENT_EXHAUSTED: 'O servidor de e-mail ficou indisponível após as tentativas.',
  TIMEOUT: 'O servidor de e-mail demorou demais para responder.',
  NOT_CONFIGURED: 'O envio de e-mail não está configurado.',
  OTHER: 'Falha inesperada no envio.',
};

interface StatusBadge {
  label: string;
  icon: string;
  tone: string;
}

/**
 * Diagnóstico do serviço de e-mail: configuração (nunca usuário nem senha), e-mail de teste ao
 * próprio administrador e histórico dos últimos 90 dias com filtros e "Carregar mais". "Reenviar"
 * só aparece para redefinição de senha que falhou com conta ainda existente.
 */
@Component({
  selector: 'gef-admin-email-page',
  imports: [EmptyView, ErrorView, FormsModule, Icon, LoadingView, RouterLink, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6" aria-labelledby="email-heading">
      <h2 id="email-heading" class="text-title-md font-bold">E-mail</h2>

      <div class="gef-card space-y-3 p-4" data-testid="config-card">
        <h3 class="text-title-sm font-bold">Configuração</h3>
        @if (configLoading()) {
          <gef-loading variant="list" message="Carregando configuração…" />
        } @else if (configError()) {
          <gef-error [message]="configError()!" [variant]="configOffline() ? 'offline' : 'error'" (retry)="loadConfig()" />
        } @else if (config(); as cfg) {
          <dl class="grid gap-3 md:grid-cols-3">
            <div><dt class="text-caption text-gefinc-muted">Servidor</dt><dd data-testid="config-host">{{ cfg.host || '—' }}</dd></div>
            <div><dt class="text-caption text-gefinc-muted">Porta</dt><dd data-testid="config-port">{{ cfg.port }}</dd></div>
            <div><dt class="text-caption text-gefinc-muted">Remetente</dt><dd data-testid="config-from">{{ cfg.from || '—' }}</dd></div>
            <div>
              <dt class="text-caption text-gefinc-muted">Configuração completa</dt>
              <dd data-testid="config-complete">
                <span class="inline-flex items-center gap-1"><gef-icon [name]="cfg.complete ? 'check' : 'alert'" [size]="16" />{{ cfg.complete ? 'Sim' : 'Não' }}</span>
              </dd>
            </div>
            <div><dt class="text-caption text-gefinc-muted">Autenticação</dt><dd data-testid="config-auth">{{ cfg.authEnabled ? 'Ativada' : 'Desativada' }}</dd></div>
            <div><dt class="text-caption text-gefinc-muted">STARTTLS</dt><dd data-testid="config-starttls">{{ cfg.starttls ? 'Ativado' : 'Desativado' }}</dd></div>
          </dl>
        }
      </div>

      <div class="gef-card space-y-3 p-4" data-testid="test-card">
        <h3 class="text-title-sm font-bold">E-mail de teste</h3>
        <p class="text-body-base text-gefinc-muted">Envia uma mensagem de teste ao seu próprio e-mail. A resposta pode levar alguns segundos.</p>
        <button type="button" class="gef-btn-primary gef-btn-inline" [disabled]="testing()" data-testid="send-test" (click)="sendTest()">
          <gef-icon name="mail" [size]="16" />{{ testing() ? 'Enviando…' : 'Enviar e-mail de teste' }}
        </button>
        <p class="sr-only" role="status" aria-live="polite" data-testid="test-status">{{ testAnnouncement() }}</p>
        @if (testResult(); as result) {
          @if (result.status === 'SENT') {
            <p class="flex items-center gap-2 text-body-base text-gefinc-primary" data-testid="test-result">
              <gef-icon name="check" [size]="16" /><span>Enviado. Confira a sua caixa de entrada.</span>
            </p>
          } @else {
            <p class="flex items-center gap-2 text-body-base text-gefinc-danger" data-testid="test-result">
              <gef-icon name="alert" [size]="16" /><span>Falhou. {{ failureText(result.failureReason) }}</span>
            </p>
          }
        }
        @if (testError()) {
          <p class="text-body-base text-gefinc-danger" role="alert" data-testid="test-error">{{ testError() }}</p>
        }
      </div>

      <div class="space-y-4">
        <h3 class="text-title-sm font-bold">Histórico de envios (90 dias)</h3>
        <div class="grid gap-3 md:grid-cols-2 md:items-end">
          <gef-select label="Situação" [options]="statusOptions" [ngModel]="status()" (ngModelChange)="onStatus($event)" />
          <gef-select label="Tipo" [options]="kindOptions" [ngModel]="kind()" (ngModelChange)="onKind($event)" />
        </div>

        <p class="sr-only" role="status" aria-live="polite" data-testid="result-status">{{ announcement() }}</p>
        @if (actionMessage()) {
          <p class="text-body-base" role="status" data-testid="action-message">{{ actionMessage() }}</p>
        }

        @if (loading()) {
          <gef-loading variant="list" message="Carregando histórico…" />
        } @else if (loadError()) {
          <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
        } @else if (items().length === 0) {
          <gef-empty icon="mail" title="Nenhum envio encontrado" hint="Não há envios nos últimos 90 dias com estes filtros." />
        } @else {
          <div class="gef-table-wrap">
            <table class="gef-table">
              <caption class="sr-only">Histórico de envios de e-mail</caption>
              <thead>
                <tr>
                  <th scope="col">Data e hora</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Destinatário</th>
                  <th scope="col">Situação</th>
                  <th scope="col" class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.id) {
                  <tr data-testid="delivery-row">
                    <td class="whitespace-nowrap" data-testid="created-at">{{ date(item.createdAt) }}</td>
                    <td data-testid="kind">{{ kindLabel(item.kind) }}</td>
                    <td data-testid="recipient">
                      @if (item.recipient.userId && !isAnonymous(item.recipient.label)) {
                        <a class="text-gefinc-primary underline-offset-2 hover:underline" [routerLink]="['/admin/users', item.recipient.userId]">{{ item.recipient.label }}</a>
                      } @else {
                        {{ item.recipient.label }}
                      }
                    </td>
                    <td data-testid="status">
                      <span class="gef-badge" [class]="badge(item).tone">
                        <gef-icon [name]="badge(item).icon" [size]="14" />{{ badge(item).label }}
                      </span>
                      @if (item.failureReason) {
                        <span class="ml-2 text-caption text-gefinc-muted" data-testid="failure">{{ failureText(item.failureReason) }}</span>
                      }
                    </td>
                    <td class="text-right">
                      @if (canResend(item)) {
                        <button type="button" class="gef-btn-sm" data-testid="resend" [disabled]="resendingId() === item.id" (click)="resend(item)">
                          {{ resendingId() === item.id ? 'Reenviando…' : 'Reenviar' }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (moreError()) {
            <p class="text-body-base text-gefinc-danger" role="alert" data-testid="more-error">{{ moreError() }}</p>
          }
          @if (nextCursor()) {
            <div class="flex justify-center">
              <button type="button" class="gef-btn-secondary" [disabled]="loadingMore()" data-testid="load-more" (click)="loadMore()">
                {{ loadingMore() ? 'Carregando mais…' : 'Carregar mais' }}
              </button>
            </div>
          }
        }
      </div>
    </section>
  `,
})
export class EmailPage implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  protected readonly statusOptions = EMAIL_STATUS_OPTIONS;
  protected readonly kindOptions = EMAIL_KIND_OPTIONS;

  protected readonly config = signal<EmailConfig | null>(null);
  protected readonly configLoading = signal(true);
  protected readonly configError = signal<string | null>(null);
  protected readonly configOffline = signal(false);

  protected readonly testing = signal(false);
  protected readonly testResult = signal<EmailTestResult | null>(null);
  protected readonly testError = signal<string | null>(null);
  protected readonly testAnnouncement = signal('');

  protected readonly status = signal<'' | 'SENT' | 'FAILED'>('');
  protected readonly kind = signal<'' | EmailKind>('');
  protected readonly items = signal<EmailDelivery[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly moreError = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly resendingId = signal<number | null>(null);
  protected readonly actionMessage = signal('');

  private request: Subscription | null = null;
  private configRequest: Subscription | null = null;
  private testRequest: Subscription | null = null;
  private resendRequest: Subscription | null = null;

  ngOnInit(): void {
    this.loadConfig();
    this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.configRequest?.unsubscribe();
    this.testRequest?.unsubscribe();
    this.resendRequest?.unsubscribe();
  }

  protected onStatus(value: string | number): void {
    this.status.set(String(value) as '' | 'SENT' | 'FAILED');
    this.load();
  }

  protected onKind(value: string | number): void {
    this.kind.set(String(value) as '' | EmailKind);
    this.load();
  }

  protected loadConfig(): void {
    this.configRequest?.unsubscribe();
    this.configLoading.set(true);
    this.configError.set(null);
    this.configRequest = this.api.getEmailConfig().subscribe({
      next: (config) => {
        this.config.set(config);
        this.configLoading.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.configOffline.set(isOfflineProblem(problem));
        this.configError.set(messageFor(problem));
        this.configLoading.set(false);
      },
    });
  }

  protected sendTest(): void {
    if (this.testing()) {
      return;
    }
    this.testing.set(true);
    this.testResult.set(null);
    this.testError.set(null);
    this.testAnnouncement.set('Enviando o e-mail de teste…');
    this.testRequest = this.api.sendTestEmail().subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.testing.set(false);
        this.testAnnouncement.set(result.status === 'SENT' ? 'E-mail de teste enviado.' : 'O e-mail de teste falhou.');
        this.load();
      },
      error: (error: unknown) => {
        const message = messageFor(toProblem(error));
        this.testError.set(message);
        this.testAnnouncement.set(message);
        this.testing.set(false);
      },
    });
  }

  protected load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.loadError.set(null);
    this.moreError.set(null);
    this.announcement.set('');
    this.request = this.api.listEmailDeliveries(this.buildParams()).subscribe({
      next: (page) => {
        this.items.set(page.content);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loading.set(false);
        this.announcement.set(this.announce(page.content.length));
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
    this.request = this.api.listEmailDeliveries({ ...this.buildParams(), cursor }).subscribe({
      next: (page) => {
        const merged = [...this.items(), ...page.content];
        this.items.set(merged);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loadingMore.set(false);
        this.announcement.set(this.announce(merged.length));
      },
      error: (error: unknown) => {
        this.moreError.set(messageFor(toProblem(error)));
        this.loadingMore.set(false);
      },
    });
  }

  protected canResend(item: EmailDelivery): boolean {
    return item.kind === 'PASSWORD_RESET' && item.status === 'FAILED' && item.recipient.userId != null;
  }

  protected resend(item: EmailDelivery): void {
    if (this.resendingId() !== null) {
      return;
    }
    this.resendingId.set(item.id);
    this.actionMessage.set('');
    this.resendRequest = this.api.resendEmailDelivery(item.id).subscribe({
      next: () => {
        this.resendingId.set(null);
        this.actionMessage.set('Redefinição reenviada com um novo link.');
        this.notices.toast('Redefinição reenviada.');
        this.load();
      },
      error: (error: unknown) => {
        this.resendingId.set(null);
        this.actionMessage.set(messageFor(toProblem(error)));
      },
    });
  }

  protected date(iso: string): string {
    return formatAdminDateTime(iso);
  }

  protected isAnonymous(label: string): boolean {
    return label.startsWith('anônimo-');
  }

  protected kindLabel(kind: EmailKind): string {
    return KIND_LABELS[kind] ?? kind;
  }

  protected failureText(reason: EmailFailureReason | undefined): string {
    return reason ? (FAILURE_LABELS[reason] ?? FAILURE_LABELS.OTHER) : FAILURE_LABELS.OTHER;
  }

  protected badge(item: EmailDelivery): StatusBadge {
    return item.status === 'SENT'
      ? { label: 'Enviado', icon: 'check', tone: 'border-gefinc-primary/40 bg-gefinc-primary/10 text-gefinc-primary' }
      : { label: 'Falhou', icon: 'alert', tone: 'border-gefinc-danger/40 bg-gefinc-danger/10 text-gefinc-danger' };
  }

  private buildParams(): AdminEmailDeliveryParams {
    const params: AdminEmailDeliveryParams = { limit: PAGE_LIMIT };
    if (this.status()) {
      params.status = this.status() as 'SENT' | 'FAILED';
    }
    if (this.kind()) {
      params.kind = this.kind() as EmailKind;
    }
    return params;
  }

  private announce(count: number): string {
    return count === 0 ? 'Nenhum envio encontrado.' : count === 1 ? '1 envio exibido.' : `${count} envios exibidos.`;
  }
}
